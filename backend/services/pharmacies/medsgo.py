from __future__ import annotations

import asyncio
import html as html_lib
import logging
import math
import random
import re
from typing import AsyncIterator
from urllib.parse import urlparse

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page, Route, async_playwright

from .base import PharmacyAdapter, PharmacyProduct

log = logging.getLogger(__name__)

BASE_URL = "https://medsgo.ph"
CATEGORY_PATHS = (
    "/prescription-medicines/",
    "/over-the-counter-medicines/",
    "/solutions/",
    "/vitamins-and-supplements/",
)
PAGE_SIZE = 20
PAGE_DELAY = (2.5, 4.5)
RATE_LIMIT_WAITS = (30, 60, 120, 240)
CONTENT_WAIT_SEC = 30
MAX_ATTEMPTS = 4

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
# Bunny Shield отдаёт проверку из своего CDN: без него страница не откроется.
ALLOWED_HOSTS = ("medsgo.ph", "b-cdn.net", "bunny.net")
BLOCKED_TYPES = {"image", "media", "font", "stylesheet"}

_CARD_RE = re.compile(r'<form[^>]+name="product_form_(\d+)"')
_GA_SPAN_RE = re.compile(r'<span[^>]+id="cp_ga_product_data_\d+"[^>]*>')
_GA_ATTR_RE = re.compile(r'data-cpga-([a-z]+)="([^"]*)"')
_IMG_RE = re.compile(r'<img\b[^>]*\bid="det_img_\d+desktop"[^>]*>')
_SRC_RE = re.compile(r'\bsrc="([^"]+)"')
_FEATURE_RE = re.compile(
    r"<em>([^<]+)</em></span>\s*<span><em>(.*?)</em>", re.S,
)
_COUNT_RE = re.compile(r'"product_count":"(\d+)"')
_DOSE_RE = re.compile(
    r"\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)(?:\s*/\s*\d*(?:\.\d+)?\s*"
    r"(?:mg|mcg|g|ml|iu))?",
    re.I,
)
_PACK_RE = re.compile(
    r"(\d+)\s*(?:'s\b|pcs\b|pieces?\b|tablets?\b|tabs?\b|capsules?\b|"
    r"caps\b|softgels?\b|sachets?\b|vials?\b|ampoules?\b|ampules?\b)",
    re.I,
)
_VOLUME_RE = re.compile(r"\d+(?:\.\d+)?\s*(?:ml|g)\b", re.I)
_FORMS = (
    ("film-coated tablet", "Film-Coated Tablet"),
    ("chewable tablet", "Chewable Tablet"),
    ("effervescent tablet", "Effervescent Tablet"),
    ("oral drops", "Oral Drops"),
    ("oral suspension", "Oral Suspension"),
    ("softgel", "Softgel Capsule"),
    ("tablet", "Tablet"),
    ("tab", "Tablet"),
    ("capsule", "Capsule"),
    ("caps", "Capsule"),
    ("syrup", "Syrup"),
    ("suspension", "Suspension"),
    ("drops", "Drops"),
    ("sachet", "Sachet"),
    ("cream", "Cream"),
    ("ointment", "Ointment"),
    ("gel", "Gel"),
    ("lotion", "Lotion"),
    ("spray", "Spray"),
    ("inhaler", "Inhaler"),
    ("nebule", "Nebule"),
    ("vial", "Injection"),
    ("ampoule", "Injection"),
    ("ampule", "Injection"),
    ("injection", "Injection"),
    ("solution", "Solution"),
    ("powder", "Powder"),
    ("suppository", "Suppository"),
    ("patch", "Patch"),
)
_FORM_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k, _ in _FORMS) + r")s?\b", re.I,
)
_FORM_NAMES = dict(_FORMS)


def _text(fragment: str | None) -> str:
    if not fragment:
        return ""
    text = html_lib.unescape(re.sub(r"<[^>]+>", " ", fragment))
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _price(card: str, element_id: str) -> float | None:
    match = re.search(
        rf'id="{element_id}"[^>]*>([\d,]+)<sup>(\d+)</sup>', card,
    )
    if not match:
        return None
    try:
        return float(f"{match.group(1).replace(',', '')}.{match.group(2)}")
    except ValueError:
        return None


def parse_form(*texts: str) -> str:
    for text in texts:
        match = _FORM_RE.search(text or "")
        if match:
            return _FORM_NAMES[match.group(1).lower()]
    return ""


def parse_dosage(feature: str, name: str) -> str:
    if feature and re.search(r"\d", feature):
        return feature
    match = _DOSE_RE.search(name or "")
    return match.group(0).strip() if match else ""


def parse_pack(packaging: str, name: str) -> str:
    for text in (name, packaging):
        match = _PACK_RE.search(text or "")
        if match:
            return match.group(1)
    match = _VOLUME_RE.search(name or "")
    return match.group(0).replace(" ", "") if match else ""


def parse_listing(page_html: str) -> list[PharmacyProduct]:
    products: list[PharmacyProduct] = []
    starts = [m.start() for m in _CARD_RE.finditer(page_html)]
    for start, end in zip(starts, starts[1:] + [len(page_html)]):
        product = _parse_card(page_html[start:end])
        if product is not None:
            products.append(product)
    return products


