from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

import httpx


@dataclass(slots=True)
class Quote:
    symbol: str
    name: str
    price: float | None
    currency: str
    change: float | None
    change_pct: float | None
    as_of: str
    stale: bool
    error: str | None = None


@dataclass(slots=True)
class CompanyCard:
    symbol: str
    name: str
    description: str
    sector: str | None
    industry: str | None
    country: str | None
    hq: str | None
    website: str | None
    market_cap: str | None
    pe: str | None
    dividend: str | None
    products: str | None
    competitors: str | None
    as_of: str
    source: str


class MarketProvider(Protocol):
    def quote(self, symbol: str) -> Quote: ...
    def search(self, query: str) -> list[Quote]: ...
    def profile(self, symbol: str) -> CompanyCard | None: ...
    def metal(self, code: str) -> Quote: ...


class HttpProvider:
    """Fournisseur interchangeable. Sans clé : indisponible, jamais de chiffre inventé."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        self._last: dict[str, Quote] = {}

    def quote(self, symbol: str) -> Quote:
        if not self.api_key:
            return self._unavailable(symbol, "Actions")
        try:
            with httpx.Client(timeout=8.0) as client:
                url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={self.api_key}"
                data = client.get(url).json()
            g = data.get("Global Quote") or {}
            price = _f(g.get("05. price"))
            prev = _f(g.get("09. change"))
            pct = _f((g.get("10. change percent") or "").replace("%", ""))
            if price is None:
                return self._unavailable(symbol, "Actions")
            q = Quote(symbol.upper(), symbol.upper(), price, "USD", prev, pct, _now(), False, None)
            self._last[symbol.upper()] = q
            return q
        except Exception:
            return self._unavailable(symbol, "Actions")

    def search(self, query: str) -> list[Quote]:
        q = self.quote(query.strip().upper())
        return [q]

    def profile(self, symbol: str) -> CompanyCard | None:
        if not self.api_key:
            return None
        try:
            with httpx.Client(timeout=8.0) as client:
                url = f"https://www.alphavantage.co/query?function=OVERVIEW&symbol={symbol}&apikey={self.api_key}"
                data = client.get(url).json()
            if not data.get("Name"):
                return None
            return CompanyCard(
                symbol=symbol.upper(),
                name=data.get("Name") or symbol,
                description=data.get("Description") or "Description indisponible.",
                sector=data.get("Sector"),
                industry=data.get("Industry"),
                country=data.get("Country"),
                hq=data.get("Address"),
                website=None,
                market_cap=data.get("MarketCapitalization"),
                pe=data.get("PERatio"),
                dividend=data.get("DividendYield"),
                products=None,
                competitors=None,
                as_of=_now(),
                source="api",
            )
        except Exception:
            return None

    def metal(self, code: str) -> Quote:
        mapping = {"XAU": "XAU", "XAG": "XAG", "XPT": "XPT"}
        sym = mapping.get(code.upper(), code.upper())
        try:
            with httpx.Client(timeout=8.0) as client:
                r = client.get(f"https://api.gold-api.com/price/{sym}")
                r.raise_for_status()
                data = r.json()
            price = _f(data.get("price"))
            if price is None:
                return self._unavailable(sym, "Métal")
            q = Quote(sym, code.upper(), price, "USD", None, None, _now(), False, None)
            self._last[sym] = q
            return q
        except Exception:
            return self._unavailable(sym, "Métal")

    def _unavailable(self, symbol: str, name: str) -> Quote:
        last = self._last.get(symbol.upper())
        if last:
            return Quote(
                last.symbol,
                last.name,
                last.price,
                last.currency,
                last.change,
                last.change_pct,
                last.as_of,
                True,
                "indisponible",
            )
        return Quote(symbol.upper(), name, None, "USD", None, None, _now(), True, "indisponible")


def _f(value: object) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M UTC")


TROY_OZ_G = 31.1034768
PURITY = {"24k": 1.0, "18k": 18 / 24, "14k": 14 / 24, "10k": 10 / 24}


def gold_value_cad(
    *,
    grams: float,
    purity: str,
    spot_usd_per_oz: float | None,
    usd_cad: float | None,
) -> float | None:
    if spot_usd_per_oz is None or usd_cad is None:
        return None
    oz = grams / TROY_OZ_G
    usd = oz * spot_usd_per_oz * PURITY[purity]
    return usd * usd_cad
