import random
from types import SimpleNamespace

import pytest

from backend.services import directions

from backend.services.directions import (
    UNALLOCATED,
    attribute_usd,
    build_direction_detail,
    build_mnn_directions,
    build_overview_directions,
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


@pytest.mark.parametrize("empty", [None, "", "  "])
def test_lf_falls_back_when_lf_avp_empty(empty):
    item = SimpleNamespace(
        mnn="A", lf_avp=empty, lf="TC-TAB",
        usd_y1=0.0, usd_y2=0.0, usd_y3=100.0,
    )
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    by_dir, rest = attribute_usd([item], dmap)

    assert by_dir["Терапия"][2] == pytest.approx(100.0)
    assert rest[2] == pytest.approx(0.0)


def test_unallocated_label_is_russian():
    assert UNALLOCATED == "Не распределено"


async def test_load_direction_map_reads_rows_and_caches(db):
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


def test_reconciles_exactly_on_many_awkward_shares():
    dmap = {
        ("A", "TC-TAB"): [("Терапия", 0.1), ("Педиатрия", 0.2),
                          ("ЛОР", 0.7)],
        ("B", "D-CRM"): [("Дерматология", 0.33), ("Терапия", 0.33),
                         ("Педиатрия", 0.33)],
        ("C", "I-VIAL"): [("Онкология", 1.0)],
    }
    items = []
    for i in range(300):
        items.append(row("A", "TC-TAB", 1234.567 + i, 1000.1 + i, 900.9 + i))
        items.append(row("B", "D-CRM", 99.99 + i, 88.88 + i, 77.77 + i))
        items.append(row("C", "I-VIAL", 7.5 + i, 6.5 + i, 5.5 + i))
        items.append(row("D", "SYR", 3.3 + i, 2.2 + i, 1.1 + i))

    by_dir, rest = attribute_usd(items, dmap)

    for k in range(3):
        total_in = sum(getattr(i, f"usd_y{k + 1}") for i in items)
        total_out = sum(v[k] for v in by_dir.values()) + rest[k]
        assert abs(total_out - total_in) < 1e-6, f"год {k + 1}"


def test_shares_over_hundred_are_normalised_not_inflated():
    dmap = {("A", "TC-TAB"): [("Терапия", 0.7), ("Педиатрия", 0.6)]}
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 100.0)], dmap)

    assert sum(v[2] for v in by_dir.values()) + rest[2] == pytest.approx(100.0)
    assert by_dir["Терапия"][2] == pytest.approx(100.0 * 0.7 / 1.3)
    assert rest[2] == pytest.approx(0.0)


def test_none_in_usd_fields_is_treated_as_zero():
    item = SimpleNamespace(
        mnn="A", lf_avp="TC-TAB", lf=None,
        usd_y1=None, usd_y2=None, usd_y3=100.0,
    )
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    by_dir, rest = attribute_usd([item], dmap)

    assert by_dir["Терапия"][0] == pytest.approx(0.0)
    assert by_dir["Терапия"][2] == pytest.approx(100.0)


def test_empty_items_returns_empty_result():
    by_dir, rest = attribute_usd([], {("A", "TC-TAB"): [("Терапия", 1.0)]})

    assert by_dir == {}
    assert rest == [0.0, 0.0, 0.0]


async def test_load_direction_map_normalises_stored_case(db):
    db.add(MnnDirection(
        mnn="aspirin", lf="tc-tab", direction="Терапия", share=1.0,
    ))
    await db.commit()

    dmap = await load_direction_map(db)
    assert ("ASPIRIN", "TC-TAB") in dmap


def test_invalidate_bumps_generation_and_clears_cache():
    gen = directions._MAP_GEN
    directions._MAP_CACHE = {("X", "Y"): [("Терапия", 1.0)]}
    invalidate_direction_map()
    assert directions._MAP_CACHE is None
    assert directions._MAP_GEN == gen + 1
    invalidate_direction_map()
    assert directions._MAP_GEN == gen + 2


async def test_load_fills_cache(db):
    db.add(MnnDirection(mnn="A", lf="TC-TAB", direction="Терапия", share=1.0))
    await db.commit()
    assert directions._MAP_CACHE is None
    await load_direction_map(db)
    assert directions._MAP_CACHE is not None


