import re
from datetime import date, datetime


def normalize_mnn(value) -> str:
    if value is None:
        return ""
    s = str(value).strip().upper().replace("Ё", "Е")
    s = re.sub(r"[\[\]]", "", s)
    s = re.sub(r"\s+", " ", s)
    parts = [p.strip() for p in s.split("+") if p.strip()]
    if not parts:
        return ""
    return " + ".join(sorted(parts))


def normalize_str(value) -> str:
    if value is None:
        return ""
    s = str(value).strip().upper()
    s = s.replace("Ё", "Е")
    return re.sub(r"\s+", " ", s)


def normalize_alias(value) -> str:
    if value is None:
        return ""
    s = str(value).strip().upper().replace("Ё", "Е")
    s = re.sub(r"[.,;_\-/\\]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def parse_bool(value) -> bool:
    if value is None:
        return False
    s = str(value).strip().lower()
    return s in {"да", "yes", "y", "true", "1", "+", "v", "✓"}


_PACK_QTY_RE = re.compile(r"(\d+(?:[.,]\d+)?)")


def parse_pack_qty(value) -> float | None:
    """Извлечь число из строки pack_qty (например, '30 таб.' → 30.0)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None
    s = str(value).strip()
    if not s:
        return None
    m = _PACK_QTY_RE.search(s)
    if not m:
        return None
    try:
        v = float(m.group(1).replace(",", "."))
        return v if v > 0 else None
    except ValueError:
        return None


def parse_float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, str):
            value = value.replace(",", ".").replace(" ", "")
        return float(value)
    except (ValueError, TypeError):
        return None


def parse_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def detect_language(value: str) -> str:
    if not value:
        return ""
    has_cyr = bool(re.search(r"[а-яА-ЯёЁ]", value))
    has_lat = bool(re.search(r"[a-zA-Z]", value))
    if has_cyr and not has_lat:
        return "ru"
    if has_lat and not has_cyr:
        return "en"
    return ""
