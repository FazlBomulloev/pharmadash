import logging
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from backend.config import DATABASE_URL

log = logging.getLogger(__name__)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)



@event.listens_for(engine.sync_engine, "connect")
def _sqlite_pragmas(dbapi_connection, _record):
    """WAL: запись парсеров БДЦ (идёт из отдельного процесса) не блокирует
    чтение дашборда. busy_timeout: вместо ошибки «database is locked»
    соединение ждёт освобождения базы."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


async_session = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db():
    async with async_session() as session:
        yield session


_MIGRATIONS = [
    ("pharmacy_prices", "image_url", "TEXT"),
    ("markets", "scoring_settings_json", "TEXT"),
]

# Колонки, которых больше нет в моделях. NOT NULL без дефолта ломает
# INSERT в старых базах, поэтому удаляем их вместе с индексами.
_DROPPED_COLUMNS = [
    ("bdp_raw", "mnn_canonical"),
    ("bdp_raw", "lf_canonical"),
    ("bdp_raw", "producer_canonical"),
    ("bdp_raw", "sector_canonical"),
    ("markets", "fx_rate_usd_rub"),
    ("markets", "fx_rate_date"),
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

    for table, column in _DROPPED_COLUMNS:
        existing = await conn.execute(text(f"PRAGMA table_info({table})"))
        cols = {row[1] for row in existing.fetchall()}
        if column in cols:
            await conn.execute(
                text(f"DROP INDEX IF EXISTS ix_{table}_{column}")
            )
            await conn.execute(
                text(f"ALTER TABLE {table} DROP COLUMN {column}")
            )
            log.info("Миграция: %s.%s удалена", table, column)


async def init_db():
    from backend.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _apply_migrations(conn)
        # осиротевшие запуски парсеров (сервер упал/перезапустился в
        # разгар работы) помечаем как error, чтобы в UI не висело "running"
        await conn.execute(
            text(
                "UPDATE pharmacy_source_runs "
                "SET status = 'error', "
                "    finished_at = CURRENT_TIMESTAMP, "
                "    error = COALESCE(error, 'Прервано при перезапуске сервера') "
                "WHERE status = 'running'"
            )
        )
    log.info("База данных инициализирована")
