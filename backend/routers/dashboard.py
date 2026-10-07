import json
import logging
import time
from collections import defaultdict
from types import SimpleNamespace
from typing import Any, Iterable

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.config import (
    MIN_COMPETITOR_USD,
    COMPETITOR_PCT,
)
from backend.database import get_db
from backend.models import Market, BdpRaw
from backend.routers.overview import build_movers
from backend.services.bdp_keys import EMPTY_KEY, dose_key, form_key
from backend.services.market_scoring import get_market_scoring
from backend.services.scoring_query import SUGGEST_LIMIT, suggest_mnn
from backend.services.year_shift import (
    parse_years,
    resolve_year_idx,
    selected_year,
    shift_items,
    shifted_years,
)


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


@router.get("/{market_id}/mnn-suggest")
async def mnn_suggest(
    market_id: int,
    q: str | None = None,
    limit: int = Query(SUGGEST_LIMIT, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Автокомплит МНН по БДП с баллом скоринга; при пустом q —
    лучшие по баллу."""
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")
    scoring = await get_market_scoring(db, market)
    return {"items": suggest_mnn(scoring["items"], q, limit)}


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
    year: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    year_idx = resolve_year_idx(market, year)
    selected = selected_year(market, year)

    mnn_upper = mnn.strip().upper()
    cache_key = (market_id, mnn_upper, lf or "", dose or "", year_idx)
    now = time.monotonic()
    cached = _DASHBOARD_CACHE.get(cache_key)
    if cached and now - cached[0] < _DASHBOARD_CACHE_TTL_SEC:
        return Response(
            content=cached[1], media_type="application/json",
        )
    stmt = select(BdpRaw).where(
        BdpRaw.market_id == market_id,
        func.upper(BdpRaw.mnn) == mnn_upper,
    )
    result = await db.execute(stmt)
    all_items = result.scalars().all()

    if not all_items:
        raise HTTPException(404, "МНН не найден в базе. Проверьте написание.")

    real_mnn = all_items[0].mnn

    forms_doses_map: dict[str, set[str]] = defaultdict(set)
    doses_forms_map: dict[str, set[str]] = defaultdict(set)
    for it in all_items:
        f = form_key(it)
        d = dose_key(it)
        forms_doses_map[f].add(d)
        doses_forms_map[d].add(f)

    available_forms = sorted(forms_doses_map.keys())
    available_doses = sorted(doses_forms_map.keys())

    def _selection(source):
        return [
            i for i in source
            if (not lf or form_key(i) == lf)
            and (not dose or dose_key(i) == dose)
        ]

    raw_selection = _selection(all_items)

    # Сдвигаем окно годов если выбран не последний год.
    all_items = shift_items(all_items, year_idx)
    items = _selection(all_items)

    years = parse_years(market)
    shifted_year_list = shifted_years(market, year_idx)
    regions = (
        json.loads(market.regions_json)
        if market.regions_json else []
    )

    zone1 = _build_zone1(items, shifted_year_list)
    # продажи по годам без сдвига окна — для графика в hero
    zone1["series"] = {
        "years": years[:3],
        "usd": [sum(getattr(i, f"usd_y{k}") for i in raw_selection)
                for k in (1, 2, 3)],
        "un": [sum(getattr(i, f"un_y{k}") for i in raw_selection)
               for k in (1, 2, 3)],
    }
    zone2 = _build_zone2(items, all_items)
    # Скоринг считается по всей выборке рынка с тем же фильтром
    # ЛФ/дозировки; из неё берём строку текущего МНН.
    scoring = await get_market_scoring(db, market, lf, dose)
    zone3 = {
        "item": scoring["by_mnn"].get(real_mnn),
        "selection_size": scoring["summary"]["total"],
        "weights": scoring["settings"]["weights"],
        "thresholds": scoring["settings"]["thresholds"],
        "stop": scoring["settings"]["stop"],
    }

    payload = {
        "mnn": real_mnn,
        "years": shifted_year_list,
        "available_years": years,
        "selected_year": selected,
        "regions": regions,
        "available_forms": available_forms,
        "available_doses": available_doses,
        "forms_doses_map": {
            k: sorted(v) for k, v in forms_doses_map.items()
        },
        "doses_forms_map": {
            k: sorted(v) for k, v in doses_forms_map.items()
        },
        "applied_filter": {"lf": lf, "dose": dose, "year": selected},
        "zone1": zone1,
        "zone2": zone2,
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
        prod = i.producer
        if prod:
            producer_sales[prod] += i.usd_y3
    active = sum(
        1 for s in producer_sales.values() if s >= threshold
    )
    total_producers = sum(1 for s in producer_sales.values() if s > 0)

    status = _classify_market_status(usd_growth, un_growth)

    y_labels = [str(y) if y else "—" for y in sorted(years)[-3:]]
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


MOVERS_LIMIT = 8
TMS_PER_PRODUCER = 6


def _top_movers(producer_data: dict[str, dict]) -> list[dict]:
    """Производители с наибольшим |Δ USD| к прошлому году,
    от наибольшего роста к наибольшему падению."""
    everyone = len(producer_data)
    rows = build_movers(producer_data, up=everyone, down=everyone)
    rows.sort(key=lambda r: -abs(r["delta"]))
    top = rows[:MOVERS_LIMIT]
    top.sort(key=lambda r: (-r["delta"], r["name"]))
    return top


def _producer_tms(tms: dict[str, dict], producer_usd: float) -> list[dict]:
    """Торговые марки производителя внутри МНН с долей в его продажах."""
    ranked = sorted(tms.items(), key=lambda x: (-x[1]["usd"], x[0]))
    return [
        {
            "tm": name,
            "usd": d["usd"],
            "share": d["usd"] / producer_usd if producer_usd > 0 else 0,
            "forms": sorted(f for f in d["forms"] if f != EMPTY_KEY),
            "doses": sorted(x for x in d["doses"] if x != EMPTY_KEY),
        }
        for name, d in ranked[:TMS_PER_PRODUCER]
    ]


def _build_zone2(items, all_items=None) -> dict:
    total_usd_y3 = sum(i.usd_y3 for i in items)
    total_un_y3 = sum(i.un_y3 for i in items)

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
            "bg_usd_y3": 0.0, "g_usd_y3": 0.0,
            "country_usd": defaultdict(float),
            "tms": defaultdict(
                lambda: {"usd": 0.0, "forms": set(), "doses": set()}
            ),
        }
    )
    for i in items:
        prod = i.producer
        if not prod:
            continue
        pd = producer_data[prod]
        tm = (i.tm or "").strip()
        if tm:
            td = pd["tms"][tm]
            td["usd"] += i.usd_y3
            td["forms"].add(form_key(i))
            td["doses"].add(dose_key(i))
        pd["usd_y2"] += i.usd_y2
        pd["usd_y3"] += i.usd_y3
        pd["un_y2"] += i.un_y2
        pd["un_y3"] += i.un_y3
        flag = (i.bg_g or "").strip().upper()
        if flag.startswith(("B", "Б")):
            pd["bg_usd_y3"] += i.usd_y3
        elif flag.startswith(("G", "Г")):
            pd["g_usd_y3"] += i.usd_y3
        country = (i.country_mfr or "").strip()
        if country:
            pd["country_usd"][country] += i.usd_y3

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
        top_country = (
            max(d["country_usd"].items(), key=lambda x: x[1])[0]
            if d["country_usd"] else None
        )
        top_competitors.append({
            "corporation": name,
            "usd_last_year": d["usd_y3"],
            "share": share,
            "un_last_year": d["un_y3"],
            "asp": asp,
            "usd_growth": usd_gr,
            "un_growth": un_gr,
            "bg_g_flag": bg_g_flag,
            "country": top_country,
            "tms": _producer_tms(d["tms"], d["usd_y3"]),
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
        lf = i.lf_avp
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
        lambda: {"usd": 0.0, "un": 0.0, "usd_y2": 0.0}
    )
    for i in items:
        if i.country_mfr:
            country_data[i.country_mfr]["usd"] += i.usd_y3
            country_data[i.country_mfr]["un"] += i.un_y3
            country_data[i.country_mfr]["usd_y2"] += i.usd_y2
    countries = [
        {
            "name": k,
            "usd": v["usd"],
            "un": v["un"],
            "share": v["usd"] / total_usd_y3 if total_usd_y3 > 0 else 0,
            "un_share": v["un"] / total_un_y3 if total_un_y3 > 0 else 0,
            "growth": _safe_growth(v["usd"], v["usd_y2"]),
        }
        for k, v in sorted(
            country_data.items(), key=lambda x: x[1]["usd"], reverse=True
        )[:10]
    ]

    # ─── Концентрация по формам (по всему МНН, без lf/dose-фильтра) ───
    base_items = all_items if all_items is not None else items
    forms_groups: dict[str, list] = defaultdict(list)
    for it in base_items:
        forms_groups[form_key(it)].append(it)

    concentration_by_form: list[dict] = []
    for form_name, form_items in forms_groups.items():
        form_total = sum(i.usd_y3 for i in form_items)
        if form_total <= 0:
            continue
        prod_sales: dict[str, float] = defaultdict(float)
        for i in form_items:
            prod = i.producer
            if prod:
                prod_sales[prod] += i.usd_y3
        if not prod_sales:
            continue

        leader_name = max(prod_sales.items(), key=lambda x: x[1])[0]
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
            "leader": leader_name,
            "active_competitors": active,
            "producer_count": len(prod_sales),
        })
    concentration_by_form.sort(
        key=lambda x: x["usd_total"], reverse=True,
    )

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
        "movers": _top_movers(producer_data),
        "total_producers": len(sorted_producers),
        "top3_share": top3_share,
        "hhi": hhi,
        "leader_share": leader_share,
        "forms": forms,
        "strengths": strengths,
        "countries": countries,
        "concentration_by_form": concentration_by_form,
        "regional_distribution": regional_distribution,
        "bg_g_breakdown": bg_g_breakdown,
    }
