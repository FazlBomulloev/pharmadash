"""Обзор рынка целиком (все МНН разом).

Возвращает 6 блоков:
  1. header  — шапка, FX-курс, счётчики
  2. volume  — общий объём БДП
  3. portfolio — топ МНН, топ производители, ATC, страны
  4. grls    — РУ, ЖНВЛП, окна истечения
  5. pc      — покрытие, цена за единицу (в USD), индексация
  6. decision — распределение МНН по DE-рекомендациям

ВСЕ суммы в USD. Цены ПЦ конвертируются по курсу рынка
(price_rub_no_vat / fx_rate_usd_rub) → unit_price_usd.
"""
import asyncio
import json
import logging
import time
from collections import defaultdict
from datetime import date
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import (
    MIN_COMPETITOR_USD,
    COMPETITOR_PCT,
    GRLS_ACTIVE_STATUSES,
)
from backend.database import async_session, get_db
from backend.models import Market, BdpRaw, GrlsEntry, PcEntry
from backend.services.scoring import (
    calculate_economic_score,
    calculate_structure_score,
    calculate_regulatory_score,
    get_recommendation,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["overview"])


# ────────────────────── overview cache ──────────────────────
# Полный ответ кешируется по (market_id, sector, atc3, jnvlp).
# Инвалидируется через invalidate_overview_cache(market_id) при любых
# изменениях BDP/PC/GRLS/FX этого рынка.
_OVERVIEW_CACHE: dict[tuple, tuple[float, dict]] = {}
_CACHE_TTL_SEC = 600  # 10 минут


def invalidate_overview_cache(market_id: int | None = None) -> None:
    """Сбросить кеш обзора. Без аргумента — весь, иначе только для рынка."""
    if market_id is None:
        _OVERVIEW_CACHE.clear()
        log.info("Кеш обзора сброшен целиком")
        return
    keys = [k for k in _OVERVIEW_CACHE if k[0] == market_id]
    for k in keys:
        _OVERVIEW_CACHE.pop(k, None)
    if keys:
        log.info("Кеш обзора сброшен для market_id=%d (%d ключей)",
                 market_id, len(keys))


# ────────────────────── helpers ──────────────────────

def _safe_div(num: float, den: float) -> float | None:
    return num / den if den else None


def _safe_growth(cur: float, prev: float) -> float | None:
    return (cur - prev) / prev if prev else None


def _cagr(start: float, end: float, periods: int) -> float | None:
    if start <= 0 or end <= 0 or periods <= 0:
        return None
    return (end / start) ** (1 / periods) - 1


_FOREIGN_MARKERS = (
    "LTD", "GMBH", "INC", "CORP", "S.A", "S.A.",
    "PLC", "B.V", "B.V.", "AG", "CO.", "LLC",
)
_RU_MARKERS = ("ООО", "АО", "ЗАО", "ОАО", "ПАО", "ИП")


def _is_foreign_holder(name: str) -> bool:
    if not name:
        return False
    up = name.upper()
    if any(m in up for m in _RU_MARKERS):
        return False
    return any(m in up for m in _FOREIGN_MARKERS)


def _atc3(code: str | None) -> str | None:
    """Класс ATC как лежит в БДП — это уже название класса
    (например, «КРОВЬ», «АНАЛЬГЕТИК»), не WHO-код. Только нормализуем."""
    if not code:
        return None
    s = code.strip().upper()
    return s or None


# ────────────────────── builders ──────────────────────

