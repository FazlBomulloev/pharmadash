import logging
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import BdpRaw, Market
from backend.services.bdp_keys import dose_key, form_key
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

_SCORING_CACHE: dict[tuple, dict] = {}
_CACHE_MAX_ENTRIES = 64
_ROWS_CACHE: dict[int, list] = {}


def invalidate_scoring_cache(market_id: int | None = None) -> None:
    if market_id is None:
        _SCORING_CACHE.clear()
        _ROWS_CACHE.clear()
        return
    _ROWS_CACHE.pop(market_id, None)
    for key in [k for k in _SCORING_CACHE if k[0] == market_id]:
        _SCORING_CACHE.pop(key, None)


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


async def get_market_scoring(
    db: AsyncSession,
    market: Market,
    lf: str | None = None,
    dose: str | None = None,
) -> dict:
    cache_key = (market.id, lf or "", dose or "")
    cached = _SCORING_CACHE.get(cache_key)
    if cached is not None:
        return cached

    rows = await load_scoring_rows(db, market.id)

    forms_doses: dict[str, set[str]] = defaultdict(set)
    keyed = []
    for r in rows:
        f, d = form_key(r), dose_key(r)
        forms_doses[f].add(d)
        keyed.append((f, d, r))

    selection = [
        r for f, d, r in keyed
        if (not lf or f == lf) and (not dose or d == dose)
    ]
    settings = market_settings(market)
    result = compute_scoring(selection, settings)

    all_doses: set[str] = set()
    for doses in forms_doses.values():
        all_doses |= doses
    result["by_mnn"] = {i["mnn"]: i for i in result["items"]}
    result["years"] = parse_years(market)[-3:]
    result["filters"] = {
        "applied": {"lf": lf or None, "dose": dose or None},
        "forms": sorted(
            f for f, doses in forms_doses.items()
            if not dose or dose in doses
        ),
        "doses": sorted(forms_doses[lf] if lf else all_doses),
    }
    result["settings"] = settings.model_dump()

    if len(_SCORING_CACHE) >= _CACHE_MAX_ENTRIES:
        _SCORING_CACHE.pop(next(iter(_SCORING_CACHE)))
    _SCORING_CACHE[cache_key] = result
    return result
