from __future__ import annotations

import asyncio
import html as html_lib
import logging
import random
import re
from typing import AsyncIterator

import httpx

from .base import PharmacyAdapter, PharmacyProduct
from .name_parse_en import (
    parse_dosage, parse_form, parse_pack, parse_trade_name,
)

log = logging.getLogger(__name__)

BASE_URL = "https://southstardrug.com.ph"
PAGE_LIMIT = 250
PAGE_DELAY = (1.0, 2.0)
RATE_LIMIT_WAITS = (20, 40, 80, 160)
MAX_ATTEMPTS = 5
REQUEST_TIMEOUT = 40
DEFAULT_VARIANT = "Default Title"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

_GENERIC_RE = re.compile(
    r"generic\s+name\s*:?\s*(?:<[^>]+>\s*)*([^<\n]{2,120})", re.I,
)


def _price(value) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if price > 0 else None


def _generic_name(body_html: str) -> str:
    match = _GENERIC_RE.search(body_html or "")
    if not match:
        return ""
    return html_lib.unescape(match.group(1)).strip(" :-")


def parse_products(payload: dict) -> list[PharmacyProduct]:
    products: list[PharmacyProduct] = []
    for item in payload.get("products") or []:
        title = (item.get("title") or "").strip()
        handle = item.get("handle") or ""
        if not title or not handle:
            continue
        images = item.get("images") or []
        image = images[0].get("src", "") if images else ""
        mnn = _generic_name(item.get("body_html") or "")
        for variant in item.get("variants") or []:
            current = _price(variant.get("price"))
            if current is None:
                continue
            old = _price(variant.get("compare_at_price"))
            if old is not None and old <= current:
                old = None
            option = (variant.get("title") or "").strip()
            name = title if option in ("", DEFAULT_VARIANT) else (
                f"{title} - {option}"
            )
            featured = variant.get("featured_image") or {}
            products.append(PharmacyProduct(
                source=SouthstarAdapter.slug,
                sku=str(variant.get("sku") or variant.get("id") or ""),
                name=name,
                mnn=mnn,
                trade_name=parse_trade_name(title),
                manufacturer=(item.get("vendor") or "").strip(),
                form=parse_form(option, title),
                dosage=parse_dosage("", name),
                pack_qty=parse_pack(option, name),
                price=old if old is not None else current,
                price_discount=current if old is not None else None,
                url=f"{BASE_URL}/products/{handle}"
                + (f"?variant={variant['id']}" if variant.get("id") else ""),
                image_url=featured.get("src") or image,
                extra={
                    "product_type": item.get("product_type") or "",
                    "tags": item.get("tags") or [],
                    "in_stock": bool(variant.get("available")),
                },
            ))
    return products


async def _fetch_page(
    client: httpx.AsyncClient, number: int,
) -> dict | None:
    url = f"{BASE_URL}/products.json"
    params = {"limit": PAGE_LIMIT, "page": number}
    for attempt in range(MAX_ATTEMPTS):
        try:
            resp = await client.get(url, params=params)
        except httpx.HTTPError as e:
            log.warning(
                "Southstar: страница %d, попытка %d/%d: %s",
                number, attempt + 1, MAX_ATTEMPTS, type(e).__name__,
            )
            await asyncio.sleep(5 * (attempt + 1))
            continue
        if resp.status_code == 200:
            try:
                return resp.json()
            except ValueError:
                log.warning(
                    "Southstar: страница %d вернула не JSON "
                    "(вероятно, проверка Cloudflare)", number,
                )
        elif resp.status_code == 429:
            wait = RATE_LIMIT_WAITS[min(attempt, len(RATE_LIMIT_WAITS) - 1)]
            log.warning(
                "Southstar: лимит запросов (429), пауза %d с", wait,
            )
            await asyncio.sleep(wait)
            continue
        else:
            log.warning(
                "Southstar: страница %d — HTTP %d", number, resp.status_code,
            )
        await asyncio.sleep(5 * (attempt + 1))
    return None


class SouthstarAdapter(PharmacyAdapter):
    slug = "southstar"
    display_name = "Southstar Drug"
    currency = "PHP"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        seen: set[str] = set()
        yielded = 0
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=httpx.Timeout(REQUEST_TIMEOUT, connect=15.0),
            follow_redirects=True,
        ) as client:
            number = 1
            while True:
                payload = await _fetch_page(client, number)
                if payload is None:
                    log.warning(
                        "Southstar: страница %d недоступна, сбор прерван",
                        number,
                    )
                    break
                if not payload.get("products"):
                    break
                for product in parse_products(payload):
                    if not product.sku or product.sku in seen:
                        continue
                    seen.add(product.sku)
                    yield product
                    yielded += 1
                    if self.limit and yielded >= self.limit:
                        return
                log.info(
                    "Southstar: страница %d (товаров: %d)", number, yielded,
                )
                number += 1
                await asyncio.sleep(random.uniform(*PAGE_DELAY))

        if yielded == 0:
            raise RuntimeError(
                "Southstar: не удалось получить ни одного товара "
                "(сайт недоступен или изменился формат каталога)"
            )
