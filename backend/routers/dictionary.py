import logging
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.config import UPLOAD_DIR
from backend.database import get_db
from backend.models import (
    DictionaryEntry, DictionaryAlias,
    BdpRaw, PcEntry, GrlsEntry,
)
from backend.schemas import (
    DictionaryEntryCreate, DictionaryEntryUpdate, DictionaryEntryOut,
    UploadResponse, MappingRequest,
)
from backend.services.dictionary_types import (
    DICT_TYPES, DICT_TYPE_LABELS,
    DICT_TYPE_MNN, DICT_TYPE_LF, DICT_TYPE_PRODUCER, DICT_TYPE_SECTOR,
)
from backend.services.dict_suggest import suggest_for_unrecognized
from backend.services.canonicalize import build_dict_index
from backend.services.normalize import normalize_alias, normalize_mnn
from backend.services.parsers.base import (
    get_sheets_and_columns, read_columns_at_row,
)
from backend.services.parsers.dict_parser import parse_dict_import
from backend.routers.overview import invalidate_overview_cache


# Какие колонки в каких таблицах хранят raw-значения и их canonical
# для каждого типа словаря.
TYPE_TO_SOURCES: dict[str, list[tuple]] = {
    DICT_TYPE_LF: [
        ("bdp", BdpRaw, BdpRaw.lf_avp, BdpRaw.lf_canonical),
        ("pc", PcEntry, PcEntry.lf, PcEntry.lf_canonical),
        ("grls", GrlsEntry, GrlsEntry.lf_full, GrlsEntry.lf_canonical),
    ],
    DICT_TYPE_MNN: [
        ("bdp", BdpRaw, BdpRaw.mnn, BdpRaw.mnn_canonical),
        ("pc", PcEntry, PcEntry.mnn_raw, PcEntry.mnn_canonical),
        ("grls", GrlsEntry, GrlsEntry.mnn_raw, GrlsEntry.mnn_canonical),
    ],
    DICT_TYPE_PRODUCER: [
        ("bdp", BdpRaw, BdpRaw.producer, BdpRaw.producer_canonical),
        ("pc", PcEntry, PcEntry.owner, PcEntry.owner_canonical),
        ("grls", GrlsEntry, GrlsEntry.ru_holder, GrlsEntry.ru_holder_canonical),
    ],
    DICT_TYPE_SECTOR: [
        ("bdp", BdpRaw, BdpRaw.sector, BdpRaw.sector_canonical),
    ],
}


def _normalize(value: str, field_type: str) -> str:
    if field_type == DICT_TYPE_MNN:
        return normalize_mnn(value)
    return normalize_alias(value)

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


@router.get("/unrecognized")
async def list_unrecognized(
    field_type: str,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Список raw-значений из БДП/ПЦ/ГРЛС, которые НЕ нашли
    соответствия в словаре. С счётчиками по источникам."""
    if field_type not in DICT_TYPES:
        raise HTTPException(400, "Неизвестный тип словаря")
    sources = TYPE_TO_SOURCES.get(field_type, [])
    if not sources:
        return {"items": [], "total": 0}

    dict_index = await build_dict_index(db)
    type_index = dict_index.get(field_type, {})

    # Агрегированно по нормализованному ключу: counts по источникам
    # + сохраняем «представительное» raw-значение (первое попавшееся).
    aggregated: dict[str, dict] = {}
    for source_name, model, raw_col, _canonical_col in sources:
        result = await db.execute(
            select(raw_col, func.count())
            .where(raw_col.isnot(None), raw_col != "")
            .group_by(raw_col)
        )
        for raw_value, count in result.all():
            if raw_value is None:
                continue
            normalized = _normalize(str(raw_value), field_type)
            if not normalized:
                continue
            if normalized in type_index:
                continue  # уже распознано
            bucket = aggregated.setdefault(
                normalized,
                {
                    "value": str(raw_value),
                    "normalized": normalized,
                    "count_bdp": 0,
                    "count_pc": 0,
                    "count_grls": 0,
                    "total": 0,
                },
            )
            bucket[f"count_{source_name}"] += count
            bucket["total"] += count

    items = sorted(
        aggregated.values(), key=lambda x: -x["total"]
    )
    return {
        "items": items[:limit],
        "total": len(aggregated),
        "shown": min(limit, len(aggregated)),
    }


@router.post("/recanonicalize")
async def recanonicalize(
    field_type: str,
    db: AsyncSession = Depends(get_db),
):
    """Перегоняет canonical-поля по всем уже загруженным строкам
    БДП/ПЦ/ГРЛС для данного типа словаря."""
    if field_type not in DICT_TYPES:
        raise HTTPException(400, "Неизвестный тип словаря")
    sources = TYPE_TO_SOURCES.get(field_type, [])
    if not sources:
        return {"ok": True, "updated": 0, "matched": 0, "unmatched": 0}

    dict_index = await build_dict_index(db)
    type_index = dict_index.get(field_type, {})

    summary = {
        "ok": True,
        "by_source": {},
        "updated_total": 0,
        "matched_total": 0,
        "unmatched_total": 0,
    }
    touched_market_ids: set[int] = set()

    for source_name, model, raw_col, canonical_col in sources:
        result = await db.execute(select(model))
        rows = result.scalars().all()

        updated = 0
        matched = 0
        unmatched = 0
        for row in rows:
            raw = getattr(row, raw_col.key)
            if not raw:
                continue
            normalized = _normalize(str(raw), field_type)
            if not normalized:
                continue
            if normalized in type_index:
                new_canonical = type_index[normalized]
                matched += 1
            else:
                new_canonical = normalized
                unmatched += 1
            current = getattr(row, canonical_col.key)
            if current != new_canonical:
                setattr(row, canonical_col.key, new_canonical)
                updated += 1
                if hasattr(row, "market_id"):
                    touched_market_ids.add(row.market_id)

        summary["by_source"][source_name] = {
            "rows": len(rows),
            "updated": updated,
            "matched": matched,
            "unmatched": unmatched,
        }
        summary["updated_total"] += updated
        summary["matched_total"] += matched
        summary["unmatched_total"] += unmatched

    await db.commit()

    for mid in touched_market_ids:
        invalidate_overview_cache(mid)

    log.info(
        "Recanonicalize %s: updated %d (matched %d, unmatched %d) "
        "across markets %s",
        field_type, summary["updated_total"],
        summary["matched_total"], summary["unmatched_total"],
        sorted(touched_market_ids),
    )
    return summary


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
