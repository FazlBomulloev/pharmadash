"""Что видят браузеры на сервере, открывая Azərimed. В базу не пишет.

По очереди Chromium и Firefox — обычными процессами, без управления, с
постоянными профилями (backend/data/browser-profiles/…): cookie и
«репутация» сохраняются между запусками. Для каждого — снимок
виртуального экрана, есть ли cookie cf_clearance и пускает ли с ней
httpx. Снимки — в backend/data/diag/.

Запуск на сервере (пересборка образа не нужна):

    docker compose exec -T backend python - < backend/scripts/diag_azerimed_browsers.py
"""
from __future__ import annotations

import asyncio
import configparser
import os
import shutil
import socket
import sqlite3
import struct
import subprocess
import tempfile
import time
import zlib
from pathlib import Path

import aiohttp
import httpx
from playwright.async_api import async_playwright

SITE = "https://aptekonline.az"
URL = f"{SITE}/products"
LIST_URL = f"{SITE}/shop/productList"
DATA = Path("/app/backend/data")
PROFILES = DATA / "browser-profiles"
SHOTS = DATA / "diag"
DISPLAY = ":99"
FB_DIR = Path(tempfile.mkdtemp(prefix="fb-"))
LIST_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": f"{SITE}/",
    "X-Requested-Width": "XMLHttpRequest",
    "checkus": "$2y$10$heJNZP6TbdT.DmpZlHp87u1NY7RqdXXV5Ht/rBbvjSsEIqgi42/ku",
}


# ---------- снимок экрана: Xvfb пишет кадр в XWD, сохраняем PNG ----------

def screenshot(name: str) -> str:
    try:
        return _screenshot(name)
    except Exception as e:  # снимок — подсказка, а не цель проверки
        return f"не получился ({e})"


def unlock(profile: Path) -> None:
    # После прошлого запуска в профиле могут остаться блокировки, и
    # браузер решит, что профиль занят другим процессом.
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket",
                 "parent.lock", ".parentlock", "lock"):
        try:
            (profile / name).unlink()
        except OSError:
            pass


def _screenshot(name: str) -> str:
    raw = (FB_DIR / "Xvfb_screen0").read_bytes()
    head = struct.unpack(">25I", raw[:100])
    header_size, width, height = head[0], head[4], head[5]
    bpp, line, ncolors = head[11], head[12], head[19]
    byte_order = head[7]  # 0 = LSB first
    offset = header_size + ncolors * 12
    rows = []
    for y in range(height):
        row = bytearray([0])
        start = offset + y * line
        for x in range(width):
            px = raw[start + x * (bpp // 8): start + x * (bpp // 8) + 4]
            b, g, r = (px[0], px[1], px[2]) if byte_order == 0 \
                else (px[3], px[2], px[1])
            row += bytes((r, g, b))
        rows.append(bytes(row))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0,
                                        0, 0))
           + chunk(b"IDAT", zlib.compress(b"".join(rows), 6))
           + chunk(b"IEND", b""))
    SHOTS.mkdir(parents=True, exist_ok=True)
    path = SHOTS / f"{name}.png"
    path.write_bytes(png)
    return str(path)


# ---------- проверка cookie ----------

async def try_catalog(cookies: dict[str, str], user_agent: str) -> str:
    async with httpx.AsyncClient(
        headers={**LIST_HEADERS, "User-Agent": user_agent},
        cookies=cookies, timeout=60,
    ) as client:
        resp = await client.get(LIST_URL, params={
            "categoryId[]": "", "keywords": "", "api_keyword": "",
            "lang": "ru", "perPage": 100, "page": 1,
        })
    if resp.status_code == 200 and resp.text.lstrip().startswith("{"):
        return f"ПУСКАЕТ: {len(resp.json().get('data') or [])} товаров"
    return f"не пускает (HTTP {resp.status_code})"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


# ---------- Chromium ----------

async def cdp_cookies(port: int) -> tuple[dict[str, str], str, str]:
    base = f"http://127.0.0.1:{port}"
    async with httpx.AsyncClient(timeout=10) as client:
        version = (await client.get(f"{base}/json/version")).json()
        tabs = (await client.get(f"{base}/json/list")).json()
    title = next((t["title"] for t in tabs
                  if t.get("type") == "page" and SITE in t.get("url", "")), "")
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(version["webSocketDebuggerUrl"],
                                      max_msg_size=0) as ws:
            await ws.send_json({"id": 1, "method": "Storage.getCookies"})
            async for msg in ws:
                data = msg.json()
                if data.get("id") == 1:
                    break
    cookies = {c["name"]: c["value"]
               for c in data.get("result", {}).get("cookies", [])
               if "aptekonline" in c.get("domain", "")}
    return cookies, version.get("User-Agent", ""), title


async def cdp_reload(port: int) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        tabs = (await client.get(f"http://127.0.0.1:{port}/json/list")).json()
    page = next((t for t in tabs
                 if t.get("type") == "page" and SITE in t.get("url", "")), None)
    if page is None:
        return
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(page["webSocketDebuggerUrl"]) as ws:
            await ws.send_json({"id": 1, "method": "Page.reload"})
            async for msg in ws:
                if msg.json().get("id") == 1:
                    break


