from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import AsyncIterator, Optional


@dataclass
class PharmacyProduct:
    source: str = ""
    sku: str = ""
    name: str = ""
    mnn: str = ""
    trade_name: str = ""
    manufacturer: str = ""
    country: str = ""
    form: str = ""
    dosage: str = ""
    pack_qty: str = ""
    price: Optional[float] = None
    price_discount: Optional[float] = None
    url: str = ""
    image_url: str = ""
    extra: dict = field(default_factory=dict)

    def extra_json(self) -> Optional[str]:
        if not self.extra:
            return None
        try:
            return json.dumps(self.extra, ensure_ascii=False)
        except (TypeError, ValueError):
            return None


class PharmacyAdapter:
    """Base contract for one pharmacy source."""

    slug: str = ""
    display_name: str = ""

    def __init__(self, limit: Optional[int] = None):
        self.limit = limit

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        """Yield PharmacyProduct items. Override in subclass."""
        if False:
            yield  # pragma: no cover — makes this an async generator
        raise NotImplementedError
