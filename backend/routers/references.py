import logging
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import UPLOAD_DIR
from backend.database import get_db
from backend.models import (
    Market, PcEntry, PcMapping, GrlsEntry, GrlsMapping,
)
from backend.schemas import MappingRequest, UploadResponse
from backend.services.parsers.base import (
    get_sheets_and_columns, read_columns_at_row,
)
from backend.services.parsers.pc_parser import parse_pc_rows
from backend.services.parsers.grls_parser import (
    parse_grls_rows, parse_grls_archive,
    extract_grls_archive, get_grls_reference_file,
)
from backend.services.canonicalize import apply_canonical_to_rows

log = logging.getLogger(__name__)
router = APIRouter(
    prefix="/markets/{market_id}/references",
    tags=["references"],
)


def _pc_path(market_id: int) -> Path:
    return UPLOAD_DIR / f"market_{market_id}_pc.xlsx"


def _grls_single_path(market_id: int) -> Path:
    return UPLOAD_DIR / f"market_{market_id}_grls.xlsx"


def _grls_archive_dir(market_id: int) -> Path:
    return UPLOAD_DIR / f"market_{market_id}_grls"


def _cleanup_grls(market_id: int):
    single = _grls_single_path(market_id)
    if single.exists():
        single.unlink()
    archive_dir = _grls_archive_dir(market_id)
    if archive_dir.exists():
        shutil.rmtree(archive_dir)


# ─────────────────── PC ───────────────────

