from __future__ import annotations

import asyncio
import html as html_lib
import json
import logging
import os
import re
from typing import AsyncIterator

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import (
    Browser, Page, Response, Route, async_playwright,
)

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
# Антибот eApteka отдаёт IP хостинга 403 («Доступ к сайту временно
# ограничен») на обычный HTTP-клиент и Chromium, а Firefox проходит его
# JS-проверку (503 → страница сама перезагружается в каталог).
#
# Сервер слабый (2 ядра, 2 ГБ): несколько вкладок, исполняющих тяжёлый JS
# витрины, съедают память, и страницы перестают грузиться. Поэтому JS
# включён только в контексте проверки, который проходит антибот и отдаёт
# cookies; страницы каталога читаются в контексте без JS, где грузится
# один HTML-документ.
BROWSER = "firefox"
TABS = 2
BATCH_SIZE = 40
PAGE_TIMEOUT_MS = 60_000
READY_TIMEOUT_MS = 30_000
RETRY_WAITS = (10, 30, 60)
BLOCKED_TYPES = {"image", "media", "font"}
CARD_SELECTOR = "article.listing-card"

_CARD_SPLIT_RE = re.compile(r'<article class="listing-card')
_OFFER_RE = re.compile(r"data-oldma-offer='(\{.*?\})'", re.S)
_XML_ID_RE = re.compile(r'data-xml-id="(\d+)"')
_HREF_RE = re.compile(rf'href="(/{re.escape(REGION)}/goods/id\d+/)"')
_IMAGE_RE = re.compile(r'<img\s+src="([^"]+)"')
_RESIZED_RE = re.compile(r"/resized/\d+_\d+_\d+_")
_PRICE_RE = re.compile(r'data-price="([\d.,\s]+)"')
_OLD_PRICE_RE = re.compile(r'data-old-price="([\d.,\s]+)"')
_MANUFACTURER_RE = re.compile(
    r'listing-card__manufacturer">.*?</span>\s*<a[^>]*>(.*?)</a>', re.S,
)
_INGREDIENT_RE = re.compile(
    r'listing-card__ingredient">.*?</span>\s*<a[^>]*>(.*?)</a>', re.S,
)
_PAGES_RE = re.compile(r"PAGEN_1=(\d+)")


async def _block_media(route: Route) -> None:
    if route.request.resource_type in BLOCKED_TYPES:
        await route.abort()
    else:
        await route.continue_()


async def _only_document(route: Route) -> None:
    if route.request.resource_type == "document":
        await route.continue_()
    else:
        await route.abort()


async def _goto(page: Page, url: str) -> Response | None:
    return await page.goto(
        url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS,
    )


class Session:
    """Контекст проверки (с JS) и контекст чтения (без JS) с общими cookies."""

    def __init__(self, browser: Browser):
        self._browser = browser
        self._lock = asyncio.Lock()
        self.generation = 0

    async def open(self) -> None:
        self._checker = await self._browser.new_context(locale="ru-RU")
        await self._checker.route("**/*", _block_media)
        self._check_page = await self._checker.new_page()
        self._reader = await self._browser.new_context(
            locale="ru-RU", java_script_enabled=False,
        )
        await self._reader.route("**/*", _only_document)

    async def new_tab(self) -> Page:
        return await self._reader.new_page()

    async def pass_check(self, url: str, generation: int) -> None:
        async with self._lock:
            if self.generation != generation:
                return  # другая вкладка уже обновила cookies
            try:
                await _goto(self._check_page, url)
                # Проверка сама перезагружает страницу в каталог.
                await self._check_page.wait_for_selector(
                    CARD_SELECTOR, state="attached", timeout=READY_TIMEOUT_MS,
                )
            except PlaywrightError as e:
                log.warning(
                    "eApteka: проверка антибота на %s не завершилась (%s)",
                    url, e.message.splitlines()[0],
                )
            await self._reader.add_cookies(await self._checker.cookies())
            self.generation += 1
            log.info("eApteka: cookies антибота обновлены")


async def _read(tab: Page, url: str) -> tuple[int | None, str]:
    response = await _goto(tab, url)
    if response is None:
        return None, ""
    return response.status, await response.text()