async def test_stale_load_does_not_overwrite_cache_after_invalidation(
    db, monkeypatch,
):
    db.add(MnnDirection(mnn="A", lf="TC-TAB", direction="Терапия", share=1.0))
    await db.commit()

    real_execute = db.execute

    async def racing_execute(*args, **kwargs):
        result = await real_execute(*args, **kwargs)
        invalidate_direction_map()  # заливка справочника посреди чтения
        return result

    monkeypatch.setattr(db, "execute", racing_execute)

    dmap = await load_direction_map(db)
    assert ("A", "TC-TAB") in dmap  # запросу отдаётся то, что он прочитал
    assert directions._MAP_CACHE is None  # но устаревший кеш не записан


def test_overview_directions_sorted_with_tail_rows():
    dmap = {
        ("A", "TC-TAB"): [("Терапия", 1.0)],
        ("B", "TC-TAB"): [("Педиатрия", 1.0)],
        ("C", "TC-TAB"): [("ЛОР", 1.0)],
    }
    items = [
        row("A", "TC-TAB", 300.0, 100.0, 200.0),
        row("B", "TC-TAB", 200.0, 100.0, 100.0),
        row("C", "TC-TAB", 100.0, 100.0, 100.0),
        row("D", "SYR", 400.0, 400.0, 400.0),
    ]
    out = build_overview_directions(items, dmap, top_n=2)

    assert [o["name"] for o in out] == [
        "Терапия", "Педиатрия", "Прочие направления", UNALLOCATED,
    ]
    assert [o["kind"] for o in out] == [
        "direction", "direction", "other", "unallocated",
    ]
    assert out[0]["usd"] == pytest.approx(300.0)
    assert out[2]["usd"] == pytest.approx(100.0)
    assert out[3]["usd"] == pytest.approx(400.0)
    assert out[0]["share"] == pytest.approx(0.3)
    assert out[0]["growth"] == pytest.approx(0.5)


def test_overview_directions_omits_tail_rows_when_empty():
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    out = build_overview_directions(
        [row("A", "TC-TAB", 100.0, 100.0, 100.0)], dmap, top_n=5,
    )

    assert [o["name"] for o in out] == ["Терапия"]


def test_overview_directions_on_empty_reference():
    items = [row("A", "TC-TAB", 100.0, 100.0, 100.0)]
    out = build_overview_directions(items, {}, top_n=5)

    assert [o["name"] for o in out] == [UNALLOCATED]
    assert out[0]["share"] == pytest.approx(1.0)


def test_overview_directions_on_zero_money_market():
    out = build_overview_directions([row("A", "TC-TAB", 0.0)], {}, top_n=5)

    assert out == []


def test_mnn_directions_splits_by_form_and_rolls_up():
    dmap = {
        ("A", "D-CRM"): [("Дерматология", 0.85), ("Педиатрия", 0.15)],
        ("A", "D-OINT"): [("Дерматология", 1.0)],
    }
    items = [
        row("A", "D-CRM", 100.0),
        row("A", "D-OINT", 100.0),
        row("A", "D-SOL", 50.0),
    ]
    out = build_mnn_directions(items, dmap)

    assert out["total"]["usd"] == pytest.approx(250.0)
    derm = next(r for r in out["total"]["rows"] if r["name"] == "Дерматология")
    assert derm["usd"] == pytest.approx(185.0)
    assert derm["share"] == pytest.approx(185.0 / 250.0)

    forms = {f["form"]: f for f in out["forms"]}
    assert forms["D-CRM"]["in_reference"] is True
    assert forms["D-SOL"]["in_reference"] is False
    assert forms["D-SOL"]["rows"] == []
    assert [f["form"] for f in out["forms"]] == ["D-CRM", "D-OINT", "D-SOL"]


def test_mnn_directions_includes_unallocated_row_in_total():
    dmap = {("A", "D-CRM"): [("Дерматология", 1.0)]}
    out = build_mnn_directions(
        [row("A", "D-CRM", 100.0), row("A", "SYR", 100.0)], dmap,
    )

    rest = next(r for r in out["total"]["rows"] if r["name"] == UNALLOCATED)
    assert rest["usd"] == pytest.approx(100.0)
    assert rest["share"] == pytest.approx(0.5)


