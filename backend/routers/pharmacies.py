from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import PharmacyPrice, PharmacySourceRun
from backend.services.pharmacies.registry import ADAPTERS
from backend.services.pharmacies.runner import (
    is_running,
    launch_background,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/pharmacies", tags=["pharmacies"])


@router.get("")
async def list_sources(db: AsyncSession = Depends(get_db)):
    out = []
    for slug, cls in ADAPTERS.items():
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
            "items_count": count,
            "running": is_running(slug),
            "last_run": _serialize_run(last_run_row),
        })
    return out


@router.post("/{slug}/run")
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
    conds = []
    slugs = [x for x in (source or "").split(",") if x]
    if slugs:
        conds.append(PharmacyPrice.source.in_(slugs))
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
    if search:
        pat = f"%{search.strip()}%"
        conds.append(or_(
            PharmacyPrice.name.ilike(pat),
            PharmacyPrice.mnn.ilike(pat),
            PharmacyPrice.trade_name.ilike(pat),
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
    if order == "desc":
        direction = sort_col.is_(None).asc(), sort_col.desc()
    else:
        direction = sort_col.is_(None).asc(), sort_col.asc()

    total_stmt = select(func.count()).select_from(PharmacyPrice)
    if where_clause is not None:
        total_stmt = total_stmt.where(where_clause)
    total = (await db.execute(total_stmt)).scalar() or 0

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
    db: AsyncSession = Depends(get_db),
):
    current = await db.get(PharmacyPrice, price_id)
    if not current:
        raise HTTPException(404, "Позиция не найдена")

    rows = [current]
    if current.trade_name:
        conds = [
            func.lower(PharmacyPrice.trade_name)
            == current.trade_name.lower(),
            PharmacyPrice.price.isnot(None),
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
async def get_filters(db: AsyncSession = Depends(get_db)):
    async def _distinct(col, limit_n: int = 300):
        rows = (await db.execute(
            select(col, func.count().label("c"))
            .where(col.isnot(None))
            .where(col != "")
            .group_by(col)
            .order_by(func.count().desc())
            .limit(limit_n)
        )).all()
        return [
            {"value": r[0], "count": r[1]} for r in rows if r[0]
        ]

    sources = [
        {"slug": s, "display_name": cls.display_name}
        for s, cls in ADAPTERS.items()
    ]
    return {
        "sources": sources,
        "manufacturers": await _distinct(PharmacyPrice.manufacturer),
        "countries": await _distinct(PharmacyPrice.country),
        "forms": await _distinct(PharmacyPrice.form),
        "mnns": await _distinct(PharmacyPrice.mnn, 500),
    }


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
        "scraped_at": r.scraped_at.isoformat(),
    }
