from __future__ import annotations

import asyncio
import html as html_lib
import json
import logging
import random
import re
from typing import Any, AsyncIterator
from urllib.parse import urlencode

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page, Route, async_playwright

from .base import PharmacyAdapter, PharmacyProduct
from .name_parse_en import (
    parse_dosage, parse_form, parse_pack, parse_trade_name,
)

log = logging.getLogger(__name__)

SITE_URL = "https://www.watsons.com.ph"
API_URL = "https://api.watsons.com.ph/api/v2/wtcph/products/search"
CATEGORY = "060000"
PAGE_SIZE = 100
FIELDS = "products(FULL),pagination(DEFAULT)"
# Akamai пропускает Firefox, а Chromium и обычные HTTP-клиенты получают 403.
BROWSER = "firefox"
PAGE_DELAY = (1.5, 3.0)
RETRY_WAITS = (15, 30, 60, 120)
BLOCKED_TYPES = {"image", "media", "font"}

FETCH_JS = """async (url) => {
    const r = await fetch(url, {credentials: "include"});
    return [r.status, await r.text()];
}"""

_TAG_RE = re.compile(r"<[^>]+>")


def _text(value: Any) -> str:
    if value is None:
        return ""
    text = html_lib.unescape(_TAG_RE.sub(" ", str(value)))
    return re.sub(r"\s+", " ", text).strip()


def _amount(value: Any) -> float | None:
    if isinstance(value, dict):
        value = value.get("value")
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount if amount > 0 else None


def _features(item: dict) -> dict[str, str]:
    features: dict[str, str] = {}
    for group in item.get("classifications") or []:
        for feature in group.get("features") or []:
            values = [
                _text(v.get("value"))
                for v in feature.get("featureValues") or []
            ]
            name = (feature.get("name") or "").strip().lower()
            if name and any(values):
                features[name] = ", ".join(v for v in values if v)
    return features


def _find(features: dict[str, str], *words: str) -> str:
    for name, value in features.items():
        if any(word in name for word in words):
            return value
    return ""


def _image(item: dict) -> str:
    images = item.get("images") or []
    preferred = [i for i in images if i.get("format") in ("zoom", "product")]
    for image in preferred + images:
        url = image.get("url") or ""
        if url:
            return url if url.startswith("http") else SITE_URL + url
    return ""


def _brand(item: dict) -> str:
    brand = item.get("masterBrand")
    if isinstance(brand, dict):
        return _text(brand.get("name"))
    return _text(brand)


def _in_stock(item: dict) -> bool:
    stock = item.get("stock")
    if isinstance(stock, dict):
        return stock.get("stockLevelStatus") != "outOfStock"
    return True


def parse_products(payload: dict) -> list[PharmacyProduct]:
    products: list[PharmacyProduct] = []
    for item in payload.get("products") or []:
        code = item.get("code") or ""
        name = _text(item.get("name") or item.get("elabProductName"))
        current = _amount(item.get("price")) or _amount(item.get("elabPrice"))
        if not code or not name or current is None:
            continue
        old = (
            _amount(item.get("strikeThroughPrice"))
            or _amount(item.get("elabOldPrice"))
        )
        if old is not None and old <= current:
            old = None
        features = _features(item)
        brand = _brand(item)
        url = item.get("url") or ""
        categories = [
            c.get("name", "") for c in item.get("categoryNameLevels") or []
        ]
        products.append(PharmacyProduct(
            source=WatsonsAdapter.slug,
            sku=code,
            name=name,
            mnn=_find(features, "generic", "active ingredient"),
            trade_name=brand or parse_trade_name(name),
            manufacturer=_find(features, "manufactur", "distribut"),
            country=_text(item.get("elabCountryOfOrigin")).title(),
            form=parse_form(_find(features, "dosage form", "form"), name),
            dosage=parse_dosage(_find(features, "strength", "dosage"), name),
            pack_qty=parse_pack("", name),
            price=old if old is not None else current,
            price_discount=current if old is not None else None,
            url=url if url.startswith("http") else SITE_URL + url,
            image_url=_image(item),
            extra={
                "category": " / ".join(c for c in categories if c),
                "prescription": bool(item.get("elabPrescription")),
                "ean": item.get("ean") or "",
                "in_stock": _in_stock(item),
            },
        ))
    return products


def page_url(number: int) -> str:
    return API_URL + "?" + urlencode({
        "fields": FIELDS,
        "query": f":mostRelevant:category:{CATEGORY}",
        "pageSize": PAGE_SIZE,
        "currentPage": number,
    })


async def _block_media(route: Route) -> None:
    if route.request.resource_type in BLOCKED_TYPES:
        await route.abort()
    else:
        await route.continue_()


async def _open_site(page: Page) -> bool:
    try:
        response = await page.goto(
            SITE_URL + "/", wait_until="domcontentloaded", timeout=90_000,
        )
    except PlaywrightError as e:
        log.warning("Watsons: главная не открылась: %s", e.message)
        return False
    # Скрипты Akamai выставляют cookie уже после загрузки документа.
    await page.wait_for_timeout(6000)
    status = response.status if response else None
    if status != 200:
        log.warning("Watsons: главная вернула HTTP %s", status)
        return False
    return True


async def _fetch_page(page: Page, number: int) -> dict | None:
    for attempt, wait in enumerate(RETRY_WAITS):
        try:
            status, body = await page.evaluate(FETCH_JS, page_url(number))
        except PlaywrightError as e:
            log.warning(
                "Watsons: стр. %d, ошибка запроса: %s", number, e.message,
            )
            status, body = None, ""
        if status == 200:
            try:
                return json.loads(body)
            except ValueError:
                log.warning("Watsons: стр. %d вернула не JSON", number)
        else:
            log.warning(
                "Watsons: стр. %d — HTTP %s, попытка %d/%d, пауза %d с",
                number, status, attempt + 1, len(RETRY_WAITS), wait,
            )
        if attempt == len(RETRY_WAITS) - 1:
            break
        await asyncio.sleep(wait)
        if status in (401, 403):
            await _open_site(page)
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
                if not await _open_site(page):
                    raise RuntimeError(
                        "Watsons: сайт не открылся (вероятно, блок Akamai)"
                    )
                number, pages = 0, None
                while pages is None or number < pages:
                    payload = await _fetch_page(page, number)
                    if payload is None:
                        log.warning(
                            "Watsons: стр. %d недоступна, сбор прерван",
                            number,
                        )
                        break
                    if pages is None:
                        pagination = payload.get("pagination") or {}
                        pages = int(pagination.get("totalPages") or 1)
                        log.info(
                            "Watsons: %s товаров, %d страниц",
                            pagination.get("totalResults"), pages,
                        )
                    items = parse_products(payload)
                    if not items:
                        break
                    for product in items:
                        if product.sku in seen:
                            continue
                        seen.add(product.sku)
                        yield product
                        yielded += 1
                        if self.limit and yielded >= self.limit:
                            return
                    log.info(
                        "Watsons: стр. %d/%d (товаров: %d)",
                        number + 1, pages, yielded,
                    )
                    number += 1
                    await asyncio.sleep(random.uniform(*PAGE_DELAY))
            finally:
                await browser.close()

        if yielded == 0:
            raise RuntimeError(
                "Watsons: не удалось получить ни одного товара "
                "(блок Akamai или изменился формат API)"
            )
