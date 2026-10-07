from typing import Any, Callable

from backend.services.scoring import (
    CATEGORIES,
    CATEGORY_STOP,
    CRITERIA,
    STOP_MAX_PRICE,
    STOP_MAX_PRODUCERS,
    STOP_MIN_SALES,
)

DEFAULT_PAGE_SIZE = 15
MAX_PAGE_SIZE = 200
SUGGEST_LIMIT = 8

_SORT_KEYS: dict[str, Callable[[dict], Any]] = {
    "rank": lambda i: i["rank"],
    "mnn": lambda i: i["mnn"],
    "cls": lambda i: i["cls"],
    "direction": lambda i: i["direction"],
    "usd": lambda i: i["sales"][2],
    "usd_y1": lambda i: i["sales"][0],
    "usd_y2": lambda i: i["sales"][1],
    "price": lambda i: i["price"],
    "cagr_usd": lambda i: i["cagr_usd"],
    "cagr_units": lambda i: i["cagr_units"],
    "import_share": lambda i: i["import_share"],
    "hospital_share": lambda i: i["hospital_share"],
    "producers": lambda i: i["producers"],
    "hhi": lambda i: i["hhi"],
    "total": lambda i: i["total"],
    "category": lambda i: CATEGORIES.index(i["category"]),
}
for _criterion in CRITERIA:
    _SORT_KEYS[f"score_{_criterion}"] = (
        lambda i, c=_criterion: i["scores"][c]
    )


def filter_items(
    items: list[dict],
    category: str | None = None,
    passed_only: bool = False,
    q: str | None = None,
) -> list[dict]:
    needle = (q or "").strip().upper()
    result = []
    for i in items:
        if category and i["category"] != category:
            continue
        if passed_only and not i["passed"]:
            continue
        if needle and not (
            needle in i["mnn"].upper()
            or needle in (i["cls"] or "").upper()
            or needle in i["direction"].upper()
        ):
            continue
        result.append(i)
    return result


def sort_items(
    items: list[dict], sort: str | None, order: str | None,
) -> list[dict]:
    key = _SORT_KEYS.get(sort or "rank", _SORT_KEYS["rank"])
    present = [i for i in items if key(i) is not None]
    missing = [i for i in items if key(i) is None]
    present.sort(key=key, reverse=(order == "desc"))
    return present + missing


def paginate(items: list[dict], page: int, page_size: int) -> list[dict]:
    size = max(1, min(page_size, MAX_PAGE_SIZE))
    start = (max(1, page) - 1) * size
    return items[start:start + size]


def suggest_mnn(
    items: list[dict], q: str | None, limit: int = SUGGEST_LIMIT,
) -> list[dict]:
    needle = (q or "").strip().upper()
    if needle:
        matched = [
            i for i in items
            if needle in i["mnn"].upper()
            or (i["cls"] or "").upper().startswith(needle)
        ]
    else:
        matched = [i for i in items if i["passed"]]
    return [
        {
            "mnn": i["mnn"],
            "cls": i["cls"],
            "usd": i["sales"][2],
            "total": i["total"],
            "category": i["category"],
        }
        for i in matched[:limit]
    ]


def preview_counts(scoring: dict) -> dict:
    stop = {STOP_MIN_SALES: 0, STOP_MAX_PRICE: 0, STOP_MAX_PRODUCERS: 0}
    for i in scoring["items"]:
        for reason in i["stop_reasons"]:
            stop[reason] += 1
    summary = scoring["summary"]
    return {
        "total": summary["total"],
        "passed": summary["passed"],
        "zones": {
            c: n for c, n in summary["categories"].items()
            if c != CATEGORY_STOP
        },
        "stop": stop,
    }
