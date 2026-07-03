"""Сдвиг 3-летнего окна БДП под выбранный год.

БДП хранит только 3 фиксированных года на рынок (usd_y1/y2/y3, un_y1/y2/y3).
`Market.years_json` содержит соответствующие календарные годы.
Пользователь может выбрать один из этих лет — тогда он становится «Y3»,
предыдущий год становится «Y2», а тот что до него — «Y1».
Если исторических данных не хватает — соответствующие Y2/Y1 = 0.

Такой сдвиг реализован через SimpleNamespace-обёртки, чтобы builders
(_build_zone1/2, _build_volume и т.д.) работали без изменений.
"""
import json
from types import SimpleNamespace
from typing import Any, Iterable


def parse_years(market) -> list[int]:
    return sorted(json.loads(market.years_json))


def resolve_year_idx(market, year: int | None) -> int:
    """Индекс 0/1/2 в отсортированном списке лет рынка.

    Если year не задан или не совпадает ни с одним — возвращает индекс
    последнего года (2 при полном наборе).
    """
    years = parse_years(market)
    if not years:
        return 0
    default_idx = len(years) - 1
    if year is None:
        return default_idx
    try:
        return years.index(int(year))
    except (ValueError, TypeError):
        return default_idx


def selected_year(market, year: int | None) -> int | None:
    """Календарный год, соответствующий resolve_year_idx()."""
    years = parse_years(market)
    if not years:
        return None
    return years[resolve_year_idx(market, year)]


# Атрибуты БДП которые копируются как есть при shift.
_PASSTHROUGH_ATTRS = (
    "mnn", "mnn_canonical", "tm",
    "producer", "producer_canonical",
    "sector", "sector_canonical", "region",
    "atc",
    "lf", "lf_canonical", "lf_avp",
    "strength", "country_mfr", "bg_g",
    "pack_size",
)


def _get(item: Any, name: str, default=None):
    return getattr(item, name, default)


def shift_items(
    items: Iterable[Any], year_idx: int,
) -> list[Any]:
    """Возвращает объекты, у которых usd_y3/un_y3 читают колонку
    соответствующего year_idx исходной строки. Y2/Y1 сдвигаются
    аналогично; при выходе за диапазон 0.

    Если year_idx == 2 (последний год) — возвращает исходный список.
    """
    materialized = list(items)
    if year_idx == 2:
        return materialized

    shifted: list[Any] = []
    for i in materialized:
        base: dict[str, Any] = {
            attr: _get(i, attr) for attr in _PASSTHROUGH_ATTRS
        }
        if year_idx == 1:
            base["usd_y3"] = _get(i, "usd_y2", 0.0) or 0.0
            base["usd_y2"] = _get(i, "usd_y1", 0.0) or 0.0
            base["usd_y1"] = 0.0
            base["un_y3"] = _get(i, "un_y2", 0.0) or 0.0
            base["un_y2"] = _get(i, "un_y1", 0.0) or 0.0
            base["un_y1"] = 0.0
        else:  # year_idx == 0
            base["usd_y3"] = _get(i, "usd_y1", 0.0) or 0.0
            base["usd_y2"] = 0.0
            base["usd_y1"] = 0.0
            base["un_y3"] = _get(i, "un_y1", 0.0) or 0.0
            base["un_y2"] = 0.0
            base["un_y1"] = 0.0
        shifted.append(SimpleNamespace(**base))
    return shifted


def shifted_years(market, year_idx: int) -> list[int]:
    """Возвращает 3-элементный список лет, соответствующий
    сдвинутому окну. Отсутствующие годы (при выходе за диапазон)
    заменяются на 0 — фронт скроет их как «—».
    """
    years = parse_years(market)
    if not years:
        return [0, 0, 0]
    end_year = years[year_idx]
    if year_idx == 2:
        return years[:3]
    if year_idx == 1:
        y2 = years[0]
        return [0, y2, end_year]
    return [0, 0, end_year]