def _build_volume(items: list[BdpRaw], years: list[int]) -> dict:
    usd_y1 = sum(i.usd_y1 for i in items)
    usd_y2 = sum(i.usd_y2 for i in items)
    usd_y3 = sum(i.usd_y3 for i in items)
    un_y1 = sum(i.un_y1 for i in items)
    un_y2 = sum(i.un_y2 for i in items)
    un_y3 = sum(i.un_y3 for i in items)

    asp_y2 = _safe_div(usd_y2, un_y2)
    asp_y3 = _safe_div(usd_y3, un_y3)

    ret_usd = sum(
        i.usd_y3 for i in items
        if "RET" in (i.sector_canonical or i.sector or "")
    )
    hos_usd = sum(
        i.usd_y3 for i in items
        if "HOS" in (i.sector_canonical or i.sector or "")
    )

    bg_usd = sum(
        i.usd_y3 for i in items
        if (i.bg_g or "").strip().upper().startswith(("B", "Б"))
    )
    g_usd = sum(
        i.usd_y3 for i in items
        if (i.bg_g or "").strip().upper().startswith(("G", "Г"))
    )
    bg_g_total = bg_usd + g_usd

    y_labels = [str(y) for y in sorted(years)[-3:]]

    return {
        "usd_y1": usd_y1,
        "usd_y2": usd_y2,
        "usd_y3": usd_y3,
        "un_y1": un_y1,
        "un_y2": un_y2,
        "un_y3": un_y3,
        "usd_growth": _safe_growth(usd_y3, usd_y2),
        "un_growth": _safe_growth(un_y3, un_y2),
        "usd_cagr_2y": _cagr(usd_y1, usd_y3, 2),
        "un_cagr_2y": _cagr(un_y1, un_y3, 2),
        "asp_y2": asp_y2,
        "asp_y3": asp_y3,
        "asp_growth": _safe_growth(asp_y3, asp_y2) if asp_y2 else None,
        "ret_share": _safe_div(ret_usd, usd_y3),
        "hos_share": _safe_div(hos_usd, usd_y3),
        "bg_share": _safe_div(bg_usd, bg_g_total) if bg_g_total else None,
        "g_share": _safe_div(g_usd, bg_g_total) if bg_g_total else None,
        "years_labels": y_labels,
    }


def _build_portfolio(items: list[BdpRaw], jnvlp_mnns: set[str]) -> dict:
    total = sum(i.usd_y3 for i in items)

    mnn_data: dict[str, dict] = defaultdict(
        lambda: {"usd_y2": 0.0, "usd_y3": 0.0, "un_y3": 0.0}
    )
    for i in items:
        key = i.mnn_canonical or i.mnn
        d = mnn_data[key]
        d["usd_y2"] += i.usd_y2
        d["usd_y3"] += i.usd_y3
        d["un_y3"] += i.un_y3

    top_mnn = [
        {
            "mnn": k,
            "usd": d["usd_y3"],
            "share": _safe_div(d["usd_y3"], total) or 0,
            "growth": _safe_growth(d["usd_y3"], d["usd_y2"]),
            "jnvlp": k in jnvlp_mnns,
        }
        for k, d in sorted(
            mnn_data.items(), key=lambda x: x[1]["usd_y3"], reverse=True
        )[:10]
    ]

    producer_data: dict[str, dict] = defaultdict(
        lambda: {"usd_y2": 0.0, "usd_y3": 0.0}
    )
    for i in items:
        prod = i.producer_canonical or i.producer
        if not prod:
            continue
        producer_data[prod]["usd_y2"] += i.usd_y2
        producer_data[prod]["usd_y3"] += i.usd_y3

    sorted_producers = sorted(
        producer_data.items(),
        key=lambda x: x[1]["usd_y3"],
        reverse=True,
    )
    top_producers = [
        {
            "name": k,
            "usd": d["usd_y3"],
            "share": _safe_div(d["usd_y3"], total) or 0,
            "growth": _safe_growth(d["usd_y3"], d["usd_y2"]),
        }
        for k, d in sorted_producers[:10]
    ]

    all_shares = [
        (d["usd_y3"] / total)
        for _, d in sorted_producers
        if total > 0
    ]
    hhi = sum(s * s for s in all_shares) * 10000 if all_shares else None
    top3_share = sum(all_shares[:3]) if all_shares else None

    atc_data: dict[str, float] = defaultdict(float)
    for i in items:
        code = _atc3(i.atc)
        if code:
            atc_data[code] += i.usd_y3
    atc_distribution = [
        {
            "atc": k,
            "usd": v,
            "share": _safe_div(v, total) or 0,
        }
        for k, v in sorted(
            atc_data.items(), key=lambda x: x[1], reverse=True
        )[:15]
    ]

    country_data: dict[str, dict] = defaultdict(
        lambda: {"usd": 0.0, "un": 0.0}
    )
    total_un = sum(i.un_y3 for i in items)
    for i in items:
        if i.country_mfr:
            country_data[i.country_mfr]["usd"] += i.usd_y3
            country_data[i.country_mfr]["un"] += i.un_y3
    countries = [
        {
            "name": k,
            "usd": v["usd"],
            "un": v["un"],
            "share": _safe_div(v["usd"], total) or 0,
            "un_share": _safe_div(v["un"], total_un) or 0,
        }
        for k, v in sorted(
            country_data.items(),
            key=lambda x: x[1]["usd"],
            reverse=True,
        )[:10]
    ]

    return {
        "top_mnn": top_mnn,
        "top_producers": top_producers,
        "hhi": hhi,
        "top3_share": top3_share,
        "atc_distribution": atc_distribution,
        "countries": countries,
    }


