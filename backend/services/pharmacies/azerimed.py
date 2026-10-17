from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from typing import AsyncIterator

import aiohttp
import httpx
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright

from .base import PharmacyAdapter, PharmacyProduct
from .name_parse import (
    bracket_form, is_medicine_form, parse_dosage, parse_trade_name,
)

log = logging.getLogger(__name__)

SITE_URL = "https://aptekonline.az"
LIST_URL = f"{SITE_URL}/shop/productList"
# Сайт закрыт Cloudflare. Chrome под управлением Playwright проверку не
# проходит — Cloudflare видит автоматизацию и показывает её по кругу.
# Обычный Chromium, запущенный как программа, проходит её сам за ~13 с,
# без нажатий. К нему подключаемся только после этого — забрать cookie и
# User-Agent, — а каталог качает httpx. Без окна (headless) проверка не
# проходит, поэтому на сервере Chromium рисует в виртуальный экран Xvfb.
# Если Cloudflare попросит поставить галочку, сбор просто не пройдёт.
CHECK_URL = f"{SITE_URL}/products"
CHECK_WAIT = 12
CHECK_POLL = 4
CHECK_POLLS = 3
# Первая загрузка часто застревает на проверке, а после перезагрузки
# страница открывается — как F5 в обычном браузере.
CHECK_RELOADS = 3
XVFB_DISPLAY = ":99"
PAGE_SIZE = 5000
REQUEST_TIMEOUT = 120
MAX_ATTEMPTS = 3
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ru-RU,ru;q=0.9",
    "Referer": f"{SITE_URL}/",
    # Так запрос шлёт поиск на сайте.
    "X-Requested-Width": "XMLHttpRequest",
    "checkus": "$2y$10$heJNZP6TbdT.DmpZlHp87u1NY7RqdXXV5Ht/rBbvjSsEIqgi42/ku",
}

# Коды единиц из учётной системы аптеки.
FORMS = {
    "TAB": "Таблетки",
    "KAPS": "Капсулы",
    "AMP": "Ампулы",
    "SIROP": "Сироп",
    "SVEC": "Свечи",
    "SAM": "Свечи",
    "SASHE": "Саше",
    "SPREY": "Спрей",
    "AER": "Аэрозоль",
    "POR": "Порошок",
    "PAST": "Пастилки",
    "LED": "Леденцы",
    "DR": "Драже",
    "GR": "Гранулы",
    "KON": "Концентрат",
    "FL": "Флакон",
    "TUB": "Туба",
    "SHAM": "Шампунь",
    "PAK": "Пакет",
    "SHIP": "Шприц",
    "PLAS": "Пластырь",
}
# Флакон и туба бывают и у косметики — лекарством их делает состав.
MEDICINE_UNITS = set(FORMS) - {"FL", "TUB", "SHAM", "PAK", "SHIP", "PLAS"}

