import json
import logging
import math
import re
import time
from collections import defaultdict
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.config import (
    MIN_COMPETITOR_USD,
    COMPETITOR_PCT,
    GRLS_ACTIVE_STATUSES,
)
from backend.database import get_db
from backend.models import Market, BdpRaw, GrlsEntry, PcEntry
from backend.services.scoring import (
    calculate_economic_score,
    calculate_structure_score,
    calculate_regulatory_score,
    get_recommendation,
    generate_drivers_and_flags,
)


def _form_key(item) -> str:
    return item.lf_canonical or item.lf or item.lf_avp or "—"


_DOSE_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*"
    r"(MG|МГ|MCG|МКГ|UG|G|Г|ME|МЕ|IU|ME/ML|МЕ/МЛ|"
    r"%|MG/ML|МГ/МЛ|MG/G|МГ/Г|ML|МЛ)",
    re.IGNORECASE,
)


def _extract_dose(strength: str | None) -> str | None:
    if not strength:
        return None
    matches = _DOSE_RE.findall(strength)
    if not matches:
        return None
    return ", ".join(
        f"{num.replace(',', '.')} {unit.upper()}"
        for num, unit in matches
    )


def _dose_key(item) -> str:
    return _extract_dose(item.strength) or "—"


def _shannon_entropy_normalized(values: list[float]) -> float | None:
    """H = -Σ(s_i log2 s_i), нормирована к log2(N) ∈ [0,1]."""
    total = sum(values)
    if total <= 0:
        return None
    n = sum(1 for v in values if v > 0)
    if n <= 1:
        return 0.0
    shares = [v / total for v in values if v > 0]
    h = -sum(s * math.log2(s) for s in shares)
    h_max = math.log2(n)
    return h / h_max if h_max > 0 else 0.0


def _gini(values: list[float]) -> float | None:
    """Коэффициент Джини на положительных значениях. None если <2 точек."""
    pos = [v for v in values if v > 0]
    n = len(pos)
    if n < 2:
        return None
    pos.sort()
    total = sum(pos)
    if total <= 0:
        return None
    cumulative = sum((i + 1) * v for i, v in enumerate(pos))
    return (2 * cumulative) / (n * total) - (n + 1) / n


def _atc3(code: str | None) -> str | None:
    """Класс ATC как лежит в БДП — это уже название класса
    (например, «КРОВЬ», «АНАЛЬГЕТИК»), не WHO-код. Только нормализуем."""
    if not code:
        return None
    s = code.strip().upper()
    return s or None


log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["dashboard"])


# ────────────────────── dashboard cache ──────────────────────
# Полный ответ /dashboard/{mnn}?lf&dose кешируется на 10 минут
# как готовые JSON-байты (обходит Pydantic-валидацию при попадании
# в кеш). Инвалидируется через invalidate_dashboard_cache(market_id).
_DASHBOARD_CACHE: dict[tuple, tuple[float, bytes]] = {}
_DASHBOARD_CACHE_TTL_SEC = 600


def invalidate_dashboard_cache(market_id: int | None = None) -> None:
    if market_id is None:
        _DASHBOARD_CACHE.clear()
        log.info("Кеш dashboard сброшен целиком")
        return
    keys = [k for k in _DASHBOARD_CACHE if k[0] == market_id]
    for k in keys:
        _DASHBOARD_CACHE.pop(k, None)
    if keys:
        log.info(
            "Кеш dashboard сброшен для market_id=%d (%d ключей)",
            market_id, len(keys),
        )


