from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum


class TxType(StrEnum):
    DEPENSE = "depense"
    REVENU = "revenu"
    PAIEMENT_DETTE = "paiement_dette"
    DETTE = "dette"
    PRET = "pret"
    TRANSFERT = "transfert"
    INVESTISSEMENT = "investissement"
    AUTRE = "autre"


class SubCategory(StrEnum):
    LOGEMENT = "logement"
    EPICERIE = "epicerie"
    RESTO = "resto"
    TRANSPORT = "transport"
    ESSENCE = "essence"
    ABONNEMENTS = "abonnements"
    SANTE = "sante"
    ASSURANCES = "assurances"
    TAXES = "taxes"
    FRAIS_BANCAIRES = "frais_bancaires"
    INTERETS_PAYES = "interets_payes"
    VETEMENTS = "vetements"
    DIVERTISSEMENT = "divertissement"
    EDUCATION = "education"
    CADEAUX = "cadeaux"
    AFFAIRES = "affaires"
    AUTRE_DEPENSE = "autre_depense"
    SALAIRE = "salaire"
    ENTREPRISE = "entreprise"
    REMBOURSEMENT_IMPOT = "remboursement_impot"
    INTERETS_RECUS = "interets_recus"
    DIVIDENDES = "dividendes"
    VENTES = "ventes"
    AUTRE_REVENU = "autre_revenu"
    CARTE_CREDIT = "carte_credit"
    MARGE = "marge"
    PRET_AUTO = "pret_auto"
    PRET_ETUDIANT = "pret_etudiant"
    HYPOTHEQUE = "hypotheque"
    A_CLASSER = "a_classer"


class LineStatus(StrEnum):
    EXTRAITE = "extraite"
    A_VERIFIER = "a_verifier"
    CONFLIT = "conflit"
    VALIDEE = "validee"
    REJETEE = "rejetee"


class StatementStatus(StrEnum):
    RECONCILE = "reconcilie"
    NON_RECONCILE = "non_reconcilie"
    EN_REVUE = "en_revue"
    INTEGRE = "integre"


class AccountKind(StrEnum):
    CHEQUE = "cheque"
    EPARGNE = "epargne"
    CARTE = "carte"
    PLACEMENT = "placement"
    PRET = "pret"


@dataclass(slots=True)
class SourceSpan:
    file_name: str
    page: int | None
    raw_line: str
    bbox: tuple[float, float, float, float] | None = None


@dataclass(slots=True)
class ExtractedLine:
    booked_on: date | None
    cents: int | None
    currency: str
    label: str
    debit_cents: int | None
    credit_cents: int | None
    running_balance_cents: int | None
    status: LineStatus
    confidence: int
    source: SourceSpan
    conflict_reason: str | None = None
    date_ambiguous: bool = False
    extractor: str = ""


@dataclass(slots=True)
class Classification:
    tx_type: TxType
    sub: SubCategory
    why: str
    rule: str
    confidence: int
    ia: bool = False


@dataclass(slots=True)
class Reconciliation:
    opening_cents: int | None
    closing_cents: int | None
    credit_total_cents: int
    debit_total_cents: int
    computed_closing_cents: int | None
    delta_cents: int | None
    balanced: bool
    suspects: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ExtractedStatement:
    bank_id: str
    bank_name: str
    account_mask: str
    kind: AccountKind
    period_start: date | None
    period_end: date | None
    currency: str
    opening_cents: int | None
    closing_cents: int | None
    lines: list[ExtractedLine]
    reconciliation: Reconciliation
    file_sha256: str
    file_name: str
    status: StatementStatus
    notes: list[str] = field(default_factory=list)
