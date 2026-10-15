from __future__ import annotations

import asyncio
import logging
import time

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .registry import ADAPTERS
from .runner import is_running, launch_background

log = logging.getLogger(__name__)

DAILY_HOUR = 6
DAILY_MINUTE = 0
POLL_SECONDS = 15
MAX_WAIT_SECONDS = 2 * 3600

_scheduler: AsyncIOScheduler | None = None


async def _wait_finished(slug: str) -> bool:
    deadline = time.monotonic() + MAX_WAIT_SECONDS
    while is_running(slug):
        if time.monotonic() > deadline:
            return False
        await asyncio.sleep(POLL_SECONDS)
    return True


async def _daily_all():
    # Строго по очереди: сервер слабый (2 ядра, 2 ГБ), а eApteka, Watsons
    # и MedsGo гоняют браузер. Одновременный старт всех парсеров съедал
    # всю память, и страницы переставали грузиться.
    for slug in ADAPTERS:
        if launch_background(slug):
            log.info("Плановый запуск %s: стартовал", slug)
        else:
            log.info("Плановый запуск %s: уже идёт, ждём окончания", slug)
        if await _wait_finished(slug):
            log.info("Плановый запуск %s: завершён", slug)
        else:
            log.warning(
                "Плановый запуск %s: идёт дольше %d ч, запускаем следующий",
                slug, MAX_WAIT_SECONDS // 3600,
            )


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _daily_all,
        CronTrigger(hour=DAILY_HOUR, minute=DAILY_MINUTE),
        id="pharmacies_daily",
        replace_existing=True,
    )
    _scheduler.start()
    log.info(
        "Планировщик БДЦ запущен, ежедневно в %02d:%02d",
        DAILY_HOUR, DAILY_MINUTE,
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    log.info("Планировщик БДЦ остановлен")
