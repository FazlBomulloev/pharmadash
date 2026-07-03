"""Drill-down эндпоинты по производителю и стране производства.

Четыре endpoint'а:
  1. GET /markets/{market_id}/producer/{producer_name}
  2. GET /markets/{market_id}/mnn/{mnn}/producer/{producer_name}
  3. GET /markets/{market_id}/country/{country_name}
  4. GET /markets/{market_id}/mnn/{mnn}/country/{country_name}

Все агрегации — в Python над строками BdpRaw. Кеш не добавляется.
"""
import json
import logging
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Market, BdpRaw


log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["drilldown"])


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


def _producer_key(item: BdpRaw) -> str | None:
    return item.producer_canonical or item.producer


def _mnn_key(item: BdpRaw) -> str | None:
    return item.mnn_canonical or item.mnn


def _form_key(item: BdpRaw) -> str:
    return item.lf_canonical or item.lf_avp or "—"


# ────────────────────── loaders ──────────────────────

async def _load_market_items(
    db: AsyncSession, market_id: int,
) -> list[BdpRaw]:
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")
    result = await db.execute(
        select(BdpRaw).where(BdpRaw.market_id == market_id)
    )
    return list(result.scalars().all())


def _years_labels(market: Market) -> list[str]:
    years = json.loads(market.years_json)
    return [str(y) for y in sorted(years)[-3:]]


# ────────────────────── producer builders ──────────────────────

def _producer_kpi(
    items: list[BdpRaw],
    scope_total_usd_y3: float,
    years_labels: list[str],
) -> dict:
    """KPI по производителю. scope_total_usd_y3 — либо весь рынок,
    либо один МНН (в зависимости от scope'а вызова)."""
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
        "usd_y1": usd_y1,
        "usd_y2": usd_y2,
        "usd_y3": usd_y3,
        "un_y1": un_y1,
        "un_y2": un_y2,
        "un_y3": un_y3,
        "usd_growth": _safe_growth(usd_y3, usd_y2),
        "un_growth": _safe_growth(un_y3, un_y2),
        "usd_cagr_2y": _cagr(usd_y1, usd_y3, 2),
        "asp_y3": asp_y3,
        "asp_growth": asp_growth,
        "share_of_market": _safe_div(usd_y3, scope_total_usd_y3),
        "years_labels": years_labels,
    }


def _producer_mnn_portfolio(
    items: list[BdpRaw],
    market_items: list[BdpRaw],
    market_total_usd_y3: float,
) -> list[dict]:
    """Разбивка производителя по МНН (только для market-scope).

    competitors_in_mnn — количество уникальных производителей
    на данном МНН во ВСЁМ рынке.
    """
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

    # Кол-во конкурентов по МНН считаем по всему рынку.
    market_mnn_producers: dict[str, set[str]] = defaultdict(set)
    for i in market_items:
        mkey = _mnn_key(i)
        pkey = _producer_key(i)
        if mkey and pkey:
            market_mnn_producers[mkey].add(pkey)

    ranked = sorted(
        mnn_data.items(),
        key=lambda x: x[1]["usd_y3"],
        reverse=True,
    )[:15]

    result = []
    for name, d in ranked:
        result.append({
            "mnn": name,
            "usd_y3": d["usd_y3"],
            "share_in_market": _safe_div(
                d["usd_y3"], market_total_usd_y3,
            ) or 0.0,
            "share_in_producer": _safe_div(
                d["usd_y3"], producer_total_y3,
            ) or 0.0,
            "growth": _safe_growth(d["usd_y3"], d["usd_y2"]),
            "competitors_in_mnn": len(
                market_mnn_producers.get(name, set()),
            ),
        })
    return result


def _producer_tm_breakdown(items: list[BdpRaw]) -> list[dict]:
    """Разбивка производителя по (ТМ, форма, дозировка). Пустые TM
    пропускаем. Топ-20 по USD Y3."""
    producer_total_y3 = sum(i.usd_y3 for i in items)

    grouped: dict[tuple[str, str, str], dict] = defaultdict(
        lambda: {"usd_y3": 0.0, "un_y3": 0.0}
    )
    for i in items:
        tm = (i.tm or "").strip()
        if not tm:
            continue
        form = _form_key(i)
        dose = (i.strength or "").strip() or "—"
        key = (tm, form, dose)
        grouped[key]["usd_y3"] += i.usd_y3
        grouped[key]["un_y3"] += i.un_y3

    ranked = sorted(
        grouped.items(),
        key=lambda x: x[1]["usd_y3"],
        reverse=True,
    )[:20]

    return [
        {
            "tm": tm,
            "form": form,
            "dose": dose,
            "usd_y3": d["usd_y3"],
            "un_y3": d["un_y3"],
            "share_in_producer": _safe_div(
                d["usd_y3"], producer_total_y3,
            ) or 0.0,
        }
        for (tm, form, dose), d in ranked
    ]


def _producer_sector_split(items: list[BdpRaw]) -> dict:
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
        "ret_usd": ret_usd,
        "hos_usd": hos_usd,
        "ret_share": _safe_div(ret_usd, total_y3),
        "hos_share": _safe_div(hos_usd, total_y3),
    }


