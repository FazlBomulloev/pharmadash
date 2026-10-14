import logging
from pathlib import Path

from openpyxl import load_workbook

log = logging.getLogger(__name__)

SHEET_NAME = "Длинный формат"

_REQUIRED_HEADERS = ("МНН", "ЛФ", "НАПРАВЛЕНИЕ", "ПРОЦЕНТ")


class DirectionsParseError(Exception):
    pass


def _headers(ws) -> list[str]:
    for row in ws.iter_rows(min_row=1, max_row=1, values_only=True):
        return [
            str(v).strip().upper() if v is not None else "" for v in row
        ]
    return []


def _pick_sheet(wb) -> str:
    if SHEET_NAME in wb.sheetnames:
        return SHEET_NAME
    for name in wb.sheetnames:
        head = _headers(wb[name])
        if all(h in head for h in _REQUIRED_HEADERS):
            return name
    raise DirectionsParseError(
        f"В файле нет листа «{SHEET_NAME}» и ни один лист не содержит "
        f"колонки МНН, ЛФ, Направление, Процент. "
        f"Найденные листы: {', '.join(wb.sheetnames)}"
    )


def _share(value) -> float | None:
    if value is None:
        return None
    try:
        share = float(value)
    except (TypeError, ValueError):
        return None
    if share > 1:
        share /= 100
    if share <= 0 or share > 1:
        return None
    return share


def parse_directions(file_path: Path) -> tuple[list[dict], dict]:
    wb = load_workbook(file_path, read_only=True, data_only=True)
    try:
        sheet = _pick_sheet(wb)
        ws = wb[sheet]

        accepted: dict[tuple[str, str, str], dict] = {}
        rows_read = 0
        rows_skipped = 0

        for idx, values in enumerate(ws.iter_rows(values_only=True)):
            if idx == 0:
                continue
            if not any(v is not None and str(v).strip() for v in values):
                continue
            rows_read += 1

            mnn = str(values[0] or "").strip().upper()
            lf = str(values[1] or "").strip().upper()
            direction = str(values[2] or "").strip()
            share = _share(values[3] if len(values) > 3 else None)

            if not mnn or not lf or not direction or share is None:
                rows_skipped += 1
                continue

            accepted[(mnn, lf, direction)] = {
                "mnn": mnn, "lf": lf,
                "direction": direction, "share": share,
            }
    finally:
        wb.close()

    rows = list(accepted.values())

    pair_shares: dict[tuple[str, str], float] = {}
    for r in rows:
        key = (r["mnn"], r["lf"])
        pair_shares[key] = pair_shares.get(key, 0.0) + r["share"]

    # Пара с суммой долей выше 100% ломает инвариант сходимости в сторону
    # раздувания рынка: недобора у неё нет, а переизбыток попал бы в итог
    # лишними деньгами. Отбрасываем целиком, её USD уйдёт в «Не распределено».
    over = {k for k, v in pair_shares.items() if v > 1.0 + 1e-6}
    if over:
        rows = [r for r in rows if (r["mnn"], r["lf"]) not in over]
        rows_skipped += sum(
            1 for r in accepted.values() if (r["mnn"], r["lf"]) in over
        )
        for k in over:
            pair_shares.pop(k, None)

    report = {
        "sheet": sheet,
        "rows_read": rows_read,
        "rows_accepted": len(rows),
        "rows_skipped": rows_skipped,
        "pairs_count": len(pair_shares),
        "directions_count": len({r["direction"] for r in rows}),
        "forms_count": len({r["lf"] for r in rows}),
        "pairs_incomplete": sum(
            1 for s in pair_shares.values() if abs(s - 1.0) > 1e-6
        ),
        "pairs_over_100": len(over),
    }
    log.info(
        "Справочник направлений разобран: лист «%s», принято %d строк, "
        "отброшено %d, пар %d",
        sheet, report["rows_accepted"], rows_skipped, report["pairs_count"],
    )
    if over:
        log.warning(
            "Отброшено %d пар с суммой долей выше 100%%", len(over),
        )
    return rows, report