@router.post("/pc/upload", response_model=UploadResponse)
async def upload_pc(
    market_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Допустим только .xlsx")

    dest = _pc_path(market_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    sheets_cols = get_sheets_and_columns(dest)
    return UploadResponse(
        sheets=list(sheets_cols.keys()),
        columns=sheets_cols,
    )


@router.get("/pc/columns")
async def get_pc_columns(
    market_id: int, sheet_name: str, header_row: int = 1,
):
    fp = _pc_path(market_id)
    if not fp.exists():
        raise HTTPException(400, "Сначала загрузите файл РС")
    cols = read_columns_at_row(fp, sheet_name, header_row)
    return {"columns": cols}


@router.post("/pc/mapping")
async def apply_pc_mapping(
    market_id: int,
    body: MappingRequest,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")
    fp = _pc_path(market_id)
    if not fp.exists():
        raise HTTPException(400, "Сначала загрузите файл РС")

    await db.execute(delete(PcMapping).where(PcMapping.market_id == market_id))
    await db.execute(delete(PcEntry).where(PcEntry.market_id == market_id))

    for item in body.mappings:
        db.add(PcMapping(
            market_id=market_id,
            system_field=item.system_field,
            file_column=item.file_column,
        ))
    await db.flush()

    mappings = {item.system_field: item.file_column for item in body.mappings}
    rows = parse_pc_rows(fp, body.sheet_name, body.header_row, mappings)
    if not rows:
        raise HTTPException(400, "Не удалось распарсить строки")

    rows, unrecognized = await apply_canonical_to_rows(rows, db)

    pc_objects = [
        PcEntry(
            market_id=market_id,
            mnn_raw=r["mnn_raw"],
            mnn_canonical=r.get("mnn_canonical") or r["mnn_raw"],
            tm=r.get("tm"),
            lf=r.get("lf"),
            lf_canonical=r.get("lf_canonical"),
            owner=r.get("owner"),
            owner_canonical=r.get("owner_canonical"),
            pack_qty=r.get("pack_qty"),
            price_rub_no_vat=r["price_rub_no_vat"],
            price_reg_date=r.get("price_reg_date"),
            price_effective_date=r.get("price_effective_date"),
        )
        for r in rows
    ]
    db.add_all(pc_objects)
    await db.commit()

    return {
        "ok": True,
        "pc_count": len(rows),
        "unrecognized": unrecognized,
    }


@router.get("/pc")
async def get_pc_status(market_id: int, db: AsyncSession = Depends(get_db)):
    count = (await db.execute(
        select(func.count()).select_from(PcEntry)
        .where(PcEntry.market_id == market_id)
    )).scalar() or 0
    return {"loaded": count > 0, "rows_count": count}


@router.delete("/pc")
async def delete_pc(market_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(PcEntry).where(PcEntry.market_id == market_id))
    await db.execute(delete(PcMapping).where(PcMapping.market_id == market_id))
    await db.commit()
    fp = _pc_path(market_id)
    if fp.exists():
        fp.unlink()
    return {"ok": True}


# ─────────────────── GRLS ───────────────────

@router.post("/grls/upload", response_model=UploadResponse)
async def upload_grls(
    market_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")
    if not file.filename:
        raise HTTPException(400, "Файл не передан")

    fname = file.filename.lower()
    if not (fname.endswith(".xlsx") or fname.endswith(".zip")):
        raise HTTPException(400, "Допустимо .xlsx или .zip")

    _cleanup_grls(market_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    if fname.endswith(".zip"):
        tmp_zip = UPLOAD_DIR / f"market_{market_id}_grls_tmp.zip"
        with open(tmp_zip, "wb") as f:
            shutil.copyfileobj(file.file, f)
        archive_dir = _grls_archive_dir(market_id)
        try:
            extract_grls_archive(tmp_zip, archive_dir)
        finally:
            tmp_zip.unlink(missing_ok=True)

        ref = get_grls_reference_file(archive_dir)
        if not ref:
            raise HTTPException(400, "В архиве нет xlsx-файлов")

        sheets_cols = get_sheets_and_columns(ref)
        return UploadResponse(
            sheets=list(sheets_cols.keys()),
            columns=sheets_cols,
        )
    else:
        dest = _grls_single_path(market_id)
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        sheets_cols = get_sheets_and_columns(dest)
        return UploadResponse(
            sheets=list(sheets_cols.keys()),
            columns=sheets_cols,
        )


@router.get("/grls/columns")
async def get_grls_columns(
    market_id: int, sheet_name: str, header_row: int = 1,
):
    archive_dir = _grls_archive_dir(market_id)
    single = _grls_single_path(market_id)

    if archive_dir.exists():
        ref = get_grls_reference_file(archive_dir)
        if not ref:
            raise HTTPException(400, "Архив пуст")
        cols = read_columns_at_row(ref, sheet_name, header_row)
    elif single.exists():
        cols = read_columns_at_row(single, sheet_name, header_row)
    else:
        raise HTTPException(400, "Сначала загрузите файл GRLS")
    return {"columns": cols}


@router.post("/grls/mapping")
async def apply_grls_mapping(
    market_id: int,
    body: MappingRequest,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    archive_dir = _grls_archive_dir(market_id)
    single = _grls_single_path(market_id)

    await db.execute(delete(GrlsMapping).where(GrlsMapping.market_id == market_id))
    await db.execute(delete(GrlsEntry).where(GrlsEntry.market_id == market_id))

    for item in body.mappings:
        db.add(GrlsMapping(
            market_id=market_id,
            system_field=item.system_field,
            file_column=item.file_column,
        ))
    await db.flush()

    mappings = {item.system_field: item.file_column for item in body.mappings}

    if archive_dir.exists():
        rows = parse_grls_archive(
            archive_dir, body.sheet_name, body.header_row, mappings,
        )
    elif single.exists():
        rows = parse_grls_rows(
            single, body.sheet_name, body.header_row, mappings,
        )
    else:
        raise HTTPException(400, "Сначала загрузите файл GRLS")

    if not rows:
        raise HTTPException(400, "Не удалось распарсить строки")

    rows, unrecognized = await apply_canonical_to_rows(rows, db)

    grls_objects = [
        GrlsEntry(
            market_id=market_id,
            mnn_raw=r["mnn_raw"],
            mnn_canonical=r.get("mnn_canonical") or r["mnn_raw"],
            tm=r.get("tm"),
            ru_holder=r.get("ru_holder"),
            ru_holder_canonical=r.get("ru_holder_canonical"),
            lf_full=r.get("lf_full"),
            lf_canonical=r.get("lf_canonical"),
            dosage=r.get("dosage"),
            jnvlp=r.get("jnvlp", False),
            ru_number=r.get("ru_number"),
            reg_date=r.get("reg_date"),
            expire_date=r.get("expire_date"),
            cancel_date=r.get("cancel_date"),
            status=r["status"],
        )
        for r in rows
    ]
    db.add_all(grls_objects)
    await db.commit()

    return {
        "ok": True,
        "grls_count": len(rows),
        "unrecognized": unrecognized,
    }


@router.get("/grls")
async def get_grls_status(market_id: int, db: AsyncSession = Depends(get_db)):
    count = (await db.execute(
        select(func.count()).select_from(GrlsEntry)
        .where(GrlsEntry.market_id == market_id)
    )).scalar() or 0
    by_status = {}
    if count > 0:
        result = await db.execute(
            select(GrlsEntry.status, func.count())
            .where(GrlsEntry.market_id == market_id)
            .group_by(GrlsEntry.status)
        )
        by_status = {s: c for s, c in result.all()}
    return {"loaded": count > 0, "rows_count": count, "by_status": by_status}


@router.delete("/grls")
async def delete_grls(market_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(GrlsEntry).where(GrlsEntry.market_id == market_id))
    await db.execute(delete(GrlsMapping).where(GrlsMapping.market_id == market_id))
    await db.commit()
    _cleanup_grls(market_id)
    return {"ok": True}
