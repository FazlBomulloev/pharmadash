"""Drill-down эндпоинты по производителю и стране производства.

Четыре endpoint'а:
  1. GET /markets/{market_id}/producer/{producer_name}
  2. GET /markets/{market_id}/mnn/{mnn}/producer/{producer_name}
  3. GET /markets/{market_id}/country/{country_name}
  4. GET /markets/{market_id}/mnn/{mnn}/country/{country_name}

Оптимизация: не тянем всё БДП рынка. WHERE-фильтр по producer/country/mnn
в SQL, выбираем только нужные колонки (не ORM instances).
"""
import json
import logging
from collections import defaultdict
from typing import Any, Sequence

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Market, BdpRaw


log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["drilldown"])


# Набор колонок, нужных builder-ам. Не тянем ORM instance (20+ колонок,
# hydrate 51K объектов — это и есть тормоз). Row поддерживает
# attribute access, поэтому builders работают без изменений.
BDP_COLS = (
    BdpRaw.mnn, BdpRaw.mnn_canonical,
    BdpRaw.tm,
    BdpRaw.producer, BdpRaw.producer_canonical,
    BdpRaw.sector, BdpRaw.sector_canonical,
    BdpRaw.region,
    BdpRaw.lf, BdpRaw.lf_canonical, BdpRaw.lf_avp,
    BdpRaw.strength,
    BdpRaw.country_mfr,
    BdpRaw.bg_g,
    BdpRaw.usd_y1, BdpRaw.usd_y2, BdpRaw.usd_y3,
    BdpRaw.un_y1, BdpRaw.un_y2, BdpRaw.un_y3,
)


# ────────────────────── helpers ──────────────────────

def _safe_div(num: float, den: float) -> float | None:
    return num / den if den else None


def _safe_growth(cur: float, prev: float) -> float | None:
    return (cur - prev) / prev if prev else None


def _cagr(start: float, end: float, periods: int) -> float | None:
    if start <= 0 or end <= 0 or periods <= 0:
        return None
    return (end / start) ** (1 / periods) - 1


def _norm_producer(name: str | None) -> str:
    return (name or "").strip().casefold()


def _norm_country(name: str | None) -> str:
    return (name or "").strip().upper()


def _norm_mnn(name: str | None) -> str:
    return (name or "").strip().upper()


def _producer_key(item: Any) -> str | None:
    return item.producer_canonical or item.producer


def _mnn_key(item: Any) -> str | None:
    return item.mnn_canonical or item.mnn


def _form_key(item: Any) -> str:
    return item.lf_canonical or item.lf_avp or "—"


def _years_labels(market: Market) -> list[str]:
    years = json.loads(market.years_json)
    return [str(y) for y in sorted(years)[-3:]]


# ────────────────────── loaders (SQL-filtered, only needed cols) ──────────────────────

async def _load_producer_items(
    db: AsyncSession, market_id: int, producer_name: str,
) -> Sequence[Any]:
    target = _norm_producer(producer_name)
    result = await db.execute(
        select(*BDP_COLS).where(
            BdpRaw.market_id == market_id,
            or_(
                func.lower(BdpRaw.producer_canonical) == target,
                func.lower(BdpRaw.producer) == target,
            ),
        )
    )
    return result.all()


async def _load_country_items(
    db: AsyncSession, market_id: int, country_name: str,
) -> Sequence[Any]:
    target = _norm_country(country_name)
    result = await db.execute(
        select(*BDP_COLS).where(
            BdpRaw.market_id == market_id,
            func.upper(BdpRaw.country_mfr) == target,
        )
    )
    return result.all()


async def _load_mnn_items(
    db: AsyncSession, market_id: int, mnn: str,
) -> Sequence[Any]:
    target = _norm_mnn(mnn)
    result = await db.execute(
        select(*BDP_COLS).where(
            BdpRaw.market_id == market_id,
            func.upper(BdpRaw.mnn_canonical) == target,
        )
    )
    return result.all()


