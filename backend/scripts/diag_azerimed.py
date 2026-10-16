"""Диагностика доступа к каталогу Azərimed с текущей машины. В базу не пишет.

Обычный Chromium в виртуальном экране Xvfb должен сам пройти проверку
Cloudflare и отдать cookie, после чего каталог качает httpx. Скрипт
показывает, проходит ли проверка с IP сервера, сколько она длится и
сколько памяти свободно до и после.

Запуск на сервере (после пересборки образа — нужен Xvfb):

    docker compose exec -T backend python - < backend/scripts/diag_azerimed.py
"""
from __future__ import annotations

import asyncio
import time

import httpx

from backend.services.pharmacies import azerimed as a


def free_mb() -> str:
    try:
        with open("/proc/meminfo") as f:
            info = {l.split(":")[0]: int(l.split()[1]) for l in f}
        return f"{info['MemAvailable'] // 1024} МБ"
    except OSError:
        return "?"


async def main() -> None:
    print("Свободно памяти до проверки:", free_mb())
    started = time.monotonic()
    try:
        cookies, user_agent = await a.pass_check()
    except Exception as e:
        print(f"ПРОВЕРКА НЕ ПРОЙДЕНА за {time.monotonic() - started:.0f} с: {e}")
        return
    print(f"Проверка пройдена за {time.monotonic() - started:.0f} с")
    print("User-Agent:", user_agent)
    print("Свободно памяти после закрытия браузера:", free_mb())

    async with httpx.AsyncClient(
        headers={**a.HEADERS, "User-Agent": user_agent}, cookies=cookies,
        timeout=a.REQUEST_TIMEOUT,
    ) as client:
        started = time.monotonic()
        data = await a._load_page(client, 1)
    if data is None:
        print("Каталог: Cloudflare не пустил httpx с этими cookie")
        return
    items = data.get("data") or []
    products = [p for p in map(a.parse_product, items) if p]
    print(
        f"Каталог: стр. 1 из {data.get('last_page')}, {len(items)} товаров "
        f"за {time.monotonic() - started:.1f} с, лекарств {len(products)}"
    )
    for p in products[:3]:
        print("  ", p.name, "|", p.mnn, "|", p.country, "|", p.price)


asyncio.run(main())
