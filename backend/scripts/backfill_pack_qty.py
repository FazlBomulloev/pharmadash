"""Бэкфил PcEntry.pack_qty_parsed из PcEntry.pack_qty.

Применять один раз после миграции, чтобы заполнить парсенное значение
для уже загруженных строк ПЦ (новые загрузки заполняют его автоматически
в pc_parser.py).

Запуск:
    python -m backend.scripts.backfill_pack_qty            # все рынки
    python -m backend.scripts.backfill_pack_qty --market 1 # один рынок
    python -m backend.scripts.backfill_pack_qty --dry-run  # только показать
    python -m backend.scripts.backfill_pack_qty --force    # перезаписать всё
"""
import argparse
import asyncio
import logging
from sqlalchemy import select

from backend.database import async_session, init_db
from backend.models import PcEntry
from backend.services.normalize import parse_pack_qty


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("backfill_pack_qty")


async def backfill(
    market_id: int | None,
    dry_run: bool,
    force: bool,
) -> None:
    await init_db()
    async with async_session() as db:
        stmt = select(PcEntry)
        if market_id is not None:
            stmt = stmt.where(PcEntry.market_id == market_id)
        if not force:
            stmt = stmt.where(PcEntry.pack_qty_parsed.is_(None))

        rows = (await db.execute(stmt)).scalars().all()
        log.info("Кандидатов: %d", len(rows))

        updated = 0
        skipped_no_source = 0
        skipped_unparseable = 0

        for row in rows:
            if not row.pack_qty:
                skipped_no_source += 1
                continue
            parsed = parse_pack_qty(row.pack_qty)
            if parsed is None:
                skipped_unparseable += 1
                continue
            if not force and row.pack_qty_parsed == parsed:
                continue
            row.pack_qty_parsed = parsed
            updated += 1

        if dry_run:
            log.info(
                "DRY-RUN: обновили бы %d, пропустили без pack_qty %d, "
                "не распарсилось %d",
                updated, skipped_no_source, skipped_unparseable,
            )
            return

        await db.commit()
        log.info(
            "Готово. Обновлено: %d. Пропущено (нет pack_qty): %d. "
            "Не распарсилось: %d.",
            updated, skipped_no_source, skipped_unparseable,
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Бэкфил PcEntry.pack_qty_parsed",
    )
    parser.add_argument(
        "--market", type=int, default=None,
        help="ID рынка (по умолчанию — все рынки)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Только показать, что было бы обновлено",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Перезаписать даже там, где pack_qty_parsed уже заполнен",
    )
    args = parser.parse_args()
    asyncio.run(backfill(args.market, args.dry_run, args.force))


if __name__ == "__main__":
    main()
