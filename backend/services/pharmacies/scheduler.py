from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .registry import ADAPTERS
from .runner import launch_background

log = logging.getLogger(__name__)

DAILY_HOUR = 6  # 06:00 локального времени сервера
DAILY_MINUTE = 0

_scheduler: AsyncIOScheduler | None = None


def _daily_all():
    for slug in ADAPTERS:
        launched = launch_background(slug)
        log.info(
            "Плановый запуск %s: %s",
            slug, "стартовал" if launched else "уже идёт, пропуск",
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
