from __future__ import annotations

import logging
from typing import AsyncIterator

import aiohttp

from .base import PharmacyAdapter, PharmacyProduct

log = logging.getLogger(__name__)

GRAPHQL_URL = "https://www.rigla.ru/graphql"
CATEGORY_ID = "2356"
PAGE_SIZE = 500

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Content-Type": "application/json",
}

SPEC_FIELDS = {
    "Международное Непатентованное Наименование": "mnn",
    "Торговое название": "trade_name",
    "Фармакологическая группа АТС (код)": "atc_code",
    "Фармакологическая группа АТС (название)": "atc_name",
    "Лекарственная форма:": "form",
    "Количество в упаковке": "pack_qty",
    "Производитель:": "manufacturer",
    "Страна производства:": "country",
    "Содержание действующего вещества (мг)": "dose_mg",
    "Концентрация действующего вещества (%)": "dose_pct",
}

GRAPHQL_QUERY = """
query productsElastic(
    $page_size: Int,
    $current_page: Int
) {
    productsElastic(
        currentPage: $current_page
        pageSize: $page_size
        filter: {
            is_in_stock: {eq: "true"}
            category_id: {eq: "%s"}
        }
    ) {
        total_count
        page_info { total_pages current_page }
        items {
            sku
            name
            url_key
            small_image { url }
            image { url }
            price {
                regularPrice { amount { value } }
            }
            specification_set_attributes {
                attribute_label
                values { value }
            }
        }
    }
}
""" % CATEGORY_ID


class RiglaAdapter(PharmacyAdapter):
    slug = "rigla"
    display_name = "Ригла"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        timeout = aiohttp.ClientTimeout(total=60)
        yielded = 0
        async with aiohttp.ClientSession(
            headers=HEADERS, timeout=timeout,
        ) as session:
            page = 1
            total_pages: int | None = None
            while total_pages is None or page <= total_pages:
                if self.limit and yielded >= self.limit:
                    return
                payload = {
                    "query": GRAPHQL_QUERY,
                    "variables": {
                        "page_size": PAGE_SIZE,
                        "current_page": page,
                    },
                }
                try:
                    async with session.post(
                        GRAPHQL_URL, json=payload,
                    ) as resp:
                        data = await resp.json()
                        result = data["data"]["productsElastic"]
                except (aiohttp.ClientError, KeyError) as e:
                    log.error(
                        "Rigla стр. %d ошибка: %s", page, e,
                    )
                    page += 1
                    continue

                total_pages = result["page_info"]["total_pages"]
                for item in result["items"]:
                    if self.limit and yielded >= self.limit:
                        return
                    yield self._parse_item(item)
                    yielded += 1

                log.info(
                    "Rigla: страница %d/%d (получено %d)",
                    page, total_pages, yielded,
                )
                page += 1

    def _parse_item(self, item: dict) -> PharmacyProduct:
        price_val = (
            item.get("price", {})
            .get("regularPrice", {})
            .get("amount", {})
            .get("value")
        )
        try:
            price = float(price_val) if price_val else None
        except (TypeError, ValueError):
            price = None

        url_key = item.get("url_key", "")
        url = (
            f"https://www.rigla.ru/product/{url_key}"
            if url_key else ""
        )

        img = ""
        for k in ("small_image", "image"):
            v = item.get(k) or {}
            u = v.get("url") if isinstance(v, dict) else None
            if u:
                img = u
                break

        p = PharmacyProduct(
            source=self.slug,
            sku=str(item.get("sku", "")),
            name=item.get("name", "") or "",
            price=price,
            url=url,
            image_url=img,
        )

        extra: dict = {}
        for attr in item.get("specification_set_attributes") or []:
            label = attr.get("attribute_label", "")
            field_name = SPEC_FIELDS.get(label)
            values = attr.get("values", [])
            if not values:
                continue
            value = values[0].get("value", "")
            if field_name == "mnn":
                p.mnn = value
            elif field_name == "trade_name":
                p.trade_name = value
            elif field_name == "form":
                p.form = value
            elif field_name == "pack_qty":
                p.pack_qty = value
            elif field_name == "manufacturer":
                p.manufacturer = value
            elif field_name == "country":
                p.country = value
            elif field_name == "dose_mg":
                p.dosage = value
            elif field_name == "dose_pct":
                if not p.dosage:
                    p.dosage = f"{value}%"
            elif field_name == "atc_code":
                extra["atc_code"] = value
            elif field_name == "atc_name":
                extra["atc_name"] = value

        p.extra = extra
        return p
