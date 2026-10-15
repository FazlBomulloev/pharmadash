import logging
import time

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from backend.database import async_session
from backend.models import Market
from backend.routers.drilldown import prewarm_drilldown_market
from backend.routers.overview import prewarm_overview_market

log = logging.getLogger(__name__)

_RUNNING: set[int] = set()
_AGAIN: set[int] = set()


async def _prewarm_once(market_id: int) -> None:
    async with async_session() as db:
        market = await db.get(Market, market_id)
        if market is None:
            return
        try:
            await prewarm_overview_market(db, market)
            await prewarm_drilldown_market(db, market)
        except HTTPException as e:
            log.info(
                "Прогрев рынка %d пропущен: %s", market_id, e.detail,
            )
        except SQLAlchemyError:
            log.exception("Прогрев рынка %d: ошибка базы", market_id)


async def prewarm_market(market_id: int) -> None:
    # Запрос на прогрев во время прогрева не теряется: данные могли
    # смениться, и посчитанное до этого кеш уже не примет.
    if market_id in _RUNNING:
        _AGAIN.add(market_id)
        return
    _RUNNING.add(market_id)
    try:
        while True:
            _AGAIN.discard(market_id)
            t0 = time.perf_counter()
            await _prewarm_once(market_id)
            log.info(
                "Кеш рынка %d прогрет за %.1f с",
                market_id, time.perf_counter() - t0,
            )
            if market_id not in _AGAIN:
                break
    finally:
        _RUNNING.discard(market_id)


async def prewarm_all_markets() -> None:
    t0 = time.perf_counter()
    async with async_session() as db:
        market_ids = (await db.execute(select(Market.id))).scalars().all()
    for market_id in market_ids:
        await prewarm_market(market_id)
    log.info(
        "Кеш всех рынков прогрет: рынков %d, %.1f с",
        len(market_ids), time.perf_counter() - t0,
    )
