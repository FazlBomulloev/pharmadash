import json
from types import SimpleNamespace
from typing import Any, Iterable


def parse_years(market) -> list[int]:
    return sorted(json.loads(market.years_json))


def resolve_year_idx(market, year: int | None) -> int:
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
    years = parse_years(market)
    if not years:
        return None
    return years[resolve_year_idx(market, year)]


_PASSTHROUGH_ATTRS = (
    "mnn", "tm",
    "producer",
    "sector", "region",
    "atc",
    "lf", "lf_avp",
    "strength", "country_mfr", "bg_g",
    "pack_size",
)


def _get(item: Any, name: str, default=None):
    return getattr(item, name, default)


def shift_items(
    items: Iterable[Any], year_idx: int,
) -> list[Any]:
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
        else:
            base["usd_y3"] = _get(i, "usd_y1", 0.0) or 0.0
            base["usd_y2"] = 0.0
            base["usd_y1"] = 0.0
            base["un_y3"] = _get(i, "un_y1", 0.0) or 0.0
            base["un_y2"] = 0.0
            base["un_y1"] = 0.0
        shifted.append(SimpleNamespace(**base))
    return shifted


def shifted_years(market, year_idx: int) -> list[int]:
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
