"""Обзор рынка целиком (все МНН разом).

Возвращает 4 блока:
  1. header  — шапка, счётчики
  2. volume  — общий объём БДП
  3. portfolio — топ МНН, топ производители, ATC, страны
  4. decision — распределение МНН по категориям скоринга

ВСЕ суммы в USD.
"""
import asyncio
import json
import logging
import time
from collections import defaultdict
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session, get_db
from backend.models import Market, BdpRaw
from backend.services.market_scoring import get_market_scoring
from backend.services.scoring import CATEGORIES
from backend.services.year_shift import (
    parse_years,
    resolve_year_idx,
    selected_year,
    shift_items,
    shifted_years,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["overview"])


# ────────────────────── overview cache ──────────────────────
# Полный ответ кешируется по (market_id, sector, atc3).
# Инвалидируется через invalidate_overview_cache(market_id) при любых
# изменениях BDP этого рынка.
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
        if "RET" in (i.sector or "")
    )
    hos_usd = sum(
        i.usd_y3 for i in items
        if "HOS" in (i.sector or "")
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

    y_labels = [str(y) if y else "—" for y in sorted(years)[-3:]]

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


def _build_portfolio(items: list[BdpRaw]) -> dict:
    total = sum(i.usd_y3 for i in items)

    mnn_data: dict[str, dict] = defaultdict(
        lambda: {"usd_y2": 0.0, "usd_y3": 0.0, "un_y3": 0.0}
    )
    for i in items:
        key = i.mnn
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
        }
        for k, d in sorted(
            mnn_data.items(), key=lambda x: x[1]["usd_y3"], reverse=True
        )[:10]
    ]

    producer_data: dict[str, dict] = defaultdict(
        lambda: {
            "usd_y2": 0.0, "usd_y3": 0.0,
            "country_usd": defaultdict(float),
        }
    )
    for i in items:
        prod = i.producer
        if not prod:
            continue
        pd = producer_data[prod]
        pd["usd_y2"] += i.usd_y2
        pd["usd_y3"] += i.usd_y3
        c = (i.country_mfr or "").strip()
        if c:
            pd["country_usd"][c] += i.usd_y3

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
            "country": (
                max(d["country_usd"].items(), key=lambda x: x[1])[0]
                if d["country_usd"] else None
            ),
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


DECISION_TOP_N = 10


def _build_decision(scoring: dict, scope_mnns: set[str]) -> dict:
    """Сводка скоринга рынка по МНН, попавшим в текущую выборку обзора.
    Баллы и ранги — общерыночные, фильтры обзора их не пересчитывают."""
    items = [i for i in scoring["items"] if i["mnn"] in scope_mnns]
    categories = {c: 0 for c in CATEGORIES}
    for i in items:
        categories[i["category"]] += 1
    passed = [i for i in items if i["passed"]]
    return {
        "total": len(items),
        "passed": len(passed),
        "categories": categories,
        "thresholds": scoring["settings"]["thresholds"],
        "top": [
            {
                "rank": i["rank"],
                "mnn": i["mnn"],
                "cls": i["cls"],
                "direction": i["direction"],
                "usd": i["sales"][2],
                "total": i["total"],
                "category": i["category"],
            }
            for i in passed[:DECISION_TOP_N]
        ],
    }


# ────────────────────── endpoint ──────────────────────

