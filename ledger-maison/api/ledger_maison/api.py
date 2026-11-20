from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyotp
from fastapi import Cookie, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func, select

from ledger_maison.classify import UserRule
from ledger_maison.dates import format_display
from ledger_maison.extract.pipeline import extract_bytes
from ledger_maison.hashing import normalize_label
from ledger_maison.markets import HttpProvider, gold_value_cad
from ledger_maison.money import Money
from ledger_maison.security import hash_password, session_token, verify_password, write_encrypted
from ledger_maison.store import (
    AccountRow,
    AuditRow,
    FavoriteRow,
    JournalRow,
    MemoryRow,
    RuleRow,
    SessionRow,
    StatementRow,
    TxRow,
    UserRow,
    connect,
    persist_statement,
    post_validated,
)
from ledger_maison.types import LineStatus, StatementStatus, SubCategory, TxType

ROOT = Path(os.environ.get("LEDGER_DATA", "./data")).resolve()
SESSION_FACTORY = connect(ROOT / "ledger.sqlite")
PROVIDER = HttpProvider(os.environ.get("MARKET_API_KEY"))
FILE_PASSWORD = os.environ.get("LEDGER_FILE_PASSWORD", "local-dev-change-me")

app = FastAPI(title="Ledger Maison")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _set_session_cookie(response: Response, request: Request, token: str) -> None:
    proto = request.headers.get("x-forwarded-proto", "")
    https = proto == "https" or str(request.base_url).startswith("https")
    response.set_cookie(
        "ledger_session",
        token,
        httponly=True,
        samesite="none" if https else "lax",
        secure=https,
        path="/",
        max_age=8 * 3600,
    )


def db():
    return SESSION_FACTORY()


def _token(request: Request, cookie: str | None) -> str | None:
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None
    return cookie


def current_user(request: Request, ledger_session: str | None = Cookie(default=None)):
    token = _token(request, ledger_session)
    if not token:
        raise HTTPException(401, "verrouillé")
    session = db()
    row = session.get(SessionRow, token)
    if row is None or row.expires < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(401, "verrouillé")
    return session


@app.get("/api/etat")
def etat():
    session = db()
    user = session.scalar(select(UserRow).limit(1))
    return {"installe": user is not None, "devise": "CAD"}


class SetupIn(BaseModel):
    mot_de_passe: str


@app.post("/api/installation")
def installation(body: SetupIn, request: Request, response: Response):
    session = db()
    if session.scalar(select(UserRow).limit(1)):
        raise HTTPException(409, "déjà installé")
    secret = pyotp.random_base32()
    session.add(UserRow(password_hash=hash_password(body.mot_de_passe), totp_secret=secret, totp_enabled=False))
    session.add(AccountRow(id="principal", name="Compte principal", kind="cheque", mask="••••", currency="CAD"))
    token = session_token()
    session.add(SessionRow(token=token, expires=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=8)))
    session.commit()
    _set_session_cookie(response, request, token)
    uri = pyotp.TOTP(secret).provisioning_uri(name="Ledger Maison", issuer_name="Ledger Maison")
    return {"totp": uri, "secret": secret, "token": token}


class LoginIn(BaseModel):
    mot_de_passe: str
    totp: str | None = None


@app.post("/api/connexion")
def connexion(body: LoginIn, request: Request, response: Response):
    session = db()
    user = session.scalar(select(UserRow).limit(1))
    if user is None or not verify_password(body.mot_de_passe, user.password_hash):
        raise HTTPException(401, "identifiants invalides")
    if user.totp_enabled:
        if not body.totp or not pyotp.TOTP(user.totp_secret).verify(body.totp, valid_window=1):
            raise HTTPException(401, "code TOTP invalide")
    token = session_token()
    session.add(SessionRow(token=token, expires=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=8)))
    session.commit()
    _set_session_cookie(response, request, token)
    return {"ok": True, "token": token}


@app.post("/api/verrou")
def verrou(request: Request, response: Response, ledger_session: str | None = Cookie(default=None)):
    session = db()
    token = _token(request, ledger_session)
    if token:
        row = session.get(SessionRow, token)
        if row:
            session.delete(row)
            session.commit()
    response.delete_cookie("ledger_session")
    return {"ok": True}


@app.post("/api/import")
async def importer(
    request: Request,
    fichiers: list[UploadFile] = File(...),
    ledger_session: str | None = Cookie(default=None),
):
    session = current_user(request, ledger_session)
    results = []
    for upload in fichiers:
        data = await upload.read()
        name = upload.filename or "releve.bin"
        results.append(_ingest(session, data, name))
    return {"resultats": results}