async def _market_total_usd_y3(db: AsyncSession, market_id: int) -> float:
    result = await db.execute(
        select(func.coalesce(func.sum(BdpRaw.usd_y3), 0.0))
        .where(BdpRaw.market_id == market_id)
    )
    return float(result.scalar() or 0.0)


async def _market_totals_3y(
    db: AsyncSession, market_id: int,
) -> tuple[float, float, float]:
    result = await db.execute(
        select(
            func.coalesce(func.sum(BdpRaw.usd_y1), 0.0),
            func.coalesce(func.sum(BdpRaw.usd_y2), 0.0),
            func.coalesce(func.sum(BdpRaw.usd_y3), 0.0),
        ).where(BdpRaw.market_id == market_id)
    )
    row = result.one()
    return (float(row[0]), float(row[1]), float(row[2]))


async def _mnn_competitors_map(
    db: AsyncSession, market_id: int,
) -> dict[str, int]:
    """MNN (as stored) → count distinct producers на этом МНН.
    Один aggregate SQL — быстрее чем python-loop над всем БДП."""
    mnn_expr = func.coalesce(BdpRaw.mnn_canonical, BdpRaw.mnn).label("m")
    prod_expr = func.coalesce(BdpRaw.producer_canonical, BdpRaw.producer)
    result = await db.execute(
        select(mnn_expr, func.count(func.distinct(prod_expr)).label("c"))
        .where(BdpRaw.market_id == market_id)
        .group_by(mnn_expr)
    )
    return {row.m: int(row.c) for row in result.all()}


# ────────────────────── producer builders ──────────────────────

def _producer_kpi(
    items: Sequence[Any],
    scope_total_usd_y3: float,
    years_labels: list[str],
) -> dict:
    usd_y1 = sum(i.usd_y1 for i in items)
    usd_y2 = sum(i.usd_y2 for i in items)
    usd_y3 = sum(i.usd_y3 for i in items)
    un_y1 = sum(i.un_y1 for i in items)
    un_y2 = sum(i.un_y2 for i in items)
    un_y3 = sum(i.un_y3 for i in items)

    asp_y2 = _safe_div(usd_y2, un_y2)
    asp_y3 = _safe_div(usd_y3, un_y3)
    asp_growth = (
        _safe_growth(asp_y3, asp_y2)
        if asp_y2 is not None and asp_y3 is not None
        else None
    )

    return {
        "usd_y1": usd_y1, "usd_y2": usd_y2, "usd_y3": usd_y3,
        "un_y1": un_y1, "un_y2": un_y2, "un_y3": un_y3,
        "usd_growth": _safe_growth(usd_y3, usd_y2),
        "un_growth": _safe_growth(un_y3, un_y2),
        "usd_cagr_2y": _cagr(usd_y1, usd_y3, 2),
        "asp_y3": asp_y3,
        "asp_growth": asp_growth,
        "share_of_market": _safe_div(usd_y3, scope_total_usd_y3),
        "years_labels": years_labels,
    }


def _producer_mnn_portfolio(
    items: Sequence[Any],
    market_mnn_competitors: dict[str, int],
    market_total_usd_y3: float,
) -> list[dict]:
    """Разбивка производителя по МНН (только market-scope).
    competitors_in_mnn берём из pre-computed aggregate."""
    producer_total_y3 = sum(i.usd_y3 for i in items)

    mnn_data: dict[str, dict] = defaultdict(
        lambda: {"usd_y2": 0.0, "usd_y3": 0.0}
    )
    for i in items:
        key = _mnn_key(i)
        if not key:
            continue
        d = mnn_data[key]
        d["usd_y2"] += i.usd_y2
        d["usd_y3"] += i.usd_y3

    ranked = sorted(
        mnn_data.items(), key=lambda x: x[1]["usd_y3"], reverse=True,
    )[:15]

    return [
        {
            "mnn": name,
            "usd_y3": d["usd_y3"],
            "share_in_market": _safe_div(
                d["usd_y3"], market_total_usd_y3,
            ) or 0.0,
            "share_in_producer": _safe_div(
                d["usd_y3"], producer_total_y3,
            ) or 0.0,
            "growth": _safe_growth(d["usd_y3"], d["usd_y2"]),
            "competitors_in_mnn": market_mnn_competitors.get(name, 0),
        }
        for name, d in ranked
    ]


