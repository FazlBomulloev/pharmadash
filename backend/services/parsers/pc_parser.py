import logging
from pathlib import Path
from backend.services.normalize import (
    normalize_mnn, normalize_str, parse_float, parse_date,
)
from backend.services.parsers.base import (
    iter_data_rows, build_col_index, read_columns_at_row,
)

log = logging.getLogger(__name__)

PC_FIELDS = [
    "mnn", "tm", "lf", "owner", "pack_qty",
    "price_rub_no_vat",
    "price_reg_date", "price_effective_date",
]

REQUIRED_PC_FIELDS = ["mnn", "price_rub_no_vat"]

STRING_FIELDS = {"tm", "lf", "owner", "pack_qty"}
FLOAT_FIELDS = {"price_rub_no_vat"}
DATE_FIELDS = {"price_reg_date", "price_effective_date"}


def parse_pc_rows(
    file_path: Path,
    sheet_name: str,
    header_row: int,
    mappings: dict[str, str],
    max_rows: int | None = None,
) -> list[dict]:
    headers = read_columns_at_row(file_path, sheet_name, header_row)
    col_index = build_col_index(headers, mappings)

    rows = []
    count = 0
    for values in iter_data_rows(file_path, sheet_name, header_row):
        record = {}
        for field in PC_FIELDS:
            idx = col_index.get(field)
            raw = values[idx] if idx is not None and idx < len(values) else None

            if field == "mnn":
                record["mnn_raw"] = normalize_mnn(raw)
            elif field in STRING_FIELDS:
                record[field] = normalize_str(raw) or None
            elif field in FLOAT_FIELDS:
                record[field] = parse_float(raw)
            elif field in DATE_FIELDS:
                record[field] = parse_date(raw)

        if not record.get("mnn_raw"):
            continue
        if record.get("price_rub_no_vat") is None:
            continue

        rows.append(record)
        count += 1
        if max_rows and count >= max_rows:
            break

    log.info("РС: распарсено %d строк из %s", len(rows), file_path.name)
    return rows
