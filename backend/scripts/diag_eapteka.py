"""Диагностика загрузки каталога eApteka с текущей машины. В базу не пишет.

Делает то же, что парсер: проходит проверку антибота в контексте с JS,
переносит cookies в контекст без JS и читает в нём страницы — сначала по
одной, затем параллельно во вкладках, как при полном сборе.

Запуск на сервере:

    docker compose exec -T backend python - < backend/scripts/diag_eapteka.py
"""
from __future__ import annotations

import asyncio
import time

from playwright.async_api import async_playwright

from backend.services.pharmacies import eapteka as e

SINGLE = (1, 2, 100)
PARALLEL = (250, 251, 252, 253, 254, 255)


def url(number: int) -> str:
    return f"{e.BASE_URL}{e.CATEGORY_URLS[0]}?PAGEN_1={number}"


def line(number: int, started: float, html: str | None) -> str:
    cards = e.parse_listing(html) if html else []
    result = "НЕ ОТКРЫЛАСЬ" if html is None else f"товаров {len(cards)}"
    sample = f", напр. {cards[0].name[:45]!r} {cards[0].price}" if cards else ""
    return f"стр. {number}: {time.time() - started:.1f} с, {result}{sample}"


async def main() -> None:
    async with async_playwright() as pw:
        browser = await getattr(pw, e.BROWSER).launch()
        session = e.Session(browser)
        await session.open()

        started = time.time()
        await session.pass_check(url(1), session.generation)
        print(f"проверка антибота: {time.time() - started:.1f} с", flush=True)

        tab = await session.new_tab()
        for number in SINGLE:
            started = time.time()
            print(line(number, started, await e.load_page(session, tab, url(number))),
                  flush=True)

        tabs = [await session.new_tab() for _ in range(e.TABS)]
        started = time.time()
        queue = list(PARALLEL)

        async def worker(t):
            out = []
            while queue:
                n = queue.pop(0)
                out.append((n, await e.load_page(session, t, url(n))))
            return out

        results = [r for chunk in await asyncio.gather(*(worker(t) for t in tabs))
                   for r in chunk]
        took = time.time() - started
        ok = sum(1 for _, h in results if h and e.parse_listing(h))
        print(f"параллельно {e.TABS} вкладки: {len(PARALLEL)} стр. за {took:.1f} с,"
              f" с товарами {ok}/{len(PARALLEL)}", flush=True)
        await browser.close()


asyncio.run(main())
