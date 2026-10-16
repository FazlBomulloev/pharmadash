from __future__ import annotations

import logging
import re
from datetime import date

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.models import CurrencyRate

log = logging.getLogger(__name__)

# Оба источника бесплатные, без ключа, обновляются раз в сутки и отдают
# все валюты мира. Второй — запасной, если первый недоступен.
PRIMARY_URL = "https://open.er-api.com/v6/latest/USD"
FALLBACK_URL = (
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest"
    "/v1/currencies/usd.json"
)
REQUEST_TIMEOUT = 30
_CODE_RE = re.compile(r"^[A-Z]{3}$")

# Курсы на дату: {"2026-10-16": {"RUB": 83.8, ...}}. Меняются раз в сутки,
# поэтому держим последнюю загруженную дату в памяти.
_cache: dict[str, dict[str, float]] = {}


def _clean(rates: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for code, value in rates.items():
        code = str(code).upper()
        if not _CODE_RE.match(code):
            continue
        try:
            value = float(value)
        except (TypeError, ValueError):
            continue
        if value > 0:
            out[code] = value
    out["USD"] = 1.0
    return out


async def _download() -> tuple[dict[str, float], str]:
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT, follow_redirects=True,
    ) as client:
        try:
            resp = await client.get(PRIMARY_URL)
            resp.raise_for_status()
            data = resp.json()
            if data.get("result") == "success":
                return _clean(data.get("rates") or {}), "open.er-api.com"
            log.warning("Курсы: open.er-api.com ответил %s", data.get("result"))
        except (httpx.HTTPError, ValueError) as e:
            log.warning("Курсы: open.er-api.com недоступен: %s", e)
        resp = await client.get(FALLBACK_URL)
        resp.raise_for_status()
        return _clean(resp.json().get("usd") or {}), "fawazahmed0"


async def refresh_rates() -> int:
    """Загружает курсы всех валют на сегодня. Возвращает число валют."""
    try:
        rates, source = await _download()
    except (httpx.HTTPError, ValueError) as e:
        log.error("Курсы валют не загружены: %s", e)
        return 0
    if len(rates) < 2:
        log.error("Курсы валют: источник %s вернул пустой список", source)
        return 0
    today = date.today().isoformat()
    async with async_session() as db:
        await db.execute(
            delete(CurrencyRate).where(CurrencyRate.rate_date == today)
        )
        db.add_all(
            CurrencyRate(
                rate_date=today, code=code, per_usd=value, source=source,
            )
            for code, value in rates.items()
        )
        await db.commit()
    _cache.clear()
    _cache[today] = rates
    log.info("Курсы валют на %s: %d валют (%s)", today, len(rates), source)
    return len(rates)


async def refresh_if_stale() -> None:
    async with async_session() as db:
        latest = (await db.execute(
            select(func.max(CurrencyRate.rate_date))
        )).scalar()
    if latest != date.today().isoformat():
        await refresh_rates()


async def usd_rates(db: AsyncSession) -> dict[str, float]:
    """Последние загруженные курсы: код валюты → единиц за 1 USD."""
    latest = (await db.execute(
        select(func.max(CurrencyRate.rate_date))
    )).scalar()
    if latest is None:
        return {"USD": 1.0}
    cached = _cache.get(latest)
    if cached is not None:
        return cached
    rows = (await db.execute(
        select(CurrencyRate.code, CurrencyRate.per_usd)
        .where(CurrencyRate.rate_date == latest)
    )).all()
    rates = {code: value for code, value in rows}
    rates["USD"] = 1.0
    _cache.clear()
    _cache[latest] = rates
    return rates


def to_usd(
    amount: float | None, currency: str, rates: dict[str, float],
) -> float | None:
    rate = rates.get(currency)
    if amount is None or not rate:
        return None
    return round(amount / rate, 2)
