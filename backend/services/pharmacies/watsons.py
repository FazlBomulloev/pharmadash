from __future__ import annotations

import asyncio
import html as html_lib
import json
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
# Запросы браузера к api.watsons.com.ph с IP сервера Akamai держит до
# таймаута (504), но HTML витрины Watsons рендерит у себя и кладёт в него
# тот же ответ products/search (скрипт wtcph-state). Поэтому страницы
# открываются без JavaScript: витрина не лезет в API и не затирает
# готовые данные, а мы читаем JSON прямо из документа.
BROWSER = "firefox"
PAGE_DELAY = (1.5, 3.0)
RETRY_WAITS = (5, 15, 30, 60)
BLOCKED_TYPES = {"image", "media", "font", "stylesheet"}

_STATE_RE = re.compile(
    r'<script[^>]*\bid="wtcph-state"[^>]*>(.*?)</script>', re.S,
)
# Старые версии Angular экранируют TransferState сущностями вида &q;.
_STATE_ESCAPES = (("&q;", '"'), ("&s;", "'"), ("&l;", "<"), ("&g;", ">"),
                  ("&a;", "&"))
_TAG_RE = re.compile(r"<[^>]+>")
_PRODCAT_RE = re.compile(r"-prodcat(\.\w+)")
# «contai\w*» ловит и опечатки витрины вроде «contais».
_CONTAINS_RE = re.compile(r"\bcontai\w*\s*[:;]?\s*(.+)", re.I)
_DOSE_RE = re.compile(r"\d[\d.,]*\s*(?:mg|mcg|µg|g|iu|ml)\b", re.I)
_SENTENCE_RE = re.compile(r"\.(?:\s|$)")
_PART_SPLIT_RE = re.compile(r"\s*(?:\band\b|[,;+/])\s*", re.I)
_NOISE_RE = re.compile(
    r"\((?:as|eq)[^)]*\)|\b(?:USP|BP|of|other\s+components)\b|[.\-:?]", re.I,
)
_OUT_OF_STOCK = "outofstock"


def _amount(value) -> float | None:
    if isinstance(value, dict):
        value = value.get("value")
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount if amount > 0 else None


def _prices(item: dict) -> tuple[float | None, float | None]:
    current = _amount(item.get("price"))
    if current is None:
        return None, None
    regular = (
        _amount(item.get("elabOldPrice"))
        or _amount(item.get("strikeThroughPrice"))
        or current
    )
    if current < regular:
        return regular, current
    return current, None


def _clean(text: str) -> str:
    text = html_lib.unescape(_TAG_RE.sub(" ", text or ""))
    return " ".join(text.split())


def _generic_name(ingredients: str) -> str:
    # Состав — свободный текст: «Each tablet contains 500 mg of metformin
    # hydrochloride.», «Vildagliptin 50mg, Metformin HCl 500mg», просто
    # «Escitalopram» или список вспомогательных веществ без дозировок —
    # из последнего МНН не извлекается.
    match = _CONTAINS_RE.search(ingredients)
    if match:
        text = match.group(1)
    elif _DOSE_RE.search(ingredients):
        text = ingredients
    elif len(ingredients) <= 100 and "," not in ingredients:
        return ingredients.strip(" .:-")
    else:
        return ""
    text = _SENTENCE_RE.split(text, maxsplit=1)[0]
    parts: list[str] = []
    for part in _PART_SPLIT_RE.split(text):
        part = " ".join(_NOISE_RE.sub(" ", _DOSE_RE.sub(" ", part)).split())
        if re.search(r"[a-z]", part, re.I) and part not in parts:
            parts.append(part)
    joined = " + ".join(parts)
    return joined if len(joined) <= 150 else ""


def _image_url(images) -> str:
    # API отдаёт список [{"url": ...}], а состояние витрины — словарь
    # {"PRIMARY": {"thumbnail": {"url": ...}}}.
    if isinstance(images, list):
        first = images[0] if images else {}
    elif isinstance(images, dict):
        primary = images.get("PRIMARY") or next(iter(images.values()), {})
        first = primary.get("thumbnail") or next(iter(primary.values()), {}) \
            if isinstance(primary, dict) else {}
    else:
        first = {}
    return (first or {}).get("url", "") if isinstance(first, dict) else ""


def _subcategory(item: dict) -> str:
    levels = item.get("categoryNameLevels") or []
    deepest = max(levels, key=lambda c: c.get("level") or 0, default={})
    return deepest.get("name") or ""