def test_direction_detail_lists_pairs_and_kpi():
    dmap = {
        ("A", "D-CRM"): [("Дерматология", 0.8), ("Педиатрия", 0.2)],
        ("B", "D-GEL"): [("Дерматология", 0.5)],
    }
    items = [
        row("A", "D-CRM", 100.0, 60.0, 80.0),
        row("B", "D-GEL", 100.0, 100.0, 100.0),
    ]
    out = build_direction_detail(items, dmap, "Дерматология", 1000.0)

    assert out["name"] == "Дерматология"
    assert out["kpi"]["usd_y3"] == pytest.approx(130.0)
    assert out["kpi"]["share_of_market"] == pytest.approx(0.13)
    assert out["kpi"]["pairs_count"] == 2
    assert out["kpi"]["mnns_count"] == 2
    assert [p["mnn"] for p in out["pairs"]] == ["A", "B"]
    assert out["pairs"][0]["usd_y3"] == pytest.approx(80.0)
    assert out["pairs"][0]["share_in_pair"] == pytest.approx(0.8)
    assert [f["form"] for f in out["forms"]] == ["D-CRM", "D-GEL"]


def test_direction_detail_unknown_name_is_empty_not_error():
    dmap = {("A", "D-CRM"): [("Дерматология", 1.0)]}
    out = build_direction_detail(
        [row("A", "D-CRM", 100.0)], dmap, "Космонавтика", 1000.0,
    )

    assert out["pairs"] == []
    assert out["kpi"]["usd_y3"] == pytest.approx(0.0)
    assert out["kpi"]["share_of_market"] == pytest.approx(0.0)


def test_direction_detail_normalises_shares_over_100_percent():
    dmap = {("A", "D-CRM"): [("Дерматология", 0.8), ("Педиатрия", 0.8)]}
    items = [row("A", "D-CRM", 100.0, 100.0, 100.0)]
    out = build_direction_detail(items, dmap, "Дерматология", 100.0)

    assert out["kpi"]["usd_y3"] == pytest.approx(50.0)
    assert out["pairs"][0]["share_in_pair"] == pytest.approx(0.5)


def test_float_noise_does_not_produce_phantom_unallocated_row():
    # Доли в сумме ровно 1.0, но невязка даёт шум порядка 1e-14
    dmap = {
        ("A", "TC-TAB"): [("Терапия", 0.1), ("Педиатрия", 0.2),
                          ("ЛОР", 0.7)],
    }
    rng = random.Random(1)  # фиксированное зерно: шум воспроизводим
    items = [row("A", "TC-TAB", rng.random() * 1000, rng.random() * 1000,
                 rng.random() * 1000) for _ in range(200)]

    out = build_overview_directions(items, dmap, top_n=5)

    assert all(o["kind"] != "unallocated" for o in out), (
        f"фантомная строка остатка: "
        f"{[(o['name'], o['usd']) for o in out if o['kind'] == 'unallocated']}"
    )


def test_real_unallocated_amount_still_shown():
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    items = [row("A", "TC-TAB", 100.0, 100.0, 100.0),
             row("B", "SYR", 5.0, 5.0, 5.0)]

    out = build_overview_directions(items, dmap, top_n=5)
    rest_row = next(o for o in out if o["kind"] == "unallocated")

    assert rest_row["usd"] == pytest.approx(5.0)


def test_mnn_directions_float_noise_does_not_produce_phantom_row():
    dmap = {
        ("A", "TC-TAB"): [("Терапия", 0.1), ("Педиатрия", 0.2),
                          ("ЛОР", 0.7)],
    }
    rng = random.Random(1)  # фиксированное зерно: шум воспроизводим
    items = [row("A", "TC-TAB", rng.random() * 1000, rng.random() * 1000,
                 rng.random() * 1000) for _ in range(200)]

    out = build_mnn_directions(items, dmap)

    assert all(r["name"] != UNALLOCATED for r in out["total"]["rows"])


def test_form_block_rows_reconcile_with_form_usd():
    dmap = {("A", "D-CRM"): [("Дерматология", 0.85)]}
    out = build_mnn_directions([row("A", "D-CRM", 100.0)], dmap)

    form = out["forms"][0]
    assert sum(r["usd"] for r in form["rows"]) == pytest.approx(form["usd"])
    rest = next(r for r in form["rows"] if r["name"] == UNALLOCATED)
    assert rest["usd"] == pytest.approx(15.0)
    assert rest["share"] == pytest.approx(0.15)


