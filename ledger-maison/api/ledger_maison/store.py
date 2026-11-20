from __future__ import annotations

import json
import os
import secrets
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from ledger_maison.audit import stamp
from ledger_maison.classify import UserRule, classify
from ledger_maison.hashing import sha256_bytes, transaction_fingerprint
from ledger_maison.ledger import post_transaction
from ledger_maison.types import (
    ExtractedStatement,
    LineStatus,
    StatementStatus,
    SubCategory,
    TxType,
)


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    totp_secret: Mapped[str] = mapped_column(String(64))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class AccountRow(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20))
    mask: Mapped[str] = mapped_column(String(16))
    currency: Mapped[str] = mapped_column(String(3), default="CAD")


class StatementRow(Base):
    __tablename__ = "statements"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    file_name: Mapped[str] = mapped_column(String(255))
    file_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    bank_id: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(32))
    opening_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    closing_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    delta_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload: Mapped[str] = mapped_column(Text)


class TxRow(Base):
    __tablename__ = "transactions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    statement_id: Mapped[str] = mapped_column(ForeignKey("statements.id"))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    booked_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="CAD")
    fx_rate: Mapped[str | None] = mapped_column(String(32), nullable=True)
    label: Mapped[str] = mapped_column(String(255))
    tx_type: Mapped[str] = mapped_column(String(32))
    sub: Mapped[str] = mapped_column(String(32))
    why: Mapped[str] = mapped_column(Text)
    rule: Mapped[str] = mapped_column(String(80))
    ia: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32))
    confidence: Mapped[int] = mapped_column(Integer)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    source_json: Mapped[str] = mapped_column(Text)
    posted: Mapped[bool] = mapped_column(Boolean, default=False)


class JournalRow(Base):
    __tablename__ = "journal_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tx_id: Mapped[str] = mapped_column(ForeignKey("transactions.id"))
    account: Mapped[str] = mapped_column(String(120))
    debit_cents: Mapped[int] = mapped_column(Integer)
    credit_cents: Mapped[int] = mapped_column(Integer)
    memo: Mapped[str] = mapped_column(String(255))


class AuditRow(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime)
    action: Mapped[str] = mapped_column(String(40))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(64))
    before: Mapped[str | None] = mapped_column(Text, nullable=True)
    after: Mapped[str | None] = mapped_column(Text, nullable=True)


class RuleRow(Base):
    __tablename__ = "rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pattern: Mapped[str] = mapped_column(String(255))
    tx_type: Mapped[str] = mapped_column(String(32))
    sub: Mapped[str] = mapped_column(String(32))
    why: Mapped[str] = mapped_column(Text)


class MemoryRow(Base):
    __tablename__ = "memory"
    label_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    tx_type: Mapped[str] = mapped_column(String(32))
    sub: Mapped[str] = mapped_column(String(32))
    why: Mapped[str] = mapped_column(Text)


class FavoriteRow(Base):
    __tablename__ = "favorites"
    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class SessionRow(Base):
    __tablename__ = "sessions"
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires: Mapped[datetime] = mapped_column(DateTime)


def connect(path: Path) -> sessionmaker:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{path}", future=True)
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def new_id() -> str:
    return secrets.token_hex(8)


def persist_statement(session, stmt: ExtractedStatement, account_id: str) -> str:
    existing = session.scalar(select(StatementRow).where(StatementRow.file_sha256 == stmt.file_sha256))
    if existing:
        raise ValueError("fichier déjà importé (empreinte SHA-256)")
    sid = new_id()
    session.add(
        StatementRow(
            id=sid,
            account_id=account_id,
            file_name=stmt.file_name,
            file_sha256=stmt.file_sha256,
            bank_id=stmt.bank_id,
            status=stmt.status.value,
            opening_cents=stmt.opening_cents,
            closing_cents=stmt.closing_cents,
            delta_cents=stmt.reconciliation.delta_cents,
            payload=json.dumps(stmt.reconciliation.suspects, ensure_ascii=False),
        )
    )
    rules = [
        UserRule(r.pattern, TxType(r.tx_type), SubCategory(r.sub), r.why) for r in session.scalars(select(RuleRow))
    ]
    memory_map = {}
    from ledger_maison.types import Classification

    for m in session.scalars(select(MemoryRow)):
        memory_map[m.label_key] = Classification(TxType(m.tx_type), SubCategory(m.sub), m.why, "mémoire", 96, False)
    for line in stmt.lines:
        cid = classify(line, user_rules=rules, memory=memory_map)
        fp = (
            transaction_fingerprint(
                booked_on=line.booked_on or date(1970, 1, 1),
                cents=line.cents or 0,
                label=line.label,
                account_id=account_id,
            )
            if line.booked_on
            else sha256_bytes(line.label.encode())
        )
        dup = session.scalar(select(TxRow).where(TxRow.fingerprint == fp))
        status = LineStatus.A_VERIFIER.value if dup else line.status.value
        session.add(
            TxRow(
                id=new_id(),
                statement_id=sid,
                account_id=account_id,
                booked_on=line.booked_on,
                cents=line.cents,
                currency=line.currency,
                label=line.label,
                tx_type=cid.tx_type.value,
                sub=cid.sub.value,
                why=cid.why,
                rule=cid.rule,
                ia=cid.ia,
                status=status if stmt.status != StatementStatus.NON_RECONCILE else LineStatus.A_VERIFIER.value,
                confidence=line.confidence,
                fingerprint=fp,
                source_json=json.dumps(
                    {
                        "file": line.source.file_name,
                        "page": line.source.page,
                        "raw": line.source.raw_line,
                        "bbox": line.source.bbox,
                    },
                    ensure_ascii=False,
                ),
                posted=False,
            )
        )
    event = stamp("import", "statement", sid, None, stmt.file_name)
    session.add(
        AuditRow(
            at=datetime.fromisoformat(event.at.replace("Z", "+00:00")) if "T" in event.at else datetime.now(timezone.utc),
            action=event.action,
            entity=event.entity,
            entity_id=event.entity_id,
            before=event.before,
            after=event.after,
        )
    )
    session.commit()
    return sid


def post_validated(session, tx: TxRow) -> None:
    if tx.posted or tx.cents is None or tx.booked_on is None:
        return
    stmt = session.get(StatementRow, tx.statement_id)
    if stmt is None or stmt.status != StatementStatus.RECONCILE.value:
        raise ValueError("relevé non réconcilié")
    if tx.status != LineStatus.VALIDEE.value:
        raise ValueError("transaction non validée")
    a, b = post_transaction(
        tx_type=TxType(tx.tx_type),
        cents=tx.cents,
        booked_on=tx.booked_on,
        label=tx.label,
        bank_account=f"banque:{tx.account_id}",
        counterparty=tx.sub,
        kind=__import__("ledger_maison.types", fromlist=["AccountKind"]).AccountKind.CHEQUE,
    )
    session.add(JournalRow(tx_id=tx.id, account=a.account, debit_cents=a.debit_cents, credit_cents=a.credit_cents, memo=a.memo))
    session.add(JournalRow(tx_id=tx.id, account=b.account, debit_cents=b.debit_cents, credit_cents=b.credit_cents, memo=b.memo))
    tx.posted = True
