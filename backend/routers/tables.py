import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.models import Market, Avp, Kap
from backend.services.exporter import export_avp_xlsx, export_kap_xlsx

log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["tables"])


def _parse_json_fields(row, json_fields: list[str]) -> dict:
    data = {}
    for attr in row.__table__.columns.keys():
        val = getattr(row, attr)
        if attr in json_fields and isinstance(val, str):
            data[attr.replace("_json", "")] = json.loads(val)
        elif attr not in json_fields:
            data[attr] = val
    return data


def _apply_sort(stmt, model, sort_by: str | None, sort_dir: str):
    if not sort_by:
        return stmt
    col = getattr(model, sort_by, None)
    if col is None:
        return stmt
    if sort_dir == "desc":
        return stmt.order_by(col.desc())
    return stmt.order_by(col.asc())


@router.get("/{market_id}/avp")
async def get_avp(
    market_id: int,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
    sort_by: str | None = None,
    sort_dir: str = "asc",
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    base = select(Avp).where(Avp.market_id == market_id)
    if search:
        term = f"%{search.upper()}%"
        base = base.where(Avp.mnn.ilike(term))

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = _apply_sort(base, Avp, sort_by, sort_dir)
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    json_fields = [
        "region_usd_json", "region_un_json",
        "region_competitors_json", "region_shares_json",
    ]
    data = [_parse_json_fields(r, json_fields) for r in rows]

    years = json.loads(market.years_json)
    regions = (
        json.loads(market.regions_json)
        if market.regions_json else []
    )

    return {
        "rows": data,
        "total": total,
        "offset": offset,
        "limit": limit,
        "years": years,
        "regions": regions,
    }


@router.get("/{market_id}/kap")
async def get_kap(
    market_id: int,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
    sort_by: str | None = None,
    sort_dir: str = "asc",
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    base = select(Kap).where(Kap.market_id == market_id)
    if search:
        term = f"%{search.upper()}%"
        base = base.where(Kap.mnn.ilike(term))

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = _apply_sort(base, Kap, sort_by, sort_dir)
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    json_fields = [
        "region_shares_json", "region_competitors_json",
    ]
    data = [_parse_json_fields(r, json_fields) for r in rows]

    years = json.loads(market.years_json)
    regions = (
        json.loads(market.regions_json)
        if market.regions_json else []
    )

    return {
        "rows": data,
        "total": total,
        "offset": offset,
        "limit": limit,
        "years": years,
        "regions": regions,
    }


@router.get("/{market_id}/avp/export")
async def export_avp(
    market_id: int,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    result = await db.execute(
        select(Avp)
        .where(Avp.market_id == market_id)
        .order_by(Avp.total_usd_y3.desc())
    )
    rows = result.scalars().all()
    years = json.loads(market.years_json)
    regions = (
        json.loads(market.regions_json)
        if market.regions_json else []
    )

    buf = export_avp_xlsx(rows, years, regions, market.name)
    filename = f"AVP_{market.name}.xlsx"

    return StreamingResponse(
        buf,
        media_type=(
            "application/vnd.openxmlformats-"
            "officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@router.get("/{market_id}/kap/export")
async def export_kap(
    market_id: int,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    result = await db.execute(
        select(Kap)
        .where(Kap.market_id == market_id)
        .order_by(
            Kap.mnn.asc(), Kap.lf_avp.asc()
        )
    )
    rows = result.scalars().all()
    years = json.loads(market.years_json)
    regions = (
        json.loads(market.regions_json)
        if market.regions_json else []
    )

    buf = export_kap_xlsx(rows, years, regions, market.name)
    filename = f"KAP_{market.name}.xlsx"

    return StreamingResponse(
        buf,
        media_type=(
            "application/vnd.openxmlformats-"
            "officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