# Страна приходит по-азербайджански и в разном написании: «Türkiyə»,
# «TÜRKİYƏ», «TUR». Ключи — после _country_key().
COUNTRIES = {
    "abş": "США", "usa": "США",
    "albaniya": "Албания",
    "almaniya": "Германия", "ger": "Германия", "deu": "Германия",
    "argentina": "Аргентина", "arg": "Аргентина",
    "avstraliya": "Австралия",
    "avstriya": "Австрия", "avs": "Австрия",
    "azərbaycan": "Азербайджан", "aze": "Азербайджан",
    "az'rbaycan": "Азербайджан", "azəebaycan": "Азербайджан",
    "banqladeş": "Бангладеш", "bangladeş": "Бангладеш", "bgd": "Бангладеш",
    "belarus": "Беларусь", "belorus": "Беларусь", "bel": "Беларусь",
    "belçika": "Бельгия",
    "birləşmiş krallıq": "Великобритания", "britaniya": "Великобритания",
    "böyük britaniya": "Великобритания", "gbr": "Великобритания",
    "ingiltərə": "Великобритания", "ingilərə": "Великобритания",
    "eng": "Великобритания",
    "bolqarıstan": "Болгария", "bolqariya": "Болгария", "bol": "Болгария",
    "bosniya və herseqovina": "Босния и Герцеговина",
    "bosniya": "Босния и Герцеговина",
    "braziliya": "Бразилия",
    "bəə": "ОАЭ", "dubay": "ОАЭ",
    "cənubi afrika": "ЮАР",
    "cənubi koreya": "Южная Корея", "koreya": "Южная Корея",
    "koreya respublikası": "Южная Корея", "kor": "Южная Корея",
    "kireya": "Южная Корея",
    "danimarka": "Дания",
    "estoniya": "Эстония",
    "finlandiya": "Финляндия", "fin": "Финляндия",
    "fransa": "Франция", "fra": "Франция", "france": "Франция",
    "fələstin": "Палестина",
    "gürcüstan": "Грузия",
    "hindistan": "Индия", "hndistan": "Индия", "ind": "Индия",
    "hong kong": "Гонконг",
    "indoneziya": "Индонезия",
    "iordaniya": "Иордания", "ior": "Иордания",
    "iran": "Иран",
    "irlandiya": "Ирландия",
    "islandiya": "Исландия",
    "ispaniya": "Испания",
    "israil": "Израиль",
    "isveç": "Швеция", "sve": "Швеция", "swe": "Швеция",
    "isveçrə": "Швейцария", "iaveçrə": "Швейцария",
    "italiya": "Италия", "ita": "Италия", "iraliya": "Италия",
    "kanada": "Канада",
    "kipr": "Кипр",
    "kolumbiya": "Колумбия",
    "latviya": "Латвия", "lat": "Латвия",
    "litva": "Литва",
    "macarıstan": "Венгрия",
    "makedoniya": "Северная Македония",
    "şimali makedoniya respublikası": "Северная Македония",
    "malayziya": "Малайзия", "malaziya": "Малайзия", "mys": "Малайзия",
    "mal": "Малайзия",
    "malta": "Мальта",
    "meksika": "Мексика",
    "misir": "Египет",
    "moldova": "Молдова", "mda": "Молдова",
    "monako": "Монако",
    "monteneqro": "Черногория",
    "mərakeş": "Марокко",
    "niderland": "Нидерланды", "nld": "Нидерланды",
    "norveç": "Норвегия",
    "oman": "Оман", "oman sultanlığı": "Оман",
    "pakistan": "Пакистан", "pak": "Пакистан",
    "paraqvay": "Парагвай",
    "peru": "Перу",
    "polşa": "Польша", "pol": "Польша",
    "portuqaliya": "Португалия",
    "qazaxıstan": "Казахстан",
    "rumıniya": "Румыния",
    "rusiya": "Россия", "rus": "Россия", "ruisya": "Россия",
    "rüsiya": "Россия",
    "san marino": "Сан-Марино", "san-marino": "Сан-Марино",
    "serbiya": "Сербия",
    "sinqapur": "Сингапур",
    "slovakiya": "Словакия",
    "sloveniya": "Словения",
    "səudiyyə ərəbistanı": "Саудовская Аравия",
    "tailand": "Таиланд", "tayland": "Таиланд", "tay": "Таиланд",
    "tha": "Таиланд",
    "tayvan": "Тайвань",
    "türkiyə": "Турция", "türkiya": "Турция", "türkiye": "Турция",
    "tur": "Турция",
    "türkmənistan": "Туркменистан", "tkm": "Туркменистан",
    "ukrayna": "Украина", "ukr": "Украина",
    "uruqvay": "Уругвай",
    "vyetnam": "Вьетнам",
    "xorvatiya": "Хорватия",
    "yaponiya": "Япония", "yapon": "Япония", "jap": "Япония",
    "jpn": "Япония", "iapaniya": "Япония",
    "yeni zellandiya": "Новая Зеландия",
    "yunanıstan": "Греция", "gre": "Греция", "grc": "Греция",
    "çexiya": "Чехия",
    "çin": "Китай", "chn": "Китай", "cin": "Китай",
    "özbəkistan": "Узбекистан",
}

_PACK_RE = re.compile(r"\bN\s?(\d+)\b")
_MNN_SPLIT_RE = re.compile(r"\s+-\s+|\s{2,}|[,;\n]")


def _country_key(value: str) -> str:
    # В азербайджанском I/İ/ı пишут вперемешку: «İTALİYA», «Italiya»,
    # «ıtaliya» — одна страна. Сводим все варианты i к одной букве.
    key = value.strip().rstrip(".").lower()
    key = key.replace("i̇", "i").replace("ı", "i")
    return re.sub(r"\s+", " ", key)


COUNTRY_INDEX = {_country_key(k): v for k, v in COUNTRIES.items()}


def _country(value: str | None) -> str:
    return COUNTRY_INDEX.get(_country_key(value or ""), "")


def _price(value) -> float | None:
    try:
        price = round(float(value), 2)
    except (TypeError, ValueError):
        return None
    return price if price > 0 else None


def _mnn(composition: str) -> str:
    parts = []
    for part in _MNN_SPLIT_RE.split(composition or ""):
        part = part.strip(" -–.")
        if part and part not in parts:
            parts.append(part)
    return " + ".join(parts)


