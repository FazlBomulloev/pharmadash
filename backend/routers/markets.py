import asyncio
import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    UploadFile,
    File,
)
from sqlalchemy import select, func, delete, insert
from sqlalchemy.ext.asyncio import AsyncSession
from backend.config import UPLOAD_DIR
from backend.database import get_db
from backend.models import Market, FieldMapping, BdpRaw
from backend.schemas import (
    MarketCreate,
    MarketOut,
    MappingRequest,
    UploadResponse,
    PreviewResponse,
    PreviewRow,
)
from backend.routers.overview import invalidate_overview_cache
from backend.routers.dashboard import invalidate_dashboard_cache
from backend.services.market_scoring import (
    get_market_scoring,
    invalidate_scoring_cache,
)
from backend.services.parsers.base import (
    read_column_samples,
    read_first_rows,
)
from backend.services.parsers.bdp_parser import (
    get_sheets_and_columns,
    read_columns_at_row,
    parse_rows,
    count_data_rows,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["markets"])

BDP_INSERT_BATCH = 5000


def _upload_path(market_id: int) -> Path:
    return UPLOAD_DIR / f"market_{market_id}.xlsx"


async def _market_card(db: AsyncSession, m: Market) -> MarketOut:
    cnt, usd_prev, usd_last = (await db.execute(
        select(
            func.count(func.distinct(BdpRaw.mnn)),
            func.sum(BdpRaw.usd_y2),
            func.sum(BdpRaw.usd_y3),
        ).where(BdpRaw.market_id == m.id)
    )).one()
    has_bdp = bool(cnt)

    categories = None
    if has_bdp:
        scoring = await get_market_scoring(db, m)
        categories = scoring["summary"]["categories"]

    fp = _upload_path(m.id)
    loaded_at = (
        datetime.fromtimestamp(fp.stat().st_mtime).isoformat()
        if has_bdp and fp.exists() else None
    )
    return MarketOut(
        id=m.id,
        name=m.name,
        years=json.loads(m.years_json),
        language=m.language,
        regions=json.loads(m.regions_json) if m.regions_json else None,
        created_at=m.created_at.isoformat(),
        mnn_count=cnt or 0,
        usd_last=usd_last if has_bdp else None,
        usd_growth=(
            (usd_last - usd_prev) / usd_prev
            if has_bdp and usd_prev else None
        ),
        categories=categories,
        bdp_loaded_at=loaded_at,
    )


@router.get("", response_model=list[MarketOut])
async def list_markets(db: AsyncSession = Depends(get_db)):
    stmt = select(Market).order_by(Market.created_at.desc())
    result = await db.execute(stmt)
    markets = result.scalars().all()
    return [await _market_card(db, m) for m in markets]


@router.get("/{market_id}", response_model=MarketOut)
async def get_market(
    market_id: int,
    db: AsyncSession = Depends(get_db),
):
    m = await db.get(Market, market_id)
    if not m:
        raise HTTPException(404, "Рынок не найден")
    return await _market_card(db, m)


@router.post("", response_model=MarketOut)
async def create_market(
    body: MarketCreate,
    db: AsyncSession = Depends(get_db),
):
    exists = await db.execute(
        select(Market).where(Market.name == body.name)
    )
    if exists.scalar():
        raise HTTPException(400, "Рынок с таким названием уже существует")

    if len(body.years) < 2 or len(body.years) > 6:
        raise HTTPException(400, "Укажите от 2 до 6 годов")

    market = Market(
        name=body.name,
        years_json=json.dumps(sorted(body.years)),
        language=body.language,
    )
    db.add(market)
    await db.commit()
    await db.refresh(market)
    log.info("Создан рынок: %s (id=%d)", market.name, market.id)
    return MarketOut(
        id=market.id,
        name=market.name,
        years=sorted(body.years),
        language=market.language,
        regions=None,
        created_at=market.created_at.isoformat(),
    )


