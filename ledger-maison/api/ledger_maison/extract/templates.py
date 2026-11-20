from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BankTemplate:
    bank_id: str
    bank_name: str
    date_prefer: str
    date_keys: tuple[str, ...]
    debit_keys: tuple[str, ...]
    credit_keys: tuple[str, ...]
    amount_keys: tuple[str, ...]
    balance_keys: tuple[str, ...]
    label_keys: tuple[str, ...]
    signed_amount_is_debit_when_positive: bool
    header_needles: tuple[str, ...]


TEMPLATES: tuple[BankTemplate, ...] = (
    BankTemplate(
        "desjardins",
        "Desjardins",
        "dmy",
        ("date", "date de l'opération", "date operation"),
        ("retrait", "retraits", "debit", "débit"),
        ("depot", "dépôt", "depots", "dépôts", "credit", "crédit"),
        ("montant",),
        ("solde", "balance"),
        ("description", "libellé", "libelle", "details"),
        False,
        ("desjardins", "caisse", "folio"),
    ),
    BankTemplate(
        "rbc",
        "Banque Royale",
        "dmy",
        ("date", "transaction date"),
        ("withdrawals", "withdrawal", "debit"),
        ("deposits", "deposit", "credit"),
        ("amount",),
        ("balance",),
        ("description", "details"),
        False,
        ("royal bank", "rbc"),
    ),
    BankTemplate(
        "td",
        "TD",
        "dmy",
        ("date",),
        ("debit", "withdrawals"),
        ("credit", "deposits"),
        ("amount",),
        ("balance",),
        ("description", "name"),
        False,
        ("td canada", "toronto-dominion", "td bank"),
    ),
    BankTemplate(
        "bmo",
        "BMO",
        "dmy",
        ("date",),
        ("debit",),
        ("credit",),
        ("amount", "montant"),
        ("balance", "solde"),
        ("transaction details", "description", "details"),
        True,
        ("bank of montreal", "bmo"),
    ),
    BankTemplate(
        "scotia",
        "Banque Scotia",
        "dmy",
        ("date",),
        ("debit",),
        ("credit",),
        ("amount",),
        ("balance",),
        ("description",),
        True,
        ("scotiabank", "banque scotia"),
    ),
    BankTemplate(
        "cibc",
        "CIBC",
        "dmy",
        ("date",),
        ("debit", "withdrawals"),
        ("credit", "deposits"),
        ("amount",),
        ("balance",),
        ("description",),
        False,
        ("cibc",),
    ),
    BankTemplate(
        "bnc",
        "Banque Nationale",
        "dmy",
        ("date",),
        ("debit", "débit"),
        ("credit", "crédit"),
        ("montant",),
        ("solde",),
        ("description", "libellé", "libelle"),
        False,
        ("banque nationale", "bnc", "national bank"),
    ),
    BankTemplate(
        "tangerine",
        "Tangerine",
        "dmy",
        ("date",),
        ("debit",),
        ("credit",),
        ("amount", "montant"),
        ("balance", "solde"),
        ("name", "description"),
        True,
        ("tangerine",),
    ),
    BankTemplate(
        "inconnu",
        "Format inconnu",
        "dmy",
        ("date", "posted", "transaction date"),
        ("debit", "withdrawal", "retrait", "out"),
        ("credit", "deposit", "depot", "dépôt", "in"),
        ("amount", "montant", "value"),
        ("balance", "solde"),
        ("description", "memo", "name", "libellé", "libelle", "payee"),
        False,
        (),
    ),
)

CREDIT_CARD_NEEDLES = ("visa", "mastercard", "carte de crédit", "credit card", "amex")


def detect_template(headers: list[str], preview: str) -> BankTemplate:
    blob = " ".join(headers).lower() + " " + preview.lower()
    for tmpl in TEMPLATES:
        if tmpl.bank_id == "inconnu":
            continue
        if any(n in blob for n in tmpl.header_needles):
            return tmpl
    return next(t for t in TEMPLATES if t.bank_id == "inconnu")


def pick_column(headers: list[str], keys: tuple[str, ...]) -> int | None:
    normalized = [_norm(h) for h in headers]
    for key in keys:
        k = _norm(key)
        for i, h in enumerate(normalized):
            if h == k or k in h:
                return i
    return None


def _norm(value: str) -> str:
    return (
        value.lower()
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("ô", "o")
        .replace("'", " ")
        .replace("’", " ")
        .strip()
    )
