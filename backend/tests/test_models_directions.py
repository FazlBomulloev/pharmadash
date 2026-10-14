import json

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.models import DirectionImport, MnnDirection


async def test_mnn_direction_roundtrip(db):
    db.add(MnnDirection(
        mnn="CLOBETASOL", lf="D-CRM",
        direction="Дерматология", share=0.85,
    ))
    await db.commit()

    rows = (await db.execute(select(MnnDirection))).scalars().all()
    assert len(rows) == 1
    assert rows[0].mnn == "CLOBETASOL"
    assert rows[0].share == 0.85


async def test_mnn_direction_rejects_duplicate_triple(db):
    for _ in range(2):
        db.add(MnnDirection(
            mnn="CLOBETASOL", lf="D-CRM",
            direction="Дерматология", share=0.85,
        ))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_direction_import_stores_report(db):
    db.add(DirectionImport(
        filename="Направления_01.xlsx",
        rows_count=72262, pairs_count=20414, directions_count=35,
        report_json=json.dumps({"skipped": 0}, ensure_ascii=False),
    ))
    await db.commit()

    row = (await db.execute(select(DirectionImport))).scalars().one()
    assert row.rows_count == 72262
    assert json.loads(row.report_json)["skipped"] == 0
    assert row.uploaded_at is not None
