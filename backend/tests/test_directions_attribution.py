from types import SimpleNamespace

import pytest

from backend.services.directions import (
    UNALLOCATED,
    attribute_usd,
    invalidate_direction_map,
    load_direction_map,
    pair_key,
)
from backend.models import MnnDirection


def row(mnn, lf, usd3, usd1=0.0, usd2=0.0):
    return SimpleNamespace(
        mnn=mnn, lf_avp=lf, lf=None,
        usd_y1=usd1, usd_y2=usd2, usd_y3=usd3,
    )


def test_pair_key_normalises_case_and_spaces():
    assert pair_key(" clobetasol ", " d-crm ") == ("CLOBETASOL", "D-CRM")


def test_pair_key_handles_none():
    assert pair_key(None, None) == ("", "")


def test_full_coverage_splits_usd_by_share():
    dmap = {("A", "TC-TAB"): [("Дерматология", 0.6), ("Педиатрия", 0.4)]}
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 100.0)], dmap)

    assert by_dir["Дерматология"][2] == pytest.approx(60.0)
    assert by_dir["Педиатрия"][2] == pytest.approx(40.0)
    assert rest[2] == pytest.approx(0.0)


def test_partial_shares_put_shortfall_into_rest():
    dmap = {("A", "TC-TAB"): [("Дерматология", 0.6), ("Педиатрия", 0.3)]}
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 100.0)], dmap)

    assert by_dir["Дерматология"][2] == pytest.approx(60.0)
    assert rest[2] == pytest.approx(10.0)


def test_missing_pair_goes_entirely_to_rest():
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 100.0)], {})

    assert by_dir == {}
    assert rest[2] == pytest.approx(100.0)


def test_reconciles_exactly_on_mixed_input():
    dmap = {
        ("A", "TC-TAB"): [("Дерматология", 0.6), ("Педиатрия", 0.4)],
        ("B", "D-CRM"): [("Терапия", 0.9)],
    }
    items = [
        row("A", "TC-TAB", 100.0, 80.0, 90.0),
        row("B", "D-CRM", 50.0, 40.0, 45.0),
        row("C", "SYR", 7.5, 7.0, 7.2),
    ]
    by_dir, rest = attribute_usd(items, dmap)

    for k in range(3):
        total_in = sum(getattr(i, f"usd_y{k + 1}") for i in items)
        total_out = sum(v[k] for v in by_dir.values()) + rest[k]
        assert total_out == pytest.approx(total_in)


def test_empty_map_sends_everything_to_rest_without_error():
    items = [row("A", "TC-TAB", 10.0), row("B", "D-CRM", 20.0)]
    by_dir, rest = attribute_usd(items, {})

    assert by_dir == {}
    assert rest[2] == pytest.approx(30.0)


def test_zero_usd_pair_produces_no_phantom_money():
    dmap = {("A", "TC-TAB"): [("Дерматология", 1.0)]}
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 0.0)], dmap)

    assert by_dir.get("Дерматология", [0, 0, 0])[2] == pytest.approx(0.0)
    assert rest[2] == pytest.approx(0.0)


def test_lf_falls_back_when_lf_avp_empty():
    item = SimpleNamespace(
        mnn="A", lf_avp=None, lf="TC-TAB",
        usd_y1=0.0, usd_y2=0.0, usd_y3=100.0,
    )
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    by_dir, rest = attribute_usd([item], dmap)

    assert by_dir["Терапия"][2] == pytest.approx(100.0)
    assert rest[2] == pytest.approx(0.0)


def test_unallocated_label_is_russian():
    assert UNALLOCATED == "Не распределено"


async def test_load_direction_map_reads_rows_and_caches(db):
    invalidate_direction_map()
    db.add_all([
        MnnDirection(mnn="A", lf="TC-TAB", direction="Терапия", share=0.7),
        MnnDirection(mnn="A", lf="TC-TAB", direction="Педиатрия", share=0.3),
    ])
    await db.commit()

    dmap = await load_direction_map(db)
    assert sorted(dmap[("A", "TC-TAB")]) == [
        ("Педиатрия", 0.3), ("Терапия", 0.7),
    ]

    db.add(MnnDirection(mnn="B", lf="D-CRM", direction="Терапия", share=1.0))
    await db.commit()
    assert ("B", "D-CRM") not in await load_direction_map(db)

    invalidate_direction_map()
    assert ("B", "D-CRM") in await load_direction_map(db)
