from __future__ import annotations

import asyncio
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

BASE_URL = "https://ozerki.ru"
# Список категории в выбранном регионе: цены и наличие — региональные.
LISTING_TPL = BASE_URL + "/_next/data/{build_id}/{region}/catalog/{slug}.json"
REGION = os.getenv("OZERKI_REGION", "sankt-peterburg")
MAX_RETRIES = 4
# Список категории уже содержит цену, МНН, бренд, производителя, страну и
# фото, поэтому страницы товаров не открываем: ~400 запросов вместо ~12 000.
CONCURRENCY = 8
REQUEST_TIMEOUT = httpx.Timeout(30.0, connect=15.0)
ROOT_SLUG = "lekarstvennye-i-profilakticheskie-sredstva"
TARGET_CATEGORY = "Лекарства и БАД"
BUILD_ID_RE = re.compile(r'"buildId":"([^"]+)"')

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "ru-RU,ru;q=0.9",
    "Referer": BASE_URL + "/catalog/",
}


async def _request(
    client: httpx.AsyncClient, url: str, **kwargs,
) -> httpx.Response:
    for attempt in range(MAX_RETRIES):
        try:
            response = await client.get(url, **kwargs)
            if response.status_code != 429 and response.status_code < 500:
                return response
            if attempt == MAX_RETRIES - 1:
                return response
        except (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.ReadTimeout,
            httpx.RemoteProtocolError,
        ):
            if attempt == MAX_RETRIES - 1:
                raise
        await asyncio.sleep(2 ** attempt + random.uniform(0, 0.5))
    raise RuntimeError("Ozerki: исчерпаны попытки HTTP-запроса")


async def _fetch_build_id(client: httpx.AsyncClient) -> str:
    resp = await _request(client, BASE_URL + "/catalog/")
    resp.raise_for_status()
    m = BUILD_ID_RE.search(resp.text)
    if not m:
        raise RuntimeError(
            "Ozerki: не удалось найти buildId на /catalog/"
        )
    build_id = m.group(1)
    log.info("Ozerki: buildId = %s", build_id)
    return build_id


def _slug(href: str) -> str:
    return (href or "").strip("/").split("/")[-1]


class OzerkiAdapter(PharmacyAdapter):
    slug = "ozerki"
    display_name = "Озерки"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
        ) as client:
            build_id = await _fetch_build_id(client)
            root = await self._listing(client, build_id, ROOT_SLUG)
            categories = [
                _slug(item.get("href", ""))
                for item in (
                    root.get("catalogFilter", {})
                    .get("categories", {})
                    .get("items", [])
                )
            ]
            categories = [c for c in categories if c]
            log.info("Ozerki: %d подкатегорий", len(categories))

            semaphore = asyncio.Semaphore(CONCURRENCY)

            async def page(slug: str, number: int) -> dict:
                async with semaphore:
                    try:
                        return await self._listing(
                            client, build_id, slug, number,
                        )
                    except (httpx.HTTPError, ValueError, KeyError) as e:
                        log.warning(
                            "Ozerki %s стр. %d: %s",
                            slug, number, type(e).__name__,
                        )
                        return {}

            # Первая страница каждой категории сообщает число страниц.
            first_pages = await asyncio.gather(
                *(page(slug, 1) for slug in categories),
            )
            rest = [
                (slug, number)
                for slug, comp in zip(categories, first_pages)
                for number in range(2, self._last_page(comp) + 1)
            ]
            log.info(
                "Ozerki: страниц списка %d", len(categories) + len(rest),
            )

            seen: set[str] = set()
            yielded = 0

            def products(comp: dict):
                for raw in comp.get("productList", {}).get("products", []):
                    product = self._extract_product(raw)
                    if product is None or product.sku in seen:
                        continue
                    seen.add(product.sku)
                    yield product

            for comp in first_pages:
                for product in products(comp):
                    yield product
                    yielded += 1
                    if self.limit and yielded >= self.limit:
                        return

            for start in range(0, len(rest), 40):
                batch = rest[start:start + 40]
                for comp in await asyncio.gather(
                    *(page(slug, number) for slug, number in batch),
                ):
                    for product in products(comp):
                        yield product
                        yielded += 1
                        if self.limit and yielded >= self.limit:
                            return
                log.info(
                    "Ozerki: %d/%d страниц (товаров: %d)",
                    min(start + len(batch), len(rest)), len(rest), yielded,
                )

    async def _listing(
        self,
        client: httpx.AsyncClient,
        build_id: str,
        slug: str,
        page: int = 1,
    ) -> dict:
        url = LISTING_TPL.format(build_id=build_id, region=REGION, slug=slug)
        resp = await _request(
            client, url, params={"page": page} if page > 1 else None,
        )
        resp.raise_for_status()
        return resp.json()["pageProps"]["data"]["componentData"]

    @staticmethod
    def _last_page(comp: dict) -> int:
        meta = (
            comp.get("productList", {}).get("pagination", {}).get("meta", {})
        )
        try:
            return int(meta.get("last_page") or 1)
        except (TypeError, ValueError):
            return 1

    def _extract_product(self, p: dict) -> PharmacyProduct | None:
        """Товар из элемента списка категории."""
        product_id = p.get("productId")
        if not product_id:
            return None

        cats = p.get("categoriesList") or []
        cat_path = " > ".join(
            c.get("name", "") for c in cats if c.get("name")
        )
        if TARGET_CATEGORY not in cat_path:
            return None

        brand = p.get("brand") or {}
        mnn = p.get("mnn") or {}
        mfr = p.get("manufacturer") or {}
        country = p.get("country") or {}
        price = p.get("price") or {}
        name = p.get("name", "") or ""

        def money(value) -> float | None:
            try:
                return float(value) if value else None
            except (TypeError, ValueError):
                return None

        image = p.get("src") or ""
        if image and not image.startswith("http"):
            image = BASE_URL + image
        href = p.get("href") or ""

        return PharmacyProduct(
            source=self.slug,
            sku=str(product_id),
            name=name,
            mnn=mnn.get("name", "") or "",
            trade_name=brand.get("name", "") or parse_trade_name(name),
            manufacturer=mfr.get("name", "") or "",
            country=country.get("name", "") or "",
            form=parse_form(name),
            dosage=str(mnn.get("dosage") or "") or parse_dosage(name),
            pack_qty=parse_pack_qty(name),
            price=money(price.get("base")),
            price_discount=money(price.get("special")),
            url=f"{BASE_URL}/{REGION}{href}" if href else "",
            image_url=image,
            extra={
                "brand": brand.get("name", ""),
                "category_path": cat_path,
                "reg_status": p.get("regStatus") or "",
            },
        )
