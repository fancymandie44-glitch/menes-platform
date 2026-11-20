from __future__ import annotations

from collections import defaultdict
from datetime import date

from ledger_maison.hashing import transaction_fingerprint
from ledger_maison.types import ExtractedStatement


def file_duplicate(existing_hashes: set[str], file_sha256: str) -> bool:
    return file_sha256 in existing_hashes


def line_duplicates(statement: ExtractedStatement, known: set[str], account_id: str) -> list[str]:
    hits: list[str] = []
    for line in statement.lines:
        if line.booked_on is None or line.cents is None:
            continue
        fp = transaction_fingerprint(
            booked_on=line.booked_on,
            cents=line.cents,
            label=line.label,
            account_id=account_id,
        )
        if fp in known:
            hits.append(fp)
        known.add(fp)
    return hits


def consecutive_balance_gap(previous_closing: int | None, next_opening: int | None) -> int | None:
    if previous_closing is None or next_opening is None:
        return None
    if previous_closing == next_opening:
        return 0
    return next_opening - previous_closing


def date_holes(days: list[date]) -> list[str]:
    if len(days) < 2:
        return []
    ordered = sorted(days)
    notes: list[str] = []
    for a, b in zip(ordered, ordered[1:]):
        delta = (b - a).days
        if delta > 40:
            notes.append(f"trou de {delta} jours entre {a.isoformat()} et {b.isoformat()}")
    return notes


def outlier_amounts(cents_list: list[int], factor: int = 20) -> list[int]:
    if not cents_list:
        return []
    median = sorted(abs(c) for c in cents_list)[len(cents_list) // 2]
    if median == 0:
        return []
    return [c for c in cents_list if abs(c) > median * factor]
