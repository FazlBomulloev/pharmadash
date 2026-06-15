import logging
from difflib import SequenceMatcher
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models import DictionaryEntry, DictionaryAlias
from backend.services.normalize import normalize_alias, normalize_mnn
from backend.services.dictionary_types import DICT_TYPE_MNN

log = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.65


def _normalize(value: str, field_type: str) -> str:
    if field_type == DICT_TYPE_MNN:
        return normalize_mnn(value)
    return normalize_alias(value)


async def suggest_for_unrecognized(
    field_type: str,
    values: list[str],
    db: AsyncSession,
    threshold: float = SIMILARITY_THRESHOLD,
) -> list[dict]:
    result = await db.execute(
        select(DictionaryEntry)
        .where(DictionaryEntry.field_type == field_type)
        .options(selectinload(DictionaryEntry.aliases))
    )
    entries = result.scalars().all()

    candidates: list[tuple[str, int, str]] = []
    for e in entries:
        for variant in filter(None, [e.value_en, e.value_ru, e.canonical]):
            candidates.append((_normalize(variant, field_type), e.id, e.canonical))
        for a in e.aliases:
            candidates.append((_normalize(a.alias, field_type), e.id, e.canonical))

    suggestions = []
    for value in values:
        norm_value = _normalize(value, field_type)
        best_ratio = 0.0
        best_entry_id = None
        best_canonical = None

        for cand_norm, cand_id, cand_canonical in candidates:
            if not cand_norm:
                continue
            ratio = SequenceMatcher(None, norm_value, cand_norm).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_entry_id = cand_id
                best_canonical = cand_canonical

        if best_ratio >= threshold:
            suggestions.append({
                "value": value,
                "suggestion": best_canonical,
                "suggestion_entry_id": best_entry_id,
                "similarity": round(best_ratio, 3),
            })
        else:
            suggestions.append({
                "value": value,
                "suggestion": None,
                "suggestion_entry_id": None,
                "similarity": round(best_ratio, 3),
            })

    return suggestions
