from __future__ import annotations

import hashlib
import re
from datetime import date


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_label(label: str) -> str:
    text = label.upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def transaction_fingerprint(
    *,
    booked_on: date,
    cents: int,
    label: str,
    account_id: str,
) -> str:
    payload = f"{booked_on.isoformat()}|{cents}|{normalize_label(label)}|{account_id}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
