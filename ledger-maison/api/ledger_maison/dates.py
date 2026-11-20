from __future__ import annotations

import calendar
import re
from datetime import date

_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_D4 = re.compile(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$")
_D2 = re.compile(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$")

_MONTHS_FR = {
    "janv": 1,
    "janvier": 1,
    "fevr": 2,
    "févr": 2,
    "fevrier": 2,
    "février": 2,
    "mars": 3,
    "avr": 4,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juil": 7,
    "juillet": 7,
    "aout": 8,
    "août": 8,
    "sept": 9,
    "septembre": 9,
    "oct": 10,
    "octobre": 10,
    "nov": 11,
    "novembre": 11,
    "dec": 12,
    "déc": 12,
    "decembre": 12,
    "décembre": 12,
}

_MONTHS_EN = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def parse_date(raw: str, *, prefer: str = "dmy") -> date | None:
    """prefer: dmy (Canada) ou mdy. None si ambigu ou invalide."""
    text = raw.strip()
    if not text:
        return None
    iso = _ISO.match(text)
    if iso:
        return _safe(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
    named = _named(text)
    if named:
        return named
    m = _D4.match(text) or _D2.match(text)
    if not m:
        return None
    a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000 if y < 80 else 1900
    if a > 12 and b <= 12:
        return _safe(y, b, a)
    if b > 12 and a <= 12:
        return _safe(y, a, b)
    if a <= 12 and b <= 12:
        if prefer == "mdy":
            return _safe(y, a, b)
        return _safe(y, b, a)
    return None


def date_is_ambiguous(raw: str) -> bool:
    text = raw.strip()
    m = _D4.match(text) or _D2.match(text)
    if not m:
        return False
    a, b = int(m.group(1)), int(m.group(2))
    return a <= 12 and b <= 12 and a != b


def format_display(value: date) -> str:
    months = (
        "janvier",
        "février",
        "mars",
        "avril",
        "mai",
        "juin",
        "juillet",
        "août",
        "septembre",
        "octobre",
        "novembre",
        "décembre",
    )
    return f"{value.day:02d} {months[value.month - 1]} {value.year}"


def format_iso(value: date) -> str:
    return value.isoformat()


def _named(text: str) -> date | None:
    cleaned = text.lower().replace(".", "")
    m = re.match(r"(\d{1,2})\s+([a-zéûôè]+)\s+(\d{4})", cleaned)
    if m:
        month = _MONTHS_FR.get(m.group(2)) or _MONTHS_EN.get(m.group(2))
        if month:
            return _safe(int(m.group(3)), month, int(m.group(1)))
    m = re.match(r"([a-z]+)\s+(\d{1,2}),?\s+(\d{4})", cleaned)
    if m:
        month = _MONTHS_EN.get(m.group(1))
        if month:
            return _safe(int(m.group(3)), month, int(m.group(2)))
    return None


def _safe(year: int, month: int, day: int) -> date | None:
    if month < 1 or month > 12:
        return None
    last = calendar.monthrange(year, month)[1]
    if day < 1 or day > last:
        return None
    return date(year, month, day)