async def _load_market_rows(db: AsyncSession, market_id: int):
    """Грузит BDP через Core columns (lightweight Row),
    минуя дорогую ORM-гидратацию объектов."""
    bdp_q = select(
        BdpRaw.mnn, BdpRaw.tm,
        BdpRaw.producer,
        BdpRaw.sector,
        BdpRaw.atc, BdpRaw.lf, BdpRaw.lf_avp,
        BdpRaw.strength, BdpRaw.country_mfr, BdpRaw.bg_g,
        BdpRaw.usd_y1, BdpRaw.usd_y2, BdpRaw.usd_y3,
        BdpRaw.un_y1, BdpRaw.un_y2, BdpRaw.un_y3,
    ).where(BdpRaw.market_id == market_id)

    return (await db.execute(bdp_q)).all()


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
_PREWARM_COMBOS: list[tuple[str | None, str | None]] = [
    (None, None),
    ("ret", None),
    ("hos", None),
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
            for sector, atc3 in _PREWARM_COMBOS:
                key = (market_id, sector or "all", atc3)
                cached = _OVERVIEW_CACHE.get(key)
                if cached and (time.time() - cached[0]) < _CACHE_TTL_SEC:
                    continue
                try:
                    await _compute_overview(
                        db, market_id, sector, atc3,
                    )
                except Exception as e:
                    log.warning("Prewarm %s упал: %s", key, e)


@router.get("/{market_id}/overview")
async def market_overview(
    market_id: int,
    background_tasks: BackgroundTasks,
    sector: str | None = Query(None, regex="^(ret|hos|all)?$"),
    atc3: str | None = Query(None),
    year: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")
    year_idx = resolve_year_idx(market, year)
    cache_key = (
        market_id, sector or "all", atc3, year_idx,
    )
    was_cached = (
        cache_key in _OVERVIEW_CACHE
        and (time.time() - _OVERVIEW_CACHE[cache_key][0]) < _CACHE_TTL_SEC
    )
    response = await _compute_overview(
        db, market_id, sector, atc3, year_idx, market,
    )
    # Прогрев только если запрос был холодный — иначе плодим лишние задачи.
    if not was_cached:
        background_tasks.add_task(_prewarm_market_overview, market_id)
    return response


async def _compute_overview(
    db: AsyncSession,
    market_id: int,
    sector: str | None,
    atc3: str | None,
    year_idx: int = 2,
    market=None,
):
    cache_key = (
        market_id, sector or "all", atc3, year_idx,
    )
    cached = _OVERVIEW_CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_SEC:
        return cached[1]

    if market is None:
        market = await db.get(Market, market_id)
        if not market:
            raise HTTPException(404, "Рынок не найден")

    all_bdp_items = await _load_market_rows(db, market_id)
    if not all_bdp_items:
        raise HTTPException(400, "Для рынка не загружены данные БДП")

    # Сдвигаем окно годов если выбран не последний.
    all_bdp_items = shift_items(all_bdp_items, year_idx)

    years = parse_years(market)
    shifted_year_list = shifted_years(market, year_idx)
    selected = years[year_idx] if years else None
    regions = (
        json.loads(market.regions_json) if market.regions_json else []
    )

    # ── ATC options строим до фильтра, чтобы селектор был стабильным ──
    atc_options = _collect_atc3_options(all_bdp_items)

    # ── применяем фильтры к BDP ──
    bdp_items = list(all_bdp_items)
    if sector == "ret":
        bdp_items = [
            i for i in bdp_items
            if "RET" in (i.sector or "")
        ]
    elif sector == "hos":
        bdp_items = [
            i for i in bdp_items
            if "HOS" in (i.sector or "")
        ]

    if atc3:
        atc3_up = atc3.strip().upper()
        bdp_items = [
            i for i in bdp_items if _atc3(i.atc) == atc3_up
        ]

    if not bdp_items:
        raise HTTPException(
            400, "По заданным фильтрам нет строк БДП. Снимите фильтры.",
        )

    scope_mnns = {i.mnn for i in bdp_items}

    # ── header counters (на отфильтрованных данных) ──
    producer_set = {
        i.producer
        for i in bdp_items
        if i.producer
    }
    tm_set = {i.tm for i in bdp_items if i.tm}

    portfolio = _build_portfolio(bdp_items)
    volume = _build_volume(bdp_items, shifted_year_list)
    scoring = await get_market_scoring(db, market)
    decision = _build_decision(scoring, scope_mnns)

    header = {
        "market_id": market.id,
        "name": market.name,
        "years": years,
        "available_years": years,
        "selected_year": selected,
        "regions": regions,
        "language": market.language,
        "has_bdp": True,
        "mnn_count": len(scope_mnns),
        "producer_count": len(producer_set),
        "tm_count": len(tm_set),
    }

    filters = {
        "applied": {
            "sector": sector or "all",
            "atc3": atc3,
            "year": selected,
        },
        "options": {
            "atc3": atc_options,
        },
    }

    response = {
        "header": header,
        "filters": filters,
        "volume": volume,
        "portfolio": portfolio,
        "decision": decision,
    }
    _OVERVIEW_CACHE[cache_key] = (time.time(), response)
    return response
