"""Скоринг рынка (уровень МНН) и «Настройки рынка».

  GET /markets/{market_id}/scoring?lf=&dose=
  GET /markets/{market_id}/settings
  PUT /markets/{market_id}/settings
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import BdpRaw, Market
from backend.routers.dashboard import invalidate_dashboard_cache
from backend.routers.overview import invalidate_overview_cache
from backend.services.market_scoring import (
    get_market_scoring,
    invalidate_scoring_cache,
    market_settings,
)
from backend.services.scoring_settings import ScoringSettings, dump_settings

log = logging.getLogger(__name__)
router = APIRouter(prefix="/markets", tags=["scoring"])


async def _get_market(db: AsyncSession, market_id: int) -> Market:
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")
    return market


@router.get("/{market_id}/scoring")
async def market_scoring(
    market_id: int,
    lf: str | None = Query(None),
    dose: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    market = await _get_market(db, market_id)
    scoring = await get_market_scoring(db, market, lf, dose)
    return {
        "market_id": market.id,
        "years": scoring["years"],
        "filters": scoring["filters"],
        "summary": scoring["summary"],
        "items": scoring["items"],
    }


async def _distinct(db: AsyncSession, market_id: int, column) -> list[str]:
    result = await db.execute(
        select(column, func.sum(BdpRaw.usd_y3))
        .where(BdpRaw.market_id == market_id)
        .group_by(column)
        .order_by(func.sum(BdpRaw.usd_y3).desc())
    )
    return [r[0] for r in result.all() if r[0]]


async def _settings_payload(db: AsyncSession, market: Market) -> dict:
    return {
        "market_id": market.id,
        "settings": market_settings(market).model_dump(),
        "defaults": ScoringSettings().model_dump(),
        # значения, реально встречающиеся в БДП рынка, — для справочников
        "classes": await _distinct(db, market.id, BdpRaw.atc),
        "forms": await _distinct(db, market.id, BdpRaw.lf_avp),
        "countries": await _distinct(db, market.id, BdpRaw.country_mfr),
    }


@router.get("/{market_id}/settings")
async def get_settings(
    market_id: int,
    db: AsyncSession = Depends(get_db),
):
    market = await _get_market(db, market_id)
    return await _settings_payload(db, market)


@router.put("/{market_id}/settings")
async def update_settings(
    market_id: int,
    body: ScoringSettings,
    db: AsyncSession = Depends(get_db),
):
    market = await _get_market(db, market_id)
    market.scoring_settings_json = dump_settings(body)
    await db.commit()
    await db.refresh(market)

    invalidate_scoring_cache(market_id)
    invalidate_dashboard_cache(market_id)
    invalidate_overview_cache(market_id)
    log.info("Настройки рынка id=%d обновлены", market_id)
    return await _settings_payload(db, market)
