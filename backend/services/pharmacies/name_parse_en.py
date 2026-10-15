import re

_DOSE_RE = re.compile(
    r"\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)(?:\s*/\s*\d*(?:\.\d+)?\s*"
    r"(?:mg|mcg|g|ml|iu))?",
    re.I,
)
_PACK_RE = re.compile(
    r"(\d+)\s*(?:'s\b|pcs\b|pieces?\b|tablets?\b|tabs?\b|capsules?\b|"
    r"caps\b|softgels?\b|sachets?\b|vials?\b|ampoules?\b|ampules?\b)",
    re.I,
)
_COUNT_RE = re.compile(r"\bbox\s+of\s+(\d+)\b|\b(\d+)\s*'?s\b", re.I)
_VOLUME_RE = re.compile(r"\d+(?:\.\d+)?\s*(?:ml|g)\b", re.I)
_FORMS = (
    ("film-coated tablet", "Film-Coated Tablet"),
    ("chewable tablet", "Chewable Tablet"),
    ("effervescent tablet", "Effervescent Tablet"),
    ("oral drops", "Oral Drops"),
    ("oral suspension", "Oral Suspension"),
    ("softgel", "Softgel Capsule"),
    ("tablet", "Tablet"),
    ("tab", "Tablet"),
    ("capsule", "Capsule"),
    ("caps", "Capsule"),
    ("syrup", "Syrup"),
    ("suspension", "Suspension"),
    ("drops", "Drops"),
    ("sachet", "Sachet"),
    ("cream", "Cream"),
    ("ointment", "Ointment"),
    ("gel", "Gel"),
    ("lotion", "Lotion"),
    ("spray", "Spray"),
    ("inhaler", "Inhaler"),
    ("nebule", "Nebule"),
    ("vial", "Injection"),
    ("ampoule", "Injection"),
    ("ampule", "Injection"),
    ("injection", "Injection"),
    ("solution", "Solution"),
    ("powder", "Powder"),
    ("suppository", "Suppository"),
    ("patch", "Patch"),
)
_FORM_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k, _ in _FORMS) + r")s?\b", re.I,
)
_FORM_NAMES = dict(_FORMS)


def parse_form(*texts: str) -> str:
    for text in texts:
        match = _FORM_RE.search(text or "")
        if match:
            return _FORM_NAMES[match.group(1).lower()]
    return ""


def parse_dosage(feature: str, name: str) -> str:
    if feature and re.search(r"\d", feature):
        return feature
    match = _DOSE_RE.search(name or "")
    return match.group(0).strip() if match else ""


def parse_pack(packaging: str, name: str) -> str:
    for text in (name, packaging):
        match = _PACK_RE.search(text or "")
        if match:
            return match.group(1)
    for text in (name, packaging):
        match = _COUNT_RE.search(text or "")
        if match:
            return match.group(1) or match.group(2)
    match = _VOLUME_RE.search(name or "")
    return match.group(0).replace(" ", "") if match else ""


def parse_trade_name(name: str) -> str:
    text = (name or "").strip()
    cuts = [
        m.start() for m in (re.search(r"\d", text), _FORM_RE.search(text))
        if m and m.start() > 0
    ]
    head = text[:min(cuts)] if cuts else text
    return head.strip(" ,;-/") or text.split(" ")[0]
