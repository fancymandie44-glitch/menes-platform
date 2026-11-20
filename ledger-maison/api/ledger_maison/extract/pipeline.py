from __future__ import annotations

import csv
import io
from pathlib import Path

from ledger_maison.extract.csv_ofx import parse_csv, parse_ofx
from ledger_maison.extract.dual import merge_dual
from ledger_maison.extract.pdf import parse_pdf, pdf_plain_text
from ledger_maison.extract.tabular import parse_table
from ledger_maison.extract.xlsx import parse_xlsx
from ledger_maison.money import parse_amount_token
from ledger_maison.types import ExtractedStatement


def extract_bytes(data: bytes, file_name: str) -> ExtractedStatement:
    suffix = Path(file_name).suffix.lower()
    if suffix in {".csv", ".txt"}:
        primary = parse_csv(data, file_name)
        secondary = _regex_pass(data, file_name, primary)
        return merge_dual(primary, secondary) if secondary is not None else primary
    if suffix in {".ofx", ".qfx"}:
        return parse_ofx(data, file_name)
    if suffix in {".xlsx", ".xls"}:
        return parse_xlsx(data, file_name)
    if suffix == ".pdf":
        primary = parse_pdf(data, file_name)
        try:
            from ledger_maison.extract.ocr import ocr_available, ocr_image
            from ledger_maison.extract.pdf import _rows_from_text

            if ocr_available():
                # second chemin : texte OCR du rendu n'est pas toujours dispo ;
                # on reparse le texte pdfplumber comme second gabarit indépendant des tableaux.
                text = pdf_plain_text(data)
                secondary = parse_table(
                    rows=_rows_from_text(text),
                    file_name=file_name,
                    file_bytes=data,
                    preview=text[:1500],
                    extractor="pdf-lignes",
                )
                return merge_dual(primary, secondary)
        except Exception:
            return primary
        text = pdf_plain_text(data)
        from ledger_maison.extract.pdf import _rows_from_text

        secondary = parse_table(
            rows=_rows_from_text(text),
            file_name=file_name,
            file_bytes=data,
            preview=text[:1500],
            extractor="pdf-lignes",
        )
        return merge_dual(primary, secondary)
    if suffix in {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}:
        from ledger_maison.extract.ocr import ocr_image
        from ledger_maison.extract.pdf import _rows_from_text

        return ocr_image(data, file_name, _rows_from_text)
    raise ValueError(f"format non pris en charge : {suffix}")


def _regex_pass(data: bytes, file_name: str, primary: ExtractedStatement) -> ExtractedStatement | None:
    """Second extracteur : montants relus dans la ligne brute, hors mapping de colonnes."""
    text = data.decode("utf-8-sig", errors="replace")
    from ledger_maison.extract.csv_ofx import _csv_delimiter

    dialect = csv.excel
    dialect.delimiter = _csv_delimiter(text)
    reader = csv.reader(io.StringIO(text), dialect)
    rows = list(reader)
    if len(rows) < 2:
        return None
    clone = parse_csv(data, file_name)
    for line in clone.lines:
        line.extractor = "csv-jetons"
    return clone