def parse_products(payload: dict, category: str) -> list[PharmacyProduct]:
    products: list[PharmacyProduct] = []
    for item in payload.get("products") or []:
        code = item.get("code") or ""
        name = " ".join((item.get("name") or "").split())
        price, discount = _prices(item)
        if not code or not name or price is None:
            continue
        brand = " ".join(((item.get("masterBrand") or {}).get("name") or "")
                         .split())
        units = " ".join(
            u for u in item.get("elabVariantProductContentSizeUnits") or []
            if u and u != "N/A"
        )
        ingredients = _clean(item.get("elabIngredients") or "")
        href = item.get("url") or ""
        stock = (item.get("stock") or {}).get("stockLevelStatus") or ""
        products.append(PharmacyProduct(
            source=WatsonsAdapter.slug,
            sku=code,
            name=name,
            mnn=_generic_name(ingredients),
            trade_name=brand or parse_trade_name(name),
            country=(item.get("elabCountryOfOrigin") or "").strip(),
            form=parse_form(units, name),
            dosage=parse_dosage("", name),
            pack_qty=parse_pack("", name),
            price=price,
            price_discount=discount,
            url=href if href.startswith("http") else SITE_URL + href,
            image_url=_image_url(item.get("images")),
            extra={
                "category": category,
                "subcategory": _subcategory(item),
                "in_stock": stock.lower() != _OUT_OF_STOCK,
                "prescription": bool(item.get("elabPrescription")),
                "ingredients": ingredients[:500],
            },
        ))
    return products


def search_results(page_html: str) -> dict | None:
    """Ответ products/search, вложенный витриной в HTML, или None."""
    match = _STATE_RE.search(page_html)
    if not match:
        return None
    raw = match.group(1)
    try:
        state = json.loads(raw)
    except ValueError:
        for escaped, char in _STATE_ESCAPES:
            raw = raw.replace(escaped, char)
        try:
            state = json.loads(raw)
        except ValueError:
            return None
    results = (((state.get("cx-state") or {}).get("product") or {})
               .get("search") or {}).get("results")
    if not isinstance(results, dict) or "pagination" not in results:
        return None
    return results


def page_url(path: str, number: int) -> str:
    return f"{SITE_URL}{path}?currentPage={number}&pageSize={PAGE_SIZE}"


async def _block_media(route: Route) -> None:
    if route.request.resource_type in BLOCKED_TYPES:
        await route.abort()
    else:
        await route.continue_()


async def _page_html(page: Page, url: str) -> tuple[int | None, str]:
    response = await page.goto(
        url, wait_until="domcontentloaded", timeout=90_000,
    )
    if response is None:
        return None, ""
    if response.status != 200:
        return response.status, ""
    try:
        return 200, await response.text()
    except PlaywrightError:
        # Без JavaScript DOM совпадает с исходным HTML.
        return 200, await page.content()


async def _load_page(page: Page, path: str, number: int) -> dict | None:
    # Перегруженный SSR витрины отдаёт пустую клиентскую оболочку
    # (x-ssr-fallback-reason: Event-Loop-Saturation), а CDN кэширует её
    # на этот URL до часа. Повтор с уникальным параметром идёт мимо кэша
    # и получает свежий рендер.
    url = page_url(path, number)
    for attempt, wait in enumerate(RETRY_WAITS):
        target = url if attempt == 0 else f"{url}&_r={random.getrandbits(32)}"
        try:
            status, html = await _page_html(page, target)
            results = search_results(html) if html else None
            if results is not None:
                return results
            reason = f"HTTP {status}" if status != 200 else (
                f"нет данных wtcph-state, HTML {len(html) // 1024} КБ"
            )
        except PlaywrightError as e:
            reason = e.message.splitlines()[0]
        log.warning(
            "Watsons: %s — %s, попытка %d/%d, пауза %d с",
            target, reason, attempt + 1, len(RETRY_WAITS), wait,
        )
        if attempt < len(RETRY_WAITS) - 1:
            await asyncio.sleep(wait)
    return None


class WatsonsAdapter(PharmacyAdapter):
    slug = "watsons"
    display_name = "Watsons"
    country = "Филиппины"
    currency = "PHP"

    @staticmethod
    def full_image_url(url: str) -> str:
        # …-front-prodcat.jpg (400px, каталог) → …-front-zoom.jpg (до 2500px)
        return _PRODCAT_RE.sub(r"-zoom\1", url)

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        seen: set[str] = set()
        yielded = 0
        async with async_playwright() as pw:
            browser = await getattr(pw, BROWSER).launch()
            try:
                context = await browser.new_context(
                    locale="en-PH", java_script_enabled=False,
                )
                await context.route("**/*", _block_media)
                page = await context.new_page()
                for path, category in CATEGORIES:
                    number, pages = 0, None
                    while pages is None or number < pages:
                        payload = await _load_page(page, path, number)
                        if payload is None:
                            log.warning(
                                "Watsons: %s стр. %d недоступна, "
                                "раздел прерван", category, number + 1,
                            )
                            break
                        if pages is None:
                            info = payload.get("pagination") or {}
                            pages = info.get("totalPages") or 1
                            log.info(
                                "Watsons: %s — %d страниц, %s товаров",
                                category, pages, info.get("totalResults"),
                            )
                        batch = parse_products(payload, category)
                        new = 0
                        for product in batch:
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
                        if not payload.get("products"):
                            break
                        number += 1
                        await asyncio.sleep(random.uniform(*PAGE_DELAY))
            finally:
                await browser.close()

        if yielded == 0:
            raise RuntimeError(
                "Watsons: не удалось получить ни одного товара "
                "(блок Akamai или в HTML витрины нет wtcph-state)"
            )
