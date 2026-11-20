from __future__ import annotations

import csv
import io
import re
from datetime import date

from ledger_maison.dates import parse_date
from ledger_maison.extract.tabular import parse_table
from ledger_maison.hashing import sha256_bytes
from ledger_maison.money import parse_amount_token, source_contains_amount
from ledger_maison.reconcile import reconcile_statement
from ledger_maison.types import (
    AccountKind,
    ExtractedLine,
    ExtractedStatement,
    LineStatus,
    SourceSpan,
    StatementStatus,
)


def parse_csv(data: bytes, file_name: str) -> ExtractedStatement:
    text = _decode(data)
    dialect = csv.excel
    dialect.delimiter = _csv_delimiter(text)
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [[cell.strip() for cell in row] for row in reader]
    preview = "\n".join(text.splitlines()[:8])
    return parse_table(
        rows=rows,
        file_name=file_name,
        file_bytes=data,
        preview=preview,
        extractor="csv",
    )


def parse_ofx(data: bytes, file_name: str) -> ExtractedStatement:
    text = _decode(data)
    txs = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, flags=re.I | re.S)
    ledger_raw = _ofx_field(text, "BALAMT")
    dtstart = _ofx_field(text, "DTSTART")
    dtend = _ofx_field(text, "DTEND")
    acct = _ofx_field(text, "ACCTID") or ""
    bankid = (_ofx_field(text, "ORG") or _ofx_field(text, "BANKID") or "ofx").lower()
    lines: list[ExtractedLine] = []
    credits = debits = 0
    dates: list[date] = []
    for block in txs:
        posted = parse_date(_ofx_date(_ofx_field(block, "DTPOSTED") or ""), prefer="dmy")
        amt_raw = (_ofx_field(block, "TRNAMT") or "").strip()
        cents = parse_amount_token(amt_raw if "." in amt_raw else (amt_raw + ".00" if amt_raw else ""))
        if cents is None and re.fullmatch(r"-?\d+", amt_raw):
            cents = int(amt_raw) * 100
        memo = (_ofx_field(block, "MEMO") or _ofx_field(block, "NAME") or "").strip()
        raw = block
        status = LineStatus.EXTRAITE
        reason = None
        conf = 92
        if posted is None or cents is None:
            status = LineStatus.A_VERIFIER
            reason = "date ou montant OFX illisible"
            conf = 15
        elif cents != 0 and not source_contains_amount(raw + " " + amt_raw, cents) and not source_contains_amount(amt_raw, cents):
            if amt_raw.replace(".", "").replace("-", "").isdigit() or re.search(r"-?\d+\.\d{2}", amt_raw):
                conf = 92
            else:
                status = LineStatus.A_VERIFIER
                reason = "montant OFX non littéral"
                conf = 20
        debit = abs(cents) if cents is not None and cents < 0 else 0
        credit = abs(cents) if cents is not None and cents > 0 else 0
        credits += credit
        debits += debit
        if posted:
            dates.append(posted)
        lines.append(
            ExtractedLine(
                booked_on=posted,
                cents=cents,
                currency="CAD",
                label=memo or "OFX",
                debit_cents=debit,
                credit_cents=credit,
                running_balance_cents=None,
                status=status,
                confidence=conf,
                source=SourceSpan(file_name, None, raw),
                conflict_reason=reason,
                extractor="ofx",
            )
        )
    closing = parse_amount_token(ledger_raw or "")
    opening = None
    if closing is not None:
        opening = closing - credits + debits
    recon = reconcile_statement(opening, closing, lines, AccountKind.CHEQUE)
    return ExtractedStatement(
        bank_id=_guess_bank(bankid + file_name),
        bank_name="OFX",
        account_mask="•••• " + acct[-4:] if len(acct) >= 4 else "••••",
        kind=AccountKind.CHEQUE,
        period_start=parse_date(_ofx_date(dtstart or ""), prefer="dmy") or (min(dates) if dates else None),
        period_end=parse_date(_ofx_date(dtend or ""), prefer="dmy") or (max(dates) if dates else None),
        currency="CAD",
        opening_cents=opening,
        closing_cents=closing,
        lines=lines,
        reconciliation=recon,
        file_sha256=sha256_bytes(data),
        file_name=file_name,
        status=StatementStatus.RECONCILE if recon.balanced else StatementStatus.NON_RECONCILE,
    )


def _guess_bank(text: str) -> str:
    t = text.lower()
    for key in ("desjardins", "rbc", "td", "bmo", "scotia", "cibc", "bnc", "tangerine"):
        if key in t:
            return key
    return "inconnu"


def _csv_delimiter(text: str) -> str:
    for ln in text.splitlines():
        low = ln.lower()
        if "date" in low and (";" in ln or "," in ln):
            return ";" if ln.count(";") > ln.count(",") else ","
    semi = text.count(";")
    comma = text.count(",")
    return ";" if semi > comma else ","


def _ofx_field(block: str, tag: str) -> str | None:
    match = re.search(rf"<{tag}>([^<\r\n]+)", block, flags=re.I)
    if not match:
        return None
    return match.group(1).strip()


def _ofx_date(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if len(digits) >= 8:
        return f"{digits[0:4]}-{digits[4:6]}-{digits[6:8]}"
    return raw


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")