def _producer_tm_breakdown(items: Sequence[Any]) -> list[dict]:
    producer_total_y3 = sum(i.usd_y3 for i in items)

    grouped: dict[tuple[str, str], dict] = defaultdict(
        lambda: {
            "usd_y3": 0.0, "un_y3": 0.0,
            "bg_usd_y3": 0.0, "g_usd_y3": 0.0,
        }
    )
    for i in items:
        tm = (i.tm or "").strip()
        if not tm:
            continue
        form = _form_key(i)
        key = (tm, form)
        d = grouped[key]
        d["usd_y3"] += i.usd_y3
        d["un_y3"] += i.un_y3
        flag = (i.bg_g or "").strip().upper()
        if flag.startswith(("B", "Б")):
            d["bg_usd_y3"] += i.usd_y3
        elif flag.startswith(("G", "Г")):
            d["g_usd_y3"] += i.usd_y3

    ranked = sorted(
        grouped.items(), key=lambda x: x[1]["usd_y3"], reverse=True,
    )[:20]

    result: list[dict] = []
    for (tm, form), d in ranked:
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
        result.append({
            "tm": tm, "form": form,
            "usd_y3": d["usd_y3"], "un_y3": d["un_y3"],
            "share_in_producer": _safe_div(
                d["usd_y3"], producer_total_y3,
            ) or 0.0,
            "bg_g_flag": bg_g_flag,
        })
    return result


def _producer_sector_split(items: Sequence[Any]) -> dict:
    total_y3 = sum(i.usd_y3 for i in items)
    ret_usd = sum(
        i.usd_y3 for i in items
        if "RET" in (i.sector_canonical or i.sector or "")
    )
    hos_usd = sum(
        i.usd_y3 for i in items
        if "HOS" in (i.sector_canonical or i.sector or "")
    )
    return {
        "ret_usd": ret_usd, "hos_usd": hos_usd,
        "ret_share": _safe_div(ret_usd, total_y3),
        "hos_share": _safe_div(hos_usd, total_y3),
    }


def _producer_top_regions(items: Sequence[Any]) -> list[dict]:
    producer_total_y3 = sum(i.usd_y3 for i in items)
    region_data: dict[str, float] = defaultdict(float)
    for i in items:
        if i.region:
            region_data[i.region] += i.usd_y3
    ranked = sorted(
        region_data.items(), key=lambda x: x[1], reverse=True,
    )[:10]
    return [
        {
            "region": name,
            "usd_y3": usd,
            "share_in_producer": _safe_div(usd, producer_total_y3) or 0.0,
        }
        for name, usd in ranked
    ]


# ────────────────────── country builders ──────────────────────

def _country_kpi(
    items: Sequence[Any],
    market_totals: tuple[float, float, float],
    years_labels: list[str],
) -> dict:
    usd_y1 = sum(i.usd_y1 for i in items)
    usd_y2 = sum(i.usd_y2 for i in items)
    usd_y3 = sum(i.usd_y3 for i in items)
    un_y1 = sum(i.un_y1 for i in items)
    un_y2 = sum(i.un_y2 for i in items)
    un_y3 = sum(i.un_y3 for i in items)

    market_usd_y1, market_usd_y2, market_usd_y3 = market_totals

    producers = {
        _producer_key(i) for i in items if _producer_key(i)
    }
    mnns = {_mnn_key(i) for i in items if _mnn_key(i)}

    share_y3 = _safe_div(usd_y3, market_usd_y3)

    return {
        "usd_y1": usd_y1, "usd_y2": usd_y2, "usd_y3": usd_y3,
        "un_y1": un_y1, "un_y2": un_y2, "un_y3": un_y3,
        "usd_growth": _safe_growth(usd_y3, usd_y2),
        "un_growth": _safe_growth(un_y3, un_y2),
        "share_y1": _safe_div(usd_y1, market_usd_y1),
        "share_y2": _safe_div(usd_y2, market_usd_y2),
        "share_y3": share_y3,
        "share_of_market": share_y3,
        "producers_count": len(producers),
        "mnns_count": len(mnns),
        "years_labels": years_labels,
    }