def _producer_top_regions(items: list[BdpRaw]) -> list[dict]:
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
    items: list[BdpRaw],
    market_items: list[BdpRaw],
    years_labels: list[str],
) -> dict:
    usd_y1 = sum(i.usd_y1 for i in items)
    usd_y2 = sum(i.usd_y2 for i in items)
    usd_y3 = sum(i.usd_y3 for i in items)
    un_y1 = sum(i.un_y1 for i in items)
    un_y2 = sum(i.un_y2 for i in items)
    un_y3 = sum(i.un_y3 for i in items)

    market_usd_y1 = sum(i.usd_y1 for i in market_items)
    market_usd_y2 = sum(i.usd_y2 for i in market_items)
    market_usd_y3 = sum(i.usd_y3 for i in market_items)

    producers = {
        _producer_key(i) for i in items if _producer_key(i)
    }
    mnns = {
        _mnn_key(i) for i in items if _mnn_key(i)
    }

    share_y3 = _safe_div(usd_y3, market_usd_y3)

    return {
        "usd_y1": usd_y1,
        "usd_y2": usd_y2,
        "usd_y3": usd_y3,
        "un_y1": un_y1,
        "un_y2": un_y2,
        "un_y3": un_y3,
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
    items: list[BdpRaw],
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
        key=lambda x: x[1]["usd_y3"],
        reverse=True,
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


def _country_mnn_portfolio(items: list[BdpRaw]) -> list[dict]:
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
        mnn_data.items(),
        key=lambda x: x[1]["usd_y3"],
        reverse=True,
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


def _country_forms_breakdown(items: list[BdpRaw]) -> list[dict]:
    country_total_y3 = sum(i.usd_y3 for i in items)

    form_groups: dict[str, list[BdpRaw]] = defaultdict(list)
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
                "tm": tm,
                "usd_y3": usd,
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


# ────────────────────── filter helpers ──────────────────────

def _filter_by_mnn(
    items: list[BdpRaw], mnn: str,
) -> list[BdpRaw]:
    target = _norm_mnn(mnn)
    return [i for i in items if _norm_mnn(_mnn_key(i)) == target]


def _filter_by_producer(
    items: list[BdpRaw], producer_name: str,
) -> tuple[list[BdpRaw], str | None]:
    """Возвращает (отфильтрованные строки, реальное имя производителя).
    Реальное имя — из первой найденной строки (canonical/raw)."""
    target = _norm_producer(producer_name)
    matched = [
        i for i in items
        if _norm_producer(_producer_key(i)) == target
    ]
    real_name = _producer_key(matched[0]) if matched else None
    return matched, real_name


def _filter_by_country(
    items: list[BdpRaw], country_name: str,
) -> tuple[list[BdpRaw], str | None]:
    target = _norm_country(country_name)
    matched = [
        i for i in items
        if _norm_country(i.country_mfr) == target
    ]
    real_name = matched[0].country_mfr if matched else None
    return matched, real_name


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
    market_items = await _load_market_items(db, market_id)
    if not market_items:
        raise HTTPException(404, "Нет данных БДП для рынка")

    items, real_name = _filter_by_producer(market_items, producer_name)
    if not items:
        raise HTTPException(404, "Производитель не найден в рынке")

    market_total_usd_y3 = sum(i.usd_y3 for i in market_items)
    years_labels = _years_labels(market)

    return {
        "name": real_name or producer_name,
        "kpi": _producer_kpi(
            items, market_total_usd_y3, years_labels,
        ),
        "mnn_portfolio": _producer_mnn_portfolio(
            items, market_items, market_total_usd_y3,
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
    market_items = await _load_market_items(db, market_id)
    if not market_items:
        raise HTTPException(404, "Нет данных БДП для рынка")

    mnn_items = _filter_by_mnn(market_items, mnn)
    if not mnn_items:
        raise HTTPException(404, "МНН не найден в рынке")

    items, real_name = _filter_by_producer(mnn_items, producer_name)
    if not items:
        raise HTTPException(
            404, "Производитель не найден в выбранном МНН",
        )

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
    market_items = await _load_market_items(db, market_id)
    if not market_items:
        raise HTTPException(404, "Нет данных БДП для рынка")

    items, real_name = _filter_by_country(market_items, country_name)
    if not items:
        raise HTTPException(404, "Страна не найдена в рынке")

    market_total_usd_y3 = sum(i.usd_y3 for i in market_items)
    years_labels = _years_labels(market)

    return {
        "name": real_name or country_name,
        "kpi": _country_kpi(items, market_items, years_labels),
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
    market_items = await _load_market_items(db, market_id)
    if not market_items:
        raise HTTPException(404, "Нет данных БДП для рынка")

    mnn_items = _filter_by_mnn(market_items, mnn)
    if not mnn_items:
        raise HTTPException(404, "МНН не найден в рынке")

    items, real_name = _filter_by_country(mnn_items, country_name)
    if not items:
        raise HTTPException(
            404, "Страна не найдена в выбранном МНН",
        )

    mnn_total_usd_y3 = sum(i.usd_y3 for i in mnn_items)
    years_labels = _years_labels(market)

    # scope: КПС считаем внутри выбранного МНН (market_items → mnn_items)
    return {
        "name": real_name or country_name,
        "kpi": _country_kpi(items, mnn_items, years_labels),
        "producers": _country_producers(items, mnn_total_usd_y3),
        "mnn_portfolio": None,
        "forms_breakdown": _country_forms_breakdown(items),
    }
