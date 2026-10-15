from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import AsyncIterator

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page, Route, async_playwright

from .base import PharmacyAdapter, PharmacyProduct
from .name_parse_en import (
    parse_dosage, parse_form, parse_pack, parse_trade_name,
)

log = logging.getLogger(__name__)

SITE_URL = "https://www.watsons.com.ph"
CATEGORIES = (
    ("/health-and-rx/prescription/c/061200", "Prescription"),
    ("/health-and-rx/over-the-counter/c/061100", "Over-the-counter"),
    ("/health-and-rx/vitamins-and-supplements/c/060800",
     "Vitamins and supplements"),
)
PAGE_SIZE = 64
# Akamai пропускает Firefox, а Chromium и обычные HTTP-клиенты получают 403.
# API тоже режется, поэтому товары берутся из отрисованной витрины.
BROWSER = "firefox"
TILE_SELECTOR = "wtc-product-tile a.product-name"
RENDER_TIMEOUT_MS = 40_000
PAGE_DELAY = (2.0, 4.0)
RETRY_WAITS = (15, 30, 60, 120)
BLOCKED_TYPES = {"image", "media", "font"}

TILES_JS = """() => {
  const text = (root, sel) => {
    const el = root.querySelector(sel);
    return el ? el.textContent.trim() : "";
  };
  const tiles = [...document.querySelectorAll("wtc-product-tile")].map(t => {
    const link = t.querySelector("a.product-name");
    const img = t.querySelector(".product-img img");
    const box = t.querySelector(".productPrice");
    return {
      href: link ? link.getAttribute("href") || "" : "",
      brand: text(t, ".product-name .brand"),
      title: text(t, ".product-name .title"),
      image: img ? img.getAttribute("src") || "" : "",
      origin: text(t, ".origin-price"),
      rrp: text(t, ".rrp-price"),
      prices: box ? box.textContent : "",
      text: t.textContent.toLowerCase(),
    };
  });
  const pages = [...document.querySelectorAll("e2-pagination li a")]
    .map(a => parseInt(a.textContent.trim(), 10))
    .filter(n => !isNaN(n));
  return [tiles, pages.length ? Math.max(...pages) : null];
}"""

_CODE_RE = re.compile(r"/p/(BP_\w+)")
_PESO_RE = re.compile(r"₱\s*([\d,]+(?:\.\d+)?)")
_OUT_OF_STOCK = ("out of stock", "sold out", "notify me")


def _peso(value: str) -> float | None:
    match = _PESO_RE.search(value or "")
    if not match:
        return None
    try:
        amount = float(match.group(1).replace(",", ""))
    except ValueError:
        return None
    return amount if amount > 0 else None


def _prices(tile: dict) -> tuple[float | None, float | None]:
    amounts = [
        a for a in (
            _peso(m.group(0)) for m in _PESO_RE.finditer(tile["prices"])
        ) if a is not None
    ]
    regular = _peso(tile["rrp"]) or _peso(tile["origin"])
    if regular is None:
        regular = max(amounts, default=None)
    if regular is None:
        return None, None
    lower = [a for a in amounts if a < regular]
    return regular, min(lower) if lower else None


def parse_tiles(tiles: list[dict], category: str) -> list[PharmacyProduct]:
    products: list[PharmacyProduct] = []
    for tile in tiles:
        code = _CODE_RE.search(tile["href"])
        brand = " ".join(tile["brand"].split())
        title = " ".join(tile["title"].split())
        price, discount = _prices(tile)
        if not code or not title or price is None:
            continue
        href = tile["href"]
        products.append(PharmacyProduct(
            source=WatsonsAdapter.slug,
            sku=code.group(1),
            name=title,
            trade_name=brand or parse_trade_name(title),
            form=parse_form("", title),
            dosage=parse_dosage("", title),
            pack_qty=parse_pack("", title),
            price=price,
            price_discount=discount,
            url=href if href.startswith("http") else SITE_URL + href,
            image_url=tile["image"],
            extra={
                "category": category,
                "in_stock": not any(w in tile["text"] for w in _OUT_OF_STOCK),
            },
        ))
    return products


def page_url(path: str, number: int) -> str:
    return f"{SITE_URL}{path}?currentPage={number}&pageSize={PAGE_SIZE}"


async def _block_media(route: Route) -> None:
    if route.request.resource_type in BLOCKED_TYPES:
        await route.abort()
    else:
        await route.continue_()


async def _load_page(
    page: Page, url: str,
) -> tuple[list[dict], int | None] | None:
    for attempt, wait in enumerate(RETRY_WAITS):
        try:
            response = await page.goto(
                url, wait_until="domcontentloaded", timeout=90_000,
            )
            status = response.status if response else None
            if status == 200:
                await page.wait_for_selector(
                    TILE_SELECTOR, timeout=RENDER_TIMEOUT_MS,
                )
                tiles, pages = await page.evaluate(TILES_JS)
                return tiles, pages
            log.warning(
                "Watsons: %s — HTTP %s, попытка %d/%d, пауза %d с",
                url, status, attempt + 1, len(RETRY_WAITS), wait,
            )
        except PlaywrightError as e:
            log.warning(
                "Watsons: %s — нет карточек (%s), попытка %d/%d, "
                "пауза %d с", url, e.message.splitlines()[0],
                attempt + 1, len(RETRY_WAITS), wait,
            )
        if attempt < len(RETRY_WAITS) - 1:
            await asyncio.sleep(wait)
    return None


class WatsonsAdapter(PharmacyAdapter):
    slug = "watsons"
    display_name = "Watsons"
    currency = "PHP"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        seen: set[str] = set()
        yielded = 0
        async with async_playwright() as pw:
            browser = await getattr(pw, BROWSER).launch()
            try:
                context = await browser.new_context(locale="en-PH")
                await context.route("**/*", _block_media)
                page = await context.new_page()
                for path, category in CATEGORIES:
                    number, pages = 0, None
                    while pages is None or number < pages:
                        loaded = await _load_page(page, page_url(path, number))
                        if loaded is None:
                            log.warning(
                                "Watsons: %s стр. %d недоступна, "
                                "раздел прерван", category, number + 1,
                            )
                            break
                        tiles, last = loaded
                        if pages is None:
                            pages = last or 1
                            log.info(
                                "Watsons: %s — %d страниц", category, pages,
                            )
                        new = 0
                        for product in parse_tiles(tiles, category):
                            if product.sku in seen:
                                continue
                            seen.add(product.sku)
                            new += 1
                            yield product
                            yielded += 1
                            if self.limit and yielded >= self.limit:
                                return
                        log.info(
                            "Watsons: %s стр. %d/%d (новых: %d, всего: %d)",
                            category, number + 1, pages, new, yielded,
                        )
                        if new == 0:
                            break
                        number += 1
                        await asyncio.sleep(random.uniform(*PAGE_DELAY))
            finally:
                await browser.close()

        if yielded == 0:
            raise RuntimeError(
                "Watsons: не удалось получить ни одного товара "
                "(блок Akamai или изменилась вёрстка витрины)"
            )