@router.delete("/{market_id}")
async def delete_market(
    market_id: int,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    await db.delete(market)
    await db.commit()
    invalidate_overview_cache(market_id)
    invalidate_dashboard_cache(market_id)
    invalidate_scoring_cache(market_id)

    fp = _upload_path(market_id)
    if fp.exists():
        fp.unlink()

    log.info("Удалён рынок id=%d", market_id)
    return {"ok": True}


@router.post("/{market_id}/upload", response_model=UploadResponse)
async def upload_file(
    market_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Допустим только формат .xlsx")

    dest = _upload_path(market_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    sheets_cols = get_sheets_and_columns(dest)
    log.info(
        "Загружен файл для рынка %s: %d листов",
        market.name, len(sheets_cols),
    )
    return UploadResponse(
        sheets=list(sheets_cols.keys()),
        columns=sheets_cols,
    )


@router.get("/{market_id}/columns")
async def get_columns(
    market_id: int,
    sheet_name: str,
    header_row: int = 1,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    fp = _upload_path(market_id)
    if not fp.exists():
        raise HTTPException(400, "Сначала загрузите файл")

    cols = read_columns_at_row(fp, sheet_name, header_row)
    samples = await asyncio.to_thread(
        read_column_samples, fp, sheet_name, header_row,
    )
    return {"columns": cols, "samples": samples}


@router.get("/{market_id}/sheet-preview")
async def sheet_preview(
    market_id: int,
    sheet_name: str,
    rows: int = Query(8, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    fp = _upload_path(market_id)
    if not fp.exists():
        raise HTTPException(400, "Сначала загрузите файл")

    try:
        preview = await asyncio.to_thread(
            read_first_rows, fp, sheet_name, rows,
        )
    except KeyError:
        raise HTTPException(400, "Лист не найден в файле")
    return {"rows": preview}


@router.get("/{market_id}/preview", response_model=PreviewResponse)
async def preview_data(
    market_id: int,
    sheet_name: str,
    header_row: int = 1,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    fp = _upload_path(market_id)
    if not fp.exists():
        raise HTTPException(400, "Сначала загрузите файл")

    fm_result = await db.execute(
        select(FieldMapping)
        .where(FieldMapping.market_id == market_id)
    )
    fm_list = fm_result.scalars().all()
    if not fm_list:
        raise HTTPException(400, "Сначала отправьте маппинг")

    mappings = {fm.system_field: fm.file_column for fm in fm_list}
    rows = parse_rows(fp, sheet_name, header_row, mappings, max_rows=5)
    total = count_data_rows(fp, sheet_name, header_row)

    return PreviewResponse(
        rows=[PreviewRow(values=r) for r in rows],
        total_rows=total,
    )


@router.post("/{market_id}/mapping")
async def apply_mapping(
    market_id: int,
    body: MappingRequest,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    fp = _upload_path(market_id)
    if not fp.exists():
        raise HTTPException(400, "Сначала загрузите файл")

    await db.execute(
        delete(FieldMapping)
        .where(FieldMapping.market_id == market_id)
    )
    await db.execute(
        delete(BdpRaw).where(BdpRaw.market_id == market_id)
    )

    for item in body.mappings:
        db.add(FieldMapping(
            market_id=market_id,
            system_field=item.system_field,
            file_column=item.file_column,
        ))
    await db.flush()

    mappings = {
        item.system_field: item.file_column
        for item in body.mappings
    }

    log.info("Парсинг файла для рынка %s...", market.name)
    rows = await asyncio.to_thread(
        parse_rows, fp, body.sheet_name, body.header_row, mappings,
    )
    if not rows:
        raise HTTPException(400, "Не удалось распарсить строки. Проверьте маппинг.")

    bdp_values = [
        {
            "market_id": market_id,
            "mnn": r["mnn"],
            "tm": r.get("tm"),
            "producer": r.get("producer"),
            "sector": r.get("sector"),
            "region": r.get("region"),
            "atc": r.get("atc"),
            "lf": r.get("lf"),
            "lf_avp": r.get("lf_avp"),
            "strength": r.get("strength"),
            "pack_size": r.get("pack_size"),
            "country_mfr": r.get("country_mfr"),
            "bg_g": r.get("bg_g"),
            "usd_y1": r.get("usd_y1", 0),
            "usd_y2": r.get("usd_y2", 0),
            "usd_y3": r.get("usd_y3", 0),
            "un_y1": r.get("un_y1", 0),
            "un_y2": r.get("un_y2", 0),
            "un_y3": r.get("un_y3", 0),
        }
        for r in rows
    ]
    for start in range(0, len(bdp_values), BDP_INSERT_BATCH):
        await db.execute(
            insert(BdpRaw),
            bdp_values[start:start + BDP_INSERT_BATCH],
        )

    regions = sorted({r["region"] for r in rows if r.get("region")})
    market.regions_json = json.dumps(regions)

    log.info(
        "Загружено %d строк БДП, регионы: %s",
        len(rows), regions,
    )

    await db.commit()

    log.info("Рынок %s: %d БДП", market.name, len(rows))
    invalidate_overview_cache(market_id)
    invalidate_dashboard_cache(market_id)
    invalidate_scoring_cache(market_id)

    return {
        "ok": True,
        "bdp_count": len(rows),
        "regions": regions,
    }
