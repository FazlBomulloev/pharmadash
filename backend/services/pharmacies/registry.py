from __future__ import annotations

from typing import Type

from .base import PharmacyAdapter
from .eapteka import EaptekaAdapter
from .rigla import RiglaAdapter
from .ozerki import OzerkiAdapter

ADAPTERS: dict[str, Type[PharmacyAdapter]] = {
    EaptekaAdapter.slug: EaptekaAdapter,
    RiglaAdapter.slug: RiglaAdapter,
    OzerkiAdapter.slug: OzerkiAdapter,
}


def get_adapter(slug: str) -> Type[PharmacyAdapter]:
    if slug not in ADAPTERS:
        raise KeyError(f"Неизвестный источник: {slug}")
    return ADAPTERS[slug]