@app.post("/api/import-exemple")
def importer_exemple(request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    folder = Path(__file__).resolve().parents[1] / "tests" / "data"
    names = ["desjardins.csv", "visa-desjardins.csv"]
    results = []
    for name in names:
        path = folder / name
        if not path.exists():
            results.append({"fichier": name, "erreur": "exemple introuvable", "reconcilie": False})
            continue
        results.append(_ingest(session, path.read_bytes(), name))
    return {"resultats": results}


def _ingest(session, data: bytes, name: str) -> dict:
    try:
        stmt = extract_bytes(data, name)
        write_encrypted(ROOT / "uploads" / f"{stmt.file_sha256}.enc", data, FILE_PASSWORD)
        sid = persist_statement(session, stmt, "principal")
        return {
            "id": sid,
            "fichier": name,
            "banque": stmt.bank_name,
            "statut": stmt.status.value,
            "lignes": len(stmt.lines),
            "ouverture": stmt.opening_cents,
            "fermeture": stmt.closing_cents,
            "delta": stmt.reconciliation.delta_cents,
            "suspects": stmt.reconciliation.suspects,
            "reconcilie": stmt.reconciliation.balanced,
        }
    except Exception as exc:
        return {"fichier": name, "erreur": str(exc), "reconcilie": False}


@app.get("/api/file")
def file_attente(request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    rows = session.scalars(
        select(TxRow).where(TxRow.status.in_([LineStatus.A_VERIFIER.value, LineStatus.CONFLIT.value, LineStatus.EXTRAITE.value]))
    ).all()
    rows = sorted(rows, key=lambda r: (0 if r.status == LineStatus.CONFLIT.value else 1, r.confidence))
    return {"lignes": [_tx(r) for r in rows]}


@app.get("/api/transactions")
def transactions(request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    rows = session.scalars(select(TxRow).order_by(TxRow.booked_on.desc())).all()
    return {"lignes": [_tx(r) for r in rows]}


class PatchTx(BaseModel):
    tx_type: str | None = None
    sub: str | None = None
    cents: int | None = None
    booked_on: str | None = None
    note: str | None = None
    statut: str | None = None
    creer_regle: bool = False


@app.patch("/api/transactions/{tx_id}")
def patch_tx(tx_id: str, body: PatchTx, request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    row = session.get(TxRow, tx_id)
    if row is None:
        raise HTTPException(404)
    before = json.dumps({"type": row.tx_type, "sub": row.sub, "cents": row.cents, "status": row.status})
    if body.tx_type:
        row.tx_type = body.tx_type
    if body.sub:
        row.sub = body.sub
    if body.cents is not None:
        row.cents = body.cents
    if body.booked_on:
        row.booked_on = datetime.strptime(body.booked_on, "%Y-%m-%d").date()
    if body.note:
        row.why = body.note
    if body.statut:
        row.status = body.statut
    if body.creer_regle:
        session.add(
            RuleRow(
                pattern=row.label,
                tx_type=row.tx_type,
                sub=row.sub,
                why=f"Règle créée à partir de {row.label}",
            )
        )
        session.merge(
            MemoryRow(
                label_key=normalize_label(row.label),
                tx_type=row.tx_type,
                sub=row.sub,
                why=row.why,
            )
        )
    if row.status == LineStatus.VALIDEE.value:
        try:
            post_validated(session, row)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
    session.add(
        AuditRow(
            at=datetime.now(timezone.utc).replace(tzinfo=None),
            action="modifier",
            entity="transaction",
            entity_id=row.id,
            before=before,
            after=json.dumps({"type": row.tx_type, "sub": row.sub, "cents": row.cents, "status": row.status}),
        )
    )
    session.commit()
    return _tx(row)


@app.get("/api/tableau")
def tableau(request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    posted = session.scalars(select(TxRow).where(TxRow.posted.is_(True))).all()
    revenus = sum(r.cents or 0 for r in posted if r.tx_type == TxType.REVENU.value)
    depenses = sum(abs(r.cents or 0) for r in posted if r.tx_type == TxType.DEPENSE.value)
    transferts = sum(abs(r.cents or 0) for r in posted if r.tx_type == TxType.TRANSFERT.value)
    pending = session.scalars(
        select(TxRow).where(TxRow.status.in_([LineStatus.A_VERIFIER.value, LineStatus.CONFLIT.value, LineStatus.EXTRAITE.value]))
    ).all()
    pending_cents = sum(abs(r.cents or 0) for r in pending)
    cats: dict[str, int] = {}
    for r in posted:
        if r.tx_type == TxType.DEPENSE.value:
            cats[r.sub] = cats.get(r.sub, 0) + abs(r.cents or 0)
    net = revenus - depenses
    epargne = round(100 * net / revenus, 1) if revenus else None
    return {
        "revenus": revenus,
        "depenses": depenses,
        "net": net,
        "transferts": transferts,
        "epargne": epargne,
        "categories": cats,
        "a_verifier": len(pending),
        "incertitude_cents": pending_cents,
        "affichage": {
            "revenus": Money(revenus).format_qc(),
            "depenses": Money(depenses).format_qc(),
            "net": Money(net).format_qc(),
            "incertitude": Money(pending_cents).format_qc(),
        },
    }


@app.get("/api/releves")
def releves(request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    rows = session.scalars(select(StatementRow)).all()
    return {
        "releves": [
            {
                "id": r.id,
                "fichier": r.file_name,
                "banque": r.bank_id,
                "statut": r.status,
                "ouverture": r.opening_cents,
                "fermeture": r.closing_cents,
                "delta": r.delta_cents,
                "suspects": json.loads(r.payload or "[]"),
            }
            for r in rows
        ]
    }


class CalcIn(BaseModel):
    a: float | None = None
    b: float | None = None
    op: str = "+"
    grams: float | None = None
    purity: str = "24k"
    principal: float | None = None
    rate: float | None = None
    years: float | None = None
    qty: float | None = None
    buy: float | None = None
    now: float | None = None


@app.post("/api/calculatrice")
def calculatrice(body: CalcIn):
    if body.op in {"+", "-", "*", "/"} and body.a is not None and body.b is not None:
        ops = {
            "+": body.a + body.b,
            "-": body.a - body.b,
            "*": body.a * body.b,
            "/": (body.a / body.b if body.b else None),
        }
        return {"resultat": ops[body.op]}
    if body.op == "or" and body.grams is not None:
        metal = PROVIDER.metal("XAU")
        cad = gold_value_cad(grams=body.grams, purity=body.purity, spot_usd_per_oz=metal.price, usd_cad=1.35)
        return {
            "spot": metal.price,
            "as_of": metal.as_of,
            "stale": metal.stale,
            "cad": cad,
            "erreur": metal.error,
        }
    if body.op == "compose" and None not in {body.principal, body.rate, body.years}:
        fv = body.principal * (1 + (body.rate or 0) / 100) ** (body.years or 0)
        return {"resultat": fv}
    if body.op == "position" and None not in {body.qty, body.buy, body.now}:
        return {"resultat": (body.now - body.buy) * body.qty}
    raise HTTPException(400, "paramètres incomplets")


@app.get("/api/marches/or")
def or_spot():
    q = PROVIDER.metal("XAU")
    ag = PROVIDER.metal("XAG")
    pt = PROVIDER.metal("XPT")
    return {"or": q.__dict__, "argent": ag.__dict__, "platine": pt.__dict__, "avertissement": "Informations à titre indicatif, pas un conseil financier."}


@app.get("/api/marches/recherche")
def recherche(q: str):
    return {"resultats": [x.__dict__ for x in PROVIDER.search(q)]}


@app.get("/api/marches/favoris")
def favoris(request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    rows = session.scalars(select(FavoriteRow).order_by(FavoriteRow.position)).all()
    quotes = [PROVIDER.quote(r.symbol).__dict__ | {"position": r.position} for r in rows]
    return {"favoris": quotes, "avertissement": "Informations à titre indicatif, pas un conseil financier."}


class FavIn(BaseModel):
    symbol: str
    ordre: list[str] | None = None


@app.post("/api/marches/favoris")
def add_fav(body: FavIn, request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    count = session.scalar(select(func.count()).select_from(FavoriteRow)) or 0
    session.merge(FavoriteRow(symbol=body.symbol.upper(), position=count))
    session.commit()
    return {"ok": True}


@app.delete("/api/marches/favoris/{symbol}")
def del_fav(symbol: str, request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    row = session.get(FavoriteRow, symbol.upper())
    if row:
        session.delete(row)
        session.commit()
    return {"ok": True}


@app.put("/api/marches/favoris")
def reorder(body: FavIn, request: Request, ledger_session: str | None = Cookie(default=None)):
    session = current_user(request, ledger_session)
    for i, sym in enumerate(body.ordre or []):
        row = session.get(FavoriteRow, sym.upper())
        if row:
            row.position = i
    session.commit()
    return {"ok": True}


@app.get("/api/marches/fiche/{symbol}")
def fiche(symbol: str):
    card = PROVIDER.profile(symbol)
    if card is None:
        return {"indisponible": True, "message": "Fiche indisponible. Aucune donnée inventée."}
    return card.__dict__


def _tx(row: TxRow) -> dict:
    source = json.loads(row.source_json)
    return {
        "id": row.id,
        "date": row.booked_on.isoformat() if row.booked_on else None,
        "date_affichee": format_display(row.booked_on) if row.booked_on else None,
        "cents": row.cents,
        "montant": Money(row.cents or 0, row.currency).format_qc() if row.cents is not None else "—",
        "label": row.label,
        "type": row.tx_type,
        "sous": row.sub,
        "pourquoi": row.why,
        "regle": row.rule,
        "ia": row.ia,
        "statut": row.status,
        "confiance": row.confidence,
        "source": source,
        "posted": row.posted,
    }
