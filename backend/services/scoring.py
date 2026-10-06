"""Скоринг рынка на уровне МНН.

Чистый расчёт без БД: на входе строки БДП (уже отфильтрованные по
ЛФ/дозировке, если фильтр выбран) и «Настройки рынка», на выходе —
метрики, 10 баллов, ИТОГ, ранг и категория по каждому МНН.

Y — последний год БДП (usd_y3/un_y3), базовый — Y-2 (usd_y1/un_y1).
"""
from bisect import bisect_left
from collections import defaultdict
from typing import Any, Iterable

from backend.services.scoring_settings import ScoringSettings

CRITERIA = (
    "volume", "import_share", "cagr_usd", "competition", "price",
    "demand", "hhi", "form", "channel", "class_barrier",
)

CATEGORY_STOP = "stop"
CATEGORY_PRIORITY = "priority"
CATEGORY_WATCH = "watch"
CATEGORY_MISS = "miss"
CATEGORIES = (
    CATEGORY_PRIORITY, CATEGORY_WATCH, CATEGORY_MISS, CATEGORY_STOP,
)

STOP_MIN_SALES = "min_sales"
STOP_MAX_PRICE = "max_price"
STOP_MAX_PRODUCERS = "max_producers"

CAGR_PERIODS = 2
HHI_MAX = 10_000


# ────────────────────── элементарные баллы ──────────────────────

def percentile_scores(
    values: dict[str, float | None],
) -> dict[str, float | None]:
    """pct(x) = (число значений < x) / (N − 1) по непустым значениям.
    При N ≤ 1 балл = 1. Пустые значения остаются None."""
    present = sorted(v for v in values.values() if v is not None)
    n = len(present)
    result: dict[str, float | None] = {}
    for key, value in values.items():
        if value is None:
            result[key] = None
        elif n <= 1:
            result[key] = 1.0
        else:
            result[key] = bisect_left(present, value) / (n - 1)
    return result


def competition_score(producers: int, settings: ScoringSettings) -> float:
    cfg = settings.competition
    upper = settings.stop.max_producers
    if producers <= 1:
        return cfg.single_producer_score
    if producers <= cfg.no_penalty_until:
        return 1.0
    if producers >= upper or upper <= cfg.no_penalty_until:
        return cfg.min_score
    progress = (
        (producers - cfg.no_penalty_until) / (upper - cfg.no_penalty_until)
    )
    return 1.0 - progress * (1.0 - cfg.min_score)


def channel_score(
    hospital_share: float | None, settings: ScoringSettings,
) -> float:
    if hospital_share is None:
        return settings.neutral_score
    cfg = settings.channel
    if hospital_share <= cfg.hospital_low:
        return 1.0
    if hospital_share >= cfg.hospital_high:
        return cfg.min_score
    progress = (
        (hospital_share - cfg.hospital_low)
        / (cfg.hospital_high - cfg.hospital_low)
    )
    return 1.0 - progress * (1.0 - cfg.min_score)


def hhi_score(hhi: float | None, settings: ScoringSettings) -> float:
    if hhi is None:
        return settings.neutral_score
    return min(1.0, max(0.0, 1.0 - hhi / HHI_MAX))


def _cagr(start: float, end: float) -> float | None:
    if start <= 0 or end <= 0:
        return None
    return (end / start) ** (1 / CAGR_PERIODS) - 1


# ────────────────────── метрики по МНН ──────────────────────

def _collect_metrics(
    rows: Iterable[Any], settings: ScoringSettings,
) -> dict[str, dict]:
    home = {c.strip().upper() for c in settings.home_countries}
    form_map = settings.form_scores.map
    form_default = settings.form_scores.default

    acc: dict[str, dict] = defaultdict(lambda: {
        "usd": [0.0, 0.0, 0.0],
        "un": [0.0, 0.0, 0.0],
        "import_usd": 0.0,
        "hospital_usd": 0.0,
        "producer_usd": defaultdict(float),
        "class_usd": defaultdict(float),
        "form_usd": 0.0,
        "form_weighted": 0.0,
    })
    for r in rows:
        a = acc[r.mnn]
        usd_y = r.usd_y3 or 0.0
        a["usd"][0] += r.usd_y1 or 0.0
        a["usd"][1] += r.usd_y2 or 0.0
        a["usd"][2] += usd_y
        a["un"][0] += r.un_y1 or 0.0
        a["un"][1] += r.un_y2 or 0.0
        a["un"][2] += r.un_y3 or 0.0

        country = (r.country_mfr or "").strip().upper()
        if country and country not in home:
            a["import_usd"] += usd_y
        if "HOS" in (r.sector or "").upper():
            a["hospital_usd"] += usd_y
        if r.producer:
            a["producer_usd"][r.producer] += usd_y
        if r.atc:
            a["class_usd"][r.atc.strip().upper()] += usd_y
        form = r.lf_avp or r.lf
        if form:
            a["form_usd"] += usd_y
            a["form_weighted"] += usd_y * form_map.get(form, form_default)

    metrics: dict[str, dict] = {}
    for mnn, a in acc.items():
        sales = a["usd"][2]
        units = a["un"][2]
        positive = [v for v in a["producer_usd"].values() if v > 0]
        positive_total = sum(positive)
        # при равных продажах класс выбирается по алфавиту — детерминированно
        cls = (
            min(a["class_usd"].items(), key=lambda kv: (-kv[1], kv[0]))[0]
            if a["class_usd"] else None
        )
        metrics[mnn] = {
            "mnn": mnn,
            "cls": cls,
            "direction": (
                settings.directions.map.get(cls, settings.directions.default)
                if cls else settings.directions.default
            ),
            "sales": a["usd"],
            "units": a["un"],
            "price": sales / units if units > 0 else None,
            "cagr_usd": _cagr(a["usd"][0], sales),
            "cagr_units": _cagr(a["un"][0], units),
            "import_share": a["import_usd"] / sales if sales > 0 else None,
            "hospital_share": (
                a["hospital_usd"] / sales if sales > 0 else None
            ),
            "producers": len(positive),
            "hhi": (
                sum((v / positive_total * 100) ** 2 for v in positive)
                if positive_total > 0 else None
            ),
            "form_score": (
                a["form_weighted"] / a["form_usd"]
                if a["form_usd"] > 0 else None
            ),
        }
    return metrics


