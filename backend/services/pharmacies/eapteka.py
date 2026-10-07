from __future__ import annotations

import asyncio
import html as html_lib
import json
import logging
import os
import random
import re
from typing import AsyncIterator

import httpx

from .base import PharmacyAdapter, PharmacyProduct
from .name_parse import (
    parse_dosage, parse_form, parse_pack_qty, parse_trade_name,
)

log = logging.getLogger(__name__)

BASE_URL = "https://www.eapteka.ru"
REGION = os.getenv("EAPTEKA_REGION", "spb")
CATEGORY_URLS = (
    f"/{REGION}/goods/drugs/",
    f"/{REGION}/goods/vitaminy_i_bad/",
)
# Карточка в списке категории уже содержит цену, производителя, МНН и
# фото, поэтому страницы товаров не открываем: ~700 страниц списка вместо
# ~13 500 страниц товаров по мегабайту каждая.
CONCURRENCY = 8
BATCH_SIZE = 40
REQUEST_TIMEOUT = 40
MAX_RETRIES = 4

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,"
        "application/xml;q=0.9,*/*;q=0.8"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}

_CARD_SPLIT_RE = re.compile(r'<article class="listing-card')
_OFFER_RE = re.compile(r"data-oldma-offer='(\{.*?\})'", re.S)
_XML_ID_RE = re.compile(r'data-xml-id="(\d+)"')
_HREF_RE = re.compile(rf'href="(/{re.escape(REGION)}/goods/id\d+/)"')
_IMAGE_RE = re.compile(r'<img\s+src="([^"]+)"')
_PRICE_RE = re.compile(r'data-price="([\d.,\s]+)"')
_OLD_PRICE_RE = re.compile(r'data-old-price="([\d.,\s]+)"')
_MANUFACTURER_RE = re.compile(
    r'listing-card__manufacturer">.*?</span>\s*<a[^>]*>(.*?)</a>', re.S,
)
_INGREDIENT_RE = re.compile(
    r'listing-card__ingredient">.*?</span>\s*<a[^>]*>(.*?)</a>', re.S,
)
_PAGES_RE = re.compile(r"PAGEN_1=(\d+)")