def parse_product(item: dict) -> PharmacyProduct | None:
    name = re.sub(r"\s+", " ", (item.get("name_ru") or item.get("name") or ""))
    name = name.strip()
    url_id = item.get("url_id")
    current = _price(item.get("price"))
    if not name or not url_id or current is None:
        return None
    discount = _price(item.get("discount_price"))
    if discount is not None and discount >= current:
        discount = None

    unit = (item.get("vahid") or "").strip().upper()
    composition = (item.get("terkib") or "").strip()
    mnn = _mnn(composition)
    # Форма из скобок точнее кода единицы: «(капли)» вместо «Флакон».
    named_form = bracket_form(name)
    form = named_form or FORMS.get(unit, "")
    # Флакон и туба без состава — чаще косметика: лекарством считаем,
    # только если форма названа в скобках.
    if not (mnn or unit in MEDICINE_UNITS or is_medicine_form(named_form)):
        return None  # косметика, гигиена, изделия

    pack = _PACK_RE.search(name)
    return PharmacyProduct(
        source=AzerimedAdapter.slug,
        sku=str(url_id),
        name=name,
        mnn=mnn,
        trade_name=parse_trade_name(name),
        country=_country(item.get("olke")),
        form=form,
        dosage=parse_dosage(name),
        pack_qty=pack.group(1) if pack else str(item.get("ededsay") or ""),
        price=current,
        price_discount=discount,
        url=f"{SITE_URL}/product/{url_id}",
        # Фото отдаются тоже из-за Cloudflare: в браузере пользователя без
        # cookie проверки они не откроются.
        image_url="",
        extra={
            "name_az": (item.get("name") or "").strip(),
            "composition": composition,
            "unit": unit,
            "country_az": (item.get("olke") or "").strip(),
            "in_stock": bool(item.get("qaliq")),
        },
    )


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _ensure_display() -> subprocess.Popen | None:
    if not sys.platform.startswith("linux") or os.environ.get("DISPLAY"):
        return None
    xvfb = subprocess.Popen(
        ["Xvfb", XVFB_DISPLAY, "-screen", "0", "1366x768x24", "-nolisten",
         "tcp"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    os.environ["DISPLAY"] = XVFB_DISPLAY
    time.sleep(1)
    return xvfb


async def _browser_state(port: int) -> tuple[dict[str, str], str, str]:
    """Cookies сайта, User-Agent и заголовок вкладки — прямо по CDP.

    Playwright тут не нужен: его connect_over_cdp зависает на служебных
    вкладках нового Chromium."""
    base = f"http://127.0.0.1:{port}"
    async with httpx.AsyncClient(timeout=10) as client:
        version = (await client.get(f"{base}/json/version")).json()
        tabs = (await client.get(f"{base}/json/list")).json()
    title = next(
        (t.get("title", "") for t in tabs
         if t.get("type") == "page" and SITE_URL in t.get("url", "")),
        "",
    )
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(
            version["webSocketDebuggerUrl"], max_msg_size=0,
        ) as ws:
            await ws.send_json({"id": 1, "method": "Storage.getCookies"})
            async for msg in ws:
                data = msg.json()
                if data.get("id") == 1:
                    break
    cookies = {
        c["name"]: c["value"]
        for c in data.get("result", {}).get("cookies", [])
        if "aptekonline" in c.get("domain", "")
    }
    return cookies, version.get("User-Agent", ""), title.lower()


async def _open_tab(port: int) -> None:
    base = f"http://127.0.0.1:{port}"
    async with httpx.AsyncClient(timeout=10) as client:
        for _ in range(20):
            try:
                resp = await client.put(f"{base}/json/new?{CHECK_URL}")
            except httpx.HTTPError:
                await asyncio.sleep(0.5)  # браузер ещё стартует
                continue
            resp.raise_for_status()
            return
    raise RuntimeError("Azərimed: браузер не открыл вкладку с сайтом")


async def _reload(port: int) -> None:
    base = f"http://127.0.0.1:{port}"
    async with httpx.AsyncClient(timeout=10) as client:
        tabs = (await client.get(f"{base}/json/list")).json()
    page = next(
        (t for t in tabs
         if t.get("type") == "page" and SITE_URL in t.get("url", "")),
        None,
    )
    if page is None:
        return
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(page["webSocketDebuggerUrl"]) as ws:
            await ws.send_json({"id": 1, "method": "Page.reload"})
            async for msg in ws:
                if msg.json().get("id") == 1:
                    break


async def pass_check() -> tuple[dict[str, str], str]:
    """Пропускает обычный Chromium через проверку Cloudflare; отдаёт его
    cookies и User-Agent."""
    async with async_playwright() as pw:
        executable = pw.chromium.executable_path
    xvfb = _ensure_display()
    port = _free_port()
    profile = tempfile.mkdtemp(prefix="azerimed-")
    args = [
        executable, f"--user-data-dir={profile}",
        f"--remote-debugging-port={port}", "--no-first-run",
        "--no-default-browser-check", "--window-size=1366,768",
        "--disable-dev-shm-usage",
    ]
    if sys.platform.startswith("linux") and os.geteuid() == 0:
        args.insert(1, "--no-sandbox")
    chrome = subprocess.Popen(
        args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        # Адрес из командной строки новый Chromium не открывает — вкладка
        # остаётся пустой. Открываем сайт отдельной вкладкой через CDP.
        await _open_tab(port)
        for attempt in range(CHECK_RELOADS + 1):
            if attempt:
                log.info("Azərimed: проверка не прошла, перезагружаем страницу")
                await _reload(port)
            # Не трогаем страницу, пока проверка идёт.
            await asyncio.sleep(CHECK_WAIT)
            for _ in range(CHECK_POLLS):
                try:
                    cookies, user_agent, title = await _browser_state(port)
                except (httpx.HTTPError, aiohttp.ClientError, ValueError) as e:
                    log.warning("Azərimed: браузер не отвечает по CDP: %s", e)
                    cookies, user_agent, title = {}, "", ""
                passed = "cf_clearance" in cookies and user_agent and not (
                    "moment" in title or "момент" in title
                )
                if passed:
                    return cookies, user_agent
                await asyncio.sleep(CHECK_POLL)
        raise RuntimeError(
            f"Azərimed: проверка Cloudflare не пройдена и после "
            f"{CHECK_RELOADS} перезагрузок"
        )
    finally:
        chrome.terminate()
        try:
            chrome.wait(10)
        except subprocess.TimeoutExpired:
            chrome.kill()
        if xvfb is not None:
            xvfb.terminate()
            os.environ.pop("DISPLAY", None)
        shutil.rmtree(profile, ignore_errors=True)


def _blocked(resp: httpx.Response) -> bool:
    return resp.status_code == 403 or "challenge-platform" in resp.text[:6000]


async def _load_page(
    client: httpx.AsyncClient, number: int,
) -> dict | None:
    params = {
        "categoryId[]": "", "keywords": "", "api_keyword": "",
        "lang": "ru", "perPage": PAGE_SIZE, "page": number,
    }
    for attempt in range(MAX_ATTEMPTS):
        try:
            resp = await client.get(LIST_URL, params=params)
        except httpx.HTTPError as e:
            log.warning(
                "Azərimed: стр. %d, попытка %d/%d: %s",
                number, attempt + 1, MAX_ATTEMPTS, type(e).__name__,
            )
        else:
            if _blocked(resp):
                return None
            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError:
                    log.warning("Azərimed: стр. %d вернула не JSON", number)
            else:
                log.warning(
                    "Azərimed: стр. %d — HTTP %d", number, resp.status_code,
                )
        await asyncio.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Azərimed: стр. {number} не загрузилась")


class AzerimedAdapter(PharmacyAdapter):
    slug = "azerimed"
    display_name = "Azərimed"
    country = "Азербайджан"
    currency = "AZN"

    async def fetch(self) -> AsyncIterator[PharmacyProduct]:
        client = httpx.AsyncClient(
            headers=HEADERS,
            timeout=httpx.Timeout(REQUEST_TIMEOUT, connect=15.0),
            follow_redirects=True,
        )
        try:
            items = await self._load_all(client)
        finally:
            await client.aclose()

        seen: set[str] = set()
        yielded = 0
        for item in items:
            product = parse_product(item)
            if product is None or product.sku in seen:
                continue
            seen.add(product.sku)
            yield product
            yielded += 1
            if self.limit and yielded >= self.limit:
                return

        if yielded == 0:
            raise RuntimeError(
                "Azərimed: не удалось получить ни одного товара "
                "(сайт недоступен или изменился формат каталога)"
            )

    async def _load_all(self, client: httpx.AsyncClient) -> list[dict]:
        items: list[dict] = []
        number, last_page, checks = 1, 1, 0
        while number <= last_page:
            data = await _load_page(client, number)
            if data is None:
                # Cookie Cloudflare живёт меньше часа — проходим заново.
                if checks >= 2:
                    raise RuntimeError(
                        "Azərimed: Cloudflare не пускает даже после проверки"
                    )
                try:
                    cookies, user_agent = await pass_check()
                except PlaywrightError as e:
                    raise RuntimeError(
                        f"Azərimed: браузер не запустился "
                        f"({e.message.splitlines()[0]})"
                    ) from e
                client.cookies.update(cookies)
                client.headers["User-Agent"] = user_agent
                checks += 1
                log.info("Azərimed: проверка Cloudflare пройдена")
                continue
            items += data.get("data") or []
            last_page = int(data.get("last_page") or 1)
            log.info(
                "Azərimed: стр. %d/%d (товаров: %d)",
                number, last_page, len(items),
            )
            if self.limit and len(items) >= self.limit * 3:
                break
            number += 1
        return items