# ────────────────────── итог ──────────────────────

def _stop_reasons(m: dict, settings: ScoringSettings) -> list[str]:
    stop = settings.stop
    reasons = []
    if m["sales"][2] < stop.min_sales_usd:
        reasons.append(STOP_MIN_SALES)
    if m["price"] is not None and m["price"] > stop.max_price_usd:
        reasons.append(STOP_MAX_PRICE)
    if m["producers"] > stop.max_producers:
        reasons.append(STOP_MAX_PRODUCERS)
    return reasons


def _category(
    total: float, stopped: bool, settings: ScoringSettings,
) -> str:
    if stopped:
        return CATEGORY_STOP
    if total >= settings.thresholds.priority:
        return CATEGORY_PRIORITY
    if total >= settings.thresholds.watch:
        return CATEGORY_WATCH
    return CATEGORY_MISS


def compute_scoring(
    rows: Iterable[Any], settings: ScoringSettings,
) -> dict:
    """Возвращает {"items": [...], "summary": {...}}.
    items отсортированы по рангу (при равном ранге — по продажам Y)."""
    metrics = _collect_metrics(rows, settings)
    neutral = settings.neutral_score
    weights = settings.weights.model_dump()
    weight_sum = sum(weights.values())

    # Объём — перцентиль внутри своего класса, остальное — по всей выборке
    by_class: dict[str | None, dict[str, float | None]] = defaultdict(dict)
    for mnn, m in metrics.items():
        by_class[m["cls"]][mnn] = m["sales"][2]
    volume_pct: dict[str, float | None] = {}
    for class_values in by_class.values():
        volume_pct.update(percentile_scores(class_values))

    cagr_pct = percentile_scores(
        {k: m["cagr_usd"] for k, m in metrics.items()}
    )
    price_pct = percentile_scores(
        {k: m["price"] for k, m in metrics.items()}
    )
    demand_pct = percentile_scores(
        {k: m["cagr_units"] for k, m in metrics.items()}
    )

    def _or_neutral(value: float | None) -> float:
        return neutral if value is None else value

    barriers = settings.class_barriers
    items: list[dict] = []
    for mnn, m in metrics.items():
        scores = {
            "volume": _or_neutral(volume_pct[mnn]),
            "import_share": _or_neutral(m["import_share"]),
            "cagr_usd": _or_neutral(cagr_pct[mnn]),
            "competition": competition_score(m["producers"], settings),
            "price": _or_neutral(price_pct[mnn]),
            "demand": _or_neutral(demand_pct[mnn]),
            "hhi": hhi_score(m["hhi"], settings),
            "form": _or_neutral(m["form_score"]),
            "channel": channel_score(m["hospital_share"], settings),
            "class_barrier": (
                barriers.map.get(m["cls"], barriers.default)
                if m["cls"] else neutral
            ),
        }
        raw = (
            sum(scores[c] * weights[c] for c in CRITERIA)
            / weight_sum * 100
        )
        items.append({**m, "scores": scores, "raw": raw})

    if items:
        raw_min = min(i["raw"] for i in items)
        raw_max = max(i["raw"] for i in items)
        spread = raw_max - raw_min
        for i in items:
            i["total"] = (
                (i["raw"] - raw_min) / spread * 100 if spread > 0 else 100.0
            )

    # Ранг по убыванию ИТОГА; у равных — одинаковый (1, 1, 3, …)
    items.sort(key=lambda i: (-i["total"], -i["sales"][2], i["mnn"]))
    prev_total = None
    prev_rank = 0
    for position, i in enumerate(items, start=1):
        if i["total"] != prev_total:
            prev_rank = position
            prev_total = i["total"]
        i["rank"] = prev_rank
        i["stop_reasons"] = _stop_reasons(i, settings)
        i["passed"] = not i["stop_reasons"]
        i["category"] = _category(i["total"], not i["passed"], settings)

    categories = {c: 0 for c in CATEGORIES}
    for i in items:
        categories[i["category"]] += 1
    summary = {
        "total": len(items),
        "passed": sum(1 for i in items if i["passed"]),
        "categories": categories,
        "sales": [sum(i["sales"][k] for i in items) for k in range(3)],
    }
    return {"items": items, "summary": summary}