def _build_grls(
    grls_rows: list[GrlsEntry],
    bdp_items: list[BdpRaw],
) -> dict:
    active = [g for g in grls_rows if g.status in GRLS_ACTIVE_STATUSES]
    active_count = len(active)

    holders = {
        g.ru_holder_canonical or g.ru_holder
        for g in active
        if g.ru_holder_canonical or g.ru_holder
    }
    registrants_count = len(holders)

    year_counts: dict[int, int] = defaultdict(int)
    for g in active:
        if g.reg_date:
            year_counts[g.reg_date.year] += 1
    registrations_by_year = [
        {"year": y, "count": c}
        for y, c in sorted(year_counts.items())
    ]

    today = date.today()
    expiring_1y = 0
    expiring_2y = 0
    expiring_3y = 0
    for g in active:
        if not g.expire_date:
            continue
        days = (g.expire_date - today).days
        if days < 0:
            continue
        if days <= 365:
            expiring_1y += 1
        if days <= 365 * 2:
            expiring_2y += 1
        if days <= 365 * 3:
            expiring_3y += 1

    foreign_count = sum(
        1 for h in holders if _is_foreign_holder(h or "")
    )
    foreign_share = _safe_div(foreign_count, registrants_count)

    # JNVLP: МНН с >=1 активным РУ в ЖНВЛП и связанная доля денег
    jnvlp_mnns: set[str] = {
        g.mnn_canonical for g in active
        if g.jnvlp and g.mnn_canonical
    }
    total_usd = sum(i.usd_y3 for i in bdp_items)
    jnvlp_usd = sum(
        i.usd_y3 for i in bdp_items
        if (i.mnn_canonical or "") in jnvlp_mnns
    )
    jnvlp_money_share = _safe_div(jnvlp_usd, total_usd)

    return {
        "active_count": active_count,
        "registrants_count": registrants_count,
        "registrations_by_year": registrations_by_year,
        "expiring_1y": expiring_1y,
        "expiring_2y": expiring_2y,
        "expiring_3y": expiring_3y,
        "foreign_share": foreign_share,
        "jnvlp_money_share": jnvlp_money_share,
        "jnvlp_mnn_count": len(jnvlp_mnns),
    }, jnvlp_mnns


