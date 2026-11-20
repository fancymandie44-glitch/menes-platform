from __future__ import annotations

from ledger_maison.reconcile import reconcile_statement
from ledger_maison.types import ExtractedLine, ExtractedStatement, LineStatus, StatementStatus


def merge_dual(primary: ExtractedStatement, secondary: ExtractedStatement) -> ExtractedStatement:
    merged: list[ExtractedLine] = []
    n = max(len(primary.lines), len(secondary.lines))
    for i in range(n):
        a = primary.lines[i] if i < len(primary.lines) else None
        b = secondary.lines[i] if i < len(secondary.lines) else None
        if a is None:
            b.status = LineStatus.CONFLIT
            b.conflict_reason = f"ligne absente de {primary.lines[0].extractor if primary.lines else 'primaire'}"
            merged.append(b)
            continue
        if b is None:
            a.status = LineStatus.CONFLIT
            a.conflict_reason = f"ligne absente de {secondary.lines[0].extractor if secondary.lines else 'secondaire'}"
            merged.append(a)
            continue
        if a.cents != b.cents or a.booked_on != b.booked_on:
            a.status = LineStatus.CONFLIT
            a.conflict_reason = (
                f"divergence {a.extractor}/{b.extractor} : "
                f"{a.booked_on} {a.cents} vs {b.booked_on} {b.cents}"
            )
            a.confidence = min(a.confidence, 5)
        merged.append(a)
    primary.lines = merged
    primary.reconciliation = reconcile_statement(
        primary.opening_cents,
        primary.closing_cents,
        merged,
        primary.kind,
    )
    primary.status = (
        StatementStatus.RECONCILE if primary.reconciliation.balanced else StatementStatus.NON_RECONCILE
    )
    if any(line.status == LineStatus.CONFLIT for line in merged):
        primary.status = StatementStatus.NON_RECONCILE
        primary.notes.append("double extraction en conflit — rien n'est compté tant que tu n'as pas tranché")
    return primary