def _country_producers(
    items: Sequence[Any],
    market_total_usd_y3: float,
) -> list[dict]:
    country_total_y3 = sum(i.usd_y3 for i in items)

    producer_data: dict[str, dict] = defaultdict(
        lambda: {"usd_y2": 0.0, "usd_y3": 0.0}
    )
    for i in items:
        pkey = _producer_key(i)
        if not pkey:
            continue
        d = producer_data[pkey]
        d["usd_y2"] += i.usd_y2
        d["usd_y3"] += i.usd_y3

    ranked = sorted(
        producer_data.items(),
        key=lambda x: x[1]["usd_y3"], reverse=True,
    )[:15]

    return [
        {
            "name": name,
            "usd_y3": d["usd_y3"],
            "share_in_country": _safe_div(
                d["usd_y3"], country_total_y3,
            ) or 0.0,
            "share_in_market": _safe_div(
                d["usd_y3"], market_total_usd_y3,
            ) or 0.0,
            "growth": _safe_growth(d["usd_y3"], d["usd_y2"]),
        }
        for name, d in ranked
    ]


def _country_mnn_portfolio(items: Sequence[Any]) -> list[dict]:
    country_total_y3 = sum(i.usd_y3 for i in items)

    mnn_data: dict[str, dict] = defaultdict(
        lambda: {"usd_y2": 0.0, "usd_y3": 0.0}
    )
    for i in items:
        key = _mnn_key(i)
        if not key:
            continue
        d = mnn_data[key]
        d["usd_y2"] += i.usd_y2
        d["usd_y3"] += i.usd_y3

    ranked = sorted(
        mnn_data.items(), key=lambda x: x[1]["usd_y3"], reverse=True,
    )[:15]

    return [
        {
            "mnn": name,
            "usd_y3": d["usd_y3"],
            "share_in_country": _safe_div(
                d["usd_y3"], country_total_y3,
            ) or 0.0,
            "growth": _safe_growth(d["usd_y3"], d["usd_y2"]),
        }
        for name, d in ranked
    ]


def _country_forms_breakdown(items: Sequence[Any]) -> list[dict]:
    country_total_y3 = sum(i.usd_y3 for i in items)

    form_groups: dict[str, list] = defaultdict(list)
    for i in items:
        form_groups[_form_key(i)].append(i)

    result: list[dict] = []
    for form_name, form_items in form_groups.items():
        form_total_y3 = sum(i.usd_y3 for i in form_items)
        if form_total_y3 <= 0:
            continue

        tm_data: dict[str, float] = defaultdict(float)
        for it in form_items:
            tm = (it.tm or "").strip()
            if not tm:
                continue
            tm_data[tm] += it.usd_y3

        tms = [
            {
                "tm": tm, "usd_y3": usd,
                "share_in_form": _safe_div(usd, form_total_y3) or 0.0,
            }
            for tm, usd in sorted(
                tm_data.items(), key=lambda x: x[1], reverse=True,
            )[:5]
        ]

        result.append({
            "form": form_name,
            "usd_y3": form_total_y3,
            "share_in_country": _safe_div(
                form_total_y3, country_total_y3,
            ) or 0.0,
            "tms": tms,
        })

    result.sort(key=lambda x: x["usd_y3"], reverse=True)
    return result


# ────────────────────── endpoints: producer ──────────────────────

