import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from backend.config import DATABASE_URL, FX_RATE_USD_RUB_DEFAULT

log = logging.getLogger(__name__)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

async_session = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db():
    async with async_session() as session:
        yield session


_MIGRATIONS = [
    ("markets", "fx_rate_usd_rub", "FLOAT"),
    ("markets", "fx_rate_date", "DATE"),
    ("pc_entry", "pack_qty_parsed", "FLOAT"),
]


async def _apply_migrations(conn):
    for table, column, ddl_type in _MIGRATIONS:
        existing = await conn.execute(text(f"PRAGMA table_info({table})"))
        cols = {row[1] for row in existing.fetchall()}
        if column not in cols:
            await conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")
            )
            log.info("Миграция: %s.%s добавлена", table, column)

    await conn.execute(
        text(
            "UPDATE markets SET fx_rate_usd_rub = :rate "
            "WHERE fx_rate_usd_rub IS NULL"
        ),
        {"rate": FX_RATE_USD_RUB_DEFAULT},
    )


async def init_db():
    from backend.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _apply_migrations(conn)
    log.info("База данных инициализирована")
