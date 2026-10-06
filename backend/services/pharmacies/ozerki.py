from __future__ import annotations

import asyncio
import logging
import os
import random
import re
from typing import AsyncIterator

import httpx

from .base import PharmacyAdapter, PharmacyProduct

log = logging.getLogger(__name__)

BASE_URL = "https://ozerki.ru"
API_TPL = BASE_URL + "/_next/data/{build_id}/catalog/{slug}.json"
PRODUCT_API_TPL = (
    BASE_URL + "/_next/data/{build_id}/{region}/catalog/product/{slug}.json"
)
SITEMAP_INDEX_URL = BASE_URL + "/sitemap.xml"
SITEMAP_REGION = os.getenv("OZERKI_REGION", "sankt-peterburg")
SITEMAP_PRODUCT_RE = re.compile(
    r"https://ozerki\.ru/(?P<region>[^/]+)/catalog/product/(?P<slug>[^/]+)/?"
)
DELAY_MIN = 0.05
DELAY_MAX = 0.15
MAX_RETRIES = 4
CONCURRENCY = 15
REQUEST_TIMEOUT = httpx.Timeout(30.0, connect=15.0)
ROOT_SLUG = "lekarstvennye-i-profilakticheskie-sredstva"
TARGET_CATEGORY = "Лекарства и БАД"
BUILD_ID_RE = re.compile(r'"buildId":"([^"]+)"')


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


