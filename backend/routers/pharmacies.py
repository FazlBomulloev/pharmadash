from __future__ import annotations

import logging
from collections import OrderedDict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.services.permissions import require
from backend.models import Market, PharmacyPrice, PharmacySourceRun
from backend.services.pharmacies.registry import ADAPTERS, market_sources
from backend.services.pharmacies.runner import (
    is_running,
    launch_background,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/pharmacies", tags=["pharmacies"])

# Цены пишет отдельный процесс парсера, и сбросить кеш этого процесса он не
# может. Поэтому кеш привязан к отпечатку таблицы запусков: старт или
# завершение любого парсера меняет отпечаток, и кеш пересчитывается.
_FILTERS_CACHE: dict[tuple, dict] = {}
_TOTALS_CACHE: OrderedDict[tuple, int] = OrderedDict()
_TOTALS_CACHE_MAX = 500


async def _data_version(db: AsyncSession) -> tuple:
    row = (await db.execute(
        select(
            func.count(),
            func.max(PharmacySourceRun.id),
            func.max(PharmacySourceRun.finished_at),
        )
    )).one()
    return tuple(row)


async def _scope(db: AsyncSession, market_id: int | None) -> list[str]:
    # Без рынка — все источники: так их видит запуск парсеров. С рынком —
    # только назначенные ему, чтобы не показывать аптеки другой страны.
    if market_id is None:
        return list(ADAPTERS)
    market = await db.get(Market, market_id)
    if market is None:
        raise HTTPException(404, "Рынок не найден")
    return market_sources(market.pharmacy_sources_json)


async def _cached_total(db: AsyncSession, key: tuple, total_stmt) -> int:
    total = _TOTALS_CACHE.get(key)
    if total is not None:
        _TOTALS_CACHE.move_to_end(key)
        return total
    total = (await db.execute(total_stmt)).scalar() or 0
    _TOTALS_CACHE[key] = total
    while len(_TOTALS_CACHE) > _TOTALS_CACHE_MAX:
        _TOTALS_CACHE.popitem(last=False)
    return total


@router.get("")
async def list_sources(
    market_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    out = []
    for slug in await _scope(db, market_id):
        cls = ADAPTERS[slug]
        count = (await db.execute(
            select(func.count()).select_from(PharmacyPrice)
            .where(PharmacyPrice.source == slug)
        )).scalar() or 0

        last_run_row = (await db.execute(
            select(PharmacySourceRun)
            .where(PharmacySourceRun.source == slug)
            .order_by(PharmacySourceRun.started_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        out.append({
            "slug": slug,
            "display_name": cls.display_name,
            "currency": cls.currency,
            "items_count": count,
            "running": is_running(slug),
            "last_run": _serialize_run(last_run_row),
        })
    return out


@router.post("/{slug}/run", dependencies=[Depends(require("pharmacies:write"))])
async def trigger_run(
    slug: str,
    limit: Optional[int] = Query(None, ge=1, le=100000),
):
    if slug not in ADAPTERS:
        raise HTTPException(404, "Источник не найден")
    launched = launch_background(slug, limit=limit)
    return {"ok": True, "launched": launched, "running": True}


@router.get("/{slug}/runs")
async def list_runs(
    slug: str,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    if slug not in ADAPTERS:
        raise HTTPException(404, "Источник не найден")
    rows = (await db.execute(
        select(PharmacySourceRun)
        .where(PharmacySourceRun.source == slug)
        .order_by(PharmacySourceRun.started_at.desc())
        .limit(limit)
    )).scalars().all()
    return [_serialize_run(r) for r in rows]


@router.get("/prices")
async def list_prices(
    market_id: Optional[int] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    mnn: Optional[str] = None,
    manufacturer: Optional[str] = None,
    country: Optional[str] = None,
    form: Optional[str] = None,
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    sort: str = Query("scraped_at"),
    order: str = Query("desc"),
    db: AsyncSession = Depends(get_db),
):
    scope = await _scope(db, market_id)
    requested = [x for x in (source or "").split(",") if x]
    slugs = [s for s in scope if s in requested] if requested else scope
    if not slugs:
        return {"total": 0, "offset": offset, "limit": limit, "items": []}
    conds = [PharmacyPrice.source.in_(slugs)]
    if mnn:
        conds.append(PharmacyPrice.mnn == mnn)
    if manufacturer:
        conds.append(PharmacyPrice.manufacturer == manufacturer)
    if country:
        conds.append(PharmacyPrice.country == country)
    if form:
        conds.append(PharmacyPrice.form == form)
    if price_min is not None:
        conds.append(PharmacyPrice.price >= price_min)
    if price_max is not None:
        conds.append(PharmacyPrice.price <= price_max)
    if search and search.strip():
        conds.append(PharmacyPrice.search_text.contains(
            search.strip().lower(), autoescape=True,
        ))

    where_clause = and_(*conds) if conds else None

    sort_col = {
        "source": PharmacyPrice.source,
        "name": PharmacyPrice.name,
        "mnn": PharmacyPrice.mnn,
        "form": PharmacyPrice.form,
        "dosage": PharmacyPrice.dosage,
        "manufacturer": PharmacyPrice.manufacturer,
        "country": PharmacyPrice.country,
        "price": PharmacyPrice.price,
        "scraped_at": PharmacyPrice.scraped_at,
    }.get(sort, PharmacyPrice.scraped_at)
    # В SQLite NULL меньше любого значения: при DESC они и так в конце.
    # Лишнее «IS NULL» в ORDER BY не даёт взять порядок из индекса, и
    # каждая страница сортировала всю таблицу.
    if order == "desc":
        direction = (sort_col.desc(),)
    else:
        direction = sort_col.is_(None).asc(), sort_col.asc()

    total_stmt = select(func.count()).select_from(PharmacyPrice)
    if where_clause is not None:
        total_stmt = total_stmt.where(where_clause)
    total_key = (
        await _data_version(db), tuple(sorted(slugs)), mnn, manufacturer,
        country, form, price_min, price_max,
        search.strip() if search else None,
    )
    total = await _cached_total(db, total_key, total_stmt)

    stmt = select(PharmacyPrice).order_by(*direction).offset(offset).limit(limit)
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_serialize_price(r) for r in rows],
    }


@router.get("/prices/{price_id}/compare")
async def compare_prices(
    price_id: int,
    market_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    current = await db.get(PharmacyPrice, price_id)
    if not current:
        raise HTTPException(404, "Позиция не найдена")
    scope = await _scope(db, market_id)

    rows = [current]
    if current.trade_name:
        conds = [
            func.lower(PharmacyPrice.trade_name)
            == current.trade_name.lower(),
            PharmacyPrice.price.isnot(None),
            PharmacyPrice.source.in_(scope),
        ]
        if current.dosage:
            conds.append(PharmacyPrice.dosage == current.dosage)
        rows = (await db.execute(
            select(PharmacyPrice).where(and_(*conds))
        )).scalars().all()

    return {"items": cheapest_per_source(rows, current)}


def cheapest_per_source(rows, current) -> list[dict]:
    best: dict[str, PharmacyPrice] = {}
    for r in rows:
        if r.price is None:
            continue
        kept = best.get(r.source)
        if kept is None or r.price < kept.price:
            best[r.source] = r
    if current.price is not None:
        best[current.source] = current
    return [
        {
            "id": r.id,
            "source": r.source,
            "display_name": (
                ADAPTERS[r.source].display_name
                if r.source in ADAPTERS else r.source
            ),
            "price": r.price,
            "url": r.url,
            "is_current": r.id == current.id,
        }
        for r in sorted(best.values(), key=lambda r: r.price)
    ]


@router.get("/filters")
async def get_filters(
    market_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    scope = await _scope(db, market_id)
    if not scope:
        return {
            "sources": [], "manufacturers": [], "countries": [],
            "forms": [], "mnns": [],
        }
    version = await _data_version(db)
    key = (version, tuple(scope))
    cached = _FILTERS_CACHE.get(key)
    if cached is not None:
        return cached

    present = (await db.execute(
        select(PharmacyPrice.source).distinct()
    )).scalars().all()
    # Если рынку назначены все источники из таблицы, условие по source
    # лишнее: без него группировка идёт по индексу колонки, а не по строкам.
    source_cond = (
        None if set(present) <= set(scope)
        else PharmacyPrice.source.in_(scope)
    )

    async def _distinct(col, limit_n: int = 300):
        stmt = (
            select(col, func.count().label("c"))
            .where(col.isnot(None))
            .where(col != "")
        )
        if source_cond is not None:
            stmt = stmt.where(source_cond)
        rows = (await db.execute(
            stmt.group_by(col).order_by(func.count().desc()).limit(limit_n)
        )).all()
        return [
            {"value": r[0], "count": r[1]} for r in rows if r[0]
        ]

    sources = [
        {"slug": s, "display_name": ADAPTERS[s].display_name}
        for s in scope
    ]
    payload = {
        "sources": sources,
        "manufacturers": await _distinct(PharmacyPrice.manufacturer),
        "countries": await _distinct(PharmacyPrice.country),
        "forms": await _distinct(PharmacyPrice.form),
        "mnns": await _distinct(PharmacyPrice.mnn, 500),
    }
    for stale in [k for k in _FILTERS_CACHE if k[0] != version]:
        del _FILTERS_CACHE[stale]
    _FILTERS_CACHE[key] = payload
    return payload


def _serialize_run(r: PharmacySourceRun | None) -> dict | None:
    if r is None:
        return None
    return {
        "id": r.id,
        "source": r.source,
        "started_at": r.started_at.isoformat(),
        "finished_at": (
            r.finished_at.isoformat() if r.finished_at else None
        ),
        "status": r.status,
        "items_count": r.items_count,
        "error": r.error,
    }


def _full_image_url(source: str, url: str | None) -> str | None:
    adapter = ADAPTERS.get(source)
    if not url or adapter is None:
        return url
    return adapter.full_image_url(url)


def _serialize_price(r: PharmacyPrice) -> dict:
    return {
        "id": r.id,
        "source": r.source,
        "sku": r.sku,
        "name": r.name,
        "mnn": r.mnn,
        "trade_name": r.trade_name,
        "manufacturer": r.manufacturer,
        "country": r.country,
        "form": r.form,
        "dosage": r.dosage,
        "pack_qty": r.pack_qty,
        "price": r.price,
        "price_discount": r.price_discount,
        "url": r.url,
        "image_url": r.image_url,
        "image_full_url": _full_image_url(r.source, r.image_url),
        "scraped_at": r.scraped_at.isoformat(),
    }
