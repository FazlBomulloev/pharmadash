import re


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


def parse_float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, str):
            value = value.replace(",", ".").replace(" ", "")
        return float(value)
    except (ValueError, TypeError):
        return None

