from __future__ import annotations

import asyncio
import logging
import re
from typing import AsyncIterator

import httpx

from .base import PharmacyAdapter, PharmacyProduct

log = logging.getLogger(__name__)

SITE_URL = "https://aloe.az"
API_URL = "https://ecom.aloe.az/api"
MEDIA_URL = "https://ecom.aloe.az/"
# Разделы сайта «Dərmanlar» (лекарства) и «Qida əlavəsi» (БАД). Тот же
# JSON отдаёт и SSR-каталог aloe.az, но там страница весит 1,5 МБ против
# 50 КБ у API. Размер страницы API не меняется — всегда 12 товаров.
CATEGORIES = {1: "Dərmanlar", 514: "Qida əlavəsi"}
PAGE_SIZE = 12
CONCURRENCY = 6
MAX_ATTEMPTS = 5
REQUEST_TIMEOUT = 40
# Сколько карточек пробовать на один ID страны, если первая не ответила.
COUNTRY_SAMPLES = 3

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "ru",
}

# Поля МНН и ATC в базе магазина заполнены вперемешку: встречаются
# «A11DA01 Thiamine (vit B1)», просто «active_substance» или страна.
_ATC_RE = re.compile(r"^[A-Z]\d{2}(?:[A-Z]{1,2}(?:\d{2})?)?$")
_ATC_MNN_RE = re.compile(r"^([A-Z]\d{2}[A-Z]{0,2}\d{0,2})\s+(.+)$")
_CYRILLIC_RE = re.compile(r"[а-яё]", re.I)
_UNITS = (
    r"mq/ml|mkq/ml|mg/ml|мг/мл|mkq|mcg|мкг|mq|mg|мг|ml|мл|ME|МЕ|IU|q|г|g|%"
)
_DOSE_RE = re.compile(
    rf"(\d+(?:[.,]\d+)?\s*(?:{_UNITS}))(?![a-zа-яёəğıöşüç])", re.I,
)
# Типы товара API отдаёт по-русски, но часть осталась без перевода.
_FORMS_RU = {
    "Kapsullar": "Капсулы",
    "Vaginal Kapsullar": "Капсулы вагинальные",
    "Krem": "Крем",
    "Gel": "Гель",
    "Krem-Gel": "Крем-гель",
    "Gel-smazka": "Гель-смазка",
    "Gel-Balzam": "Гель-бальзам",
    "Diş geli": "Зубной гель",
    "Qoruyucu": "Презервативы",
    "Həblər": "Таблетки",
    "Fışıldayan həblər": "Шипучие таблетки",
    "Fışıldayan həb": "Шипучие таблетки",
    "Saşe": "Саше",
    "Sprey": "Спрей",
    "Pastilka": "Пастилки",
    "Məhlullar": "Раствор",
    "Suspenziya": "Суспензия",
    "Inyeksiya üçün toz": "Порошок для инъекций",
    "Uşaq yeməkləri": "Детское питание",
    "Qulaq çöpləri": "Ватные палочки",
}
_PACK_RE = re.compile(r"(\d+)\s*(?:əd|шт|ədəd)\b", re.I)


def _price(value) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if price > 0 else None


def _text(value) -> str:
    if value is None:
        return ""
    value = str(value).strip()
    return "" if value in ("0", "Yoxdur") else value


def _atc_mnn(item: dict) -> tuple[str, str]:
    substance = _text(item.get("active_substance"))
    match = _ATC_MNN_RE.match(substance)
    if match:
        return match.group(1), match.group(2).strip()
    atc = _text(item.get("ats_classification"))
    return (atc if _ATC_RE.match(atc) else ""), ""


def _image(item: dict) -> str:
    images = sorted(
        item.get("images") or [], key=lambda i: -(i.get("main") or 0),
    )
    for image in images:
        path = (image.get("media_manager") or {}).get("media_file")
        if path:
            return MEDIA_URL + path
    return ""


