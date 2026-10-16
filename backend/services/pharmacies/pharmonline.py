from __future__ import annotations

import asyncio
import logging
import re
from typing import AsyncIterator

import httpx

from .base import PharmacyAdapter, PharmacyProduct
from .name_parse import (
    is_medicine_form, parse_dosage, parse_form, parse_trade_name, strip_html,
)

log = logging.getLogger(__name__)

SITE_URL = "https://pharmonline.az"
API_URL = f"{SITE_URL}/api"
PHOTO_URL = (
    "https://media.pharmonline.az/cdn/storage/product_images/"
    "{id}/ultraHD/{path}.webp"
)
PAGE_SIZE = 100  # больше API не отдаёт
CONCURRENCY = 6
MAX_ATTEMPTS = 5
REQUEST_TIMEOUT = 40

# Дополнительные поля товара. Позиция в списке у части товаров плавает,
# поэтому берём по ID поля.
FIELD_COUNTRY = "arPsvL8wgPiZhJ4jm3"
FIELD_GROUP = "aJJ5xgMv8Lac2Z2854"
FIELD_FORM = "a42XumXYbN5wk53dgm"
FIELD_COMPOSITION = "aQPrLwdqjXSJkCzdot"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": f"{SITE_URL}/ru/products",
}

# Разделы без лекарств: товар только из них и без МНН — не лекарство
# (подгузники, косметика, детское питание, медтехника).
NON_MEDICAL_CATEGORIES = {
    "Средства для детей",
    "Средства для гигиены",
    "Средства по уходу за кожей",
    "Средства по уходу за волосами",
    "Забота о полости рта",
    "Интимные средства",
    "Медицинские принадлежности",
    "Медицинское оборудование",
    "Натуральные средства",
}

_PACK_RE = re.compile(r"№\s*(\d+)")
_BRACKETS_RE = re.compile(r"\(([^()]+)\)")
# «Левофлоксацин - 500 мг» → «Левофлоксацин»: дозировку отрезаем.
_DOSE_TAIL_RE = re.compile(r"\s*(?:[-–—:]\s*)?\d.*$")
_COMPANY_RE = re.compile(
    r"\b(?:ООО|ОАО|ЗАО|АО|ПАО|Ltd|LLC|GmbH|Inc|S\.?A|A\.?S)\b", re.I,
)


def _ru(obj: dict | None, key: str = "name") -> str:
    if not isinstance(obj, dict):
        return ""
    i18n = obj.get("i18n") or {}
    for lang in ("ru", "az", "en"):
        value = (i18n.get(lang) or {}).get(key)
        if value:
            return strip_html(str(value))
    return strip_html(str(obj.get(key) or ""))


