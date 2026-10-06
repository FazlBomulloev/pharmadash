from __future__ import annotations

import asyncio
import logging
import os
import random
import re
from typing import AsyncIterator

import aiohttp
from bs4 import BeautifulSoup

from .base import PharmacyAdapter, PharmacyProduct

log = logging.getLogger(__name__)

BASE_URL = "https://www.eapteka.ru"
REGION = os.getenv("EAPTEKA_REGION", "spb")
CATEGORY_URLS = (
    f"/{REGION}/goods/drugs/",
    f"/{REGION}/goods/vitaminy_i_bad/",
)
SITEMAP_URL = (
    BASE_URL + "/upload/eapteka_sitemap/sitemap_ssl.xml"
)
CONCURRENCY = 15
BATCH_SIZE = 60
BATCH_PAUSE = 0.5
REQUEST_TIMEOUT = 30
MAX_RETRIES = 4
PRODUCT_URL_RE = re.compile(
    rf"https://www\.eapteka\.ru/{re.escape(REGION)}/goods/id\d+/"
)

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


async def _fetch(session, url, retries=MAX_RETRIES):
    for attempt in range(retries):
        try:
            timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            async with session.get(
                url, timeout=timeout, allow_redirects=True,
            ) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    if (
                        "проверка вашего браузера" in text.lower()
                        or "доступ к сайту временно ограничен" in text.lower()
                    ):
                        log.warning("eApteka: обнаружена антибот-проверка")
                        return None
                    return text
                log.debug("eApteka HTTP %d: %s", resp.status, url)
                if resp.status not in (403, 429, 500, 502, 503, 504):
                    return None
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            log.debug(
                "eApteka попытка %d/%d %s: %s",
                attempt + 1, retries, url, e,
            )
        if attempt < retries - 1:
            await asyncio.sleep(2 ** attempt + random.uniform(0.2, 0.8))
    return None


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    text = text.replace(",", ".").strip()
    m = re.search(r"[\d.]+", text)
    if not m:
        return None
    try:
        return float(m.group())
    except ValueError:
        return None


