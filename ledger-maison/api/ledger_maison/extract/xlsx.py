from __future__ import annotations

from io import BytesIO

from openpyxl import load_workbook

from ledger_maison.extract.tabular import parse_table


def parse_xlsx(data: bytes, file_name: str) -> object:
    wb = load_workbook(BytesIO(data), data_only=True, read_only=True)
    sheet = wb.active
    rows: list[list[str]] = []
    for row in sheet.iter_rows(values_only=True):
        rows.append(["" if cell is None else str(cell).strip() for cell in row])
    preview = file_name + "\n" + " ".join(rows[0] if rows else [])
    return parse_table(
        rows=rows,
        file_name=file_name,
        file_bytes=data,
        preview=preview,
        extractor="xlsx",
    )
