from __future__ import annotations

import re
from dataclasses import dataclass

from ledger_maison.hashing import normalize_label
from ledger_maison.types import Classification, ExtractedLine, SubCategory, TxType


@dataclass(frozen=True, slots=True)
class UserRule:
    pattern: str
    tx_type: TxType
    sub: SubCategory
    why: str


def classify(
    line: ExtractedLine,
    *,
    user_rules: list[UserRule] | None = None,
    memory: dict[str, Classification] | None = None,
) -> Classification:
    label = normalize_label(line.label)
    for rule in user_rules or []:
        if re.search(rule.pattern, line.label, re.I) or re.search(rule.pattern, label, re.I):
            return Classification(rule.tx_type, rule.sub, rule.why, "règle utilisateur", 99, False)

    if memory:
        key = normalize_label(line.label)
        if key in memory:
            remembered = memory[key]
            return Classification(
                remembered.tx_type,
                remembered.sub,
                f"Même libellé que ta correction précédente sur « {line.label} ».",
                "mémoire des corrections",
                96,
                False,
            )

    det = _deterministic(line, label)
    if det:
        return det
    return Classification(
        TxType.AUTRE,
        SubCategory.A_CLASSER,
        "Aucun mot-clé ni règle. À classer.",
        "défaut",
        25,
        False,
    )


def classify_ia_suggestion(line: ExtractedLine, proposed: Classification) -> Classification:
    """Étiquette obligatoire : suggestion IA. N'écrit jamais le montant."""
    return Classification(
        proposed.tx_type,
        proposed.sub,
        proposed.why,
        "suggestion IA",
        min(proposed.confidence, 55),
        True,
    )


_DETERMINISTIC: tuple[tuple[tuple[str, ...], TxType, SubCategory, str], ...] = (
    (("HYDRO QUEBEC", "HYDRO-QUEBEC"), TxType.DEPENSE, SubCategory.LOGEMENT, "Hydro-Québec, électricité"),
    (("VIDEOtron", "BELL CANADA", "ROGERS", "FIDO"), TxType.DEPENSE, SubCategory.ABONNEMENTS, "télécom / abonnement"),
    (("NETFLIX", "SPOTIFY", "APPLE.COM/BILL", "DISNEYPLUS"), TxType.DEPENSE, SubCategory.ABONNEMENTS, "abonnement"),
    (("IGA", "METRO", "SUPER C", "PROVIGO", "COSTCO"), TxType.DEPENSE, SubCategory.EPICERIE, "épicerie"),
    (("TIM HORTONS", "STARBUCKS", "MCDONALD", "RESTAURANT"), TxType.DEPENSE, SubCategory.RESTO, "resto"),
    (("STM ", "STM-", "EXPRESS DE LA STM", "UBER", "TAXI"), TxType.DEPENSE, SubCategory.TRANSPORT, "transport"),
    (("PETRO", "SHELL", "ESSO", "ULTRAMAR"), TxType.DEPENSE, SubCategory.ESSENCE, "essence"),
    (("RAMQ", "PHARMAPRIX", "JEAN COUTU"), TxType.DEPENSE, SubCategory.SANTE, "santé"),
    (("DESJARDINS ASS", "BELAIR", "INTACT", "SUN LIFE"), TxType.DEPENSE, SubCategory.ASSURANCES, "assurance"),
    (("REVENU QUEBEC", "ARC ", "CRA ", "IMPOT"), TxType.DEPENSE, SubCategory.TAXES, "taxes / impôts"),
    (("FRAIS ", "FRAIS MENSUELS", "MONTHLY FEE"), TxType.DEPENSE, SubCategory.FRAIS_BANCAIRES, "frais bancaires"),
    (("INTERET", "INTEREST"), TxType.DEPENSE, SubCategory.INTERETS_PAYES, "intérêts"),
    (("PAIEMENT CARTE", "PAYMENT THANK YOU", "PAIEMENT - CARTE"), TxType.PAIEMENT_DETTE, SubCategory.CARTE_CREDIT, "paiement de carte"),
    (("VIREMENT", "TRANSFER", "INTERAC"), TxType.TRANSFERT, SubCategory.A_CLASSER, "virement / Interac"),
    (("DEPOT SALAIRE", "PAIE ", "PAYROLL"), TxType.REVENU, SubCategory.SALAIRE, "paie"),
    (("DIVIDENDE", "DIVIDEND"), TxType.REVENU, SubCategory.DIVIDENDES, "dividende"),
    (("PLACEMENT", "WEALTHSIMPLE", "QUESTRADE", "COTISATION REER"), TxType.INVESTISSEMENT, SubCategory.A_CLASSER, "placement"),
)


def _deterministic(line: ExtractedLine, label: str) -> Classification | None:
    for needles, tx_type, sub, why in _DETERMINISTIC:
        if any(n in label for n in needles):
            return Classification(
                tx_type,
                sub,
                f"Libellé « {line.label} » → {why}.",
                "règle déterministe (mots-clés)",
                88,
                False,
            )
    return None