async def _sleep():
    await asyncio.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


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
            subcats = await self._get_subcategories(client, build_id)
            slugs = await self._collect_product_slugs(
                client, build_id, subcats,
            )
            urls = [(SITEMAP_REGION, slug) for slug in slugs]
            log.info(
                "Ozerki: выбрано %d товаров из категории %s",
                len(urls), TARGET_CATEGORY,
            )
            semaphore = asyncio.Semaphore(CONCURRENCY)

            async def fetch_one(
                item: tuple[str, str],
            ) -> PharmacyProduct | None:
                region, slug = item
                async with semaphore:
                    try:
                        data = await self._api_get(
                            client, build_id, slug, region=region,
                            is_product=True,
                        )
                        product = self._extract_product(data)
                        if product is None:
                            return None
                        category_path = product.extra.get("category_path", "")
                        if TARGET_CATEGORY not in category_path:
                            return None
                        product.url = (
                            f"{BASE_URL}/{region}/catalog/product/{slug}/"
                        )
                        return product
                    except httpx.HTTPStatusError as e:
                        log.warning(
                            "Ozerki %s: HTTP %s", slug, e.response.status_code,
                        )
                    except Exception as e:  # noqa: BLE001
                        log.warning(
                            "Ozerki %s: %s", slug, type(e).__name__,
                        )
                    return None

            yielded = 0
            for start in range(0, len(urls), 100):
                batch = urls[start:start + 100]
                products = await asyncio.gather(
                    *(fetch_one(item) for item in batch),
                )
                for product in products:
                    if product is None:
                        continue
                    yield product
                    yielded += 1
                    if self.limit and yielded >= self.limit:
                        return
                log.info(
                    "Ozerki: %d/%d карточек (ок: %d)",
                    min(start + len(batch), len(urls)), len(urls), yielded,
                )
                await _sleep()

    async def _collect_sitemap_urls(
        self, client: httpx.AsyncClient,
    ) -> list[tuple[str, str]]:
        response = await _request(client, SITEMAP_INDEX_URL)
        response.raise_for_status()
        sitemap_urls = re.findall(r"<loc>(.*?)</loc>", response.text)
        regional = next(
            (
                url for url in sitemap_urls
                if url.endswith(f"sitemap-{SITEMAP_REGION}.xml")
            ),
            None,
        )
        if regional is None:
            raise RuntimeError(
                f"Ozerki: sitemap региона {SITEMAP_REGION!r} не найден"
            )

        result: list[tuple[str, str]] = []
        seen: set[str] = set()
        regional_sitemap = await _request(client, regional)
        regional_sitemap.raise_for_status()
        product_sitemaps = [
            url for url in re.findall(
                r"<loc>(.*?)</loc>", regional_sitemap.text,
            )
            if "/sitemap-products-" in url
        ]
        for sitemap_url in product_sitemaps:
            sitemap = await _request(client, sitemap_url)
            sitemap.raise_for_status()
            for raw_url in re.findall(r"<loc>(.*?)</loc>", sitemap.text):
                match = SITEMAP_PRODUCT_RE.fullmatch(raw_url.strip())
                if match is None:
                    continue
                slug = match.group("slug")
                if slug not in seen:
                    seen.add(slug)
                    result.append((match.group("region"), slug))
                    if self.limit and len(result) >= self.limit:
                        return result
        log.info(
            "Ozerki: sitemap региона %s содержит %d товаров",
            SITEMAP_REGION, len(result),
        )
        return result

    async def _api_get(
        self,
        client: httpx.AsyncClient,
        build_id: str,
        slug: str,
        params: dict | None = None,
        region: str | None = None,
        is_product: bool = False,
    ) -> dict:
        if is_product:
            url = PRODUCT_API_TPL.format(
                build_id=build_id,
                region=region or SITEMAP_REGION,
                slug=slug,
            )
        else:
            url = API_TPL.format(build_id=build_id, slug=slug)
        resp = await _request(client, url, params=params)
        resp.raise_for_status()
        return resp.json()

    async def _get_subcategories(
        self, client: httpx.AsyncClient, build_id: str,
    ) -> list[dict]:
        log.info("Ozerki: собираем подкатегории...")
        data = await self._api_get(client, build_id, ROOT_SLUG)
        comp = data["pageProps"]["data"]["componentData"]
        items = (
            comp.get("catalogFilter", {})
            .get("categories", {})
            .get("items", [])
        )
        subcats = []
        for item in items:
            href = item.get("href", "")
            slug = href.strip("/").split("/")[-1]
            subcats.append({
                "name": item.get("label", ""),
                "slug": slug,
                "count": item.get("count", 0),
            })
        log.info("Ozerki: %d подкатегорий", len(subcats))
        return subcats

    async def _collect_product_slugs(
        self,
        client: httpx.AsyncClient,
        build_id: str,
        subcats: list[dict],
    ) -> list[str]:
        seen: set = set()
        slugs: list[str] = []
        for i, cat in enumerate(subcats, 1):
            if self.limit and len(slugs) >= self.limit:
                break
            page = 1
            while True:
                if self.limit and len(slugs) >= self.limit:
                    break
                params = {"page": page} if page > 1 else None
                try:
                    data = await self._api_get(
                        client, build_id, cat["slug"], params,
                    )
                except httpx.HTTPStatusError:
                    break
                comp = data["pageProps"]["data"]["componentData"]
                prod_list = comp.get("productList", {})
                products = prod_list.get("products", [])
                pagination = prod_list.get("pagination", {})
                meta = pagination.get("meta", {})
                for p in products:
                    href = p.get("href", "")
                    slug = href.strip("/").split("/")[-1]
                    pid = p.get("productId")
                    if pid and pid not in seen:
                        seen.add(pid)
                        slugs.append(slug)
                last_page = meta.get("last_page", 1)
                if page >= last_page:
                    break
                page += 1
                await _sleep()
            log.info(
                "Ozerki [%d/%d] %s: всего слагов %d",
                i, len(subcats), cat["name"], len(slugs),
            )
        return slugs

    def _extract_product(self, data: dict) -> PharmacyProduct | None:
        try:
            p = (
                data["pageProps"]["data"]
                ["componentData"]["productCard"]["product"]
            )
        except (KeyError, TypeError):
            return None

        brand = p.get("brand") or {}
        tn = p.get("tradeName") or {}
        mnn = p.get("mnn") or {}
        ft = p.get("formType") or {}
        mfr = p.get("manufacturer") or {}
        country = p.get("country") or {}
        price = p.get("price") or {}
        cats = p.get("categoriesList", [])
        cat_path = " > ".join(
            c.get("name", "") for c in cats if c.get("name")
        )

        try:
            price_base = (
                float(price.get("base")) if price.get("base") else None
            )
        except (TypeError, ValueError):
            price_base = None
        try:
            price_special = (
                float(price.get("special"))
                if price.get("special") else None
            )
        except (TypeError, ValueError):
            price_special = None

        img = ""
        # Возможные места картинки в productCard Озерков
        for key in ("mainImage", "photo", "image", "img"):
            v = p.get(key)
            if isinstance(v, str) and v:
                img = v if v.startswith("http") else BASE_URL + v
                break
            if isinstance(v, dict):
                for sub in ("url", "src", "path"):
                    val = v.get(sub)
                    if val:
                        img = val if val.startswith("http") else BASE_URL + val
                        break
                if img:
                    break
        if not img:
            gallery = p.get("gallery") or p.get("images") or []
            if isinstance(gallery, list) and gallery:
                first = gallery[0]
                if isinstance(first, str):
                    img = first if first.startswith("http") else BASE_URL + first
                elif isinstance(first, dict):
                    val = first.get("url") or first.get("src") or ""
                    if val:
                        img = val if val.startswith("http") else BASE_URL + val

        return PharmacyProduct(
            source=self.slug,
            sku=str(p.get("productId") or ""),
            name=p.get("name", "") or "",
            mnn=mnn.get("name", "") or "",
            trade_name=tn.get("name", "") or "",
            manufacturer=mfr.get("name", "") or "",
            country=country.get("name", "") or "",
            form=ft.get("name", "") or p.get("medForm", "") or "",
            dosage=str(
                p.get("dosage")
                or mnn.get("dosage")
                or p.get("volume")
                or ""
            ),
            pack_qty=str(p.get("unitsInPackage") or ""),
            price=price_base,
            price_discount=price_special,
            url=BASE_URL + (p.get("href") or ""),
            image_url=img,
            extra={
                "brand": brand.get("name", ""),
                "category_path": cat_path,
            },
        )
