import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Запуск PharmDash API")
    await init_db()
    yield
    log.info("Остановка PharmDash API")


app = FastAPI(
    title="PharmDash API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.routers import markets, tables, dashboard, references, dictionary  # noqa: E402

app.include_router(markets.router, prefix="/api")
app.include_router(tables.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(references.router, prefix="/api")
app.include_router(dictionary.router, prefix="/api")
