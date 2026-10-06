"""Ключи группировки строк БДП: лекарственная форма и дозировка."""
import re

EMPTY_KEY = "—"

_DOSE_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*"
    r"(MG|МГ|MCG|МКГ|UG|G|Г|ME|МЕ|IU|ME/ML|МЕ/МЛ|"
    r"%|MG/ML|МГ/МЛ|MG/G|МГ/Г|ML|МЛ)",
    re.IGNORECASE,
)


def form_key(item) -> str:
    return item.lf_avp or item.lf or EMPTY_KEY


def extract_dose(strength: str | None) -> str | None:
    if not strength:
        return None
    matches = _DOSE_RE.findall(strength)
    if not matches:
        return None
    return ", ".join(
        f"{num.replace(',', '.')} {unit.upper()}"
        for num, unit in matches
    )


def dose_key(item) -> str:
    return extract_dose(item.strength) or EMPTY_KEY