@router.get("/{market_id}/mnn-list")
async def mnn_list(
    market_id: int,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    stmt = (
        select(BdpRaw.mnn_canonical)
        .where(BdpRaw.market_id == market_id)
        .distinct()
        .order_by(BdpRaw.mnn_canonical)
    )
    if q:
        stmt = stmt.where(BdpRaw.mnn_canonical.ilike(f"%{q.upper()}%"))

    result = await db.execute(stmt)
    mnns = [r[0] for r in result.all()]
    return {"mnns": mnns}


def _classify_market_status(
    usd_growth: float | None,
    un_growth: float | None,
) -> str:
    if usd_growth is None or un_growth is None:
        return "N/A"
    if usd_growth > 0.10 and un_growth > 0.0:
        return "Growing"
    if usd_growth < -0.10 or un_growth < -0.15:
        return "Declining"
    if usd_growth > 0.0 and un_growth < 0.0:
        return "Price-driven"
    if usd_growth < 0.0 and un_growth > 0.0:
        return "Price pressure"
    return "Stable"


@router.get("/{market_id}/dashboard/{mnn}")
async def dashboard(
    market_id: int,
    mnn: str,
    lf: str | None = Query(None),
    dose: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    mnn_upper = mnn.strip().upper()
    cache_key = (market_id, mnn_upper, lf or "", dose or "")
    now = time.monotonic()
    cached = _DASHBOARD_CACHE.get(cache_key)
    if cached and now - cached[0] < _DASHBOARD_CACHE_TTL_SEC:
        return Response(
            content=cached[1], media_type="application/json",
        )
    stmt = select(BdpRaw).where(
        BdpRaw.market_id == market_id,
        func.upper(BdpRaw.mnn_canonical) == mnn_upper,
    )
    result = await db.execute(stmt)
    all_items = result.scalars().all()

    if not all_items:
        raise HTTPException(404, "МНН не найден в базе. Проверьте написание.")

    real_canonical = all_items[0].mnn_canonical

    forms_doses_map: dict[str, set[str]] = defaultdict(set)
    doses_forms_map: dict[str, set[str]] = defaultdict(set)
    for it in all_items:
        f = _form_key(it)
        d = _dose_key(it)
        forms_doses_map[f].add(d)
        doses_forms_map[d].add(f)

    available_forms = sorted(forms_doses_map.keys())
    available_doses = sorted(doses_forms_map.keys())

    items = all_items
    if lf:
        items = [i for i in items if _form_key(i) == lf]
    if dose:
        items = [i for i in items if _dose_key(i) == dose]

    years = json.loads(market.years_json)
    regions = (
        json.loads(market.regions_json)
        if market.regions_json else []
    )

    has_grls = (await db.execute(
        select(func.count()).select_from(GrlsEntry)
        .where(GrlsEntry.market_id == market_id)
    )).scalar() > 0
    has_pc = (await db.execute(
        select(func.count()).select_from(PcEntry)
        .where(PcEntry.market_id == market_id)
    )).scalar() > 0

    zone1 = _build_zone1(items, years)
    zone2 = await _build_zone2(
        items, db, market_id, real_canonical, all_items,
    )
    atc_benchmark = await _build_atc_benchmark(
        db, market_id, items, real_canonical,
    )
    zone3 = _build_zone3(zone1, zone2, has_grls, has_pc)

    payload = {
        "mnn": real_canonical,
        "years": years,
        "regions": regions,
        "available_forms": available_forms,
        "available_doses": available_doses,
        "forms_doses_map": {
            k: sorted(v) for k, v in forms_doses_map.items()
        },
        "doses_forms_map": {
            k: sorted(v) for k, v in doses_forms_map.items()
        },
        "applied_filter": {"lf": lf, "dose": dose},
        "zone1": zone1,
        "zone2": zone2,
        "atc_benchmark": atc_benchmark,
        "zone3": zone3,
    }
    body = json.dumps(
        jsonable_encoder(payload), ensure_ascii=False,
    ).encode("utf-8")
    _DASHBOARD_CACHE[cache_key] = (now, body)
    return Response(content=body, media_type="application/json")


def _safe_growth(cur: float, prev: float) -> float | None:
    if prev == 0:
        return None
    return (cur - prev) / prev


def _build_zone1(items, years) -> dict:
    usd_y1 = sum(i.usd_y1 for i in items)
    usd_y2 = sum(i.usd_y2 for i in items)
    usd_y3 = sum(i.usd_y3 for i in items)
    un_y1 = sum(i.un_y1 for i in items)
    un_y2 = sum(i.un_y2 for i in items)
    un_y3 = sum(i.un_y3 for i in items)

    asp_y2 = usd_y2 / un_y2 if un_y2 > 0 else None
    asp_y3 = usd_y3 / un_y3 if un_y3 > 0 else None
    asp_growth = (
        _safe_growth(asp_y3, asp_y2)
        if asp_y2 and asp_y3 else None
    )

    usd_growth = _safe_growth(usd_y3, usd_y2)
    un_growth = _safe_growth(un_y3, un_y2)

    threshold = max(MIN_COMPETITOR_USD, COMPETITOR_PCT * usd_y3)
    producer_sales: dict[str, float] = defaultdict(float)
    for i in items:
        prod = i.producer_canonical or i.producer
        if prod:
            producer_sales[prod] += i.usd_y3
    active = sum(
        1 for s in producer_sales.values() if s >= threshold
    )
    total_producers = sum(1 for s in producer_sales.values() if s > 0)

    status = _classify_market_status(usd_growth, un_growth)

    y_labels = [str(y) for y in sorted(years)[-3:]]
    trend = {
        "years": y_labels,
        "usd": [usd_y1, usd_y2, usd_y3],
        "un": [un_y1, un_y2, un_y3],
    }

    return {
        "usd_last_year": usd_y3,
        "un_last_year": un_y3,
        "usd_growth": usd_growth,
        "un_growth": un_growth,
        "asp_last_year": asp_y3,
        "asp_growth": asp_growth,
        "active_competitors": active,
        "total_producers": total_producers,
        "competitor_threshold_usd": threshold,
        "market_status": status,
        "trend": trend,
    }


async def _build_zone2(
    items, db: AsyncSession, market_id: int, mnn_canonical: str,
    all_items=None,
) -> dict:
    total_usd_y3 = sum(i.usd_y3 for i in items)
    total_un_y3 = sum(i.un_y3 for i in items)

    ret_usd = sum(
        i.usd_y3 for i in items if "RET" in (i.sector_canonical or i.sector or "")
    )
    hos_usd = sum(
        i.usd_y3 for i in items if "HOS" in (i.sector_canonical or i.sector or "")
    )

    ret_share = ret_usd / total_usd_y3 if total_usd_y3 > 0 else None
    hos_share = hos_usd / total_usd_y3 if total_usd_y3 > 0 else None

    producer_data: dict[str, dict] = defaultdict(
        lambda: {
            "usd_y2": 0, "usd_y3": 0,
            "un_y2": 0, "un_y3": 0,
            "bg_usd_y3": 0.0, "g_usd_y3": 0.0,
        }
    )
    for i in items:
        prod = i.producer_canonical or i.producer
        if not prod:
            continue
        pd = producer_data[prod]
        pd["usd_y2"] += i.usd_y2
        pd["usd_y3"] += i.usd_y3
        pd["un_y2"] += i.un_y2
        pd["un_y3"] += i.un_y3
        flag = (i.bg_g or "").strip().upper()
        if flag.startswith(("B", "Б")):
            pd["bg_usd_y3"] += i.usd_y3
        elif flag.startswith(("G", "Г")):
            pd["g_usd_y3"] += i.usd_y3

    sorted_producers = sorted(
        producer_data.items(),
        key=lambda x: x[1]["usd_y3"],
        reverse=True,
    )

    top_competitors = []
    for name, d in sorted_producers[:10]:
        share = d["usd_y3"] / total_usd_y3 if total_usd_y3 > 0 else 0
        asp = (
            d["usd_y3"] / d["un_y3"] if d["un_y3"] > 0 else None
        )
        usd_gr = _safe_growth(d["usd_y3"], d["usd_y2"])
        un_gr = _safe_growth(d["un_y3"], d["un_y2"])
        bg_g_total = d["bg_usd_y3"] + d["g_usd_y3"]
        if bg_g_total <= 0:
            bg_g_flag = None
        else:
            bg_ratio = d["bg_usd_y3"] / bg_g_total
            if bg_ratio >= 0.6:
                bg_g_flag = "BG"
            elif bg_ratio <= 0.4:
                bg_g_flag = "G"
            else:
                bg_g_flag = "MIXED"
        top_competitors.append({
            "corporation": name,
            "usd_last_year": d["usd_y3"],
            "share": share,
            "un_last_year": d["un_y3"],
            "asp": asp,
            "usd_growth": usd_gr,
            "un_growth": un_gr,
            "bg_g_flag": bg_g_flag,
        })

    shares = [c["share"] for c in top_competitors]
    top3_share = sum(shares[:3]) if len(shares) >= 3 else sum(shares)
    leader_share = shares[0] if shares else None

    all_shares = [
        d["usd_y3"] / total_usd_y3
        for _, d in sorted_producers
        if total_usd_y3 > 0
    ]
    hhi = sum(s * s for s in all_shares) * 10000 if all_shares else None

    lf_data: dict[str, float] = defaultdict(float)
    for i in items:
        lf = i.lf_canonical or i.lf_avp
        if lf:
            lf_data[lf] += i.usd_y3
    forms = [
        {
            "name": k,
            "usd": v,
            "share": v / total_usd_y3 if total_usd_y3 > 0 else 0,
        }
        for k, v in sorted(
            lf_data.items(), key=lambda x: x[1], reverse=True
        )
    ]

    strength_data: dict[str, float] = defaultdict(float)
    for i in items:
        if i.strength:
            strength_data[i.strength] += i.usd_y3
    strengths = [
        {
            "name": k,
            "usd": v,
            "share": v / total_usd_y3 if total_usd_y3 > 0 else 0,
        }
        for k, v in sorted(
            strength_data.items(), key=lambda x: x[1], reverse=True
        )[:10]
    ]

    country_data: dict[str, dict] = defaultdict(
        lambda: {"usd": 0.0, "un": 0.0}
    )
    for i in items:
        if i.country_mfr:
            country_data[i.country_mfr]["usd"] += i.usd_y3
            country_data[i.country_mfr]["un"] += i.un_y3
    countries = [
        {
            "name": k,
            "usd": v["usd"],
            "un": v["un"],
            "share": v["usd"] / total_usd_y3 if total_usd_y3 > 0 else 0,
            "un_share": v["un"] / total_un_y3 if total_un_y3 > 0 else 0,
        }
        for k, v in sorted(
            country_data.items(), key=lambda x: x[1]["usd"], reverse=True
        )[:10]
    ]

    # ─── Концентрация по формам (по всему МНН, без lf/dose-фильтра) ───
    base_items = all_items if all_items is not None else items
    forms_groups: dict[str, list] = defaultdict(list)
    for it in base_items:
        forms_groups[_form_key(it)].append(it)

    concentration_by_form: list[dict] = []
    for form_name, form_items in forms_groups.items():
        form_total = sum(i.usd_y3 for i in form_items)
        if form_total <= 0:
            continue
        prod_sales: dict[str, float] = defaultdict(float)
        for i in form_items:
            prod = i.producer_canonical or i.producer
            if prod:
                prod_sales[prod] += i.usd_y3
        if not prod_sales:
            continue

        shares_sorted = sorted(prod_sales.values(), reverse=True)
        shares_pct = [s / form_total for s in shares_sorted]
        top3 = sum(shares_pct[:3])
        leader = shares_pct[0]
        hhi_v = sum(s * s for s in shares_pct) * 10000

        threshold = max(MIN_COMPETITOR_USD, COMPETITOR_PCT * form_total)
        active = sum(1 for v in prod_sales.values() if v >= threshold)

        concentration_by_form.append({
            "name": form_name,
            "usd_total": form_total,
            "share": (
                form_total / sum(i.usd_y3 for i in base_items)
                if sum(i.usd_y3 for i in base_items) > 0 else 0
            ),
            "hhi": hhi_v,
            "top3_share": top3,
            "leader_share": leader,
            "active_competitors": active,
            "producer_count": len(prod_sales),
        })
    concentration_by_form.sort(
        key=lambda x: x["usd_total"], reverse=True,
    )

    # ─── GRLS ───
    mnn_upper = mnn_canonical.upper()
    grls_result = await db.execute(
        select(GrlsEntry).where(
            GrlsEntry.market_id == market_id,
            func.upper(GrlsEntry.mnn_canonical) == mnn_upper,
        )
    )
    grls_rows = grls_result.scalars().all()

    active_grls = [g for g in grls_rows if g.status in GRLS_ACTIVE_STATUSES]
    grls_active_count = len(active_grls)
    grls_registrants = len({
        g.ru_holder_canonical or g.ru_holder
        for g in active_grls
        if g.ru_holder_canonical or g.ru_holder
    })
    jnvlp_flag = any(g.jnvlp for g in active_grls)

    znvlp_text = (
        "Да (ЖНВЛП)" if jnvlp_flag
        else ("Нет" if grls_rows else "Не определено")
    )
    grls_text = (
        f"{grls_active_count} активных РУ, {grls_registrants} регистрантов"
        if grls_rows else "Не определено"
    )

    # ─── Возраст рынка + окно истечения + регистрации по годам ───
    today = date.today()
    reg_years: dict[int, int] = defaultdict(int)
    expiring_1y = expiring_2y = expiring_3y = 0
    market_age = None
    oldest_year = None
    for g in active_grls:
        if g.reg_date:
            reg_years[g.reg_date.year] += 1
            if oldest_year is None or g.reg_date.year < oldest_year:
                oldest_year = g.reg_date.year
        if g.expire_date:
            days = (g.expire_date - today).days
            if days < 0:
                continue
            if days <= 365:
                expiring_1y += 1
            if days <= 365 * 2:
                expiring_2y += 1
            if days <= 365 * 3:
                expiring_3y += 1
    if oldest_year is not None:
        market_age = today.year - oldest_year
    registrations_by_year = [
        {"year": y, "count": c}
        for y, c in sorted(reg_years.items())
    ]
    grls_extra = {
        "market_age": market_age,
        "oldest_reg_year": oldest_year,
        "expiring_1y": expiring_1y,
        "expiring_2y": expiring_2y,
        "expiring_3y": expiring_3y,
        "registrations_by_year": registrations_by_year,
    }

    # ─── PC ───
    pc_result = await db.execute(
        select(PcEntry).where(
            PcEntry.market_id == market_id,
            func.upper(PcEntry.mnn_canonical) == mnn_upper,
        )
    )
    pc_rows = pc_result.scalars().all()
    pc_flag = len(pc_rows) > 0
    pc_prices = sorted(p.price_rub_no_vat for p in pc_rows if p.price_rub_no_vat)
    pc_stats = None
    if pc_prices:
        n = len(pc_prices)
        median = (
            pc_prices[n // 2] if n % 2 == 1
            else (pc_prices[n // 2 - 1] + pc_prices[n // 2]) / 2
        )
        pc_stats = {
            "min": pc_prices[0],
            "median": median,
            "max": pc_prices[-1],
            "count": n,
        }

    # ─── Энтропия Шеннона (нормированная) — по producer_sales ───
    producer_usd_values = [
        d["usd_y3"] for _, d in producer_data.items() if d["usd_y3"] > 0
    ]
    entropy_normalized = _shannon_entropy_normalized(producer_usd_values)

    # ─── Региональная концентрация (Gini) ───
    region_usd: dict[str, float] = defaultdict(float)
    for i in items:
        if i.region:
            region_usd[i.region] += i.usd_y3
    region_bars = [
        {
            "name": k,
            "usd": v,
            "share": v / total_usd_y3 if total_usd_y3 > 0 else 0,
        }
        for k, v in sorted(
            region_usd.items(), key=lambda x: x[1], reverse=True
        )
    ]
    region_gini = _gini(list(region_usd.values()))
    regional_distribution = {
        "regions": region_bars,
        "gini": region_gini,
        "regions_count": len(region_usd),
    } if len(region_usd) >= 2 else None

    # ─── БГ vs Г разрез: динамика Y1→Y3 + ASP по годам + gap ───
    bg = {"usd": [0.0, 0.0, 0.0], "un": [0.0, 0.0, 0.0]}
    g = {"usd": [0.0, 0.0, 0.0], "un": [0.0, 0.0, 0.0]}
    for i in items:
        flag = (i.bg_g or "").strip().upper()
        if flag.startswith(("B", "Б")):
            bucket = bg
        elif flag.startswith(("G", "Г")):
            bucket = g
        else:
            continue
        bucket["usd"][0] += i.usd_y1
        bucket["usd"][1] += i.usd_y2
        bucket["usd"][2] += i.usd_y3
        bucket["un"][0] += i.un_y1
        bucket["un"][1] += i.un_y2
        bucket["un"][2] += i.un_y3

    total_bg_g_y3 = bg["usd"][2] + g["usd"][2]
    bg_g_breakdown = None
    if total_bg_g_y3 > 0:
        totals_by_year = [
            bg["usd"][k] + g["usd"][k] for k in range(3)
        ]
        bg_share_by_year = [
            (bg["usd"][k] / totals_by_year[k])
            if totals_by_year[k] > 0 else None
            for k in range(3)
        ]
        asp_bg_by_year = [
            (bg["usd"][k] / bg["un"][k]) if bg["un"][k] > 0 else None
            for k in range(3)
        ]
        asp_g_by_year = [
            (g["usd"][k] / g["un"][k]) if g["un"][k] > 0 else None
            for k in range(3)
        ]
        asp_bg_y3 = asp_bg_by_year[2]
        asp_g_y3 = asp_g_by_year[2]
        asp_gap = (
            (asp_bg_y3 / asp_g_y3 - 1)
            if asp_bg_y3 and asp_g_y3 and asp_g_y3 > 0
            else None
        )
        bg_g_breakdown = {
            "bg_share": bg["usd"][2] / total_bg_g_y3,
            "g_share": g["usd"][2] / total_bg_g_y3,
            "bg_un_share": (
                bg["un"][2] / (bg["un"][2] + g["un"][2])
                if (bg["un"][2] + g["un"][2]) > 0 else None
            ),
            "g_un_share": (
                g["un"][2] / (bg["un"][2] + g["un"][2])
                if (bg["un"][2] + g["un"][2]) > 0 else None
            ),
            "asp_bg": asp_bg_y3,
            "asp_g": asp_g_y3,
            "asp_gap_pct": asp_gap,
            "bg_share_by_year": bg_share_by_year,
            "bg_usd_by_year": bg["usd"],
            "g_usd_by_year": g["usd"],
            "asp_bg_by_year": asp_bg_by_year,
            "asp_g_by_year": asp_g_by_year,
        }

    return {
        "ret_share": ret_share,
        "hos_share": hos_share,
        "top_competitors": top_competitors,
        "total_producers": len(sorted_producers),
        "top3_share": top3_share,
        "hhi": hhi,
        "entropy_normalized": entropy_normalized,
        "leader_share": leader_share,
        "forms": forms,
        "strengths": strengths,
        "countries": countries,
        "concentration_by_form": concentration_by_form,
        "regional_distribution": regional_distribution,
        "bg_g_breakdown": bg_g_breakdown,
        "znvlp": znvlp_text,
        "grls": grls_text,
        "grls_active_count": grls_active_count,
        "grls_registrants": grls_registrants,
        "grls_extra": grls_extra,
        "jnvlp_flag": jnvlp_flag,
        "pc_flag": pc_flag,
        "pc_stats": pc_stats,
    }


def _pct(values: list[float], q: float) -> float | None:
    v = [x for x in values if x is not None]
    if not v:
        return None
    v.sort()
    idx = max(0, min(len(v) - 1, int(round(q * (len(v) - 1)))))
    return v[idx]


async def _build_atc_benchmark(
    db: AsyncSession,
    market_id: int,
    our_items: list,
    real_canonical: str,
) -> list[dict]:
    """Бенчмарки нашего МНН по каждому ATC-классу из текущей
    выборки (с учётом фильтров lf/dose).

    Логика:
    — Берём уникальные ATC из our_items
    — Для каждого ATC: USD нашего МНН считаем по строкам с этим
      ATC (не по всему МНН), сравниваем с другими МНН в этом классе
    — Скрываем классы где <3 МНН и наш USD = 0
    """
    our_atcs = sorted({
        c for c in (_atc3(i.atc) for i in our_items) if c
    })
    if not our_atcs:
        return []

    # Один запрос — все строки рынка с непустым ATC
    result = await db.execute(
        select(
            BdpRaw.mnn_canonical, BdpRaw.mnn, BdpRaw.atc,
            BdpRaw.producer, BdpRaw.producer_canonical,
            BdpRaw.usd_y2, BdpRaw.usd_y3,
        ).where(
            BdpRaw.market_id == market_id,
            BdpRaw.atc.isnot(None),
        )
    )
    all_rows = result.all()

    # Группировка: ATC → MNN → строки
    rows_by_atc_mnn: dict[str, dict[str, list]] = defaultdict(
        lambda: defaultdict(list)
    )
    for r in all_rows:
        atc = _atc3(r.atc)
        if not atc:
            continue
        key = r.mnn_canonical or r.mnn
        rows_by_atc_mnn[atc][key].append(r)

    def _calc_metrics(rows: list) -> dict:
        usd_y2 = sum(r.usd_y2 for r in rows)
        usd_y3 = sum(r.usd_y3 for r in rows)
        prod_sales: dict[str, float] = defaultdict(float)
        for r in rows:
            p = r.producer_canonical or r.producer
            if p:
                prod_sales[p] += r.usd_y3
        shares = sorted(
            (s / usd_y3 for s in prod_sales.values() if usd_y3 > 0),
            reverse=True,
        )
        return {
            "usd": usd_y3,
            "growth": (
                (usd_y3 - usd_y2) / usd_y2 if usd_y2 > 0 else None
            ),
            "hhi": sum(s * s for s in shares) * 10000 if shares else None,
            "competitors": len(prod_sales),
        }

    # Наши строки сгруппированы по ATC из our_items (учёт фильтра lf/dose)
    our_rows_by_atc: dict[str, list] = defaultdict(list)
    for i in our_items:
        c = _atc3(i.atc)
        if c:
            our_rows_by_atc[c].append(i)

    benchmarks: list[dict] = []
    for atc in our_atcs:
        bucket = rows_by_atc_mnn.get(atc, {})
        if len(bucket) < 3:
            continue

        # Метрики нашего МНН — из отфильтрованных our_items
        our_rows = our_rows_by_atc.get(atc, [])
        our_metrics = _calc_metrics(our_rows) if our_rows else None
        if not our_metrics or our_metrics["usd"] <= 0:
            continue

        # Пиры (все МНН класса), мы свои метрики уже посчитали отдельно
        peers: list[dict] = []
        for key, rows in bucket.items():
            if key == real_canonical:
                # Подставляем наши отфильтрованные метрики
                peer = {"mnn": key, **our_metrics}
            else:
                peer = {"mnn": key, **_calc_metrics(rows)}
            peers.append(peer)

        usds = [p["usd"] for p in peers]
        growths = [p["growth"] for p in peers if p["growth"] is not None]
        hhis = [p["hhi"] for p in peers if p["hhi"] is not None]
        compets = [p["competitors"] for p in peers]

        peers_sorted_usd = sorted(peers, key=lambda x: -x["usd"])
        our_rank = next(
            (i + 1 for i, p in enumerate(peers_sorted_usd)
             if p["mnn"] == real_canonical),
            None,
        )

        benchmarks.append({
            "atc3": atc,
            "mnn_count": len(peers),
            "our": {
                "usd": our_metrics["usd"],
                "growth": our_metrics["growth"],
                "hhi": our_metrics["hhi"],
                "competitors": our_metrics["competitors"],
                "rank_by_usd": our_rank,
            },
            "class_stats": {
                "usd_median": _pct(usds, 0.5),
                "usd_p75": _pct(usds, 0.75),
                "usd_max": max(usds) if usds else None,
                "growth_median": _pct(growths, 0.5),
                "hhi_median": _pct(hhis, 0.5),
                "competitors_median": _pct(
                    [float(c) for c in compets], 0.5,
                ),
            },
            "top_peers": [
                {"mnn": p["mnn"], "usd": p["usd"]}
                for p in peers_sorted_usd[:5]
            ],
        })

    # Сортируем по нашему USD в классе (больший вклад — первым)
    benchmarks.sort(key=lambda b: -b["our"]["usd"])
    return benchmarks


def _build_zone3(
    zone1: dict, zone2: dict,
    has_grls: bool = False, has_pc: bool = False,
) -> dict:
    econ_score, econ_details = calculate_economic_score(
        usd_y3=zone1["usd_last_year"],
        usd_growth=zone1["usd_growth"],
        un_growth=zone1["un_growth"],
        un_y3=zone1["un_last_year"],
        asp_growth=zone1["asp_growth"],
    )

    struct_score, struct_details = calculate_structure_score(
        active_competitors=zone1["active_competitors"],
        top3_share=zone2["top3_share"],
        hhi=zone2["hhi"],
        ret_share=zone2["ret_share"],
        forms_count=len(zone2.get("forms") or []),
        strengths_count=len(zone2.get("strengths") or []),
    )

    reg_score, reg_details = calculate_regulatory_score(
        jnvlp_flag=zone2.get("jnvlp_flag", False),
        grls_active_count=zone2.get("grls_active_count", 0),
        grls_registrants=zone2.get("grls_registrants", 0),
        pc_flag=zone2.get("pc_flag", False),
        has_grls=has_grls,
        has_pc=has_pc,
    )

    # Пропорция из 100 (50 эконом + 30 структура + 20 регулирование)
    raw_total = econ_score + struct_score + reg_score
    max_possible = 50 + 30 + 20
    total_score = round(raw_total / max_possible * 100, 1)

    recommendation, color = get_recommendation(total_score)

    drivers, flags, checks = generate_drivers_and_flags(
        usd_y3=zone1["usd_last_year"],
        usd_growth=zone1["usd_growth"],
        un_growth=zone1["un_growth"],
        asp_growth=zone1["asp_growth"],
        top3_share=zone2["top3_share"],
        hhi=zone2["hhi"],
        active_competitors=zone1["active_competitors"],
        jnvlp_flag=zone2.get("jnvlp_flag", False),
        pc_flag=zone2.get("pc_flag", False),
        grls_registrants=zone2.get("grls_registrants", 0),
        has_grls=has_grls,
        has_pc=has_pc,
    )

    # ── Дополнительные drivers/flags из новых метрик ──
    entropy = zone2.get("entropy_normalized")
    if entropy is not None:
        if entropy >= 0.75 and zone1["active_competitors"] >= 4:
            drivers.append({
                "type": "positive",
                "text": f"Сбалансированная конкуренция (энтропия {entropy:.2f})",
            })
        elif entropy <= 0.20 and zone1["active_competitors"] >= 2:
            flags.append({
                "type": "competition",
                "text": f"Доминирование лидера (энтропия {entropy:.2f})",
            })

    rd = zone2.get("regional_distribution")
    if rd and rd.get("gini") is not None:
        gini = rd["gini"]
        if gini > 0.7:
            flags.append({
                "type": "geography",
                "text": (
                    f"Рынок локализован в нескольких регионах "
                    f"(Gini {gini:.2f})"
                ),
            })
            checks.append("Проверить причину региональной концентрации")

    grls_extra = zone2.get("grls_extra") or {}
    age = grls_extra.get("market_age")
    if age is not None:
        if age < 3:
            flags.append({
                "type": "regulatory",
                "text": f"Молодой рынок ({age} лет от первой РУ)",
            })
        elif age >= 15:
            drivers.append({
                "type": "positive",
                "text": f"Зрелый рынок ({age} лет от первой РУ)",
            })

    exp_1y = grls_extra.get("expiring_1y", 0)
    active_n = zone2.get("grls_active_count", 0)
    if active_n > 0 and exp_1y / active_n >= 0.30:
        drivers.append({
            "type": "positive",
            "text": (
                f"Окно входа: {exp_1y} из {active_n} РУ "
                "истекают в ближайший год"
            ),
        })
        checks.append("Список истекающих РУ — проверить кандидатов на замену")

    return {
        "total_score": total_score,
        "economic_score": econ_score,
        "structure_score": struct_score,
        "regulatory_score": reg_score,
        "details": {
            "economic": econ_details,
            "structure": struct_details,
            "regulatory": reg_details,
        },
        "recommendation": recommendation,
        "recommendation_color": color,
        "drivers": drivers,
        "red_flags": flags,
        "next_checks": checks,
    }