async def load_page(session: Session, tab: Page, url: str) -> str | None:
    """Исходный HTML страницы каталога или None, если она не открылась.

    Берётся тело ответа, а не DOM: скрипты витрины после загрузки
    затирают data-oldma-offer пустышкой, и в DOM данных товара нет.
    """
    attempts = len(RETRY_WAITS) + 1
    for attempt in range(attempts):
        generation = session.generation
        try:
            status, html = await _read(tab, url)
            if status == 200 and not _is_antibot(html):
                return html  # страница без товаров — тоже ответ
            if status in (403, 503) or _is_antibot(html):
                await session.pass_check(url, generation)
                status, html = await _read(tab, url)
                if status == 200 and not _is_antibot(html):
                    return html
                reason = f"антибот-проверка не пройдена (HTTP {status})"
            else:
                reason = f"HTTP {status}"
        except PlaywrightError as e:
            reason = e.message.splitlines()[0]
        if attempt == attempts - 1:
            log.warning("eApteka: %s — %s, попытки исчерпаны", url, reason)
            break
        wait = RETRY_WAITS[attempt]
        log.warning(
            "eApteka: %s — %s, попытка %d/%d, пауза %d с",
            url, reason, attempt + 1, attempts, wait,
        )
        await asyncio.sleep(wait)
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
    if not fragment:
        return ""
    text = html_lib.unescape(re.sub(r"<[^>]+>", " ", fragment))
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def parse_listing(page_html: str) -> list[PharmacyProduct]:
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

    @staticmethod
    def full_image_url(url: str) -> str:
        # …/resized/230_230_1_<hash>.png → оригинал …/1_<hash>.png
        return _RESIZED_RE.sub("/1_", url)

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        async with async_playwright() as pw:
            browser = await getattr(pw, BROWSER).launch()
            try:
                async for product in self._crawl(browser):
                    yield product
            finally:
                await browser.close()

    async def _crawl(self, browser: Browser) -> AsyncIterator[PharmacyProduct]:
        session = Session(browser)
        await session.open()
        tabs: asyncio.Queue[Page] = asyncio.Queue()
        for _ in range(TABS):
            tabs.put_nowait(await session.new_tab())
        main_tab = await session.new_tab()

        seen: set[str] = set()
        yielded = 0

        async def page(category_url: str, number: int) -> str | None:
            tab = await tabs.get()
            try:
                return await load_page(
                    session, tab, f"{BASE_URL}{category_url}?PAGEN_1={number}",
                )
            finally:
                tabs.put_nowait(tab)

        def fresh(page_html: str | None) -> list[PharmacyProduct]:
            result = []
            for product in parse_listing(page_html or ""):
                if product.sku not in seen:
                    seen.add(product.sku)
                    result.append(product)
            return result

        for category_url in CATEGORY_URLS:
            first = await load_page(session, main_tab, BASE_URL + category_url)
            if not first:
                log.warning("eApteka: категория %s недоступна", category_url)
                continue
            total_pages = max(
                (int(n) for n in _PAGES_RE.findall(first)), default=1,
            )
            log.info("eApteka: %s — %d страниц", category_url, total_pages)
            for product in fresh(first):
                yield product
                yielded += 1
                if self.limit and yielded >= self.limit:
                    return

            missed = 0
            numbers = list(range(2, total_pages + 1))
            for start in range(0, len(numbers), BATCH_SIZE):
                batch = numbers[start:start + BATCH_SIZE]
                for page_html in await asyncio.gather(
                    *(page(category_url, n) for n in batch),
                ):
                    if page_html is None:
                        missed += 1
                    for product in fresh(page_html):
                        yield product
                        yielded += 1
                        if self.limit and yielded >= self.limit:
                            return
                log.info(
                    "eApteka: %s — %d/%d страниц (товаров: %d, "
                    "не открылось: %d)",
                    category_url, start + len(batch) + 1, total_pages,
                    yielded, missed,
                )

        if yielded == 0:
            raise RuntimeError(
                "eApteka: не удалось получить ни одного товара "
                "(категории недоступны или изменилась вёрстка)"
            )
