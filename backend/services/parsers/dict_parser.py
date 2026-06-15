import logging
from pathlib import Path
from backend.services.normalize import normalize_str
from backend.services.parsers.base import (
    iter_data_rows, build_col_index, read_columns_at_row,
)

log = logging.getLogger(__name__)

DICT_IMPORT_FIELDS = [
    "value_en", "value_ru", "canonical", "aliases", "notes",
]


def parse_dict_import(
    file_path: Path,
    sheet_name: str,
    header_row: int,
    mappings: dict[str, str],
    alias_separator: str = ";",
) -> list[dict]:
    headers = read_columns_at_row(file_path, sheet_name, header_row)
    col_index = build_col_index(headers, mappings)

    rows = []
    for values in iter_data_rows(file_path, sheet_name, header_row):
        record = {}
        for field in DICT_IMPORT_FIELDS:
            idx = col_index.get(field)
            raw = values[idx] if idx is not None and idx < len(values) else None
            if raw is None or str(raw).strip() == "":
                record[field] = None
                continue

            if field == "aliases":
                aliases_str = str(raw)
                record[field] = [
                    normalize_str(a) for a in aliases_str.split(alias_separator)
                    if a.strip()
                ]
            else:
                record[field] = str(raw).strip()

        if not (record.get("value_en") or record.get("value_ru")):
            continue

        if not record.get("canonical"):
            record["canonical"] = record.get("value_en") or record.get("value_ru")

        rows.append(record)

    log.info("Импорт словаря: распарсено %d строк из %s", len(rows), file_path.name)
    return rows