def _build_pc(
    pc_rows: list[PcEntry],
    bdp_items: list[BdpRaw],
    fx_rate: float | None,
) -> dict | None:
    if not pc_rows:
        return None

    pc_mnns = {p.mnn_canonical for p in pc_rows if p.mnn_canonical}
    all_mnns = {
        i.mnn_canonical for i in bdp_items if i.mnn_canonical
    }
    mnn_coverage = _safe_div(
        len(pc_mnns & all_mnns), len(all_mnns)
    ) if all_mnns else None

    total_usd = sum(i.usd_y3 for i in bdp_items)
    covered_usd = sum(
        i.usd_y3 for i in bdp_items
        if (i.mnn_canonical or "") in pc_mnns
    )
    money_coverage = _safe_div(covered_usd, total_usd)

    # Цена за единицу в USD
    unit_price_stats = None
    if fx_rate and fx_rate > 0:
        prices_usd: list[float] = []
        for p in pc_rows:
            if (
                p.price_rub_no_vat
                and p.pack_qty_parsed
                and p.pack_qty_parsed > 0
            ):
                prices_usd.append(
                    p.price_rub_no_vat / p.pack_qty_parsed / fx_rate
                )
        if prices_usd:
            prices_usd.sort()
            n = len(prices_usd)
            median = (
                prices_usd[n // 2] if n % 2 == 1
                else (prices_usd[n // 2 - 1] + prices_usd[n // 2]) / 2
            )
            unit_price_stats = {
                "count": n,
                "min": prices_usd[0],
                "p25": prices_usd[max(0, n // 4)],
                "median": median,
                "p75": prices_usd[min(n - 1, (3 * n) // 4)],
                "max": prices_usd[-1],
            }

    year_counts: dict[int, int] = defaultdict(int)
    for p in pc_rows:
        if p.price_effective_date:
            year_counts[p.price_effective_date.year] += 1
    indexation_by_year = [
        {"year": y, "count": c}
        for y, c in sorted(year_counts.items())
    ]

    owner_counts: dict[str, int] = defaultdict(int)
    for p in pc_rows:
        owner = p.owner_canonical or p.owner
        if owner:
            owner_counts[owner] += 1
    top_owners = [
        {"name": k, "count": v}
        for k, v in sorted(
            owner_counts.items(), key=lambda x: x[1], reverse=True
        )[:10]
    ]

    return {
        "mnn_coverage_pct": mnn_coverage,
        "money_coverage_pct": money_coverage,
        "unit_price_usd_stats": unit_price_stats,
        "indexation_by_year": indexation_by_year,
        "top_owners": top_owners,
    }


def _score_single_mnn(
    items: list[BdpRaw],
    jnvlp_mnns: set[str],
    pc_mnns: set[str],
    has_grls: bool,
    has_pc: bool,
    mnn_key: str,
) -> dict:
    """Считает Decision Engine score для одного МНН (без drivers/flags)."""
    usd_y2 = sum(i.usd_y2 for i in items)
    usd_y3 = sum(i.usd_y3 for i in items)
    un_y2 = sum(i.un_y2 for i in items)
    un_y3 = sum(i.un_y3 for i in items)

    asp_y2 = _safe_div(usd_y2, un_y2)
    asp_y3 = _safe_div(usd_y3, un_y3)
    asp_growth = _safe_growth(asp_y3, asp_y2) if asp_y2 and asp_y3 else None
    usd_growth = _safe_growth(usd_y3, usd_y2)
    un_growth = _safe_growth(un_y3, un_y2)

    threshold = max(MIN_COMPETITOR_USD, COMPETITOR_PCT * usd_y3)
    producer_sales: dict[str, float] = defaultdict(float)
    for i in items:
        prod = i.producer_canonical or i.producer
        if prod:
            producer_sales[prod] += i.usd_y3
    active = sum(1 for s in producer_sales.values() if s >= threshold)

    ret_usd = sum(
        i.usd_y3 for i in items
        if "RET" in (i.sector_canonical or i.sector or "")
    )
    ret_share = _safe_div(ret_usd, usd_y3)

    sorted_shares = sorted(
        (s / usd_y3 for s in producer_sales.values() if usd_y3 > 0),
        reverse=True,
    )
    top3 = sum(sorted_shares[:3]) if sorted_shares else None
    hhi = (
        sum(s * s for s in sorted_shares) * 10000
        if sorted_shares else None
    )

    forms = {(i.lf_canonical or i.lf_avp) for i in items if i.lf_canonical or i.lf_avp}
    strengths = {i.strength for i in items if i.strength}

    econ, _ = calculate_economic_score(
        usd_y3=usd_y3, usd_growth=usd_growth,
        un_growth=un_growth, un_y3=un_y3, asp_growth=asp_growth,
    )
    struct, _ = calculate_structure_score(
        active_competitors=active, top3_share=top3, hhi=hhi,
        ret_share=ret_share, forms_count=len(forms),
        strengths_count=len(strengths),
    )
    reg, _ = calculate_regulatory_score(
        jnvlp_flag=mnn_key in jnvlp_mnns,
        grls_active_count=1 if has_grls else 0,
        grls_registrants=1 if has_grls else 0,
        pc_flag=mnn_key in pc_mnns,
        has_grls=has_grls, has_pc=has_pc,
    )
    raw_total = econ + struct + reg
    total_score = round(raw_total / (50 + 30 + 20) * 100, 1)
    rec, color = get_recommendation(total_score)

    return {
        "mnn": mnn_key,
        "usd": usd_y3,
        "total_score": total_score,
        "recommendation": rec,
        "color": color,
    }


def _build_decision(
    items: list[BdpRaw],
    jnvlp_mnns: set[str],
    pc_mnns: set[str],
    has_grls: bool,
    has_pc: bool,
) -> dict:
    by_mnn: dict[str, list[BdpRaw]] = defaultdict(list)
    for i in items:
        key = i.mnn_canonical or i.mnn
        by_mnn[key].append(i)

    scores = [
        _score_single_mnn(
            its, jnvlp_mnns, pc_mnns, has_grls, has_pc, key,
        )
        for key, its in by_mnn.items()
    ]

    distribution: dict[str, int] = defaultdict(int)
    for s in scores:
        distribution[s["color"]] += 1

    top_opportunities = sorted(
        scores, key=lambda x: (-x["total_score"], -x["usd"])
    )[:10]
    top_avoid = sorted(
        scores, key=lambda x: (x["total_score"], -x["usd"])
    )[:10]

    return {
        "distribution": dict(distribution),
        "top_opportunities": top_opportunities,
        "top_avoid": top_avoid,
    }


# ────────────────────── endpoint ──────────────────────

async def _load_market_rows(db: AsyncSession, market_id: int):
    """Грузит BDP/GRLS/PC через Core columns (lightweight Row),
    минуя дорогую ORM-гидратацию объектов."""
    bdp_q = select(
        BdpRaw.mnn, BdpRaw.mnn_canonical, BdpRaw.tm,
        BdpRaw.producer, BdpRaw.producer_canonical,
        BdpRaw.sector, BdpRaw.sector_canonical,
        BdpRaw.atc, BdpRaw.lf, BdpRaw.lf_avp, BdpRaw.lf_canonical,
        BdpRaw.strength, BdpRaw.country_mfr, BdpRaw.bg_g,
        BdpRaw.usd_y1, BdpRaw.usd_y2, BdpRaw.usd_y3,
        BdpRaw.un_y1, BdpRaw.un_y2, BdpRaw.un_y3,
    ).where(BdpRaw.market_id == market_id)

    grls_q = select(
        GrlsEntry.mnn_canonical, GrlsEntry.ru_holder,
        GrlsEntry.ru_holder_canonical, GrlsEntry.jnvlp,
        GrlsEntry.status, GrlsEntry.reg_date, GrlsEntry.expire_date,
    ).where(GrlsEntry.market_id == market_id)

    pc_q = select(
        PcEntry.mnn_canonical, PcEntry.owner, PcEntry.owner_canonical,
        PcEntry.pack_qty_parsed, PcEntry.price_rub_no_vat,
        PcEntry.price_effective_date,
    ).where(PcEntry.market_id == market_id)

    bdp = (await db.execute(bdp_q)).all()
    grls = (await db.execute(grls_q)).all()
    pc = (await db.execute(pc_q)).all()
    return bdp, grls, pc


def _collect_atc3_options(items) -> list[dict]:
    """Список ATC-3 классов в данных с долей по USD (для селектора)."""
    atc_usd: dict[str, float] = defaultdict(float)
    for i in items:
        code = _atc3(i.atc)
        if code:
            atc_usd[code] += i.usd_y3
    total = sum(atc_usd.values()) or 1
    return [
        {"atc": k, "share": v / total}
        for k, v in sorted(atc_usd.items(), key=lambda x: -x[1])
    ]


# Комбинации фильтров, которые прогреваются в фоне после первого
# холодного запроса (без atc3 — он user-specific).
_PREWARM_COMBOS: list[tuple[str | None, str | None, str | None]] = [
    (None, None, None),
    ("ret", None, None),
    ("hos", None, None),
    (None, None, "only"),
    (None, None, "exclude"),
]

# По одному активному прогреву на market_id — чтобы не плодить
# параллельные SQLite-нагрузки.
_PREWARM_LOCKS: dict[int, asyncio.Lock] = {}


def _prewarm_lock(market_id: int) -> asyncio.Lock:
    lock = _PREWARM_LOCKS.get(market_id)
    if lock is None:
        lock = asyncio.Lock()
        _PREWARM_LOCKS[market_id] = lock
    return lock


async def _prewarm_market_overview(market_id: int) -> None:
    """Фоновая прогревка кеша для типовых комбинаций фильтров.
    Сериализуется лок-ом на market_id."""
    lock = _prewarm_lock(market_id)
    if lock.locked():
        return  # уже идёт прогрев, не дублируем
    async with lock:
        async with async_session() as db:
            for sector, atc3, jnvlp in _PREWARM_COMBOS:
                key = (market_id, sector or "all", atc3, jnvlp or "all")
                cached = _OVERVIEW_CACHE.get(key)
                if cached and (time.time() - cached[0]) < _CACHE_TTL_SEC:
                    continue
                try:
                    await _compute_overview(
                        db, market_id, sector, atc3, jnvlp,
                    )
                except Exception as e:
                    log.warning("Prewarm %s упал: %s", key, e)


@router.get("/{market_id}/overview")
async def market_overview(
    market_id: int,
    background_tasks: BackgroundTasks,
    sector: str | None = Query(None, regex="^(ret|hos|all)?$"),
    atc3: str | None = Query(None),
    jnvlp: str | None = Query(None, regex="^(all|only|exclude)?$"),
    db: AsyncSession = Depends(get_db),
):
    cache_key = (market_id, sector or "all", atc3, jnvlp or "all")
    was_cached = (
        cache_key in _OVERVIEW_CACHE
        and (time.time() - _OVERVIEW_CACHE[cache_key][0]) < _CACHE_TTL_SEC
    )
    response = await _compute_overview(db, market_id, sector, atc3, jnvlp)
    # Прогрев только если запрос был холодный — иначе плодим лишние задачи.
    if not was_cached:
        background_tasks.add_task(_prewarm_market_overview, market_id)
    return response


async def _compute_overview(
    db: AsyncSession,
    market_id: int,
    sector: str | None,
    atc3: str | None,
    jnvlp: str | None,
):
    cache_key = (market_id, sector or "all", atc3, jnvlp or "all")
    cached = _OVERVIEW_CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_SEC:
        return cached[1]

    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    all_bdp_items, grls_rows, pc_rows = await _load_market_rows(
        db, market_id,
    )
    if not all_bdp_items:
        raise HTTPException(400, "Для рынка не загружены данные БДП")

    years = json.loads(market.years_json)
    regions = (
        json.loads(market.regions_json) if market.regions_json else []
    )

    # ── ATC options строим до фильтра, чтобы селектор был стабильным ──
    atc_options = _collect_atc3_options(all_bdp_items)

    # ── Для JNVLP-фильтра нужно знать ЖНВЛП-МНН до построения блоков ──
    active_grls_all = [
        g for g in grls_rows if g.status in GRLS_ACTIVE_STATUSES
    ]
    jnvlp_mnns_all: set[str] = {
        g.mnn_canonical for g in active_grls_all
        if g.jnvlp and g.mnn_canonical
    }

    # ── применяем фильтры к BDP ──
    bdp_items = list(all_bdp_items)
    if sector == "ret":
        bdp_items = [
            i for i in bdp_items
            if "RET" in (i.sector_canonical or i.sector or "")
        ]
    elif sector == "hos":
        bdp_items = [
            i for i in bdp_items
            if "HOS" in (i.sector_canonical or i.sector or "")
        ]

    if atc3:
        atc3_up = atc3.strip().upper()
        bdp_items = [
            i for i in bdp_items if _atc3(i.atc) == atc3_up
        ]

    if jnvlp == "only":
        bdp_items = [
            i for i in bdp_items
            if (i.mnn_canonical or "") in jnvlp_mnns_all
        ]
    elif jnvlp == "exclude":
        bdp_items = [
            i for i in bdp_items
            if (i.mnn_canonical or "") not in jnvlp_mnns_all
        ]

    if not bdp_items:
        raise HTTPException(
            400, "По заданным фильтрам нет строк БДП. Снимите фильтры.",
        )

    # ── scope-MNN: ограничиваем GRLS/PC теми МНН, что прошли фильтр ──
    scope_mnns = {i.mnn_canonical or i.mnn for i in bdp_items}
    scoped_grls = [
        g for g in grls_rows
        if (g.mnn_canonical or "") in scope_mnns
    ]
    scoped_pc = [
        p for p in pc_rows
        if (p.mnn_canonical or "") in scope_mnns
    ]

    # ── header counters (на отфильтрованных данных) ──
    producer_set = {
        i.producer_canonical or i.producer
        for i in bdp_items
        if i.producer_canonical or i.producer
    }
    tm_set = {i.tm for i in bdp_items if i.tm}
    active_grls_count = sum(
        1 for g in scoped_grls if g.status in GRLS_ACTIVE_STATUSES
    )

    grls_block, jnvlp_mnns = (
        _build_grls(scoped_grls, bdp_items)
        if scoped_grls else (None, set())
    )

    pc_block = _build_pc(scoped_pc, bdp_items, market.fx_rate_usd_rub)
    pc_mnns = {p.mnn_canonical for p in scoped_pc if p.mnn_canonical}

    portfolio = _build_portfolio(bdp_items, jnvlp_mnns)
    volume = _build_volume(bdp_items, years)
    decision = _build_decision(
        bdp_items, jnvlp_mnns, pc_mnns,
        has_grls=bool(scoped_grls),
        has_pc=bool(scoped_pc),
    )

    header = {
        "market_id": market.id,
        "name": market.name,
        "years": years,
        "regions": regions,
        "language": market.language,
        "fx_rate_usd_rub": market.fx_rate_usd_rub,
        "fx_rate_date": (
            market.fx_rate_date.isoformat() if market.fx_rate_date else None
        ),
        "has_bdp": True,
        "has_pc": bool(scoped_pc),
        "has_grls": bool(scoped_grls),
        "mnn_count": len(scope_mnns),
        "producer_count": len(producer_set),
        "tm_count": len(tm_set),
        "grls_active_count": active_grls_count,
        "pc_rows_count": len(scoped_pc),
    }

    filters = {
        "applied": {
            "sector": sector or "all",
            "atc3": atc3,
            "jnvlp": jnvlp or "all",
        },
        "options": {
            "atc3": atc_options,
            "has_jnvlp_data": bool(jnvlp_mnns_all),
        },
    }

    response = {
        "header": header,
        "filters": filters,
        "volume": volume,
        "portfolio": portfolio,
        "grls": grls_block,
        "pc": pc_block,
        "decision": decision,
    }
    _OVERVIEW_CACHE[cache_key] = (time.time(), response)
    return response
