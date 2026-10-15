"""Диагностика доступа к API Watsons с текущей машины. В базу не пишет.

Запуск на сервере (скрипт подаётся в контейнер через stdin, пересборка
не нужна):

    docker compose exec -T backend python - < backend/scripts/diag_watsons.py
"""
from __future__ import annotations

import asyncio
import time

from playwright.async_api import async_playwright

from backend.services.pharmacies import watsons as w

T0 = time.time()


def p(*parts) -> None:
    print(f"[{time.time() - T0:6.1f}s]", *parts, flush=True)


def _is_search(url: str) -> bool:
    return "/products/search" in url


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.firefox.launch()
        context = await browser.new_context(locale="en-PH")
        await context.route("**/*", w._block_media)
        page = await context.new_page()
        page.on("request", lambda r: _is_search(r.url) and p(
            "REQ ", r.method, r.url.split("?")[-1][:90]))
        page.on("response", lambda r: _is_search(r.url) and p(
            "RESP", r.status, r.request.method, r.url.split("?")[-1][:90]))
        page.on("requestfailed", lambda r: _is_search(r.url) and p(
            "FAIL", r.method, r.failure, r.url.split("?")[-1][:90]))

        path = w.CATEGORIES[0][0]
        p("1) открываю витрину", path)
        response = await page.goto(
            w.SITE_URL + path, wait_until="domcontentloaded", timeout=90_000,
        )
        p("   витрина HTTP", response.status if response else None)
        await page.wait_for_timeout(30_000)
        p("   карточек на витрине:",
          await page.locator("e2-product-tile").count())

        p("2) fetch к API изнутри страницы, как в парсере")
        for number in range(4):
            try:
                result = await page.evaluate(
                    w.SEARCH_JS, [w.SEARCH_API, "061200", number, 64],
                )
                products = (result["body"] or {}).get("products") or []
                p(f"   стр. {number}: HTTP {result['status']},"
                  f" товаров {len(products)}")
            except Exception as e:  # noqa: BLE001 — нужна любая причина
                p(f"   стр. {number}: ОШИБКА {str(e).splitlines()[0][:120]}")
            await asyncio.sleep(2)

        p("3) переход по страницам витрины (запрос делает сам сайт)")
        for number in (1, 2):
            await page.goto(
                f"{w.SITE_URL}{path}?currentPage={number}&pageSize=64",
                wait_until="domcontentloaded", timeout=90_000,
            )
            await page.wait_for_timeout(20_000)
            p(f"   стр. {number}: карточек",
              await page.locator("e2-product-tile").count())
        await browser.close()
    p("готово")


asyncio.run(main())
