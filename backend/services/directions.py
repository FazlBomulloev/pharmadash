import logging
from collections import defaultdict
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import MnnDirection

log = logging.getLogger(__name__)

UNALLOCATED = "Не распределено"

DirectionMap = dict[tuple[str, str], list[tuple[str, float]]]

_MAP_CACHE: DirectionMap | None = None
_MAP_GEN = 0


def pair_key(mnn: str | None, lf: str | None) -> tuple[str, str]:
    return ((mnn or "").strip().upper(), (lf or "").strip().upper())


def item_key(item: Any) -> tuple[str, str]:
    lf_avp = (getattr(item, "lf_avp", None) or "").strip()
    lf = lf_avp or (getattr(item, "lf", None) or "").strip()
    return pair_key(getattr(item, "mnn", None), lf)


def invalidate_direction_map() -> None:
    global _MAP_CACHE, _MAP_GEN
    _MAP_CACHE = None
    _MAP_GEN += 1
    log.info("Кеш справочника направлений сброшен")


async def load_direction_map(db: AsyncSession) -> DirectionMap:
    global _MAP_CACHE
    if _MAP_CACHE is not None:
        return _MAP_CACHE

    gen = _MAP_GEN
    stmt = select(
        MnnDirection.mnn, MnnDirection.lf,
        MnnDirection.direction, MnnDirection.share,
    )
    result: DirectionMap = defaultdict(list)
    for mnn, lf, direction, share in (await db.execute(stmt)).all():
        result[pair_key(mnn, lf)].append((direction, share))
    loaded = dict(result)

    if gen == _MAP_GEN:
        _MAP_CACHE = loaded
        log.info("Справочник направлений загружен: %d пар", len(loaded))
    else:
        log.info(
            "Справочник перезалит во время чтения — кеш не обновлён, "
            "прочитано %d пар", len(loaded),
        )
    return loaded


def attribute_usd(
    items: Iterable[Any], dmap: DirectionMap,
) -> tuple[dict[str, list[float]], list[float]]:
    by_dir: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    rest = [0.0, 0.0, 0.0]

    for item in items:
        usd = (
            item.usd_y1 or 0.0,
            item.usd_y2 or 0.0,
            item.usd_y3 or 0.0,
        )
        pairs = dmap.get(item_key(item))
        if not pairs:
            for k in range(3):
                rest[k] += usd[k]
            continue

        covered = sum(share for _, share in pairs)
        # Сумма долей выше 100% раздула бы рынок: недобора нет, а переизбыток
        # попал бы в итог лишними деньгами. Импорт такие пары отбраковывает,
        # но ядро обязано держать инвариант и на данных, пришедших иначе.
        scale = 1.0 / covered if covered > 1.0 else 1.0
        if scale != 1.0:
            log.warning(
                "Сумма долей пары %s равна %.3f — доли нормированы",
                item_key(item), covered,
            )

        allocated = [0.0, 0.0, 0.0]
        for direction, share in pairs:
            bucket = by_dir[direction]
            for k in range(3):
                part = usd[k] * share * scale
                bucket[k] += part
                allocated[k] += part

        # Остаток — именно невязка. При covered < 1 это недобор, при
        # covered >= 1 — ноль с точностью float. Порога не нужно.
        for k in range(3):
            rest[k] += usd[k] - allocated[k]

    return dict(by_dir), rest