def test_overview_directions_sort_unsorted_input_with_name_tiebreak():
    dmap = {
        ("A", "TC-TAB"): [("Аллергология", 1.0)],
        ("B", "TC-TAB"): [("Яхтенная медицина", 1.0)],
        ("C", "TC-TAB"): [("Онкология", 1.0)],
    }
    items = [
        row("A", "TC-TAB", 100.0, 100.0, 100.0),
        row("B", "TC-TAB", 100.0, 100.0, 100.0),
        row("C", "TC-TAB", 500.0, 500.0, 500.0),
    ]
    out = build_overview_directions(items, dmap, top_n=10)

    assert [o["name"] for o in out] == [
        "Онкология", "Аллергология", "Яхтенная медицина",
    ]


def test_mnn_directions_sorts_forms_by_money_desc():
    dmap = {
        ("A", "D-SOL"): [("Дерматология", 1.0)],
        ("A", "D-CRM"): [("Дерматология", 1.0)],
    }
    items = [row("A", "D-SOL", 10.0), row("A", "D-CRM", 90.0)]
    out = build_mnn_directions(items, dmap)

    assert [f["form"] for f in out["forms"]] == ["D-CRM", "D-SOL"]


def test_direction_detail_sorts_pairs_by_money_desc():
    dmap = {
        ("A", "TC-TAB"): [("Терапия", 1.0)],
        ("B", "TC-TAB"): [("Терапия", 1.0)],
    }
    items = [row("A", "TC-TAB", 10.0), row("B", "TC-TAB", 90.0)]
    out = build_direction_detail(items, dmap, "Терапия", 1000.0)

    assert [p["mnn"] for p in out["pairs"]] == ["B", "A"]


def test_overview_shares_by_year_use_per_year_denominators():
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    # row(mnn, lf, usd3, usd1, usd2): итоги y1=200, y2=500, y3=1000
    items = [
        row("A", "TC-TAB", 400.0, 100.0, 250.0),
        row("B", "SYR", 600.0, 100.0, 250.0),
    ]
    out = build_overview_directions(items, dmap, top_n=5)
    therapy = next(o for o in out if o["name"] == "Терапия")

    assert therapy["shares_by_year"][0] == pytest.approx(0.5)
    assert therapy["shares_by_year"][1] == pytest.approx(0.5)
    assert therapy["shares_by_year"][2] == pytest.approx(0.4)


def test_overview_shares_by_year_distinct_and_for_other_row():
    dmap = {
        ("A", "TC-TAB"): [("Терапия", 1.0)],
        ("B", "TC-TAB"): [("ЛОР", 1.0)],
    }
    # итоги: y1=400, y2=500, y3=1000; Терапия в топе, ЛОР в «Прочих»
    items = [
        row("A", "TC-TAB", 600.0, 300.0, 250.0),
        row("B", "TC-TAB", 400.0, 100.0, 250.0),
    ]
    out = build_overview_directions(items, dmap, top_n=1)

    therapy = next(o for o in out if o["name"] == "Терапия")
    other = next(o for o in out if o["kind"] == "other")
    assert therapy["shares_by_year"] == pytest.approx([0.75, 0.5, 0.6])
    assert other["shares_by_year"] == pytest.approx([0.25, 0.5, 0.4])


def test_form_row_shares_use_form_total_not_mnn_total():
    dmap = {
        ("A", "D-CRM"): [("Дерматология", 0.85), ("Педиатрия", 0.15)],
        ("A", "D-OINT"): [("Дерматология", 1.0)],
    }
    items = [row("A", "D-CRM", 100.0), row("A", "D-OINT", 900.0)]
    out = build_mnn_directions(items, dmap)

    crm = next(f for f in out["forms"] if f["form"] == "D-CRM")
    derm = next(r for r in crm["rows"] if r["name"] == "Дерматология")
    assert derm["share"] == pytest.approx(0.85)


