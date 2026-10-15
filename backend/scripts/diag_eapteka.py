"""Диагностика доступа к каталогу eApteka с текущей машины. В базу не пишет.

Firefox проходит JS-проверку антибота и отдаёт cookies, после чего браузер
закрывается, а страницы каталога качает обычный httpx с этими cookies и
User-Agent браузера. Скрипт показывает, пускает ли антибот такие запросы:
сначала по одному, затем параллельно.

Вся логика — в этом файле, пересборка образа не нужна. Запуск на сервере:

    docker compose exec -T backend python - < backend/scripts/diag_eapteka.py
"""
from __future__ import annotations

import asyncio
import time

import httpx
from playwright.async_api import async_playwright

from backend.services.pharmacies import eapteka as e

SINGLE = (1, 2, 100, 250, 400)
PARALLEL = tuple(range(300, 312))
CONCURRENCY = 4


def url(number: int) -> str:
    return f"{e.BASE_URL}{e.CATEGORY_URLS[0]}?PAGEN_1={number}"


async def browser_cookies() -> tuple[dict[str, str], str]:
    async with async_playwright() as pw:
        browser = await pw.firefox.launch()
        context = await browser.new_context(locale="ru-RU")
        await context.route("**/*", e._block_media)
        page = await context.new_page()
        await page.goto(url(1), wait_until="domcontentloaded", timeout=60_000)
        try:
            await page.wait_for_selector(
                e.CARD_SELECTOR, state="attached", timeout=30_000,
            )
        except Exception as exc:  # noqa: BLE001 — нужна любая причина
            print("  каталог в браузере не появился:", str(exc).splitlines()[0])
        user_agent = await page.evaluate("navigator.userAgent")
        cookies = {c["name"]: c["value"] for c in await context.cookies()
                   if "eapteka" in c["domain"]}
        await browser.close()
    return cookies, user_agent


async def get(client: httpx.AsyncClient, number: int) -> str:
    started = time.time()
    try:
        response = await client.get(url(number))
        html = response.text
        cards = len(e.parse_listing(html)) if response.status_code == 200 else 0
        note = " (страница антибота)" if e._is_antibot(html) else ""
        return (f"стр. {number}: HTTP {response.status_code}{note},"
                f" {time.time() - started:.1f} с, товаров {cards}")
    except httpx.HTTPError as exc:
        return f"стр. {number}: ОШИБКА {type(exc).__name__} {exc}"[:150]


async def main() -> None:
    started = time.time()
    cookies, user_agent = await browser_cookies()
    print(f"1) Firefox прошёл проверку и закрыт: {time.time() - started:.1f} с,"
          f" cookies: {sorted(cookies)}", flush=True)
    print(f"   User-Agent: {user_agent}", flush=True)

    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
    }
    async with httpx.AsyncClient(
        headers=headers, cookies=cookies, timeout=40, follow_redirects=True,
    ) as client:
        print("2) httpx с cookies браузера, по одной странице:", flush=True)
        for number in SINGLE:
            print("  ", await get(client, number), flush=True)

        print(f"3) httpx параллельно по {CONCURRENCY}:", flush=True)
        sem = asyncio.Semaphore(CONCURRENCY)

        async def limited(number: int) -> str:
            async with sem:
                return await get(client, number)

        started = time.time()
        for line in await asyncio.gather(*(limited(n) for n in PARALLEL)):
            print("  ", line, flush=True)
        print(f"   {len(PARALLEL)} стр. за {time.time() - started:.1f} с", flush=True)

    async with httpx.AsyncClient(headers=headers, timeout=40) as bare:
        print("4) для сравнения — httpx без cookies:", flush=True)
        print("  ", await get(bare, 2), flush=True)


asyncio.run(main())