@router.get("/{market_id}/producer/{producer_name}")
async def producer_market_scope(
    market_id: int,
    producer_name: str,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    items = await _load_producer_items(db, market_id, producer_name)
    if not items:
        raise HTTPException(404, "Производитель не найден в рынке")

    real_name = _producer_key(items[0])
    market_total_usd_y3 = await _market_total_usd_y3(db, market_id)
    mnn_competitors = await _mnn_competitors_map(db, market_id)
    years_labels = _years_labels(market)

    return {
        "name": real_name or producer_name,
        "kpi": _producer_kpi(
            items, market_total_usd_y3, years_labels,
        ),
        "mnn_portfolio": _producer_mnn_portfolio(
            items, mnn_competitors, market_total_usd_y3,
        ),
        "tm_breakdown": _producer_tm_breakdown(items),
        "sector_split": _producer_sector_split(items),
        "top_regions": _producer_top_regions(items),
    }


@router.get("/{market_id}/mnn/{mnn}/producer/{producer_name}")
async def producer_mnn_scope(
    market_id: int,
    mnn: str,
    producer_name: str,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    mnn_items = await _load_mnn_items(db, market_id, mnn)
    if not mnn_items:
        raise HTTPException(404, "МНН не найден в рынке")

    target = _norm_producer(producer_name)
    items = [
        i for i in mnn_items
        if _norm_producer(_producer_key(i)) == target
    ]
    if not items:
        raise HTTPException(
            404, "Производитель не найден в выбранном МНН",
        )

    real_name = _producer_key(items[0])
    mnn_total_usd_y3 = sum(i.usd_y3 for i in mnn_items)
    years_labels = _years_labels(market)

    return {
        "name": real_name or producer_name,
        "kpi": _producer_kpi(
            items, mnn_total_usd_y3, years_labels,
        ),
        "mnn_portfolio": None,
        "tm_breakdown": _producer_tm_breakdown(items),
        "sector_split": _producer_sector_split(items),
        "top_regions": _producer_top_regions(items),
    }


# ────────────────────── endpoints: country ──────────────────────

@router.get("/{market_id}/country/{country_name}")
async def country_market_scope(
    market_id: int,
    country_name: str,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    items = await _load_country_items(db, market_id, country_name)
    if not items:
        raise HTTPException(404, "Страна не найдена в рынке")

    real_name = items[0].country_mfr
    market_totals = await _market_totals_3y(db, market_id)
    market_total_usd_y3 = market_totals[2]
    years_labels = _years_labels(market)

    return {
        "name": real_name or country_name,
        "kpi": _country_kpi(items, market_totals, years_labels),
        "producers": _country_producers(items, market_total_usd_y3),
        "mnn_portfolio": _country_mnn_portfolio(items),
        "forms_breakdown": _country_forms_breakdown(items),
    }


@router.get("/{market_id}/mnn/{mnn}/country/{country_name}")
async def country_mnn_scope(
    market_id: int,
    mnn: str,
    country_name: str,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    mnn_items = await _load_mnn_items(db, market_id, mnn)
    if not mnn_items:
        raise HTTPException(404, "МНН не найден в рынке")

    target = _norm_country(country_name)
    items = [
        i for i in mnn_items
        if _norm_country(i.country_mfr) == target
    ]
    if not items:
        raise HTTPException(
            404, "Страна не найдена в выбранном МНН",
        )

    real_name = items[0].country_mfr
    mnn_usd_y1 = sum(i.usd_y1 for i in mnn_items)
    mnn_usd_y2 = sum(i.usd_y2 for i in mnn_items)
    mnn_usd_y3 = sum(i.usd_y3 for i in mnn_items)
    mnn_totals = (mnn_usd_y1, mnn_usd_y2, mnn_usd_y3)
    years_labels = _years_labels(market)

    return {
        "name": real_name or country_name,
        "kpi": _country_kpi(items, mnn_totals, years_labels),
        "producers": _country_producers(items, mnn_usd_y3),
        "mnn_portfolio": None,
        "forms_breakdown": _country_forms_breakdown(items),
    }
