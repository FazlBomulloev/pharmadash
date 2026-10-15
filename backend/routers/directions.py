import asyncio
import json
import logging
import shutil

from fastapi import (
    APIRouter, Depends, File, HTTPException, Query, UploadFile,
)
from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import DIRECTIONS_FILE, UPLOAD_DIR
from backend.database import get_db
from backend.services.permissions import require
from backend.models import DirectionImport, MnnDirection
from backend.routers.dashboard import invalidate_dashboard_cache
from backend.routers.overview import invalidate_overview_cache
from backend.schemas import (
    DirectionMetaResponse,
    DirectionRowsResponse,
    DirectionUploadResponse,
)
from backend.services.directions import invalidate_direction_map
from backend.services.parsers.directions_parser import (
    DirectionsParseError, parse_directions,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/directions", tags=["directions"])

INSERT_BATCH = 5000


@router.post("/upload", response_model=DirectionUploadResponse, dependencies=[Depends(require("directions:write"))])
async def upload_directions(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Допустим только формат .xlsx")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(DIRECTIONS_FILE, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        rows, report = await asyncio.to_thread(
            parse_directions, DIRECTIONS_FILE,
        )
    except DirectionsParseError as e:
        raise HTTPException(400, str(e))

    if not rows:
        raise HTTPException(
            400,
            "В файле не найдено ни одной корректной строки. "
            "Проверьте колонки МНН, ЛФ, Направление, Процент.",
        )

    await db.execute(delete(MnnDirection))
    for start in range(0, len(rows), INSERT_BATCH):
        await db.execute(insert(MnnDirection), rows[start:start + INSERT_BATCH])

    db.add(DirectionImport(
        filename=file.filename,
        rows_count=report["rows_accepted"],
        pairs_count=report["pairs_count"],
        directions_count=report["directions_count"],
        report_json=json.dumps(report, ensure_ascii=False),
    ))
    await db.commit()

    invalidate_direction_map()
    invalidate_overview_cache()
    invalidate_dashboard_cache()
    log.info(
        "Справочник направлений обновлён из «%s»: %d строк",
        file.filename, report["rows_accepted"],
    )
    return DirectionUploadResponse(**report)


@router.get("/meta", response_model=DirectionMetaResponse)
async def directions_meta(db: AsyncSession = Depends(get_db)):
    last = (
        await db.execute(
            select(DirectionImport)
            .order_by(DirectionImport.uploaded_at.desc())
            .limit(1)
        )
    ).scalars().first()

    rows_count = (
        await db.execute(select(func.count()).select_from(MnnDirection))
    ).scalar_one()
    pairs_count = (
        await db.execute(
            select(func.count()).select_from(
                select(MnnDirection.mnn, MnnDirection.lf)
                .distinct()
                .subquery()
            )
        )
    ).scalar_one()
    directions = [
        r[0] for r in (
            await db.execute(
                select(MnnDirection.direction)
                .distinct()
                .order_by(MnnDirection.direction)
            )
        ).all()
    ]
    forms = [
        r[0] for r in (
            await db.execute(
                select(MnnDirection.lf).distinct().order_by(MnnDirection.lf)
            )
        ).all()
    ]

    return DirectionMetaResponse(
        filename=last.filename if last else None,
        uploaded_at=(
            last.uploaded_at.isoformat() if last and last.uploaded_at else None
        ),
        rows_count=rows_count,
        pairs_count=pairs_count,
        directions=directions,
        forms=forms,
        report=json.loads(last.report_json) if last and last.report_json else None,
    )


@router.get("/rows", response_model=DirectionRowsResponse)
async def directions_rows(
    q: str | None = Query(None),
    direction: str | None = Query(None),
    lf: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if q and q.strip():
        filters.append(MnnDirection.mnn.ilike(f"%{q.strip().upper()}%"))
    if direction:
        filters.append(MnnDirection.direction == direction)
    if lf:
        filters.append(MnnDirection.lf == lf.strip().upper())

    total = (
        await db.execute(
            select(func.count()).select_from(MnnDirection).where(*filters)
        )
    ).scalar_one()

    rows = (
        await db.execute(
            select(MnnDirection)
            .where(*filters)
            .order_by(
                MnnDirection.mnn, MnnDirection.lf,
                MnnDirection.share.desc(),
            )
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).scalars().all()

    return DirectionRowsResponse(
        items=[
            {
                "mnn": r.mnn, "lf": r.lf,
                "direction": r.direction, "share": r.share,
            }
            for r in rows
        ],
        total=total,
        page=page,
        per_page=per_page,
    )