async def _fetch(client: httpx.AsyncClient, url: str) -> str | None:
    """HTML страницы или None. Клиент — httpx: запросы через aiohttp сайт
    отклоняет антибот-заглушкой (HTTP 503) при тех же заголовках."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.text
            log.debug("eApteka HTTP %d: %s", resp.status_code, url)
            if resp.status_code == 503 and _is_antibot(resp.text):
                log.warning("eApteka: антибот-проверка на %s", url)
            elif resp.status_code not in (403, 429, 500, 502, 503, 504):
                return None
        except httpx.HTTPError as e:
            log.debug(
                "eApteka попытка %d/%d %s: %s",
                attempt + 1, MAX_RETRIES, url, type(e).__name__,
            )
        if attempt < MAX_RETRIES - 1:
            await asyncio.sleep(2 ** attempt + random.uniform(0.2, 0.8))
    return None


def _is_antibot(text: str) -> bool:
    lowered = text.lower()
    return (
        "проверка вашего браузера" in lowered
        or "доступ к сайту временно ограничен" in lowered
    )


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    text = text.replace(",", ".").replace(" ", "").strip()
    m = re.search(r"[\d.]+", text)
    if not m:
        return None
    try:
        return float(m.group())
    except ValueError:
        return None


def _clean(fragment: str | None) -> str:
    """Текст из HTML-фрагмента: без тегов, сущностей и лишних пробелов."""
    if not fragment:
        return ""
    text = html_lib.unescape(re.sub(r"<[^>]+>", " ", fragment))
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def parse_listing(page_html: str) -> list[PharmacyProduct]:
    """Товары со страницы списка категории."""
    products: list[PharmacyProduct] = []
    for card in _CARD_SPLIT_RE.split(page_html)[1:]:
        product = _parse_card(card)
        if product is not None:
            products.append(product)
    return products


def _parse_card(card: str) -> PharmacyProduct | None:
    href = _HREF_RE.search(card)
    xml_id = _XML_ID_RE.search(card)
    if not href or not xml_id:
        return None

    offer: dict = {}
    offer_match = _OFFER_RE.search(card)
    if offer_match:
        try:
            offer = json.loads(html_lib.unescape(offer_match.group(1)))
        except ValueError:
            offer = {}

    name = _clean(offer.get("itemName"))
    if not name:
        return None

    current = _parse_price(
        (_PRICE_RE.search(card) or [None, None])[1]
    ) or _parse_price(str(offer.get("itemPrice") or ""))
    old_match = _OLD_PRICE_RE.search(card)
    old = _parse_price(old_match.group(1)) if old_match else None

    manufacturer, country = "", ""
    mfr_match = _MANUFACTURER_RE.search(card)
    if mfr_match:
        parts = _clean(mfr_match.group(1)).rsplit(",", 1)
        manufacturer = parts[0].strip()
        if len(parts) > 1:
            country = parts[1].strip()

    ingredient = _INGREDIENT_RE.search(card)
    image = _IMAGE_RE.search(card)
    brand = _clean(offer.get("itemBrand"))

    return PharmacyProduct(
        source=EaptekaAdapter.slug,
        sku=xml_id.group(1),
        name=name,
        mnn=_clean(ingredient.group(1)) if ingredient else "",
        trade_name=parse_trade_name(name),
        manufacturer=manufacturer,
        country=country,
        form=parse_form(name),
        dosage=parse_dosage(name),
        pack_qty=parse_pack_qty(name),
        # цена без скидки — основная; со скидкой — отдельным полем
        price=old if old is not None else current,
        price_discount=current if old is not None else None,
        url=BASE_URL + href.group(1),
        image_url=html_lib.unescape(image.group(1)) if image else "",
        extra={
            "Оригинал/Дженерик": (
                "Оригинал" if "listing-card__original" in card else "Дженерик"
            ),
            "category": _clean(offer.get("itemCategory")),
            "brand": brand,
        },
    )


class EaptekaAdapter(PharmacyAdapter):
    slug = "eapteka"
    display_name = "eApteka"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=httpx.Timeout(REQUEST_TIMEOUT, connect=15.0),
            follow_redirects=True,
        ) as session:
            seen: set[str] = set()
            yielded = 0
            sem = asyncio.Semaphore(CONCURRENCY)

            async def page(category_url: str, number: int) -> str | None:
                async with sem:
                    return await _fetch(
                        session,
                        f"{BASE_URL}{category_url}?PAGEN_1={number}",
                    )

            def fresh(page_html: str | None) -> list[PharmacyProduct]:
                """Товары страницы, которых ещё не было."""
                result = []
                for product in parse_listing(page_html or ""):
                    if product.sku not in seen:
                        seen.add(product.sku)
                        result.append(product)
                return result

            for category_url in CATEGORY_URLS:
                first = await _fetch(session, BASE_URL + category_url)
                if not first:
                    log.warning(
                        "eApteka: категория %s недоступна", category_url,
                    )
                    continue
                total_pages = max(
                    (int(n) for n in _PAGES_RE.findall(first)), default=1,
                )
                log.info(
                    "eApteka: %s — %d страниц", category_url, total_pages,
                )
                for product in fresh(first):
                    yield product
                    yielded += 1
                    if self.limit and yielded >= self.limit:
                        return

                numbers = list(range(2, total_pages + 1))
                for start in range(0, len(numbers), BATCH_SIZE):
                    batch = numbers[start:start + BATCH_SIZE]
                    for page_html in await asyncio.gather(
                        *(page(category_url, n) for n in batch),
                    ):
                        for product in fresh(page_html):
                            yield product
                            yielded += 1
                            if self.limit and yielded >= self.limit:
                                return
                    log.info(
                        "eApteka: %s — %d/%d страниц (товаров: %d)",
                        category_url, start + len(batch) + 1,
                        total_pages, yielded,
                    )

            if yielded == 0:
                raise RuntimeError(
                    "eApteka: не удалось получить ни одного товара "
                    "(категории недоступны или изменилась вёрстка)"
                )
