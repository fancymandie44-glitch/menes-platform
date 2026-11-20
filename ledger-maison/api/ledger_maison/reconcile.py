from __future__ import annotations

from ledger_maison.types import AccountKind, ExtractedLine, LineStatus, Reconciliation


def reconcile_statement(
    opening_cents: int | None,
    closing_cents: int | None,
    lines: list[ExtractedLine],
    kind: AccountKind,
) -> Reconciliation:
    credits = sum((line.credit_cents or 0) for line in lines if line.status != LineStatus.REJETEE)
    debits = sum((line.debit_cents or 0) for line in lines if line.status != LineStatus.REJETEE)
    computed: int | None = None
    delta: int | None = None
    balanced = False
    suspects: list[str] = []

    countable = [line for line in lines if line.status not in {LineStatus.REJETEE}]
    if any(line.status in {LineStatus.CONFLIT, LineStatus.A_VERIFIER} or line.cents is None for line in countable):
        suspects.extend(
            f"{line.label}: {line.status}" + (f" ({line.conflict_reason})" if line.conflict_reason else "")
            for line in countable
            if line.status in {LineStatus.CONFLIT, LineStatus.A_VERIFIER} or line.cents is None
        )

    if opening_cents is not None:
        if kind == AccountKind.CARTE:
            computed = opening_cents + debits - credits
        else:
            computed = opening_cents + credits - debits
        if closing_cents is not None:
            delta = computed - closing_cents
            balanced = delta == 0 and not suspects
            if delta != 0:
                suspects.append(f"écart de réconciliation : {delta} cents")
                suspects.extend(_sign_suspects(lines, kind))
        else:
            suspects.append("solde de fermeture absent")
    else:
        suspects.append("solde d'ouverture absent")

    return Reconciliation(
        opening_cents=opening_cents,
        closing_cents=closing_cents,
        credit_total_cents=credits,
        debit_total_cents=debits,
        computed_closing_cents=computed,
        delta_cents=delta,
        balanced=balanced,
        suspects=suspects,
    )


def _sign_suspects(lines: list[ExtractedLine], kind: AccountKind) -> list[str]:
    out: list[str] = []
    prev = None
    for line in lines:
        if line.running_balance_cents is None or line.debit_cents is None or line.credit_cents is None:
            continue
        if prev is None:
            prev = line.running_balance_cents
            continue
        if kind == AccountKind.CARTE:
            expected = prev + line.debit_cents - line.credit_cents
        else:
            expected = prev - line.debit_cents + line.credit_cents
        if expected != line.running_balance_cents:
            out.append(
                f"solde courant incohérent « {line.label} » : attendu {expected} cents, lu {line.running_balance_cents}"
            )
        prev = line.running_balance_cents
    return out
