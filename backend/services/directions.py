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


def pair_key(mnn: str | None, lf: str | None) -> tuple[str, str]:
    return ((mnn or "").strip().upper(), (lf or "").strip().upper())


def item_key(item: Any) -> tuple[str, str]:
    lf = getattr(item, "lf_avp", None) or getattr(item, "lf", None)
    return pair_key(getattr(item, "mnn", None), lf)


def invalidate_direction_map() -> None:
    global _MAP_CACHE
    _MAP_CACHE = None
    log.info("Кеш справочника направлений сброшен")


async def load_direction_map(db: AsyncSession) -> DirectionMap:
    global _MAP_CACHE
    if _MAP_CACHE is not None:
        return _MAP_CACHE

    stmt = select(
        MnnDirection.mnn, MnnDirection.lf,
        MnnDirection.direction, MnnDirection.share,
    )
    result: DirectionMap = defaultdict(list)
    for mnn, lf, direction, share in (await db.execute(stmt)).all():
        result[pair_key(mnn, lf)].append((direction, share))

    _MAP_CACHE = dict(result)
    log.info("Справочник направлений загружен: %d пар", len(_MAP_CACHE))
    return _MAP_CACHE


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

        covered = 0.0
        for direction, share in pairs:
            covered += share
            bucket = by_dir[direction]
            for k in range(3):
                bucket[k] += usd[k] * share

        if covered < 1.0 - 1e-9:
            shortfall = 1.0 - covered
            for k in range(3):
                rest[k] += usd[k] * shortfall

    return dict(by_dir), rest
