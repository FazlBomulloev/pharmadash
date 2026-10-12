import logging
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import BdpRaw, Market
from backend.services.scoring import compute_scoring
from backend.services.scoring_settings import ScoringSettings, load_settings
from backend.services.year_shift import parse_years

log = logging.getLogger(__name__)

_SCORING_COLS = (
    BdpRaw.mnn, BdpRaw.producer, BdpRaw.country_mfr, BdpRaw.sector,
    BdpRaw.atc, BdpRaw.lf, BdpRaw.lf_avp, BdpRaw.strength,
    BdpRaw.usd_y1, BdpRaw.usd_y2, BdpRaw.usd_y3,
    BdpRaw.un_y1, BdpRaw.un_y2, BdpRaw.un_y3,
)

_SCORING_CACHE: dict[int, dict] = {}
_ROWS_CACHE: dict[int, list] = {}


def invalidate_scoring_cache(market_id: int | None = None) -> None:
    if market_id is None:
        _SCORING_CACHE.clear()
        _ROWS_CACHE.clear()
        return
    _ROWS_CACHE.pop(market_id, None)
    _SCORING_CACHE.pop(market_id, None)


def market_settings(market: Market) -> ScoringSettings:
    return load_settings(market.scoring_settings_json)


async def load_scoring_rows(db: AsyncSession, market_id: int) -> list:
    rows = _ROWS_CACHE.get(market_id)
    if rows is None:
        rows = (await db.execute(
            select(*_SCORING_COLS).where(BdpRaw.market_id == market_id)
        )).all()
        _ROWS_CACHE[market_id] = rows
    return rows


async def get_market_scoring(db: AsyncSession, market: Market) -> dict:
    cached = _SCORING_CACHE.get(market.id)
    if cached is not None:
        return cached

    rows = await load_scoring_rows(db, market.id)
    settings = market_settings(market)
    result = compute_scoring(rows, settings)

    by_mnn: dict[str, list[dict]] = defaultdict(list)
    for i in result["items"]:
        by_mnn[i["mnn"]].append(i)
    result["by_mnn"] = dict(by_mnn)
    result["forms"] = sorted({i["lf"] for i in result["items"]})
    result["years"] = parse_years(market)[-3:]
    result["settings"] = settings.model_dump()

    _SCORING_CACHE[market.id] = result
    return result


def mnn_scoring_item(
    scoring: dict, mnn: str, lf: str | None = None,
) -> dict | None:
    pairs = scoring["by_mnn"].get(mnn, [])
    if lf:
        return next((i for i in pairs if i["lf"] == lf), None)
    return max(pairs, key=lambda i: i["sales"][2], default=None)