def _trade_name(name: str) -> str:
    digit = re.search(r"\s\d", name)
    head = name[:digit.start()] if digit else name
    return head.strip(" ,;-") or name


def _russian_name(cname: str) -> str:
    """Русское название из cname, если оно там есть.

    «Хонда / Honda 50 ml.» → «Хонда 50 ml.»;
    «Канпол 80/101 Сумочка … (Digərlər) (Canpol)» → без хвостовых скобок
    с категорией и брендом.
    """
    if not _CYRILLIC_RE.search(cname):
        return ""
    name = cname
    if " / " in name:
        russian, latin = name.split(" / ", 1)
        if _CYRILLIC_RE.search(russian):
            tail = re.search(r"\s\d", latin)
            name = russian + (latin[tail.start():] if tail else "")
    while True:
        trimmed = re.sub(r"\s*\([^()\d]*\)\s*$", "", name)
        if trimmed == name or not trimmed:
            break
        name = trimmed
    name = re.sub(r"\s*\(\d{3,5}\)", "", name)
    return re.sub(r"\s+", " ", name).strip(" ,;-")


def parse_product(
    item: dict, category: str,
    countries: dict[int, str], types: dict[int, str],
) -> PharmacyProduct | None:
    name_az = _text(item.get("name"))
    slug = item.get("slug")
    current = _price(item.get("price"))
    if not name_az or not slug or current is None:
        return None
    old = _price(item.get("old_price"))
    if old is not None and old <= current:
        old = None
    # cname — оригинальное название из учётной системы, у ~70% товаров
    # по-русски: «Витамин В1 / Vitamin B1 5% 1 ml. 10 əd.».
    cname = _text(item.get("cname"))
    name = _russian_name(cname) or name_az
    atc, mnn = _atc_mnn(item)
    volume = _text(item.get("volume"))
    pack = _text(item.get("package_quantity"))
    dose = _DOSE_RE.search(name_az) or _DOSE_RE.search(cname)
    pack_match = _PACK_RE.search(name_az) or _PACK_RE.search(cname)
    return PharmacyProduct(
        source=AloeAdapter.slug,
        sku=str(item.get("code") or item.get("id") or ""),
        name=name,
        mnn=mnn,
        trade_name=_trade_name(name),
        manufacturer=_text((item.get("brand") or {}).get("name")),
        country=countries.get(item.get("manufacturer_country") or 0, ""),
        form=types.get(item.get("product_type") or 0, ""),
        dosage=dose.group(1).strip() if dose else volume,
        pack_qty=pack_match.group(1) if pack_match else pack,
        price=old if old is not None else current,
        price_discount=current if old is not None else None,
        url=f"{SITE_URL}/ru/{slug}",
        image_url=_image(item),
        extra={
            "category": category,
            "name_az": name_az,
            "atc": atc,
            "volume": volume,
            "prescription": bool(item.get("recipe_or_not")),
        },
    )


async def _get_json(
    client: httpx.AsyncClient, sem: asyncio.Semaphore,
    path: str, params: dict | None = None,
) -> dict | None:
    for attempt in range(MAX_ATTEMPTS):
        try:
            async with sem:
                resp = await client.get(f"{API_URL}/{path}", params=params)
        except httpx.HTTPError as e:
            log.warning(
                "Aloe: %s %s, попытка %d/%d: %s", path, params or "",
                attempt + 1, MAX_ATTEMPTS, type(e).__name__,
            )
        else:
            if resp.status_code == 200:
                try:
                    return resp.json().get("data")
                except ValueError:
                    log.warning("Aloe: %s вернул не JSON", path)
            elif resp.status_code == 404:
                return None
            else:
                log.warning(
                    "Aloe: %s %s — HTTP %d", path, params or "",
                    resp.status_code,
                )
        await asyncio.sleep(2 * 2 ** attempt)
    return None


