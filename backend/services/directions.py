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


OTHER = "Прочие направления"
OVERVIEW_TOP_N = 15
NOISE_REL = 1e-9  # относительный порог показа остатка


def _safe_div(num: float, den: float) -> float | None:
    return num / den if den else None


def _growth(cur: float, prev: float) -> float | None:
    return (cur - prev) / prev if prev else None


def _row(name: str, usd: list[float], totals: list[float], kind: str) -> dict:
    return {
        "name": name,
        "usd": usd[2],
        "share": _safe_div(usd[2], totals[2]),
        "shares_by_year": [
            _safe_div(usd[k], totals[k]) for k in range(3)
        ],
        "growth": _growth(usd[2], usd[1]),
        "kind": kind,
    }


def build_overview_directions(
    items: Iterable[Any], dmap: DirectionMap, top_n: int = OVERVIEW_TOP_N,
) -> list[dict]:
    materialised = list(items)
    by_dir, rest = attribute_usd(materialised, dmap)
    totals = [
        sum(i.usd_y1 or 0.0 for i in materialised),
        sum(i.usd_y2 or 0.0 for i in materialised),
        sum(i.usd_y3 or 0.0 for i in materialised),
    ]
    if totals[2] <= 0:
        return []

    ranked = sorted(by_dir.items(), key=lambda x: (-x[1][2], x[0]))
    out = [
        _row(name, usd, totals, "direction") for name, usd in ranked[:top_n]
    ]

    tail = ranked[top_n:]
    if tail:
        merged = [sum(usd[k] for _, usd in tail) for k in range(3)]
        out.append(_row(OTHER, merged, totals, "other"))

    # Порог отсекает шум float: при суммах долей ровно 100% невязка может
    # дать около 1e-14, и строка «Не распределено $0 · 0%» выглядела бы
    # как дефект продукта. Инвариант сходимости при этом не меняется —
    # порог влияет только на отображение. Порог намеренно привязан к
    # последнему году (rest[2]): и рынок, и сортировка определяются по нему.
    if rest[2] > totals[2] * NOISE_REL:
        out.append(_row(UNALLOCATED, rest, totals, "unallocated"))

    return out


def _share_rows(
    by_dir: dict[str, list[float]], rest: list[float], total: float,
) -> list[dict]:
    rows = [
        {
            "name": name,
            "usd": usd[2],
            "share": _safe_div(usd[2], total) or 0.0,
        }
        for name, usd in sorted(by_dir.items(), key=lambda x: (-x[1][2], x[0]))
    ]
    if rest[2] > total * NOISE_REL:  # см. build_overview_directions
        rows.append({
            "name": UNALLOCATED,
            "usd": rest[2],
            "share": _safe_div(rest[2], total) or 0.0,
        })
    return rows


def build_mnn_directions(items: Iterable[Any], dmap: DirectionMap) -> dict:
    materialised = list(items)

    by_form: dict[str, list[Any]] = defaultdict(list)
    for item in materialised:
        by_form[item_key(item)[1] or "—"].append(item)

    total_by_dir, total_rest = attribute_usd(materialised, dmap)
    total_usd = sum(i.usd_y3 or 0.0 for i in materialised)

    forms = []
    for form, group in sorted(
        by_form.items(), key=lambda x: (-sum(i.usd_y3 or 0.0 for i in x[1]), x[0]),
    ):
        group_by_dir, group_rest = attribute_usd(group, dmap)
        group_usd = sum(i.usd_y3 or 0.0 for i in group)
        forms.append({
            "form": form,
            "usd": group_usd,
            "in_reference": bool(group_by_dir),
            "rows": (
                _share_rows(group_by_dir, group_rest, group_usd)
                if group_by_dir else []
            ),
        })

    return {
        "total": {
            "usd": total_usd,
            "rows": _share_rows(total_by_dir, total_rest, total_usd),
        },
        "forms": forms,
    }


def build_direction_detail(
    items: Iterable[Any],
    dmap: DirectionMap,
    name: str,
    market_total_y3: float,
) -> dict:
    pairs: dict[tuple[str, str], dict] = {}
    kpi_usd = [0.0, 0.0, 0.0]
    form_usd: dict[str, float] = defaultdict(float)
    mnn_keys: set[str] = set()

    for item in items:
        key = item_key(item)
        pair_shares = dmap.get(key, [])
        share = next((s for d, s in pair_shares if d == name), None)
        if share is None:
            continue
        # Та же нормировка, что в attribute_usd: сумма долей выше 100%.
        covered = sum(s for _, s in pair_shares)
        if covered > 1.0:
            share = share / covered
        usd = [
            (item.usd_y1 or 0.0) * share,
            (item.usd_y2 or 0.0) * share,
            (item.usd_y3 or 0.0) * share,
        ]
        for k in range(3):
            kpi_usd[k] += usd[k]
        form_usd[key[1] or "—"] += usd[2]
        mnn_keys.add(key[0])

        entry = pairs.get(key)
        if entry is None:
            pairs[key] = {
                "mnn": item.mnn,
                "mnn_key": key[0],
                "lf": key[1] or "—",
                "usd_y2": usd[1],
                "usd_y3": usd[2],
                "share_in_pair": share,
            }
        else:
            entry["usd_y2"] += usd[1]
            entry["usd_y3"] += usd[2]

    ranked = sorted(
        pairs.values(), key=lambda p: (-p["usd_y3"], p["mnn_key"], p["lf"]),
    )
    for entry in ranked:
        entry["growth"] = _growth(entry["usd_y3"], entry["usd_y2"])
        entry.pop("usd_y2")
        entry.pop("mnn_key")

    return {
        "name": name,
        "kpi": {
            "usd_y1": kpi_usd[0],
            "usd_y2": kpi_usd[1],
            "usd_y3": kpi_usd[2],
            "usd_growth": _growth(kpi_usd[2], kpi_usd[1]),
            "share_of_market": _safe_div(kpi_usd[2], market_total_y3) or 0.0,
            "pairs_count": len(ranked),
            "mnns_count": len(mnn_keys),
        },
        "pairs": ranked,
        "forms": [
            {"form": form, "usd_y3": usd,
             "share_in_direction": _safe_div(usd, kpi_usd[2]) or 0.0}
            for form, usd in sorted(
                form_usd.items(), key=lambda x: (-x[1], x[0]),
            )
        ],
    }