def test_overview_rows_sum_to_market_total():
    dmap = {
        ("A", "TC-TAB"): [("Терапия", 0.6), ("Педиатрия", 0.4)],
        ("B", "D-CRM"): [("Дерматология", 0.9)],
        ("C", "TC-CAP"): [("Онкология", 1.0)],
        ("D", "LOZ"): [("ЛОР", 1.0)],
    }
    items = [
        row("A", "TC-TAB", 500.0, 400.0, 450.0),
        row("B", "D-CRM", 300.0, 200.0, 250.0),
        row("C", "TC-CAP", 100.0, 90.0, 95.0),
        row("D", "LOZ", 50.0, 40.0, 45.0),
        row("E", "SYR", 70.0, 60.0, 65.0),
    ]
    out = build_overview_directions(items, dmap, top_n=2)
    total = sum(i.usd_y3 for i in items)

    assert any(o["kind"] == "other" for o in out)
    assert sum(o["usd"] for o in out) == pytest.approx(total)


def test_mnn_total_rows_sum_to_mnn_total():
    dmap = {
        ("A", "D-CRM"): [("Дерматология", 0.85), ("Педиатрия", 0.15)],
        ("A", "D-OINT"): [("Дерматология", 0.7)],
    }
    items = [row("A", "D-CRM", 100.0), row("A", "D-OINT", 50.0),
             row("A", "SYR", 25.0)]
    out = build_mnn_directions(items, dmap)

    assert sum(r["usd"] for r in out["total"]["rows"]) == pytest.approx(
        out["total"]["usd"],
    )


def test_direction_detail_kpi_years_and_counts_are_distinct():
    dmap = {
        ("A", "D-CRM"): [("Дерматология", 1.0)],
        ("A", "D-OINT"): [("Дерматология", 1.0)],
        ("B", "D-GEL"): [("Дерматология", 0.5)],
    }
    items = [
        row("A", "D-CRM", 300.0, 100.0, 200.0),
        row("A", "D-OINT", 100.0, 50.0, 80.0),
        row("B", "D-GEL", 200.0, 100.0, 100.0),
    ]
    out = build_direction_detail(items, dmap, "Дерматология", 1000.0)
    kpi = out["kpi"]

    assert kpi["pairs_count"] == 3
    assert kpi["mnns_count"] == 2
    assert kpi["usd_y1"] == pytest.approx(200.0)
    assert kpi["usd_y2"] == pytest.approx(330.0)
    assert kpi["usd_y3"] == pytest.approx(500.0)
    assert kpi["usd_growth"] == pytest.approx((500.0 - 330.0) / 330.0)

    top = out["pairs"][0]
    assert top["growth"] == pytest.approx((300.0 - 200.0) / 200.0)

    forms = {f["form"]: f for f in out["forms"]}
    assert forms["D-CRM"]["share_in_direction"] == pytest.approx(300.0 / 500.0)


def test_direction_detail_handles_none_mnn_and_case_variants():
    dmap = {
        ("A", "D-CRM"): [("Дерматология", 1.0)],
        ("", "D-GEL"): [("Дерматология", 1.0)],
    }
    items = [
        row("a", "D-CRM", 50.0), row("A ", "D-CRM", 50.0),
        row(None, "D-GEL", 50.0), row("", "D-GEL", 50.0),
    ]
    out = build_direction_detail(items, dmap, "Дерматология", 1000.0)

    assert out["kpi"]["mnns_count"] == 2
    assert out["kpi"]["pairs_count"] == 2


def test_threshold_boundary_hides_below_and_shows_above():
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    total = 1_000_000.0

    below = [row("A", "TC-TAB", total), row("B", "SYR", total * 5e-10)]
    out_below = build_overview_directions(below, dmap, top_n=5)
    assert all(o["kind"] != "unallocated" for o in out_below)

    above = [row("A", "TC-TAB", total), row("B", "SYR", total * 5e-9)]
    out_above = build_overview_directions(above, dmap, top_n=5)
    assert any(o["kind"] == "unallocated" for o in out_above)


def test_mnn_directions_on_zero_market_and_empty_reference():
    zero = build_mnn_directions([row("A", "D-CRM", 0.0)], {})
    assert zero["total"]["usd"] == pytest.approx(0.0)
    assert zero["total"]["rows"] == []

    empty = build_mnn_directions([row("A", "D-CRM", 100.0)], {})
    assert [r["name"] for r in empty["total"]["rows"]] == [UNALLOCATED]
    assert empty["total"]["rows"][0]["share"] == pytest.approx(1.0)
    assert empty["forms"][0]["in_reference"] is False
    assert empty["forms"][0]["rows"] == []
