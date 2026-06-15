import logging
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.config import UPLOAD_DIR
from backend.database import get_db
from backend.models import DictionaryEntry, DictionaryAlias
from backend.schemas import (
    DictionaryEntryCreate, DictionaryEntryUpdate, DictionaryEntryOut,
    UploadResponse, MappingRequest,
)
from backend.services.dictionary_types import (
    DICT_TYPES, DICT_TYPE_LABELS,
)
from backend.services.dict_suggest import suggest_for_unrecognized
from backend.services.parsers.base import (
    get_sheets_and_columns, read_columns_at_row,
)
from backend.services.parsers.dict_parser import parse_dict_import

log = logging.getLogger(__name__)
router = APIRouter(prefix="/dictionary", tags=["dictionary"])


@router.get("/types")
async def list_types():
    return [
        {"type": t, "label": DICT_TYPE_LABELS[t]} for t in DICT_TYPES
    ]


@router.get("")
async def list_entries(
    field_type: str | None = None,
    search: str | None = None,
    offset: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    base = select(DictionaryEntry)
    if field_type:
        if field_type not in DICT_TYPES:
            raise HTTPException(400, "Неизвестный тип словаря")
        base = base.where(DictionaryEntry.field_type == field_type)

    if search:
        term = f"%{search.upper()}%"
        base = base.where(
            (DictionaryEntry.value_en.ilike(term)) |
            (DictionaryEntry.value_ru.ilike(term)) |
            (DictionaryEntry.canonical.ilike(term))
        )

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0

    result = await db.execute(
        base.options(selectinload(DictionaryEntry.aliases))
        .order_by(DictionaryEntry.canonical)
        .offset(offset).limit(limit)
    )
    entries = result.scalars().all()
    return {
        "rows": [DictionaryEntryOut.model_validate(e).model_dump() for e in entries],
        "total": total,
    }


@router.post("", response_model=DictionaryEntryOut)
async def create_entry(
    body: DictionaryEntryCreate,
    db: AsyncSession = Depends(get_db),
):
    if body.field_type not in DICT_TYPES:
        raise HTTPException(400, "Неизвестный тип словаря")

    if not body.value_en and not body.value_ru:
        raise HTTPException(400, "Заполните хотя бы одно из value_en / value_ru")

    canonical = body.canonical or body.value_en or body.value_ru

    exists = await db.execute(
        select(DictionaryEntry).where(
            DictionaryEntry.field_type == body.field_type,
            DictionaryEntry.canonical == canonical,
        )
    )
    if exists.scalar():
        raise HTTPException(400, f"Запись с canonical='{canonical}' уже существует")

    entry = DictionaryEntry(
        field_type=body.field_type,
        value_en=body.value_en,
        value_ru=body.value_ru,
        canonical=canonical,
        notes=body.notes,
    )
    db.add(entry)
    await db.flush()

    for alias in body.aliases:
        if not alias.strip():
            continue
        db.add(DictionaryAlias(entry_id=entry.id, alias=alias.strip()))

    await db.commit()
    await db.refresh(entry)
    return DictionaryEntryOut.model_validate(entry)


@router.patch("/{entry_id}", response_model=DictionaryEntryOut)
async def update_entry(
    entry_id: int,
    body: DictionaryEntryUpdate,
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(DictionaryEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Запись не найдена")

    if body.value_en is not None:
        entry.value_en = body.value_en
    if body.value_ru is not None:
        entry.value_ru = body.value_ru
    if body.canonical is not None:
        entry.canonical = body.canonical
    if body.notes is not None:
        entry.notes = body.notes

    await db.commit()
    await db.refresh(entry)
    return DictionaryEntryOut.model_validate(entry)


@router.delete("/{entry_id}")
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    entry = await db.get(DictionaryEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Запись не найдена")
    await db.delete(entry)
    await db.commit()
    return {"ok": True}


@router.post("/{entry_id}/aliases")
async def add_alias(
    entry_id: int,
    alias: str,
    language: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(DictionaryEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Запись не найдена")

    alias_value = alias.strip()
    if not alias_value:
        raise HTTPException(400, "Пустой alias")

    db.add(DictionaryAlias(
        entry_id=entry_id, alias=alias_value, language=language,
    ))
    await db.commit()
    return {"ok": True}


@router.delete("/aliases/{alias_id}")
async def delete_alias(alias_id: int, db: AsyncSession = Depends(get_db)):
    alias = await db.get(DictionaryAlias, alias_id)
    if not alias:
        raise HTTPException(404, "Alias не найден")
    await db.delete(alias)
    await db.commit()
    return {"ok": True}


@router.post("/suggest")
async def suggest(
    field_type: str,
    values: list[str],
    db: AsyncSession = Depends(get_db),
):
    if field_type not in DICT_TYPES:
        raise HTTPException(400, "Неизвестный тип словаря")
    return await suggest_for_unrecognized(field_type, values, db)


_DICT_IMPORT_PATH = UPLOAD_DIR / "dict_import.xlsx"


@router.post("/import/upload", response_model=UploadResponse)
async def upload_dict_import(
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Допустим только .xlsx")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(_DICT_IMPORT_PATH, "wb") as f:
        shutil.copyfileobj(file.file, f)

    sheets_cols = get_sheets_and_columns(_DICT_IMPORT_PATH)
    return UploadResponse(
        sheets=list(sheets_cols.keys()),
        columns=sheets_cols,
    )


@router.get("/import/columns")
async def get_dict_import_columns(
    sheet_name: str,
    header_row: int = 1,
):
    if not _DICT_IMPORT_PATH.exists():
        raise HTTPException(400, "Сначала загрузите файл")
    cols = read_columns_at_row(_DICT_IMPORT_PATH, sheet_name, header_row)
    return {"columns": cols}


@router.post("/import/apply")
async def apply_dict_import(
    field_type: str,
    body: MappingRequest,
    overwrite: bool = False,
    db: AsyncSession = Depends(get_db),
):
    if field_type not in DICT_TYPES:
        raise HTTPException(400, "Неизвестный тип словаря")

    if not _DICT_IMPORT_PATH.exists():
        raise HTTPException(400, "Сначала загрузите файл")

    mappings = {
        item.system_field: item.file_column for item in body.mappings
    }
    rows = parse_dict_import(
        _DICT_IMPORT_PATH, body.sheet_name, body.header_row, mappings,
    )

    created = 0
    updated = 0
    skipped = 0

    for r in rows:
        canonical = r["canonical"]
        existing = (await db.execute(
            select(DictionaryEntry).where(
                DictionaryEntry.field_type == field_type,
                DictionaryEntry.canonical == canonical,
            )
        )).scalar()

        if existing:
            if not overwrite:
                skipped += 1
                continue
            existing.value_en = r.get("value_en") or existing.value_en
            existing.value_ru = r.get("value_ru") or existing.value_ru
            existing.notes = r.get("notes") or existing.notes
            entry = existing
            updated += 1
        else:
            entry = DictionaryEntry(
                field_type=field_type,
                value_en=r.get("value_en"),
                value_ru=r.get("value_ru"),
                canonical=canonical,
                notes=r.get("notes"),
            )
            db.add(entry)
            await db.flush()
            created += 1

        existing_aliases = {a.alias for a in entry.aliases} if entry.aliases else set()
        for alias in (r.get("aliases") or []):
            if alias and alias not in existing_aliases:
                db.add(DictionaryAlias(entry_id=entry.id, alias=alias))

    await db.commit()

    log.info(
        "Импорт словаря %s: создано %d, обновлено %d, пропущено %d",
        field_type, created, updated, skipped,
    )
    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "total": created + updated + skipped,
    }