async def _fetch_category(
    client: httpx.AsyncClient, sem: asyncio.Semaphore, category_id: int,
    max_pages: int | None = None,
) -> tuple[list[dict], dict[int, str]]:
    def page_params(number: int) -> dict:
        return {"category_id": category_id, "page": number}

    first = await _get_json(client, sem, "products/filters", page_params(1))
    if not first:
        raise RuntimeError(f"Aloe: раздел {category_id} недоступен")
    types = {}
    for product_type in first.get("product_types") or []:
        title = (product_type.get("name") or "").strip()
        types[product_type["id"]] = _FORMS_RU.get(title, title)
    listing = first["products"]
    last_page = int(listing.get("last_page") or 1)
    if max_pages:
        last_page = min(last_page, max_pages)
    log.info(
        "Aloe: раздел %s — %s товаров, %d стр.",
        CATEGORIES[category_id], listing.get("total"), last_page,
    )
    pages: dict[int, list[dict]] = {1: listing.get("data") or []}

    async def load(number: int) -> None:
        data = await _get_json(
            client, sem, "products/filters", page_params(number),
        )
        if data:
            pages[number] = data["products"].get("data") or []
            if len(pages) % 100 == 0:
                log.info(
                    "Aloe: раздел %s — %d/%d стр.",
                    CATEGORIES[category_id], len(pages), last_page,
                )

    await asyncio.gather(*(load(n) for n in range(2, last_page + 1)))
    missing = last_page - len(pages)
    if missing:
        log.warning(
            "Aloe: раздел %s — не загружено %d стр.",
            CATEGORIES[category_id], missing,
        )
    return [it for n in sorted(pages) for it in pages[n]], types


async def _fetch_countries(
    client: httpx.AsyncClient, sem: asyncio.Semaphore, items: list[dict],
) -> dict[int, str]:
    """Название страны есть только в карточке товара — берём по одной
    карточке на каждый ID страны."""
    samples: dict[int, list[str]] = {}
    for item in items:
        country_id = item.get("manufacturer_country")
        if country_id and item.get("slug"):
            bucket = samples.setdefault(country_id, [])
            if len(bucket) < COUNTRY_SAMPLES:
                bucket.append(item["slug"])

    countries: dict[int, str] = {}

    async def resolve(country_id: int, slugs: list[str]) -> None:
        for slug in slugs:
            data = await _get_json(client, sem, f"products/show/{slug}")
            name = _text((data or {}).get("countryname"))
            if name:
                countries[country_id] = name
                return

    await asyncio.gather(*(resolve(c, s) for c, s in samples.items()))
    log.info("Aloe: стран найдено %d из %d", len(countries), len(samples))
    return countries


class AloeAdapter(PharmacyAdapter):
    slug = "aloe"
    display_name = "Aloe+"
    currency = "AZN"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        sem = asyncio.Semaphore(CONCURRENCY)
        items: list[tuple[dict, str]] = []
        types: dict[int, str] = {}
        max_pages = -(-self.limit // PAGE_SIZE) if self.limit else None
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=httpx.Timeout(REQUEST_TIMEOUT, connect=15.0),
            follow_redirects=True,
        ) as client:
            for category_id, title in CATEGORIES.items():
                category_items, category_types = await _fetch_category(
                    client, sem, category_id, max_pages,
                )
                types.update(category_types)
                items += [(it, title) for it in category_items]
            countries = await _fetch_countries(
                client, sem, [it for it, _ in items],
            )

        seen: set[str] = set()
        yielded = 0
        for item, category in items:
            product = parse_product(item, category, countries, types)
            if product is None or not product.sku or product.sku in seen:
                continue
            seen.add(product.sku)
            yield product
            yielded += 1
            if self.limit and yielded >= self.limit:
                return

        if yielded == 0:
            raise RuntimeError(
                "Aloe: не удалось получить ни одного товара "
                "(сайт недоступен или изменился формат API)"
            )
