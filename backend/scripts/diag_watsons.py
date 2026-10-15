"""Диагностика загрузки страниц Watsons с текущей машины. В базу не пишет.

Открывает несколько страниц категории так же, как парсер (Firefox без
JavaScript), и показывает HTTP-статус, время и число товаров из
вложенного в HTML состояния витрины (wtcph-state).

Запуск на сервере (скрипт подаётся в контейнер через stdin, пересборка
не нужна):

    docker compose exec -T backend python - < backend/scripts/diag_watsons.py
"""
from __future__ import annotations

import asyncio
import time

from playwright.async_api import async_playwright

from backend.services.pharmacies import watsons as w

PAGES = 4


async def main() -> None:
    async with async_playwright() as pw:
        browser = await getattr(pw, w.BROWSER).launch()
        context = await browser.new_context(
            locale="en-PH", java_script_enabled=False,
        )
        await context.route("**/*", w._block_media)
        page = await context.new_page()
        path = w.CATEGORIES[0][0]
        for number in range(PAGES):
            url = w.page_url(path, number)
            started = time.time()
            try:
                status, html = await w._page_html(page, url)
                results = w.search_results(html) if html else None
            except Exception as e:  # noqa: BLE001 — нужна любая причина
                print(f"стр. {number}: ОШИБКА {str(e).splitlines()[0][:120]}",
                      flush=True)
                continue
            products = (results or {}).get("products") or []
            print(
                f"стр. {number}: HTTP {status}, {time.time() - started:.1f} с,"
                f" HTML {len(html) // 1024} КБ,"
                f" pagination={(results or {}).get('pagination')},"
                f" товаров {len(products)}",
                flush=True,
            )
            await asyncio.sleep(2)
        await browser.close()


asyncio.run(main())
