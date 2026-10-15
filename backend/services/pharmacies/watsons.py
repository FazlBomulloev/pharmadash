from __future__ import annotations

import asyncio
import html as html_lib
import logging
import random
import re
from typing import AsyncIterator

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page, Response, Route, async_playwright

from .base import PharmacyAdapter, PharmacyProduct
from .name_parse_en import (
    parse_dosage, parse_form, parse_pack, parse_trade_name,
)

log = logging.getLogger(__name__)

SITE_URL = "https://www.watsons.com.ph"
SEARCH_API = "https://api.watsons.com.ph/api/v2/wtcph/products/search"
CATEGORIES = (
    ("/health-and-rx/prescription/c/061200", "Prescription"),
    ("/health-and-rx/over-the-counter/c/061100", "Over-the-counter"),
    ("/health-and-rx/vitamins-and-supplements/c/060800",
     "Vitamins and supplements"),
)
PAGE_SIZE = 64
# Akamai пропускает Firefox, а Chromium и обычные HTTP-клиенты получают 403.
# Поэтому API поиска вызывается fetch'ем изнутри открытой витрины: так
# запрос несёт её cookies, а ответ декодирует сам браузер (перехват
# ответа в Firefox периодически падает с NS_ERROR_INVALID_CONTENT_ENCODING).
BROWSER = "firefox"
PAGE_DELAY = (1.0, 2.5)
SITE_READY_TIMEOUT_MS = 60_000
RETRY_WAITS = (15, 30, 60, 120)
BLOCKED_TYPES = {"image", "media", "font"}

SEARCH_JS = """async ([api, code, page, size]) => {
  const query = new URLSearchParams({
    fields: "FULL", query: ":bestSeller:category:" + code,
    pageSize: String(size), currentPage: String(page),
    sort: "bestSeller", lang: "en", curr: "PHP",
  });
  const response = await fetch(api + "?" + query, {headers: {
    accept: "application/json, text/plain, */*",
    "cache-control": "no-cache", pragma: "no-cache", expires: "0",
    "queue-target": location.href,
  }});
  return {
    status: response.status,
    body: response.ok ? await response.json() : null,
  };
}"""

_CODE_RE = re.compile(r"/c/(\w+)$")
_TAG_RE = re.compile(r"<[^>]+>")
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
        images = item.get("images") or []
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
            image_url=images[0].get("url", "") if images else "",
            extra={
                "category": category,
                "subcategory": _subcategory(item),
                "in_stock": stock.lower() != _OUT_OF_STOCK,
                "prescription": bool(item.get("elabPrescription")),
                "ingredients": ingredients[:500],
            },
        ))
    return products


def category_code(path: str) -> str:
    match = _CODE_RE.search(path)
    if not match:
        raise ValueError(f"Watsons: нет кода категории в {path}")
    return match.group(1)


async def _block_media(route: Route) -> None:
    if route.request.resource_type in BLOCKED_TYPES:
        await route.abort()
    else:
        await route.continue_()


def _is_storefront_search(response: Response) -> bool:
    return "/products/search" in response.url \
        and "category%3A" in response.url and response.ok


async def _open_storefront(page: Page, path: str) -> bool:
    # Свои запросы к API шлём только после того, как витрина сама получила
    # список товаров: к этому моменту скрипты Akamai выставили cookies.
    # Иначе на медленном сервере первый fetch падает (NetworkError, 504).
    ready = asyncio.ensure_future(page.wait_for_event(
        "response", _is_storefront_search, timeout=SITE_READY_TIMEOUT_MS,
    ))
    try:
        response = await page.goto(
            SITE_URL + path, wait_until="domcontentloaded", timeout=90_000,
        )
    except PlaywrightError as e:
        ready.cancel()
        log.warning("Watsons: витрина не открылась (%s)",
                    e.message.splitlines()[0])
        return False
    status = response.status if response else None
    if status != 200:
        ready.cancel()
        log.warning("Watsons: витрина %s — HTTP %s", path, status)
        return False
    try:
        await ready
    except PlaywrightError:
        log.warning(
            "Watsons: витрина %s не загрузила товары за %d с, "
            "продолжаем без ожидания", path, SITE_READY_TIMEOUT_MS // 1000,
        )
    return True


async def _load_page(
    page: Page, path: str, number: int,
) -> dict | None:
    code = category_code(path)
    for attempt, wait in enumerate(RETRY_WAITS):
        try:
            result = await page.evaluate(
                SEARCH_JS, [SEARCH_API, code, number, PAGE_SIZE],
            )
            if result["status"] == 200 and result["body"]:
                return result["body"]
            reason = f"HTTP {result['status']}"
        except PlaywrightError as e:
            reason = e.message.splitlines()[0]
        log.warning(
            "Watsons: %s стр. %d — %s, попытка %d/%d, пауза %d с",
            code, number + 1, reason, attempt + 1, len(RETRY_WAITS), wait,
        )
        if attempt < len(RETRY_WAITS) - 1:
            await asyncio.sleep(wait)
            # Свежий заход на витрину обновляет cookies Akamai.
            await _open_storefront(page, path)
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
                    if not await _open_storefront(page, path):
                        log.warning("Watsons: %s пропущен", category)
                        continue
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
                "(блок Akamai или изменился API витрины)"
            )
