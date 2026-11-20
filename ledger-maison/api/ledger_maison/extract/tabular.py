from __future__ import annotations

import re
from datetime import date

from ledger_maison.dates import date_is_ambiguous, parse_date
from ledger_maison.extract.templates import (
    CREDIT_CARD_NEEDLES,
    BankTemplate,
    detect_template,
    pick_column,
)
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


def parse_table(
    *,
    rows: list[list[str]],
    file_name: str,
    file_bytes: bytes,
    preview: str = "",
    extractor: str,
    forced: BankTemplate | None = None,
) -> ExtractedStatement:
    if not rows:
        raise ValueError("aucune ligne")
    header_index = _header_index(rows)
    headers = rows[header_index]
    body = rows[header_index + 1 :]
    tmpl = forced or detect_template(headers, preview + " " + file_name)
    date_i = pick_column(headers, tmpl.date_keys)
    debit_i = pick_column(headers, tmpl.debit_keys)
    credit_i = pick_column(headers, tmpl.credit_keys)
    amount_i = pick_column(headers, tmpl.amount_keys)
    balance_i = pick_column(headers, tmpl.balance_keys)
    label_i = pick_column(headers, tmpl.label_keys)
    if date_i is None or label_i is None:
        raise ValueError("colonnes date/description introuvables")
    if debit_i is None and credit_i is None and amount_i is None:
        raise ValueError("aucune colonne de montant")

    kind = AccountKind.CARTE if any(n in preview.lower() for n in CREDIT_CARD_NEEDLES) else AccountKind.CHEQUE
    lines: list[ExtractedLine] = []
    opening = closing = None
    period_dates: list[date] = []

    for offset, row in enumerate(body):
        if _empty(row):
            continue
        raw = _join(headers, row)
        date_raw = _cell(row, date_i)
        booked = parse_date(date_raw, prefer=tmpl.date_prefer)
        ambiguous = date_is_ambiguous(date_raw)
        debit = _amount(_cell(row, debit_i)) if debit_i is not None else None
        credit = _amount(_cell(row, credit_i)) if credit_i is not None else None
        amount = _amount(_cell(row, amount_i)) if amount_i is not None else None
        balance = _amount(_cell(row, balance_i)) if balance_i is not None else None
        label = _cell(row, label_i).strip() or "Sans libellé"

        if _is_opening_row(label):
            if balance is not None:
                opening = balance
            elif credit is not None:
                opening = abs(credit)
            elif amount is not None:
                opening = abs(amount)
            continue

        debit_cents, credit_cents, cents, status, reason, conf = _split_signed(
            debit=debit,
            credit=credit,
            amount=amount,
            signed_positive_is_debit=tmpl.signed_amount_is_debit_when_positive,
            raw=raw,
        )

        literal_ok = cents is None or cents == 0 or source_contains_amount(raw, cents) or source_contains_amount(
            raw, abs(cents)
        )
        if booked is None or cents is None or not literal_ok:
            status = LineStatus.A_VERIFIER
            extra = "montant absent du texte source" if cents is not None and not literal_ok else "date ou montant illisible"
            reason = f"{reason} ; {extra}" if reason else extra
            conf = min(conf, 20)

        if booked:
            period_dates.append(booked)
        if balance is not None:
            if opening is None:
                opening = balance - (credit_cents or 0) + (debit_cents or 0)
            closing = balance

        lines.append(
            ExtractedLine(
                booked_on=booked,
                cents=cents,
                currency="CAD",
                label=label,
                debit_cents=debit_cents,
                credit_cents=credit_cents,
                running_balance_cents=balance,
            status=status,
            confidence=conf if not ambiguous else min(conf, 85),
            source=SourceSpan(file_name, None, raw),
            conflict_reason=reason,
                date_ambiguous=ambiguous,
                extractor=extractor,
            )
        )

    recon = reconcile_statement(opening, closing, lines, kind)
    status = StatementStatus.RECONCILE if recon.balanced else StatementStatus.NON_RECONCILE
    return ExtractedStatement(
        bank_id=tmpl.bank_id,
        bank_name=tmpl.bank_name,
        account_mask=_mask(preview + file_name),
        kind=kind,
        period_start=min(period_dates) if period_dates else None,
        period_end=max(period_dates) if period_dates else None,
        currency="CAD",
        opening_cents=opening,
        closing_cents=closing,
        lines=lines,
        reconciliation=recon,
        file_sha256=sha256_bytes(file_bytes),
        file_name=file_name,
        status=status,
    )


def _split_signed(
    *,
    debit: int | None,
    credit: int | None,
    amount: int | None,
    signed_positive_is_debit: bool,
    raw: str,
) -> tuple[int | None, int | None, int | None, LineStatus, str | None, int]:
    if debit is not None or credit is not None:
        d = abs(debit or 0)
        c = abs(credit or 0)
        if d and c:
            return d, c, None, LineStatus.A_VERIFIER, "débit et crédit tous deux remplis", 30
        if d:
            return d, 0, -d, LineStatus.EXTRAITE, None, 95
        if c:
            return 0, c, c, LineStatus.EXTRAITE, None, 95
        if amount is None:
            return 0, 0, 0, LineStatus.A_VERIFIER, "montant vide", 10
    if amount is None:
        return None, None, None, LineStatus.A_VERIFIER, "montant illisible", 10
    if signed_positive_is_debit:
        if amount > 0:
            return amount, 0, -amount, LineStatus.EXTRAITE, None, 90
        if amount < 0:
            return 0, -amount, -amount, LineStatus.EXTRAITE, None, 90
        return 0, 0, 0, LineStatus.A_VERIFIER, "zéro", 20
    if amount < 0:
        return -amount, 0, amount, LineStatus.EXTRAITE, None, 90
    if amount > 0:
        return 0, amount, amount, LineStatus.EXTRAITE, None, 90
    return 0, 0, 0, LineStatus.A_VERIFIER, "zéro", 20


def _amount(raw: str) -> int | None:
    if not raw.strip():
        return None
    return parse_amount_token(raw)


def _cell(row: list[str], index: int) -> str:
    return row[index] if index < len(row) else ""


def _join(headers: list[str], row: list[str]) -> str:
    parts = []
    for i, h in enumerate(headers):
        parts.append(f"{h}: {_cell(row, i)}")
    return " | ".join(parts)


def _empty(row: list[str]) -> bool:
    return not any(c.strip() for c in row)


def _header_index(rows: list[list[str]]) -> int:
    needles = (
        "date",
        "posted",
        "description",
        "payee",
        "memo",
        "name",
        "montant",
        "amount",
        "debit",
        "credit",
        "solde",
        "balance",
        "retrait",
        "retraits",
        "depot",
        "depots",
        "out",
        "in",
    )
    for i, row in enumerate(rows[:12]):
        tokens = set(" ".join(row).lower().replace(",", " ").replace(";", " ").split())
        hits = sum(1 for needle in needles if needle in tokens)
        if hits >= 2:
            return i
    return 0


def _is_opening_row(label: str) -> bool:
    t = label.lower()
    return any(
        key in t
        for key in (
            "solde d'ouverture",
            "solde d’ouverture",
            "opening balance",
            "balance forward",
            "solde precedent",
            "solde précédent",
        )
    )


def _mask(text: str) -> str:
    import re

    digits = re.findall(r"\d{4,}", text)
    if not digits:
        return "••••"
    last = digits[-1][-4:]
    return f"•••• {last}"
