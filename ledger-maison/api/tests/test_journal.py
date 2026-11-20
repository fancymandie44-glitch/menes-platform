from datetime import date

from ledger_maison.ledger import post_transaction
from ledger_maison.types import AccountKind, TxType


def test_every_type_balances():
    kinds = [
        (TxType.DEPENSE, -1999),
        (TxType.REVENU, 50000),
        (TxType.TRANSFERT, -10000),
        (TxType.PAIEMENT_DETTE, -8000),
        (TxType.DETTE, 12000),
        (TxType.PRET, -3000),
        (TxType.INVESTISSEMENT, -2500),
        (TxType.AUTRE, -100),
    ]
    for tx, cents in kinds:
        a, b = post_transaction(
            tx_type=tx,
            cents=cents,
            booked_on=date(2026, 1, 1),
            label="x",
            bank_account="banque:1",
            counterparty="cat",
            kind=AccountKind.CHEQUE,
        )
        assert a.debit_cents + b.debit_cents == a.credit_cents + b.credit_cents
