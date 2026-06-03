import logging
from backend.config import (
    SCORE_THRESHOLDS,
    RECOMMENDATION_RANGES,
    CONCENTRATION_THRESHOLDS,
)

log = logging.getLogger(__name__)


def _score_by_ranges(
    value: float | None,
    ranges: list[tuple],
) -> int:
    if value is None:
        return 0
    for threshold, score in ranges:
        if value < threshold:
            return score
    return ranges[-1][1]


def _competitor_score(count: int) -> int:
    mapping = SCORE_THRESHOLDS["market_structure"]["active_competitors"]
    if 3 <= count <= 15:
        return mapping["3-15"]
    elif 16 <= count <= 30:
        return mapping["16-30"]
    elif 1 <= count <= 2:
        return mapping["1-2"]
    else:
        return mapping[">30"]


def calculate_economic_score(
    usd_y3: float,
    usd_growth: float | None,
    un_growth: float | None,
    un_y3: float,
    asp_growth: float | None,
) -> tuple[float, list[dict]]:
    cfg = SCORE_THRESHOLDS["economic"]
    details = []

    s1 = _score_by_ranges(usd_y3, cfg["usd_last_year"])
    details.append({
        "metric": "USD Last Year",
        "value": usd_y3, "score": s1, "max": 15,
    })

    s2 = _score_by_ranges(usd_growth, cfg["usd_growth"])
    details.append({
        "metric": "USD Growth",
        "value": usd_growth, "score": s2, "max": 10,
    })

    s3 = _score_by_ranges(un_growth, cfg["un_growth"])
    details.append({
        "metric": "UN Growth",
        "value": un_growth, "score": s3, "max": 10,
    })

    s4 = _score_by_ranges(un_y3, cfg["un_last_year"])
    details.append({
        "metric": "UN Last Year",
        "value": un_y3, "score": s4, "max": 5,
    })

    s5 = _score_by_ranges(asp_growth, cfg["asp_quality"])
    details.append({
        "metric": "ASP Quality",
        "value": asp_growth, "score": s5, "max": 10,
    })

    return s1 + s2 + s3 + s4 + s5, details


def calculate_structure_score(
    active_competitors: int,
    top3_share: float | None,
    hhi: float | None,
    ret_share: float | None,
) -> tuple[float, list[dict]]:
    cfg = SCORE_THRESHOLDS["market_structure"]
    details = []

    s1 = _competitor_score(active_competitors)
    details.append({
        "metric": "Active Competitors",
        "value": active_competitors, "score": s1, "max": 8,
    })

    s2 = _score_by_ranges(top3_share, cfg["top3_share"])
    details.append({
        "metric": "Top-3 Share",
        "value": top3_share, "score": s2, "max": 7,
    })

    s3 = _score_by_ranges(hhi, cfg["hhi"])
    details.append({
        "metric": "HHI",
        "value": hhi, "score": s3, "max": 5,
    })

    fit = cfg["ret_hos_fit"]
    if ret_share is not None:
        if 0.3 <= ret_share <= 0.8:
            s4 = fit["match"]
        elif 0.2 <= ret_share <= 0.9:
            s4 = fit["mixed"]
        else:
            s4 = fit["mismatch"]
    else:
        s4 = fit["mixed"]
    details.append({
        "metric": "RET/HOS Fit",
        "value": ret_share, "score": s4, "max": 5,
    })

    s5 = fit["mixed"]
    details.append({
        "metric": "Form/Strength Fit",
        "value": None, "score": s5, "max": 5,
    })

    return s1 + s2 + s3 + s4 + s5, details


def calculate_regulatory_score() -> tuple[float, list[dict]]:
    details = []
    s1 = 3
    details.append({
        "metric": "ЖНВЛП", "value": "Не определено",
        "score": s1, "max": 5,
    })
    s2 = 3
    details.append({
        "metric": "ГРЛС", "value": "Не определено",
        "score": s2, "max": 6,
    })
    s3 = 2
    details.append({
        "metric": "GRLS Crowding", "value": "Не определено",
        "score": s3, "max": 4,
    })
    s4 = 3
    details.append({
        "metric": "Access Risk", "value": "Не определено",
        "score": s4, "max": 5,
    })
    return s1 + s2 + s3 + s4, details


def get_recommendation(total_score: float) -> tuple[str, str]:
    for low, high, label, color in RECOMMENDATION_RANGES:
        if low <= total_score <= high:
            return label, color
    return "Reject", "#F44336"


def generate_drivers_and_flags(
    usd_y3: float,
    usd_growth: float | None,
    un_growth: float | None,
    asp_growth: float | None,
    top3_share: float | None,
    hhi: float | None,
    active_competitors: int,
) -> tuple[list[dict], list[dict], list[str]]:
    drivers: list[dict] = []
    flags: list[dict] = []
    checks: list[str] = []

    if usd_y3 > 10_000_000:
        drivers.append({
            "type": "positive",
            "text": f"Рынок > $10M (${usd_y3:,.0f})",
        })
    elif usd_y3 < 500_000:
        flags.append({
            "type": "risk",
            "text": f"Малый рынок (${usd_y3:,.0f})",
        })

    if usd_growth is not None:
        if usd_growth > 0.10:
            drivers.append({
                "type": "positive",
                "text": f"Рост USD +{usd_growth:.1%}",
            })
        elif usd_growth < -0.10:
            flags.append({
                "type": "risk",
                "text": f"Падение USD {usd_growth:.1%}",
            })

    if un_growth is not None:
        if un_growth > 0.10:
            drivers.append({
                "type": "positive",
                "text": f"Рост потребления UN +{un_growth:.1%}",
            })
        elif un_growth < -0.15:
            flags.append({
                "type": "risk",
                "text": f"Падение потребления UN {un_growth:.1%}",
            })

    if asp_growth is not None and asp_growth < -0.05:
        flags.append({
            "type": "price",
            "text": f"Ценовое давление ASP {asp_growth:.1%}",
        })

    if top3_share is not None and top3_share > 0.70:
        flags.append({
            "type": "competition",
            "text": f"Высокая концентрация Top-3 {top3_share:.1%}",
        })
    elif top3_share is not None and top3_share < 0.40:
        drivers.append({
            "type": "positive",
            "text": "Умеренная конкуренция",
        })

    if hhi is not None and hhi > 2500:
        flags.append({
            "type": "competition",
            "text": f"HHI > 2500 ({hhi:.0f})",
        })

    if active_competitors <= 2:
        flags.append({
            "type": "competition",
            "text": "Мало конкурентов — возможен закрытый рынок",
        })

    checks.append("Проверить форму завода, цену, GMP/БЭ")
    if top3_share and top3_share > 0.50:
        checks.append("Проверить позицию лидера и барьеры входа")

    return drivers, flags, checks
