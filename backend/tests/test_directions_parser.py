import pytest
from openpyxl import Workbook

from backend.services.parsers.directions_parser import (
    DirectionsParseError,
    SHEET_NAME,
    parse_directions,
)


def make_file(tmp_path, sheet_title, rows, header=True):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title
    if header:
        ws.append(["МНН", "ЛФ", "Направление", "Процент"])
    for r in rows:
        ws.append(list(r))
    path = tmp_path / "ref.xlsx"
    wb.save(path)
    return path


def test_parses_named_sheet(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("CLOBETASOL", "D-CRM", "Дерматология", 0.85),
        ("CLOBETASOL", "D-CRM", "Педиатрия", 0.15),
    ])
    rows, report = parse_directions(path)

    assert len(rows) == 2
    assert rows[0] == {
        "mnn": "CLOBETASOL", "lf": "D-CRM",
        "direction": "Дерматология", "share": 0.85,
    }
    assert report["sheet"] == SHEET_NAME
    assert report["rows_accepted"] == 2
    assert report["pairs_count"] == 1
    assert report["directions_count"] == 2
    assert report["forms_count"] == 1
    assert report["pairs_incomplete"] == 0


def test_finds_sheet_by_columns_when_name_differs(tmp_path):
    path = make_file(tmp_path, "Данные", [
        ("CLOBETASOL", "D-CRM", "Дерматология", 1.0),
    ])
    rows, report = parse_directions(path)

    assert len(rows) == 1
    assert report["sheet"] == "Данные"


def test_raises_when_no_suitable_sheet(tmp_path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Прочее"
    ws.append(["Колонка", "Другая"])
    ws.append(["значение", 1])
    path = tmp_path / "bad.xlsx"
    wb.save(path)

    with pytest.raises(DirectionsParseError) as exc:
        parse_directions(path)

    assert "Длинный формат" in str(exc.value)


def test_percent_above_one_is_divided_by_hundred(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 35),
        ("A", "TC-TAB", "Педиатрия", 65),
    ])
    rows, report = parse_directions(path)

    assert [r["share"] for r in rows] == [0.35, 0.65]
    assert report["pairs_incomplete"] == 0


def test_skips_non_positive_and_empty_rows(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 1.0),
        ("A", "TC-TAB", "Педиатрия", 0),
        ("A", "TC-TAB", "ЛОР", None),
        (None, None, None, None),
        ("", "TC-TAB", "Терапия", 0.5),
        ("B", "TC-TAB", "", 0.5),
    ])
    rows, report = parse_directions(path)

    assert len(rows) == 1
    assert report["rows_skipped"] == 4


def test_normalises_case_and_whitespace(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        (" clobetasol ", " d-crm ", "  Дерматология  ", 1.0),
    ])
    rows, _ = parse_directions(path)

    assert rows[0]["mnn"] == "CLOBETASOL"
    assert rows[0]["lf"] == "D-CRM"
    assert rows[0]["direction"] == "Дерматология"


def test_duplicate_triple_keeps_last(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 0.4),
        ("A", "TC-TAB", "Терапия", 0.9),
    ])
    rows, report = parse_directions(path)

    assert len(rows) == 1
    assert rows[0]["share"] == 0.9
    assert report["rows_accepted"] == 1
    assert report["rows_duplicate"] == 1


def test_counts_pairs_with_incomplete_shares(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 0.5),
        ("A", "TC-TAB", "Педиатрия", 0.4),
        ("B", "TC-TAB", "Терапия", 1.0),
    ])
    _, report = parse_directions(path)

    assert report["pairs_incomplete"] == 1


def test_share_above_hundred_is_clamped_out(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 150),
    ])
    rows, report = parse_directions(path)

    assert rows == []
    assert report["rows_skipped"] == 1


def test_pair_whose_shares_exceed_hundred_is_dropped(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 0.7),
        ("A", "TC-TAB", "Педиатрия", 0.6),
        ("B", "TC-TAB", "Терапия", 1.0),
    ])
    rows, report = parse_directions(path)

    assert [r["mnn"] for r in rows] == ["B"]
    assert report["pairs_over_100"] == 1
    assert report["pairs_count"] == 1
    assert report["rows_accepted"] == 1


def test_out_of_range_value_is_dropped_without_killing_its_pair(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 150),       # 1.5 после деления — вне диапазона
        ("A", "TC-TAB", "Педиатрия", 0.2),
    ])
    rows, report = parse_directions(path)

    # битая строка отброшена по значению, пара выжила с остальными долями
    assert [r["direction"] for r in rows] == ["Педиатрия"]
    assert report["rows_skipped"] == 1
    assert report["pairs_over_100"] == 0
    assert report["pairs_count"] == 1


def test_report_arithmetic_closes(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 0.6),
        ("A", "TC-TAB", "Педиатрия", 0.4),
        ("A", "TC-TAB", "Терапия", 0.6),        # дубликат триплета
        ("B", "D-CRM", "Дерматология", 0),       # битая доля
        ("C", "LOZ", "ЛОР", 0.7),
        ("C", "LOZ", "Терапия", 0.6),            # пара C в сумме 130%
    ])
    _, report = parse_directions(path)

    assert report["rows_read"] == (
        report["rows_accepted"]
        + report["rows_skipped"]
        + report["rows_duplicate"]
    )
    assert report["rows_duplicate"] == 1
    assert report["pairs_over_100"] == 1
    assert report["pairs_count"] == 1          # осталась только пара A
