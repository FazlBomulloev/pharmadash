"""Скоринг рынка (уровень МНН) и «Настройки рынка».

  GET /markets/{market_id}/scoring?lf=&dose=&category=&passed=&q=
      &sort=&order=&page=&page_size=
  GET /markets/{market_id}/settings
  PUT /markets/{market_id}/settings
  POST /markets/{market_id}/settings/preview
"""
import asyncio
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
    load_scoring_rows,
    market_settings,
)
from backend.services.scoring import CATEGORIES, compute_scoring
from backend.services.scoring_query import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    filter_items,
    paginate,
    preview_counts,
    sort_items,
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
    category: str | None = Query(None),
    passed: bool = Query(False),
    q: str | None = Query(None),
    sort: str = Query("rank"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
):
    market = await _get_market(db, market_id)
    if category and category not in CATEGORIES:
        raise HTTPException(400, "Неизвестная категория скоринга")
    scoring = await get_market_scoring(db, market, lf, dose)
    matched = sort_items(
        filter_items(scoring["items"], category, passed, q), sort, order,
    )
    return {
        "market_id": market.id,
        "years": scoring["years"],
        "filters": scoring["filters"],
        # сводка — по всей выборке ЛФ/дозировки, а не по странице
        "summary": scoring["summary"],
        "thresholds": scoring["settings"]["thresholds"],
        "weights": scoring["settings"]["weights"],
        "total": len(matched),
        "page": page,
        "page_size": page_size,
        "items": paginate(matched, page, page_size),
    }


async def _distinct(db: AsyncSession, market_id: int, column) -> list[str]:
    result = await db.execute(
        select(column, func.sum(BdpRaw.usd_y3))
        .where(BdpRaw.market_id == market_id)
        .group_by(column)
        .order_by(func.sum(BdpRaw.usd_y3).desc())
    )
    return [r[0] for r in result.all() if r[0]]


async def _country_options(db: AsyncSession, market_id: int) -> list[dict]:
    """Страны производителей в БДП рынка с числом позиций."""
    result = await db.execute(
        select(BdpRaw.country_mfr, func.count())
        .where(BdpRaw.market_id == market_id)
        .group_by(BdpRaw.country_mfr)
        .order_by(func.sum(BdpRaw.usd_y3).desc())
    )
    return [{"value": r[0], "count": r[1]} for r in result.all() if r[0]]


async def _settings_payload(db: AsyncSession, market: Market) -> dict:
    return {
        "market_id": market.id,
        "settings": market_settings(market).model_dump(),
        "defaults": ScoringSettings().model_dump(),
        # значения, реально встречающиеся в БДП рынка, — для справочников
        "classes": await _distinct(db, market.id, BdpRaw.atc),
        "forms": await _distinct(db, market.id, BdpRaw.lf_avp),
        "countries": await _distinct(db, market.id, BdpRaw.country_mfr),
        "country_options": await _country_options(db, market.id),
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


@router.post("/{market_id}/settings/preview")
async def preview_settings(
    market_id: int,
    body: ScoringSettings,
    db: AsyncSession = Depends(get_db),
):
    """Пересчёт скоринга с черновиком настроек без сохранения."""
    market = await _get_market(db, market_id)
    if body == market_settings(market):
        # черновик совпадает с сохранёнными настройками — берём готовый расчёт
        return preview_counts(await get_market_scoring(db, market))
    rows = await load_scoring_rows(db, market_id)
    scoring = await asyncio.to_thread(compute_scoring, rows, body)
    return preview_counts(scoring)
