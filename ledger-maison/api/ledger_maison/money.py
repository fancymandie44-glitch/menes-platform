from __future__ import annotations

import re
from dataclasses import dataclass

_NBSP = "\u00a0"
_NNBSP = "\u202f"


@dataclass(frozen=True, slots=True, order=True)
class Money:
    """Montant en cents. Jamais de float."""

    cents: int
    currency: str = "CAD"

    def __add__(self, other: Money) -> Money:
        _same(self, other)
        return Money(self.cents + other.cents, self.currency)

    def __sub__(self, other: Money) -> Money:
        _same(self, other)
        return Money(self.cents - other.cents, self.currency)

    def __neg__(self) -> Money:
        return Money(-self.cents, self.currency)

    @property
    def abs(self) -> Money:
        return Money(abs(self.cents), self.currency)

    def format_qc(self) -> str:
        sign = "−" if self.cents < 0 else ""
        whole, frac = divmod(abs(self.cents), 100)
        grouped = f"{whole:,}".replace(",", " ")
        symbol = {"CAD": "$", "USD": "US$", "EUR": "€"}.get(self.currency, self.currency)
        return f"{sign}{grouped},{frac:02d} {symbol}"


def _same(a: Money, b: Money) -> None:
    if a.currency != b.currency:
        raise ValueError(f"devises distinctes : {a.currency} vs {b.currency}")


def amount_literals(cents: int) -> tuple[str, ...]:
    """Formes d'écriture qu'on doit retrouver dans le relevé source."""
    sign = "-" if cents < 0 else ""
    n = abs(cents)
    whole, frac = divmod(n, 100)
    comma = f"{whole},{frac:02d}"
    dot = f"{whole}.{frac:02d}"
    spaced_fr = f"{whole:,}".replace(",", " ") + f",{frac:02d}"
    spaced_nbsp = spaced_fr.replace(" ", _NBSP)
    us = f"{whole:,}.{frac:02d}"
    forms = [
        f"{sign}{comma}",
        f"{sign}{dot}",
        f"{sign}{spaced_fr}",
        f"{sign}{spaced_nbsp}",
        f"{sign}{us}",
        f"({comma})",
        f"({dot})",
        f"({spaced_fr})",
        f"({us})",
        f"{comma} CR",
        f"{dot} CR",
        f"{comma} DR",
        f"{dot} DR",
        f"{comma}CR",
        f"{dot}DR",
    ]
    if whole >= 1000:
        thin = f"{whole:,}".replace(",", _NNBSP) + f",{frac:02d}"
        forms.append(f"{sign}{thin}")
    return tuple(dict.fromkeys(forms))


def source_contains_amount(source: str, cents: int) -> bool:
    text = source.replace(_NBSP, " ").replace(_NNBSP, " ")
    compact = re.sub(r"\s+", "", text)
    for form in amount_literals(cents):
        needle = form.replace(_NBSP, " ").replace(_NNBSP, " ")
        if needle in text or re.sub(r"\s+", "", needle) in compact:
            return True
    return False


_AMOUNT_TOKEN = re.compile(
    r"""
    (?P<par>\()?
    (?P<sign>[-+])?
    (?P<body>(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d{2})?)
    (?P<par2>\))?
    (?:\s*(?P<crdr>CR|DR|cr|dr))?
    """,
    re.VERBOSE,
)


def parse_amount_token(raw: str) -> int | None:
    """Parse un jeton de montant. None si illisible. Résultat en cents (signe inclus)."""
    text = raw.strip().replace(_NBSP, " ").replace(_NNBSP, " ")
    if not text or text in {".", "-", "—", "–"}:
        return None
    match = _AMOUNT_TOKEN.search(text)
    if not match:
        return None
    body = match.group("body")
    if body is None:
        return None
    if "," in body and "." in body:
        if body.rfind(".") > body.rfind(","):
            body = body.replace(",", "")
        else:
            body = body.replace(".", "").replace(",", ".")
    elif "," in body:
        parts = body.split(",")
        if len(parts) == 2 and len(parts[1]) == 2:
            body = body.replace(" ", "").replace(",", ".")
        else:
            body = body.replace(",", "")
    else:
        body = body.replace(" ", "")
    if "." not in body:
        return None
    whole, frac = body.rsplit(".", 1)
    if len(frac) != 2 or not whole.isdigit() or not frac.isdigit():
        return None
    cents = int(whole) * 100 + int(frac)
    negative = False
    if match.group("par") and match.group("par2"):
        negative = True
    if match.group("sign") == "-":
        negative = True
    crdr = (match.group("crdr") or "").upper()
    if crdr == "DR":
        negative = True
    if crdr == "CR":
        negative = False
        cents = abs(cents)
    return -cents if negative else cents
