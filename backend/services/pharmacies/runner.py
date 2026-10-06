from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import delete, insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.models import PharmacyPrice, PharmacySourceRun

from .base import PharmacyProduct
from .registry import get_adapter

log = logging.getLogger(__name__)

_active_runs: dict[str, asyncio.Task] = {}
_locks: dict[str, asyncio.Lock] = {}
BATCH_SIZE = 500


def _lock(slug: str) -> asyncio.Lock:
    if slug not in _locks:
        _locks[slug] = asyncio.Lock()
    return _locks[slug]


def is_running(slug: str) -> bool:
    task = _active_runs.get(slug)
    return task is not None and not task.done()


async def run_source(
    slug: str, limit: Optional[int] = None,
) -> int:
    """Snapshot-обновление: очищает старые записи источника, кладёт свежие.
    Возвращает количество загруженных товаров."""
    async with _lock(slug):
        adapter_cls = get_adapter(slug)
        adapter = adapter_cls(limit=limit)

        run_id: int
        async with async_session() as db:
            run = PharmacySourceRun(source=slug, status="running")
            db.add(run)
            await db.commit()
            await db.refresh(run)
            run_id = run.id

        started = datetime.utcnow()
        count = 0
        error_msg: str | None = None
        rows: list[dict] = []

        try:
            async for product in adapter.fetch():
                if not isinstance(product, PharmacyProduct):
                    continue
                rows.append(_to_row(product))

            async with async_session() as db:
                await db.execute(
                    delete(PharmacyPrice)
                    .where(PharmacyPrice.source == slug)
                )
                for start in range(0, len(rows), BATCH_SIZE):
                    batch = rows[start:start + BATCH_SIZE]
                    await _flush(db, batch)
                    count += len(batch)

            log.info(
                "Пharmacy %s: снапшот обновлён (%d записей за %.1f с)",
                slug, count,
                (datetime.utcnow() - started).total_seconds(),
            )

        except Exception as e:  # noqa: BLE001
            error_msg = f"{type(e).__name__}: {e}"
            log.exception("Пharmacy %s: ошибка запуска", slug)

        async with async_session() as db:
            run = await db.get(PharmacySourceRun, run_id)
            if run is not None:
                run.finished_at = datetime.utcnow()
                run.items_count = count
                run.status = "error" if error_msg else "success"
                run.error = error_msg
                await db.commit()

        return count


def _to_row(p: PharmacyProduct) -> dict:
    return {
        "source": p.source,
        "sku": p.sku or None,
        "name": p.name or "",
        "mnn": p.mnn or None,
        "trade_name": p.trade_name or None,
        "manufacturer": p.manufacturer or None,
        "country": p.country or None,
        "form": p.form or None,
        "dosage": p.dosage or None,
        "pack_qty": p.pack_qty or None,
        "price": p.price,
        "price_discount": p.price_discount,
        "url": p.url or None,
        "image_url": p.image_url or None,
        "extra_json": p.extra_json(),
        "scraped_at": datetime.utcnow(),
    }


async def _flush(db: AsyncSession, rows: list[dict]) -> None:
    if not rows:
        return
    await db.execute(insert(PharmacyPrice), rows)
    await db.commit()


def launch_background(
    slug: str, limit: Optional[int] = None,
) -> bool:
    """Запустить обновление в фоне. Возвращает False, если уже идёт."""
    if is_running(slug):
        return False

    async def _job():
        try:
            await run_source(slug, limit=limit)
        finally:
            _active_runs.pop(slug, None)

    task = asyncio.create_task(_job())
    _active_runs[slug] = task
    return True