def _fields(item: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for block in item.get("customFields") or []:
        if not isinstance(block, dict):
            continue
        for kind in ("input", "textarea"):
            for field in block.get(kind) or []:
                value = _ru(field, "value")
                if field.get("_id") and value:
                    out[field["_id"]] = value
    return out


def _price(value) -> float | None:
    try:
        price = round(float(value), 2)
    except (TypeError, ValueError):
        return None
    return price if price > 0 else None


def _mnn(composition: str) -> str:
    parts = []
    for part in re.split(r"[,;\n+]+", composition):
        part = _DOSE_TAIL_RE.sub("", part).strip(" -–.")
        if part and part not in parts:
            parts.append(part)
    return " + ".join(parts)


def _maker(alt: str, country: str) -> str:
    """imgAlt: «Альбумин 20% (Альбунорм) 100 мл (Раствор) (Oktafarma)
    (Австрия)» — производитель стоит в скобках перед страной. Если
    производителя нет, там оказывается форма выпуска или артикул."""
    groups = [g.strip() for g in _BRACKETS_RE.findall(alt)]
    if len(groups) < 2 or not country or groups[-1].lower() != country.lower():
        return ""
    maker = groups[-2]
    if len(re.findall(r"[^\W\d_]", maker)) < 2:
        return ""
    if parse_form(maker) and not _COMPANY_RE.search(maker):
        return ""
    return maker


def _bracket_form(name: str) -> str:
    """«Ратун 150 мл (Сироп)» → «Сироп»."""
    for group in _BRACKETS_RE.findall(name):
        form = parse_form(group)
        if form and form.lower() == group.strip().lower():
            return form
    return ""


def parse_product(
    item: dict, categories: dict[str, dict], countries: set[str],
) -> PharmacyProduct | None:
    name = re.sub(r"\s+", " ", _ru(item))
    path = item.get("path")
    current = _price(item.get("totalMinPrice"))
    if not name or not path or current is None:
        return None
    full = _price(item.get("minPrice"))
    discounted = bool(item.get("sale")) and full is not None and full > current

    fields = _fields(item)
    alt = _ru(item, "imgAlt")
    alt_groups = _BRACKETS_RE.findall(alt)
    country = fields.get(FIELD_COUNTRY, "")
    if not country and alt_groups and alt_groups[-1].strip() in countries:
        country = alt_groups[-1].strip()
    form_text = fields.get(FIELD_FORM, "")
    form = re.split(r"\s*(?:№|\d)", form_text, maxsplit=1)[0].strip(" ,;-")
    pack = _PACK_RE.search(name) or _PACK_RE.search(form_text)

    roots = []
    for category_id in item.get("category") or []:
        category = categories.get(category_id)
        if category and category.get("depth") == 1:
            title = _ru(category)
            if title and title not in roots:
                roots.append(title)

    mnn = _mnn(fields.get(FIELD_COMPOSITION, ""))
    form = form or _bracket_form(name)
    medical = any(title not in NON_MEDICAL_CATEGORIES for title in roots)
    if not mnn and not (medical and is_medicine_form(form)):
        return None

    images = [i for i in item.get("images") or [] if isinstance(i, str)]
    return PharmacyProduct(
        source=PharmonlineAdapter.slug,
        sku=str(item.get("_id") or ""),
        name=name,
        mnn=mnn,
        trade_name=parse_trade_name(name),
        manufacturer=_maker(alt, country),
        country=country,
        form=form,
        dosage=parse_dosage(name),
        pack_qty=pack.group(1) if pack else str(item.get("packageCount") or ""),
        price=full if discounted else current,
        price_discount=current if discounted else None,
        url=f"{SITE_URL}/ru/product/{path}",
        image_url=PHOTO_URL.format(id=images[0], path=path) if images else "",
        extra={
            "category": "; ".join(roots),
            "group": fields.get(FIELD_GROUP, ""),
            "composition": fields.get(FIELD_COMPOSITION, ""),
            "in_stock": bool(item.get("onStock")),
            "barcodes": item.get("barcodeArr") or [],
        },
    )


async def _get_json(
    client: httpx.AsyncClient, sem: asyncio.Semaphore,
    path: str, params: dict,
):
    for attempt in range(MAX_ATTEMPTS):
        try:
            async with sem:
                resp = await client.get(f"{API_URL}/{path}", params=params)
        except httpx.HTTPError as e:
            log.warning(
                "Pharmonline: %s %s, попытка %d/%d: %s", path, params,
                attempt + 1, MAX_ATTEMPTS, type(e).__name__,
            )
        else:
            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError:
                    log.warning("Pharmonline: %s вернул не JSON", path)
            elif resp.status_code in (400, 404):
                return None
            else:
                log.warning(
                    "Pharmonline: %s %s — HTTP %d", path, params,
                    resp.status_code,
                )
        await asyncio.sleep(2 * 2 ** attempt)
    return None


class PharmonlineAdapter(PharmacyAdapter):
    slug = "pharmonline"
    display_name = "Pharmonline"
    currency = "AZN"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        sem = asyncio.Semaphore(CONCURRENCY)
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=httpx.Timeout(REQUEST_TIMEOUT, connect=15.0),
            follow_redirects=True,
        ) as client:
            raw_categories = await _get_json(
                client, sem, "categories", {"type": "category"},
            ) or []
            first = await _get_json(
                client, sem, "products", {"page": 1, "limit": PAGE_SIZE},
            )
            if not first or "data" not in first:
                raise RuntimeError("Pharmonline: каталог недоступен")
            last_page = int(first.get("pages") or 1)
            if self.limit:
                last_page = min(last_page, -(-self.limit // PAGE_SIZE))
            log.info(
                "Pharmonline: %s товаров, %d стр.",
                first.get("total"), last_page,
            )
            pages: dict[int, list[dict]] = {1: first["data"]}

            async def load(number: int) -> None:
                data = await _get_json(
                    client, sem, "products",
                    {"page": number, "limit": PAGE_SIZE},
                )
                if data and "data" in data:
                    pages[number] = data["data"]

            await asyncio.gather(*(load(n) for n in range(2, last_page + 1)))

        missing = last_page - len(pages)
        if missing:
            log.warning("Pharmonline: не загружено %d стр.", missing)

        categories = {
            c["id"]: c for c in raw_categories
            if isinstance(c, dict) and c.get("id")
        }
        countries = {
            _fields(item).get(FIELD_COUNTRY, "")
            for page in pages.values() for item in page
        } - {""}
        seen: set[str] = set()
        yielded = 0
        for number in sorted(pages):
            for item in pages[number]:
                product = parse_product(item, categories, countries)
                if product is None or not product.sku or product.sku in seen:
                    continue
                seen.add(product.sku)
                yield product
                yielded += 1
                if self.limit and yielded >= self.limit:
                    return

        if yielded == 0:
            raise RuntimeError(
                "Pharmonline: не удалось получить ни одного товара "
                "(сайт недоступен или изменился формат API)"
            )
