from __future__ import annotations

import html
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


_MEDICINE_FORM_RE = re.compile(
    r"таблет|табл|капсул|капс|ампул|раствор|р-р|сироп|капл|спрей|свеч|"
    r"суппозитор|крем|гель|мазь|саше|суспенз|пастил|порош|инфуз|флакон|"
    r"драже|гранул|аэрозол|эмульс|лиофилизат|концентрат|инъекц|линимент|"
    r"эликсир|настойк",
    re.IGNORECASE,
)
_NOT_MEDICINE_FORM_RE = re.compile(r"смазк|зубн|таблетниц", re.IGNORECASE)
_HTML_TAG_RE = re.compile(
    r"</?(?:br|p|span|div|b|i|u|strong|em|sup|sub|li|ul|ol)\b[^>]*>",
    re.IGNORECASE,
)


_BRACKETS_RE = re.compile(r"\(([^()]+)\)")


def bracket_form(name: str) -> str:
    """Форма из скобок названия: «Ратун 150 мл (Сироп)» → «Сироп»."""
    for group in _BRACKETS_RE.findall(name or ""):
        form = parse_form(group)
        if form and form.lower() == group.strip().lower():
            return form
    return ""


def is_medicine_form(form: str) -> bool:
    """Лекарственная форма, а не изделие: «Таблетки», «Капли», но не
    «Тонометр» или «Гель-смазка»."""
    return bool(
        form
        and _MEDICINE_FORM_RE.search(form)
        and not _NOT_MEDICINE_FORM_RE.search(form)
    )


def strip_html(text: str) -> str:
    """Каталоги иногда хранят в полях разметку: «<br>», «<p>…</p>»."""
    text = _HTML_TAG_RE.sub(" ", text or "")
    text = html.unescape(text).replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()
