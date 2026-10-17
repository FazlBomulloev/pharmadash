"""Постоянный браузер Azərimed с экраном noVNC — эксперимент.

С IP сервера Cloudflare показывает галочку «Verify you are human». Здесь
Chromium с постоянным профилем работает всё время в виртуальном экране;
человек один раз проходит галочку через noVNC, а скрипт раз в 5 минут
нажимает F5 (как с клавиатуры, через xdotool) и пишет в журнал, пускает
ли сайт с текущей cookie. Парсер берёт cookie у этого браузера.

Запуск на сервере (нужен AZERIMED_VNC_PASSWORD в .env):

    docker compose exec backend python backend/scripts/azerimed_session.py background
    docker compose exec backend python backend/scripts/azerimed_session.py status
    docker compose exec backend python backend/scripts/azerimed_session.py stop

Экран — только через SSH-туннель с компьютера:

    ssh -L 6080:127.0.0.1:6080 root@<сервер>
    http://localhost:6080/vnc.html
"""
from __future__ import annotations

import asyncio
import datetime as dt
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import httpx  # noqa: E402

from backend.services.pharmacies import azerimed as a  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"
PROFILE = DATA / "browser-profiles" / "azerimed-session"
LOG = DATA / "azerimed_session.log"
PIDS = Path("/tmp/azerimed_session.pids")
DISPLAY = ":98"
VNC_PORT = 5900
WEB_PORT = 6080
CHECK_EVERY = 60
RELOAD_EVERY = 20 * 60


def log(text: str) -> None:
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {text}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def spawn(args: list[str], **kw) -> subprocess.Popen:
    proc = subprocess.Popen(
        args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw,
    )
    # Сразу в файл: если запуск дальше упадёт, stop() найдёт что убрать.
    with PIDS.open("a") as f:
        f.write(f" {proc.pid}")
    return proc


def unlock() -> None:
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            (PROFILE / name).unlink()
        except OSError:
            pass


async def catalog_ok(cookies: dict[str, str], user_agent: str) -> bool:
    async with httpx.AsyncClient(
        headers={**a.HEADERS, "User-Agent": user_agent},
        cookies=cookies, timeout=30,
    ) as client:
        resp = await client.get(a.LIST_URL, params={
            "categoryId[]": "", "keywords": "", "api_keyword": "",
            "lang": "ru", "perPage": 1, "page": 1,
        })
    return resp.status_code == 200 and resp.text.lstrip().startswith("{")


def press_f5() -> None:
    subprocess.run(
        ["xdotool", "search", "--onlyvisible", "--class", "chromium",
         "windowactivate", "--sync", "key", "F5"],
        env={**os.environ, "DISPLAY": DISPLAY},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20,
    )


async def start() -> None:
    try:
        await _run()
    except Exception as e:
        log(f"Сессия упала: {type(e).__name__}: {e}")
        stop()
        raise


def background() -> None:
    """Запускает сессию отдельным процессом, отвязанным от окна SSH."""
    out = (DATA / "azerimed_session.out").open("a", encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve()), "start"],
        stdin=subprocess.DEVNULL, stdout=out, stderr=out,
        start_new_session=True, cwd=str(Path(__file__).resolve().parents[2]),
    )
    print(f"Сессия запускается в фоне (процесс {proc.pid}). Журнал: status")


async def _run() -> None:
    password = os.environ.get("AZERIMED_VNC_PASSWORD", "")
    if len(password) < 6:
        sys.exit("Задайте AZERIMED_VNC_PASSWORD (от 6 символов) в .env")
    if await a.session_cookies() is not None or _alive():
        sys.exit("Сессия уже запущена: azerimed_session.py status")

    PROFILE.mkdir(parents=True, exist_ok=True)
    unlock()
    PIDS.write_text("")
    env = {**os.environ, "DISPLAY": DISPLAY}
    procs = [spawn(["Xvfb", DISPLAY, "-screen", "0", "1366x768x24",
                    "-nolisten", "tcp"])]
    time.sleep(1)

    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        executable = pw.chromium.executable_path
    procs.append(spawn([
        executable, "--no-sandbox", f"--user-data-dir={PROFILE}",
        f"--remote-debugging-port={a.SESSION_PORT}", "--no-first-run",
        "--no-default-browser-check", "--window-position=0,0",
        "--window-size=1366,768", "--disable-dev-shm-usage",
    ], env=env))

    passfile = Path("/tmp/azerimed_vnc.pass")
    subprocess.run(["x11vnc", "-storepasswd", password, str(passfile)],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   check=True)
    procs.append(spawn([
        "x11vnc", "-display", DISPLAY, "-rfbauth", str(passfile),
        "-localhost", "-forever", "-shared", "-rfbport", str(VNC_PORT),
    ]))
    # Порт 6080 проброшен только на 127.0.0.1 сервера (docker-compose).
    procs.append(spawn([
        "websockify", "--web", "/usr/share/novnc", f"0.0.0.0:{WEB_PORT}",
        f"localhost:{VNC_PORT}",
    ]))

    await a._open_tab(a.SESSION_PORT, procs[1], "/dev/null")
    log("Сессия запущена. Откройте экран через noVNC и пройдите проверку.")

    passed_before: bool | None = None
    last_reload = time.monotonic()
    while True:
        await asyncio.sleep(CHECK_EVERY)
        if procs[1].poll() is not None:
            log("Браузер закрылся — сессия остановлена")
            break
        reload = passed_before and \
            time.monotonic() - last_reload >= RELOAD_EVERY
        if reload:
            press_f5()
            last_reload = time.monotonic()
            await asyncio.sleep(20)
        try:
            cookies, user_agent, title = await a._browser_state(a.SESSION_PORT)
            passed = "cf_clearance" in cookies and await catalog_ok(
                cookies, user_agent,
            )
        except Exception as e:
            log(f"Ошибка проверки: {e}")
            continue
        if reload or passed != passed_before:
            state = "сайт пускает" if passed else (
                f"НЕ пускает, на странице: {title or '—'}"
            )
            log(("после F5: " if reload else "") + state)
        passed_before = passed


def _alive() -> bool:
    if not PIDS.exists():
        return False
    for pid in PIDS.read_text().split():
        try:
            stat = Path(f"/proc/{int(pid)}/stat").read_text()
        except (OSError, ValueError):
            continue
        # Завершённый процесс, которого никто не убрал, — «зомби» (Z).
        if stat.rsplit(")", 1)[-1].split()[0] != "Z":
            return True
    return False


def stop() -> None:
    if not PIDS.exists():
        print("Сессия не запущена")
        return
    for pid in PIDS.read_text().split():
        try:
            os.kill(int(pid), signal.SIGTERM)
        except (OSError, ValueError):
            pass
    PIDS.unlink()
    subprocess.run(["pkill", "-f", "azerimed_session.py start"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log("Сессия остановлена")


def status() -> None:
    print("Запущена" if _alive() else "Не запущена")
    if LOG.exists():
        print("".join(LOG.read_text(encoding="utf-8").splitlines(True)[-20:]))


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "status"
    if command == "start":
        asyncio.run(start())
    elif command == "background":
        background()
    elif command == "stop":
        stop()
    else:
        status()
