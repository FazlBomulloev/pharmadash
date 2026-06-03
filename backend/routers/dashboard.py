import json
import logging
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.config import (
    MIN_COMPETITOR_USD,
    COMPETITOR_PCT,
    MARKET_STATUS_RULES,
)
from backend.database import get_db
from backend.models import Market, BdpRaw
from backend.services.scoring import (
    calculate_economic_score,
    calculate_structure_score,
    calculate_regulatory_score,
    get_recommendation,
    generate_drivers_and_flags,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["dashboard"])


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
        select(BdpRaw.mnn)
        .where(BdpRaw.market_id == market_id)
        .distinct()
        .order_by(BdpRaw.mnn)
    )
    if q:
        stmt = stmt.where(BdpRaw.mnn.ilike(f"%{q.upper()}%"))

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
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    mnn_norm = mnn.strip().upper()
    stmt = select(BdpRaw).where(
        BdpRaw.market_id == market_id,
        func.upper(BdpRaw.mnn) == mnn_norm,
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    if not items:
        raise HTTPException(404, "МНН не найден в базе. Проверьте написание.")

    years = json.loads(market.years_json)
    regions = (
        json.loads(market.regions_json)
        if market.regions_json else []
    )

    zone1 = _build_zone1(items, years)
    zone2 = _build_zone2(items)
    zone3 = _build_zone3(zone1, zone2)

    return {
        "mnn": mnn_norm,
        "years": years,
        "regions": regions,
        "zone1": zone1,
        "zone2": zone2,
        "zone3": zone3,
    }


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
        if i.producer:
            producer_sales[i.producer] += i.usd_y3
    active = sum(
        1 for s in producer_sales.values() if s >= threshold
    )

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
        "market_status": status,
        "trend": trend,
    }


def _build_zone2(items) -> dict:
    total_usd_y3 = sum(i.usd_y3 for i in items)

    ret_usd = sum(
        i.usd_y3 for i in items if "RET" in (i.sector or "")
    )
    hos_usd = sum(
        i.usd_y3 for i in items if "HOS" in (i.sector or "")
    )

    ret_share = ret_usd / total_usd_y3 if total_usd_y3 > 0 else None
    hos_share = hos_usd / total_usd_y3 if total_usd_y3 > 0 else None

    producer_data: dict[str, dict] = defaultdict(
        lambda: {
            "usd_y2": 0, "usd_y3": 0,
            "un_y2": 0, "un_y3": 0,
        }
    )
    for i in items:
        if not i.producer:
            continue
        pd = producer_data[i.producer]
        pd["usd_y2"] += i.usd_y2
        pd["usd_y3"] += i.usd_y3
        pd["un_y2"] += i.un_y2
        pd["un_y3"] += i.un_y3

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
        top_competitors.append({
            "corporation": name,
            "usd_last_year": d["usd_y3"],
            "share": share,
            "un_last_year": d["un_y3"],
            "asp": asp,
            "usd_growth": usd_gr,
            "un_growth": un_gr,
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
        if i.lf_avp:
            lf_data[i.lf_avp] += i.usd_y3
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

    country_data: dict[str, float] = defaultdict(float)
    for i in items:
        if i.country_mfr:
            country_data[i.country_mfr] += i.usd_y3
    countries = [
        {
            "name": k,
            "usd": v,
            "share": v / total_usd_y3 if total_usd_y3 > 0 else 0,
        }
        for k, v in sorted(
            country_data.items(), key=lambda x: x[1], reverse=True
        )[:10]
    ]

    return {
        "ret_share": ret_share,
        "hos_share": hos_share,
        "top_competitors": top_competitors,
        "top3_share": top3_share,
        "hhi": hhi,
        "leader_share": leader_share,
        "forms": forms,
        "strengths": strengths,
        "countries": countries,
        "znvlp": "Не определено",
        "grls": "Не определено",
    }


def _build_zone3(zone1: dict, zone2: dict) -> dict:
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
    )

    reg_score, reg_details = calculate_regulatory_score()

    # Без справочников: пропорция из 80
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
    )

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
