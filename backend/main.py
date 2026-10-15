import asyncio
import logging
import time
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from backend.config import CORS_ORIGINS
from backend.database import init_db
from backend.routers.overview import prewarm_all_overviews
from backend.services.pharmacies.scheduler import (
    start_scheduler, stop_scheduler,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Запуск PharmDash API")
    await init_db()
    start_scheduler()
    # Без прогрева первый открывший обзор после перезапуска ждёт
    # полного пересчёта.
    prewarm = asyncio.create_task(prewarm_all_overviews())
    yield
    prewarm.cancel()
    try:
        await prewarm
    except asyncio.CancelledError:
        log.info("Прогрев кеша обзора прерван остановкой сервера")
    stop_scheduler()
    log.info("Остановка PharmDash API")


app = FastAPI(
    title="PharmDash API",
    version="1.0.0",
    lifespan=lifespan,
)

# Раньше здесь стоял allow_origins=["*"] вместе с allow_credentials=True.
# В такой паре CORSMiddleware отражает любой Origin и разрешает ему слать
# cookie — то есть любой сайт, открытый у вошедшего человека, мог бы читать
# весь API от его имени. С появлением сессионной аутентификации это
# недопустимо. И в продакшене (nginx отдаёт фронтенд и проксирует /api), и в
# разработке (vite проксирует /api) запросы идут с того же источника, поэтому
# по умолчанию cross-origin не разрешён никому.
if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    log.info("CORS разрешён для: %s", ", ".join(CORS_ORIGINS))


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    dt_ms = (time.perf_counter() - t0) * 1000
    if request.url.path.startswith("/api") and dt_ms >= 100:
        log.info(
            "%s %s → %d %.0fms",
            request.method, request.url.path,
            response.status_code, dt_ms,
        )
    return response

from backend.routers import (  # noqa: E402
    markets, dashboard, overview, drilldown, pharmacies, scoring, directions,
    auth,
)
from backend.services.auth import require_user  # noqa: E402

_protected = [Depends(require_user)]


app.include_router(auth.router, prefix="/api")
app.include_router(
    markets.router, prefix="/api", dependencies=_protected,
)
app.include_router(
    dashboard.router, prefix="/api", dependencies=_protected,
)
app.include_router(
    overview.router, prefix="/api", dependencies=_protected,
)
app.include_router(
    drilldown.router, prefix="/api", dependencies=_protected,
)
app.include_router(
    pharmacies.router, prefix="/api", dependencies=_protected,
)
app.include_router(
    scoring.router, prefix="/api", dependencies=_protected,
)
app.include_router(
    directions.router, prefix="/api", dependencies=_protected,
)
