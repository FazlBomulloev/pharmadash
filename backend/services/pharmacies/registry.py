from __future__ import annotations

import json
from typing import Type

from .base import PharmacyAdapter
from .eapteka import EaptekaAdapter
from .medsgo import MedsgoAdapter
from .rigla import RiglaAdapter
from .southstar import SouthstarAdapter
from .watsons import WatsonsAdapter
from .ozerki import OzerkiAdapter

ADAPTERS: dict[str, Type[PharmacyAdapter]] = {
    EaptekaAdapter.slug: EaptekaAdapter,
    RiglaAdapter.slug: RiglaAdapter,
    OzerkiAdapter.slug: OzerkiAdapter,
    MedsgoAdapter.slug: MedsgoAdapter,
    SouthstarAdapter.slug: SouthstarAdapter,
    WatsonsAdapter.slug: WatsonsAdapter,
}


def market_sources(raw_json: str | None) -> list[str]:
    if not raw_json:
        return []
    try:
        slugs = json.loads(raw_json)
    except ValueError:
        return []
    if not isinstance(slugs, list):
        return []
    return [s for s in ADAPTERS if s in slugs]


def get_adapter(slug: str) -> Type[PharmacyAdapter]:
    if slug not in ADAPTERS:
        raise KeyError(f"Неизвестный источник: {slug}")
    return ADAPTERS[slug]