class EaptekaAdapter(PharmacyAdapter):
    slug = "eapteka"
    display_name = "eApteka"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            links = await self._collect_links(session)
            if not links:
                return
            log.info("eApteka: собрано ссылок %d", len(links))

            sem = asyncio.Semaphore(CONCURRENCY)
            total = len(links)
            for i in range(0, total, BATCH_SIZE):
                batch = links[i:i + BATCH_SIZE]

                async def _one(url):
                    async with sem:
                        html = await _fetch(
                            session,
                            url if url.startswith("http") else BASE_URL + url,
                        )
                        if not html:
                            return None
                        try:
                            product = self._parse_card(html, url)
                            if product is None:
                                return None
                            return product
                        except Exception as e:  # noqa: BLE001
                            log.warning("eApteka парсинг %s: %s", url, e)
                            return None

                results = await asyncio.gather(
                    *[_one(u) for u in batch], return_exceptions=True,
                )
                for r in results:
                    if isinstance(r, PharmacyProduct):
                        yield r
                done = min(i + BATCH_SIZE, total)
                log.info(
                    "eApteka: %d/%d карточек", done, total,
                )
                if i + BATCH_SIZE < total:
                    await asyncio.sleep(BATCH_PAUSE)

    async def _collect_links(self, session) -> list[str]:
        links = await self._collect_category_links(session)
        if links:
            return links[: self.limit] if self.limit else links

        log.warning(
            "eApteka: категории недоступны, используем sitemap как fallback",
        )
        index = await _fetch(session, SITEMAP_URL)
        if not index:
            raise RuntimeError("eApteka: не удалось получить sitemap")
        sitemap_urls = re.findall(r"<loc>(.*?)</loc>", index)
        offer_sitemaps = [
            url for url in sitemap_urls if "_offers_" in url
        ]
        links: list[str] = []
        seen: set[str] = set()
        log.info(
            "eApteka: сканируем %d sitemap-файлов для региона %s",
            len(offer_sitemaps), REGION,
        )
        for sitemap_url in offer_sitemaps:
            content = await _fetch(session, sitemap_url)
            if not content:
                continue
            for url in re.findall(r"<loc>(.*?)</loc>", content):
                url = url.strip()
                if PRODUCT_URL_RE.fullmatch(url) and url not in seen:
                    seen.add(url)
                    links.append(url)
                    if self.limit and len(links) >= self.limit:
                        return links
        return links

    async def _collect_category_links(self, session) -> list[str]:
        first_pages: list[tuple[str, str, int]] = []
        for category_url in CATEGORY_URLS:
            html = await _fetch(session, BASE_URL + category_url)
            if not html:
                continue
            links, total_pages = self._extract_category_page(html)
            first_pages.append((category_url, html, total_pages))
            if self.limit and len(links) >= self.limit:
                return list(dict.fromkeys(links))[:self.limit]

        if not first_pages:
            return []

        links: list[str] = []
        for category_url, html, total_pages in first_pages:
            links.extend(self._extract_category_page(html)[0])
            page_numbers = range(2, total_pages + 1)
            if self.limit:
                page_numbers = range(2, (self.limit // 33) + 3)

            sem = asyncio.Semaphore(CONCURRENCY)

            async def fetch_page(page: int) -> list[str]:
                async with sem:
                    page_url = (
                        f"{BASE_URL}{category_url}?PAGEN_1={page}"
                    )
                    page_html = await _fetch(session, page_url)
                    if not page_html:
                        return []
                    return self._extract_category_page(page_html)[0]

            results = await asyncio.gather(
                *(fetch_page(page) for page in page_numbers),
            )
            for page_links in results:
                links.extend(page_links)

        links = list(dict.fromkeys(links))
        log.info("eApteka: категории содержат %d ссылок", len(links))
        return links

    def _extract_category_page(self, html: str) -> tuple[list[str], int]:
        links = re.findall(
            rf'href="(/{re.escape(REGION)}/goods/id\d+/)"',
            html,
        )
        links = list(dict.fromkeys(links))
        pages = re.findall(r"PAGEN_1=(\d+)", html)
        return links, max((int(page) for page in pages), default=1)

    def _parse_card(
        self, html: str, url: str,
    ) -> PharmacyProduct | None:
        soup = BeautifulSoup(html, "html.parser")
        breadcrumb_names = [
            node.get_text(" ", strip=True)
            for node in soup.select(
                '.breadcrumbs span[itemprop="name"]',
            )
        ]
        if not any(
            name in {"Лекарственные средства", "Витамины и БАД"}
            for name in breadcrumb_names
        ):
            return None
        p = PharmacyProduct(
            source=self.slug,
            url=url if url.startswith("http") else BASE_URL + url,
        )

        h1 = soup.find("h1")
        if h1:
            p.name = h1.get_text(strip=True)

        # Картинка: сначала og:image (самое надёжное), потом карточка
        og = soup.find("meta", attrs={"property": "og:image"})
        if og and og.get("content"):
            img = og["content"].strip()
            p.image_url = (
                img if img.startswith("http") else BASE_URL + img
            )
        if not p.image_url:
            img_tag = soup.find(
                "img", class_=re.compile(r"offer-image|product__image", re.I),
            )
            if img_tag:
                src = (
                    img_tag.get("data-src")
                    or img_tag.get("src")
                    or ""
                ).strip()
                if src:
                    p.image_url = (
                        src if src.startswith("http") else BASE_URL + src
                    )

        price = None
        old_tag = soup.find(attrs={"data-old-price": True})
        if old_tag:
            price = _parse_price(old_tag.get("data-old-price"))
        if price is None:
            price_tag = soup.find(attrs={"data-price": True})
            if price_tag:
                price = _parse_price(price_tag.get("data-price"))
        if price is None:
            itemprop = soup.find(attrs={"itemprop": "price"})
            if itemprop:
                price = _parse_price(
                    itemprop.get("content")
                    or itemprop.get_text(strip=True)
                )
        p.price = price

        art_tag = soup.find(attrs={"data-action": "article"})
        if art_tag:
            p.sku = art_tag.get_text(strip=True)

        desc = soup.find(
            class_=re.compile(r"offer-card__desc", re.I),
        )
        original = ""
        if desc:
            for ptag in desc.find_all("p"):
                text = ptag.get_text()
                if "Производитель:" in text:
                    a = ptag.find("a")
                    if a:
                        raw = a.get_text(strip=True)
                        parts = raw.rsplit(",", 1)
                        p.manufacturer = parts[0].strip()
                        if len(parts) > 1:
                            p.country = parts[1].strip()
                elif "Действующее вещество:" in text:
                    a = ptag.find("a")
                    if a:
                        p.mnn = a.get_text(strip=True)
            orig_block = desc.find(
                class_=re.compile(r"\boriginal\b", re.I),
            )
            original = "Оригинал" if orig_block else "Дженерик"

        brand_m = re.search(r'"brand"\s*:\s*"([^"]+)"', html)
        if brand_m:
            p.trade_name = brand_m.group(1)

        def _instr(block_id):
            block = soup.find(id=block_id)
            if not block:
                return ""
            text_div = block.find(
                class_="offer-instruction__item-text",
            )
            if not text_div:
                return ""
            a = text_div.find("a")
            return (a or text_div).get_text(strip=True)

        if not p.mnn:
            p.mnn = _instr("instruction_ACTIVE_INGREDIENT")

        form_raw = _instr("instruction_FORM")
        if form_raw:
            first = form_raw.split("\n")[0].strip()
            p.form = re.split(r"[.;]", first)[0].strip()

        dose_m = re.search(
            r"(\d+[.,]?\d*\s*(?:мг|мкг|г|мл|МЕ|ЕД|%|"
            r"мг/мл|мг/доза|мкг/доза))",
            p.name,
        )
        if dose_m:
            p.dosage = dose_m.group(1)

        if not p.trade_name and p.name:
            p.trade_name = p.name.split(" ")[0]

        atx = ""
        pharm = soup.find(id="instruction_PHARM_EFFECT")
        if pharm:
            text_div = pharm.find(
                class_="offer-instruction__item-text",
            )
            if text_div:
                m = re.search(
                    r"(?:Код АТХ|АТХ)[:\s]*([A-Z]\d{2}[A-Z]{2}\d{2})",
                    text_div.get_text(),
                )
                if m:
                    atx = m.group(1)

        prescription = ""
        recipe_block = soup.find(id="instruction_IS_RECIPE")
        if recipe_block:
            text_div = recipe_block.find(
                class_="offer-instruction__item-text",
            )
            if text_div:
                raw = text_div.get_text(strip=True)
                if "По рецепту" in raw:
                    prescription = "Да"
                elif "Без рецепта" in raw:
                    prescription = "Нет"

        p.extra = {
            "original": original,
            "atx": atx,
            "prescription": prescription,
        }
        return p