def _parse_card(card: str) -> PharmacyProduct | None:
    span = _GA_SPAN_RE.search(card)
    if not span:
        return None
    ga = {
        k: html_lib.unescape(v) for k, v in _GA_ATTR_RE.findall(span.group(0))
    }
    pid, name = ga.get("pid"), ga.get("prodname", "").strip()
    if not pid or not name:
        return None

    current = _price(card, f"sec_discounted_price_{pid}")
    if current is None:
        try:
            current = float(ga.get("price") or "")
        except ValueError:
            current = None
    old = _price(card, f"sec_list_price_{pid}")
    if old is not None and current is not None and old <= current:
        old = None

    features = {
        _text(k).lower(): _text(v) for k, v in _FEATURE_RE.findall(card)
    }
    image = _IMG_RE.search(card)
    image_src = _SRC_RE.search(image.group(0)) if image else None
    brand = features.get("brand") or ga.get("brand", "")
    packaging = features.get("packaging", "")

    return PharmacyProduct(
        source=MedsgoAdapter.slug,
        sku=pid,
        name=name,
        trade_name=brand,
        form=parse_form(packaging, name),
        dosage=parse_dosage(features.get("dosage", ""), name),
        pack_qty=parse_pack(packaging, name),
        price=old if old is not None else current,
        price_discount=current if old is not None else None,
        url=ga.get("href", ""),
        image_url=html_lib.unescape(image_src.group(1)) if image_src else "",
        extra={
            "category": ga.get("cm", ""),
            "in_stock": "Out of stock" not in card,
        },
    )


def total_pages(page_html: str) -> int | None:
    match = _COUNT_RE.search(page_html)
    if not match:
        return None
    return max(math.ceil(int(match.group(1)) / PAGE_SIZE), 1)


async def _block_extras(route: Route) -> None:
    request = route.request
    host = urlparse(request.url).hostname or ""
    allowed = any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)
    if not allowed or request.resource_type in BLOCKED_TYPES:
        await route.abort()
    else:
        await route.continue_()


async def _load(page: Page, url: str) -> str | None:
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = await page.goto(
                url, wait_until="domcontentloaded", timeout=60_000,
            )
        except PlaywrightError as e:
            log.warning("MedsGo: ошибка загрузки %s: %s", url, e.message)
            await asyncio.sleep(5)
            continue

        if response is not None and response.status == 429:
            wait = RATE_LIMIT_WAITS[min(attempt, len(RATE_LIMIT_WAITS) - 1)]
            log.warning(
                "MedsGo: лимит запросов (429) на %s, пауза %d с", url, wait,
            )
            await asyncio.sleep(wait)
            continue

        # Shield сначала отдаёт проверку и сам перезагружает страницу:
        # ждём, пока в HTML появятся карточки или пагинация.
        for _ in range(CONTENT_WAIT_SEC):
            try:
                content = await page.content()
            except PlaywrightError:
                await asyncio.sleep(1)
                continue
            if "cp_ga_product_data_" in content or "product_count" in content:
                return content
            await asyncio.sleep(1)
        log.warning(
            "MedsGo: нет каталога на %s (попытка %d/%d)",
            url, attempt + 1, MAX_ATTEMPTS,
        )
    return None


class MedsgoAdapter(PharmacyAdapter):
    slug = "medsgo"
    display_name = "MedsGo"
    currency = "PHP"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        seen: set[str] = set()
        yielded = 0
        async with async_playwright() as pw:
            browser = await pw.chromium.launch()
            try:
                context = await browser.new_context(
                    user_agent=USER_AGENT, locale="en-US",
                )
                await context.route("**/*", _block_extras)
                page = await context.new_page()
                for path in CATEGORY_PATHS:
                    pages = None
                    number = 1
                    while pages is None or number <= pages:
                        url = BASE_URL + path + (
                            f"page-{number}/" if number > 1 else ""
                        )
                        content = await _load(page, url)
                        if content is None:
                            log.warning(
                                "MedsGo: %s — страница %d недоступна, "
                                "раздел прерван", path, number,
                            )
                            break
                        if pages is None:
                            pages = total_pages(content) or 1
                            log.info("MedsGo: %s — %d страниц", path, pages)
                        cards = parse_listing(content)
                        if not cards:
                            break
                        for product in cards:
                            if product.sku in seen:
                                continue
                            seen.add(product.sku)
                            yield product
                            yielded += 1
                            if self.limit and yielded >= self.limit:
                                return
                        if number % 10 == 0:
                            log.info(
                                "MedsGo: %s — %d/%d страниц (товаров: %d)",
                                path, number, pages, yielded,
                            )
                        number += 1
                        await asyncio.sleep(random.uniform(*PAGE_DELAY))
            finally:
                await browser.close()

        if yielded == 0:
            raise RuntimeError(
                "MedsGo: не удалось получить ни одного товара "
                "(сайт недоступен, защита не пройдена или изменилась вёрстка)"
            )
