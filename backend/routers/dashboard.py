import json
import logging
import re
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.config import (
    MIN_COMPETITOR_USD,
    COMPETITOR_PCT,
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
    zone3 = _build_zone3(zone1, zone2, has_grls, has_pc)

    return {
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
        prod = i.producer_canonical or i.producer
        if prod:
            producer_sales[prod] += i.usd_y3
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

    active_statuses = {
        "Действующий", "Изменённый",
        "Выдано по правилам ЕАЭС",
        "Действует на подтверждении государственной регистрации",
    }
    active_grls = [g for g in grls_rows if g.status in active_statuses]
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
        "concentration_by_form": concentration_by_form,
        "znvlp": znvlp_text,
        "grls": grls_text,
        "grls_active_count": grls_active_count,
        "grls_registrants": grls_registrants,
        "jnvlp_flag": jnvlp_flag,
        "pc_flag": pc_flag,
        "pc_stats": pc_stats,
    }


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
