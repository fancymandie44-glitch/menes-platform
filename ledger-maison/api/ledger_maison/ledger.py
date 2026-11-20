from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from ledger_maison.types import AccountKind, TxType


@dataclass(frozen=True, slots=True)
class JournalLine:
    account: str
    debit_cents: int
    credit_cents: int
    memo: str


def post_transaction(
    *,
    tx_type: TxType,
    cents: int,
    booked_on: date,
    label: str,
    bank_account: str,
    counterparty: str,
    kind: AccountKind,
) -> tuple[JournalLine, JournalLine]:
    """Écriture à deux jambes, toujours équilibrée. cents > 0 = entrée d'argent au compte."""
    amount = abs(cents)
    inflow = cents > 0
    if tx_type == TxType.TRANSFERT:
        source = bank_account if not inflow else counterparty
        dest = counterparty if not inflow else bank_account
        a = JournalLine(dest, amount, 0, label)
        b = JournalLine(source, 0, amount, label)
    elif tx_type == TxType.REVENU:
        a = JournalLine(bank_account, amount, 0, label)
        b = JournalLine(f"revenu:{counterparty}", 0, amount, label)
    elif tx_type == TxType.DEPENSE:
        a = JournalLine(f"depense:{counterparty}", amount, 0, label)
        b = JournalLine(bank_account, 0, amount, label)
    elif tx_type == TxType.PAIEMENT_DETTE:
        a = JournalLine(f"dette:{counterparty}", amount, 0, label)
        b = JournalLine(bank_account, 0, amount, label)
    elif tx_type == TxType.DETTE:
        a = JournalLine(bank_account, amount, 0, label)
        b = JournalLine(f"dette:{counterparty}", 0, amount, label)
    elif tx_type == TxType.PRET:
        if inflow:
            a = JournalLine(bank_account, amount, 0, label)
            b = JournalLine(f"pret:{counterparty}", 0, amount, label)
        else:
            a = JournalLine(f"pret:{counterparty}", amount, 0, label)
            b = JournalLine(bank_account, 0, amount, label)
    elif tx_type == TxType.INVESTISSEMENT:
        if inflow:
            a = JournalLine(bank_account, amount, 0, label)
            b = JournalLine(f"placement:{counterparty}", 0, amount, label)
        else:
            a = JournalLine(f"placement:{counterparty}", amount, 0, label)
            b = JournalLine(bank_account, 0, amount, label)
    else:
        if inflow:
            a = JournalLine(bank_account, amount, 0, label)
            b = JournalLine("attente:autre", 0, amount, label)
        else:
            a = JournalLine("attente:autre", amount, 0, label)
            b = JournalLine(bank_account, 0, amount, label)
    _assert_balanced(a, b)
    return a, b


def _assert_balanced(a: JournalLine, b: JournalLine) -> None:
    if a.debit_cents + b.debit_cents != a.credit_cents + b.credit_cents:
        raise ValueError("écriture non équilibrée")
    if a.debit_cents < 0 or a.credit_cents < 0 or b.debit_cents < 0 or b.credit_cents < 0:
        raise ValueError("montant négatif dans le journal")
