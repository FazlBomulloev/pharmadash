import logging
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models import DictionaryEntry, DictionaryAlias
from backend.services.normalize import normalize_alias, normalize_mnn
from backend.services.dictionary_types import (
    DICT_TYPE_MNN, SOURCE_FIELD_TO_DICT_TYPE, CANONICAL_FIELD_MAP,
)

log = logging.getLogger(__name__)


async def build_dict_index(
    db: AsyncSession,
) -> dict[str, dict[str, str]]:
    index: dict[str, dict[str, str]] = defaultdict(dict)

    entries_result = await db.execute(
        select(DictionaryEntry)
        .options(selectinload(DictionaryEntry.aliases))
        .order_by(DictionaryEntry.id)
    )
    entries = entries_result.scalars().all()

    for e in entries:
        ft = e.field_type
        canonical = e.canonical
        bucket = index[ft]

        if e.value_en:
            key = (
                normalize_mnn(e.value_en)
                if ft == DICT_TYPE_MNN
                else normalize_alias(e.value_en)
            )
            if key and key not in bucket:
                bucket[key] = canonical
        if e.value_ru:
            key = (
                normalize_mnn(e.value_ru)
                if ft == DICT_TYPE_MNN
                else normalize_alias(e.value_ru)
            )
            if key and key not in bucket:
                bucket[key] = canonical

        for a in e.aliases:
            key = (
                normalize_mnn(a.alias)
                if ft == DICT_TYPE_MNN
                else normalize_alias(a.alias)
            )
            if key and key not in bucket:
                bucket[key] = canonical

    log.info(
        "Индекс словаря построен: %s",
        {k: len(v) for k, v in index.items()},
    )
    return dict(index)


def _normalize_for_lookup(value: str, field_type: str) -> str:
    if field_type == DICT_TYPE_MNN:
        return normalize_mnn(value)
    return normalize_alias(value)


def canonicalize_record(
    record: dict,
    dict_index: dict[str, dict[str, str]],
    unrecognized: dict[str, set],
) -> dict:
    for source_field, raw_value in list(record.items()):
        field_type = SOURCE_FIELD_TO_DICT_TYPE.get(source_field)
        if not field_type:
            continue
        if not raw_value:
            continue

        canonical_field = CANONICAL_FIELD_MAP.get(source_field)
        if not canonical_field:
            continue

        normalized = _normalize_for_lookup(str(raw_value), field_type)
        canonical = dict_index.get(field_type, {}).get(normalized)

        if canonical:
            record[canonical_field] = canonical
        else:
            record[canonical_field] = normalized or str(raw_value)
            unrecognized[field_type].add(str(raw_value))

    return record


async def apply_canonical_to_rows(
    rows: list[dict],
    db: AsyncSession,
) -> tuple[list[dict], dict[str, list[str]]]:
    dict_index = await build_dict_index(db)
    unrecognized: dict[str, set] = defaultdict(set)

    for r in rows:
        canonicalize_record(r, dict_index, unrecognized)

    return rows, {k: sorted(v) for k, v in unrecognized.items()}
