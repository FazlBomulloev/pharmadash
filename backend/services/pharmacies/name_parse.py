from __future__ import annotations

import re

_UNITS = r"мг/мл|мкг/мл|мг/доза|мкг/доза|ме/мл|мг/г|мкг|мг|мл|ме|ед|г|%"
_DOSE_RE = re.compile(
    rf"(\d+(?:[.,]\d+)?\s*(?:{_UNITS}))(?![а-яёa-z])", re.IGNORECASE,
)
_PACK_RE = re.compile(r"(\d+)\s*шт", re.IGNORECASE)

_FORM_STEMS = (
    "таблет", "табл", "капсул", "капс", "раствор", "р-р", "порош", "мазь",
    "гель", "крем", "спрей", "капли", "сироп", "суппозитор", "свечи",
    "суспенз", "аэрозол", "лиофилизат", "гранул", "пластыр", "эмульс",
    "настойк", "драже", "шампун", "масло", "концентрат", "паста", "линимент",
    "пастилк", "леденц", "ампул", "бальзам", "лосьон", "пена", "эликсир",
    "экстракт", "жидкост", "лак ", "карандаш", "саше", "чай", "батончик",
)
_FORM_RE = re.compile(
    r"(?<![а-яёa-z])(" + "|".join(re.escape(s) for s in _FORM_STEMS) + ")",
    re.IGNORECASE,
)


def parse_dosage(name: str) -> str:
    match = _DOSE_RE.search(name or "")
    return match.group(1).strip() if match else ""


def parse_pack_qty(name: str) -> str:
    match = _PACK_RE.search(name or "")
    return match.group(1) if match else ""


def parse_form(name: str) -> str:
    text = (name or "").replace("\xa0", " ")
    match = _FORM_RE.search(text)
    if not match:
        return ""
    tail = text[match.start():]
    digit = re.search(r"\d", tail)
    form = tail[:digit.start()] if digit else tail
    return form.strip(" ,;-")


def parse_trade_name(name: str) -> str:
    text = (name or "").replace("\xa0", " ").strip()
    form = _FORM_RE.search(text)
    digit = re.search(r"\d", text)
    cuts = [m.start() for m in (form, digit) if m and m.start() > 0]
    head = text[:min(cuts)] if cuts else text
    return head.strip(" ,;-") or text.split(" ")[0]
