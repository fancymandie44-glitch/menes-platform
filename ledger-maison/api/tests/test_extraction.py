from __future__ import annotations

from datetime import date

from ledger_maison.classify import classify
from ledger_maison.dates import parse_date
from ledger_maison.extract.pipeline import extract_bytes
from ledger_maison.hashing import sha256_bytes, transaction_fingerprint
from ledger_maison.integrity import file_duplicate, line_duplicates
from ledger_maison.ledger import post_transaction
from ledger_maison.money import Money, parse_amount_token, source_contains_amount
from ledger_maison.types import LineStatus, StatementStatus, TxType
from tests.fixtures_banks import (
    BANK_FILES,
    OPENING,
    expected_closing,
    sample_ops,
)


def test_number_formats():
    assert parse_amount_token("1 234,56") == 123456
    assert parse_amount_token("1,234.56") == 123456
    assert parse_amount_token("(50.00)") == -5000
    assert parse_amount_token("50.00 CR") == 5000
    assert parse_amount_token("50.00 DR") == -5000
    assert parse_amount_token("-12.34") == -1234
    money = Money(123456, "CAD")
    assert money.format_qc() == "1 234,56 $"
    assert source_contains_amount("achat 1 234,56 $", 123456)


def test_dates_ca_vs_us():
    assert parse_date("15/01/2026", prefer="dmy") == date(2026, 1, 15)
    assert parse_date("01/15/2026", prefer="mdy") == date(2026, 1, 15)
    assert parse_date("2026-01-15") == date(2026, 1, 15)
    assert parse_date("15 janvier 2026") == date(2026, 1, 15)


def test_eight_banks_and_unknown_reconcile():
    names = [
        "desjardins.csv",
        "rbc.csv",
        "td.csv",
        "bmo.csv",
        "scotia.csv",
        "cibc.csv",
        "bnc.csv",
        "tangerine.csv",
        "inconnu.csv",
    ]
    for name in names:
        stmt = extract_bytes(BANK_FILES[name](), name)
        assert stmt.reconciliation.balanced, (name, stmt.reconciliation.suspects, stmt.bank_id)
        assert stmt.status == StatementStatus.RECONCILE
        assert stmt.opening_cents == OPENING
        assert stmt.closing_cents == expected_closing()
        assert len(stmt.lines) == len(sample_ops())
        for line in stmt.lines:
            assert line.status != LineStatus.CONFLIT
            if line.cents:
                assert source_contains_amount(line.source.raw_line, line.cents) or source_contains_amount(
                    line.source.raw_line, abs(line.cents)
                )


def test_credit_card_reconciles():
    stmt = extract_bytes(BANK_FILES["visa-desjardins.csv"](), "visa-desjardins.csv")
    assert stmt.kind.value == "carte"
    assert stmt.reconciliation.balanced, stmt.reconciliation.suspects
    assert stmt.status == StatementStatus.RECONCILE


def test_ofx_and_xlsx_and_pdf():
    ofx = extract_bytes(BANK_FILES["td.ofx"](), "td.ofx")
    assert ofx.reconciliation.balanced, ofx.reconciliation.suspects
    xlsx = extract_bytes(BANK_FILES["cibc.xlsx"](), "cibc.xlsx")
    assert xlsx.reconciliation.balanced, xlsx.reconciliation.suspects
    pdf = extract_bytes(BANK_FILES["desjardins.pdf"](), "desjardins.pdf")
    assert pdf.reconciliation.balanced, (pdf.reconciliation.suspects, [l.label for l in pdf.lines])


def test_unbalanced_is_blocked():
    raw = BANK_FILES["rbc.csv"]().decode("utf-8").splitlines()
    raw = [ln for ln in raw if "NETFLIX" not in ln]
    stmt = extract_bytes(("\n".join(raw) + "\n").encode(), "rbc.csv")
    assert not stmt.reconciliation.balanced
    assert stmt.status == StatementStatus.NON_RECONCILE
    assert stmt.reconciliation.delta_cents != 0


def test_file_and_line_duplicates():
    data = BANK_FILES["td.csv"]()
    stmt = extract_bytes(data, "td.csv")
    digest = sha256_bytes(data)
    assert file_duplicate({digest}, digest)
    known: set[str] = set()
    first = line_duplicates(stmt, known, "acc-1")
    assert first == []
    second = line_duplicates(stmt, known, "acc-1")
    assert len(second) == len(stmt.lines)


def test_conflict_when_amounts_diverge():
    from ledger_maison.extract.dual import merge_dual
    from ledger_maison.types import ExtractedLine, LineStatus, SourceSpan
    from datetime import date as d

    a = extract_bytes(BANK_FILES["td.csv"](), "td.csv")
    b = extract_bytes(BANK_FILES["td.csv"](), "td.csv")
    b.lines[0].cents = (b.lines[0].cents or 0) + 1
    b.lines[0].extractor = "ocr"
    merged = merge_dual(a, b)
    assert merged.lines[0].status == LineStatus.CONFLIT
    assert merged.status == StatementStatus.NON_RECONCILE


def test_classification_hydro_and_salary():
    stmt = extract_bytes(BANK_FILES["desjardins.csv"](), "desjardins.csv")
    by_label = {line.label: classify(line) for line in stmt.lines}
    hydro = by_label["HYDRO-QUEBEC PAIEMENT"]
    assert hydro.tx_type == TxType.DEPENSE
    assert hydro.sub.value == "logement"
    assert "Hydro" in hydro.why or "électricité" in hydro.why
    pay = by_label["DEPOT SALAIRE ACME"]
    assert pay.tx_type == TxType.REVENU


def test_journal_always_balances():
    debit, credit = post_transaction(
        tx_type=TxType.DEPENSE,
        cents=-14250,
        booked_on=date(2026, 1, 5),
        label="HYDRO",
        bank_account="cheque:1",
        counterparty="logement",
        kind=stmt_kind(),
    )
    assert debit.debit_cents + credit.debit_cents == debit.credit_cents + credit.credit_cents


def stmt_kind():
    from ledger_maison.types import AccountKind

    return AccountKind.CHEQUE


def test_fingerprint_stable():
    fp = transaction_fingerprint(
        booked_on=date(2026, 1, 5),
        cents=-14250,
        label="HYDRO-QUEBEC PAIEMENT",
        account_id="x",
    )
    fp2 = transaction_fingerprint(
        booked_on=date(2026, 1, 5),
        cents=-14250,
        label="hydro quebec paiement",
        account_id="x",
    )
    assert fp == fp2
