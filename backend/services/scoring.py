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
    forms_count: int = 0,
    strengths_count: int = 0,
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

    rh_fit = cfg["ret_hos_fit"]
    if ret_share is not None:
        if 0.3 <= ret_share <= 0.8:
            s4 = rh_fit["match"]
        elif 0.2 <= ret_share <= 0.9:
            s4 = rh_fit["mixed"]
        else:
            s4 = rh_fit["mismatch"]
    else:
        s4 = rh_fit["mixed"]
    details.append({
        "metric": "RET/HOS Fit",
        "value": ret_share, "score": s4, "max": 5,
    })

    fs_fit = cfg["form_strength_fit"]
    diversity = forms_count + strengths_count * 0.5
    if diversity >= 6 or forms_count >= 4:
        s5 = fs_fit["large"]
        fs_label = "разнообразный портфель"
    elif diversity >= 2.5 or forms_count >= 2:
        s5 = fs_fit["medium"]
        fs_label = "умеренное разнообразие"
    else:
        s5 = fs_fit["small"]
        fs_label = "узкий портфель"
    details.append({
        "metric": "Form/Strength Fit",
        "value": f"{forms_count} форм, {strengths_count} дозировок ({fs_label})",
        "score": s5, "max": 5,
    })

    return s1 + s2 + s3 + s4 + s5, details


def calculate_regulatory_score(
    jnvlp_flag: bool = False,
    grls_active_count: int = 0,
    grls_registrants: int = 0,
    pc_flag: bool = False,
    has_grls: bool = False,
    has_pc: bool = False,
) -> tuple[float, list[dict]]:
    details = []

    if not has_grls:
        s1, v1 = 3, "Нет данных GRLS"
    elif not jnvlp_flag:
        s1, v1 = 5, "Не в ЖНВЛП"
    else:
        s1, v1 = 1, "ЖНВЛП — ценовое регулирование"
    details.append({"metric": "ЖНВЛП", "value": v1, "score": s1, "max": 5})

    if not has_grls:
        s2, v2 = 3, "Нет данных"
    elif grls_active_count > 5:
        s2, v2 = 6, f"{grls_active_count} активных РУ"
    elif grls_active_count >= 2:
        s2, v2 = 3, f"{grls_active_count} активных РУ"
    else:
        s2, v2 = 1, f"{grls_active_count} активных РУ"
    details.append({"metric": "Активные РУ", "value": v2, "score": s2, "max": 6})

    if not has_grls:
        s3, v3 = 2, "Нет данных"
    elif 3 <= grls_registrants <= 10:
        s3, v3 = 4, f"{grls_registrants} регистрантов"
    elif grls_registrants > 10:
        s3, v3 = 2, f"{grls_registrants} (перенасыщено)"
    else:
        s3, v3 = 1, f"{grls_registrants} (монополия/мало)"
    details.append({"metric": "Плотность регистрантов", "value": v3, "score": s3, "max": 4})

    if not has_pc:
        s4, v4 = 3, "Нет данных РС"
    elif not pc_flag:
        s4, v4 = 5, "Не в РС"
    else:
        s4, v4 = 3, "В действующем РС"
    details.append({"metric": "Риск ценового регулирования", "value": v4, "score": s4, "max": 5})

    return s1 + s2 + s3 + s4, details


def get_recommendation(total_score: float) -> tuple[str, str]:
    for low, high, label, color in RECOMMENDATION_RANGES:
        if low <= total_score <= high:
            return label, color
    return "Unattractive", "red"


def generate_drivers_and_flags(
    usd_y3: float,
    usd_growth: float | None,
    un_growth: float | None,
    asp_growth: float | None,
    top3_share: float | None,
    hhi: float | None,
    active_competitors: int,
    jnvlp_flag: bool = False,
    pc_flag: bool = False,
    grls_registrants: int = 0,
    has_grls: bool = False,
    has_pc: bool = False,
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

    if has_grls and jnvlp_flag:
        flags.append({"type": "regulatory", "text": "Препарат в ЖНВЛП (ценовое регулирование)"})

    if has_pc and pc_flag:
        flags.append({"type": "regulatory", "text": "Действующая предельная цена — риск маржинальности"})

    if has_grls and grls_registrants > 10:
        flags.append({
            "type": "competition",
            "text": f"Высокая регистрационная насыщенность ({grls_registrants} регистрантов)",
        })

    if has_grls and not jnvlp_flag and has_pc and not pc_flag:
        drivers.append({"type": "positive", "text": "Регуляторно чистый продукт"})

    checks.append("Проверить форму завода, цену, GMP/БЭ")
    if top3_share and top3_share > 0.50:
        checks.append("Проверить позицию лидера и барьеры входа")

    return drivers, flags, checks
