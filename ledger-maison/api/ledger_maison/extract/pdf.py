from __future__ import annotations

import io

import pdfplumber

from ledger_maison.extract.tabular import parse_table
from ledger_maison.hashing import sha256_bytes
from ledger_maison.types import ExtractedStatement


def parse_pdf(data: bytes, file_name: str) -> ExtractedStatement:
    rows: list[list[str]] = []
    preview_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            preview_parts.append(page.extract_text() or "")
            tables = page.extract_tables() or []
            for table in tables:
                for raw in table:
                    rows.append([("" if cell is None else str(cell)).strip() for cell in raw])
    if not rows:
        rows = _rows_from_text("\n".join(preview_parts))
    return parse_table(
        rows=rows,
        file_name=file_name,
        file_bytes=data,
        preview="\n".join(preview_parts[:2]) + " " + file_name,
        extractor="pdf-texte",
    )


def pdf_plain_text(data: bytes) -> str:
    chunks: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def file_hash(data: bytes) -> str:
    return sha256_bytes(data)


def _rows_from_text(text: str) -> list[list[str]]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    rows: list[list[str]] = []
    for ln in lines:
        if ";" in ln:
            rows.append([c.strip() for c in ln.split(";")])
        elif "," in ln and ln.count(",") >= 3:
            rows.append([c.strip() for c in ln.split(",")])
        else:
            rows.append(ln.split())
    return rows