async def chromium(executable: str) -> None:
    print("\n=== Chromium, постоянный профиль ===", flush=True)
    profile = PROFILES / "azerimed-chromium"
    profile.mkdir(parents=True, exist_ok=True)
    unlock(profile)
    port = free_port()
    proc = subprocess.Popen(
        [executable, "--no-sandbox", f"--user-data-dir={profile}",
         f"--remote-debugging-port={port}", "--no-first-run",
         "--no-default-browser-check", "--window-size=1366,768",
         "--window-position=0,0", "--disable-dev-shm-usage"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for _ in range(40):
                try:
                    await client.put(f"http://127.0.0.1:{port}/json/new?{URL}")
                    break
                except httpx.HTTPError:
                    await asyncio.sleep(1)
        cookies, user_agent, title = {}, "", ""
        for step in range(6):
            await asyncio.sleep(12)
            cookies, user_agent, title = await cdp_cookies(port)
            print(f"  +{time.monotonic() - started:.0f} с: заголовок "
                  f"{title!r}, cf_clearance: {'cf_clearance' in cookies}",
                  flush=True)
            if step == 0:
                print("  снимок:", screenshot("chromium-1"))
            if "cf_clearance" in cookies:
                break
            if step in (1, 3):
                await cdp_reload(port)
                print("  перезагрузка страницы", flush=True)
        print("  снимок:", screenshot("chromium-2"))
        if "cf_clearance" in cookies:
            print("  каталог с cookie:", await try_catalog(cookies, user_agent))
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()


# ---------- Firefox ----------

def firefox_user_agent(executable: str) -> str:
    ini = configparser.ConfigParser()
    ini.read(Path(executable).parent / "application.ini")
    major = ini.get("App", "Version", fallback="0").split(".")[0]
    return (f"Mozilla/5.0 (X11; Linux x86_64; rv:{major}.0) "
            f"Gecko/20100101 Firefox/{major}.0")


def firefox_cookies(profile: Path) -> dict[str, str]:
    db = profile / "cookies.sqlite"
    if not db.exists():
        return {}
    tmp = Path(tempfile.mkdtemp())
    for suffix in ("", "-wal", "-shm"):
        src = Path(f"{db}{suffix}")
        if src.exists():
            shutil.copy(src, tmp / f"cookies.sqlite{suffix}")
    con = sqlite3.connect(tmp / "cookies.sqlite")
    try:
        rows = con.execute(
            "SELECT name, value FROM moz_cookies WHERE host LIKE '%aptekonline%'"
        ).fetchall()
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)
    return dict(rows)


async def firefox(executable: str) -> None:
    print("\n=== Firefox, постоянный профиль ===", flush=True)
    profile = PROFILES / "azerimed-firefox"
    profile.mkdir(parents=True, exist_ok=True)
    unlock(profile)
    (profile / "user.js").write_text(
        'user_pref("browser.shell.checkDefaultBrowser", false);\n'
        'user_pref("browser.startup.homepage_override.mstone", "ignore");\n'
        'user_pref("datareporting.policy.dataSubmissionEnabled", false);\n'
        'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);\n'
    )
    started = time.monotonic()
    proc = subprocess.Popen(
        [executable, "-profile", str(profile), "-no-remote",
         "-width", "1366", "-height", "768", URL],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        await asyncio.sleep(20)
        print("  снимок:", screenshot("firefox-1"))
        await asyncio.sleep(25)
        print("  снимок:", screenshot("firefox-2"))
    finally:
        # Мягкое закрытие: Firefox сбрасывает cookie на диск.
        proc.terminate()
        try:
            proc.wait(20)
        except subprocess.TimeoutExpired:
            proc.kill()
    cookies = firefox_cookies(profile)
    print(f"  +{time.monotonic() - started:.0f} с: cookie сайта "
          f"{sorted(cookies)}", flush=True)
    if "cf_clearance" in cookies:
        user_agent = firefox_user_agent(executable)
        print("  User-Agent:", user_agent)
        print("  каталог с cookie:", await try_catalog(cookies, user_agent))


async def main() -> None:
    xvfb = subprocess.Popen(
        ["Xvfb", DISPLAY, "-screen", "0", "1366x768x24", "-nolisten", "tcp",
         "-fbdir", str(FB_DIR)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    os.environ["DISPLAY"] = DISPLAY
    time.sleep(1)
    try:
        async with async_playwright() as pw:
            chromium_exe = pw.chromium.executable_path
            firefox_exe = pw.firefox.executable_path
        await chromium(chromium_exe)
        await firefox(firefox_exe)
    finally:
        xvfb.terminate()
        shutil.rmtree(FB_DIR, ignore_errors=True)
    print("\nСнимки:", ", ".join(sorted(p.name for p in SHOTS.glob("*.png"))))
    print("На сервере они в ~/pharmadash/backend/data/diag/")


asyncio.run(main())
