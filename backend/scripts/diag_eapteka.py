"""Диагностика загрузки каталога eApteka с текущей машины. В базу не пишет.

Открывает несколько страниц категории так же, как парсер (Firefox,
прохождение JS-проверки антибота), и показывает время и число товаров.

Запуск на сервере:

    docker compose exec -T backend python - < backend/scripts/diag_eapteka.py
"""
from __future__ import annotations

import asyncio
import time

from playwright.async_api import async_playwright

from backend.services.pharmacies import eapteka as e

PAGES = (1, 2, 100, 250)


async def main() -> None:
    category = e.CATEGORY_URLS[0]
    async with async_playwright() as pw:
        browser = await getattr(pw, e.BROWSER).launch()
        context = await browser.new_context(locale="ru-RU")
        await context.route("**/*", e._block_media)
        page = await context.new_page()
        for number in PAGES:
            url = f"{e.BASE_URL}{category}?PAGEN_1={number}"
            started = time.time()
            html = await e.load_page(page, url)
            cards = e.parse_listing(html) if html else []
            print(
                f"стр. {number}: {time.time() - started:.1f} с,"
                f" {'НЕ ОТКРЫЛАСЬ' if html is None else f'товаров {len(cards)}'}"
                + (f", напр. {cards[0].name[:50]!r} {cards[0].price}"
                   if cards else ""),
                flush=True,
            )
        await browser.close()


asyncio.run(main())
