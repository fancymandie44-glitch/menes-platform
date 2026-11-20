from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from io import BytesIO

from openpyxl import Workbook
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


@dataclass(frozen=True)
class Spec:
    booked: date
    label: str
    debit_cents: int
    credit_cents: int


def sample_ops() -> list[Spec]:
    return [
        Spec(date(2026, 1, 2), "DEPOT SALAIRE ACME", 0, 320000),
        Spec(date(2026, 1, 5), "HYDRO-QUEBEC PAIEMENT", 14250, 0),
        Spec(date(2026, 1, 8), "IGA 3844 MONTREAL", 8732, 0),
        Spec(date(2026, 1, 12), "NETFLIX.COM", 1899, 0),
        Spec(date(2026, 1, 18), "FRAIS MENSUELS", 1295, 0),
        Spec(date(2026, 1, 22), "VIREMENT EPARGNE", 50000, 0),
        Spec(date(2026, 1, 28), "PETRO-CANADA", 6420, 0),
    ]


OPENING = 100000  # 1 000,00 $


def expected_closing(kind: str = "cheque") -> int:
    ops = sample_ops()
    credits = sum(o.credit_cents for o in ops)
    debits = sum(o.debit_cents for o in ops)
    if kind == "carte":
        return OPENING + debits - credits
    return OPENING + credits - debits


def fr_amount(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    n = abs(cents)
    whole, frac = divmod(n, 100)
    grouped = f"{whole:,}".replace(",", " ")
    return f"{sign}{grouped},{frac:02d}"


def us_amount(cents: int) -> str:
    """Sans séparateur de milliers : un CSV à virgules ne doit pas couper 3,200.00."""
    sign = "-" if cents < 0 else ""
    n = abs(cents)
    whole, frac = divmod(n, 100)
    return f"{sign}{whole}.{frac:02d}"


def running(ops: list[Spec], opening: int, kind: str) -> list[int]:
    bal = opening
    out: list[int] = []
    for op in ops:
        if kind == "carte":
            bal = bal + op.debit_cents - op.credit_cents
        else:
            bal = bal + op.credit_cents - op.debit_cents
        out.append(bal)
    return out


def csv_desjardins() -> bytes:
    ops = sample_ops()
    bals = running(ops, OPENING, "cheque")
    lines = [
        "Desjardins — Caisse 1234, folio 5678901234",
        "Date;Description;Retraits;Dépôts;Solde",
        f"2026-01-01;Solde d'ouverture;;;{fr_amount(OPENING)}",
    ]
    for op, bal in zip(ops, bals):
        d = fr_amount(op.debit_cents) if op.debit_cents else ""
        c = fr_amount(op.credit_cents) if op.credit_cents else ""
        lines.append(f"{op.booked.strftime('%d/%m/%Y')};{op.label};{d};{c};{fr_amount(bal)}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def csv_two_col(bank: str, header: str, date_fmt: str, amount_fn, signed: bool, kind: str) -> bytes:
    ops = sample_ops()
    bals = running(ops, OPENING, kind)
    rows = [header]
    rows.append(
        "Date,Description,Debit,Credit,Balance"
        if not signed
        else "Date,Description,Amount,Balance"
    )
    rows.append(
        f"2026-01-01,Opening balance,,{amount_fn(OPENING)},{amount_fn(OPENING)}"
        if not signed
        else f"2026-01-01,Opening balance,{amount_fn(OPENING)},{amount_fn(OPENING)}"
    )
    # opening row for signed templates uses label Opening balance — tabular looks for "opening balance"
    out = [f"{bank}", rows[1]]
    if not signed:
        out.append(f"01/01/2026,Opening balance,,{amount_fn(OPENING)},{amount_fn(OPENING)}")
    else:
        out.append(f"01/01/2026,Opening balance,{amount_fn(0)},{amount_fn(OPENING)}")
    for op, bal in zip(ops, bals):
        ds = op.booked.strftime(date_fmt)
        if signed:
            amt = op.debit_cents - op.credit_cents
            out.append(f"{ds},{op.label},{amount_fn(amt)},{amount_fn(bal)}")
        else:
            d = amount_fn(op.debit_cents) if op.debit_cents else ""
            c = amount_fn(op.credit_cents) if op.credit_cents else ""
            out.append(f"{ds},{op.label},{d},{c},{amount_fn(bal)}")
    return ("\n".join(out) + "\n").encode("utf-8")


def csv_rbc() -> bytes:
    return csv_two_col("Royal Bank of Canada RBC", "", "%d/%m/%Y", us_amount, False, "cheque")


def csv_td() -> bytes:
    return csv_two_col("TD Canada Trust", "", "%Y-%m-%d", us_amount, False, "cheque")


def csv_bmo() -> bytes:
    return csv_two_col("BMO Bank of Montreal", "", "%d/%m/%Y", us_amount, True, "cheque")


def csv_scotia() -> bytes:
    return csv_two_col("Scotiabank", "", "%d/%m/%Y", us_amount, True, "cheque")


def csv_cibc() -> bytes:
    return csv_two_col("CIBC", "", "%d/%m/%Y", us_amount, False, "cheque")


def csv_bnc() -> bytes:
    ops = sample_ops()
    bals = running(ops, OPENING, "cheque")
    lines = ["Banque Nationale du Canada BNC", "Date;Libellé;Débit;Crédit;Solde"]
    lines.append(f"01/01/2026;Solde d'ouverture;;{fr_amount(OPENING)};{fr_amount(OPENING)}")
    for op, bal in zip(ops, bals):
        d = fr_amount(op.debit_cents) if op.debit_cents else ""
        c = fr_amount(op.credit_cents) if op.credit_cents else ""
        lines.append(f"{op.booked.strftime('%d/%m/%Y')};{op.label};{d};{c};{fr_amount(bal)}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def csv_tangerine() -> bytes:
    return csv_two_col("Tangerine", "", "%Y-%m-%d", us_amount, True, "cheque")


def csv_unknown() -> bytes:
    ops = sample_ops()
    bals = running(ops, OPENING, "cheque")
    lines = ["Relevé maison — format inconnu", "Posted,Payee,Out,In,Balance"]
    lines.append(f"2026-01-01,Opening balance,,{us_amount(OPENING)},{us_amount(OPENING)}")
    for op, bal in zip(ops, bals):
        out = us_amount(op.debit_cents) if op.debit_cents else ""
        inn = us_amount(op.credit_cents) if op.credit_cents else ""
        lines.append(f"{op.booked.isoformat()},{op.label},{out},{inn},{us_amount(bal)}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def csv_credit_card() -> bytes:
    ops = [
        Spec(date(2026, 2, 3), "COSTCO LAVAL", 15670, 0),
        Spec(date(2026, 2, 10), "PAIEMENT CARTE", 0, 20000),
        Spec(date(2026, 2, 14), "IGA 12", 4321, 0),
    ]
    opening = 50000
    bals = running(ops, opening, "carte")
    lines = ["Visa Desjardins credit card", "Date,Description,Debit,Credit,Balance"]
    lines.append(f"01/02/2026,Opening balance,,{us_amount(opening)},{us_amount(opening)}")
    for op, bal in zip(ops, bals):
        d = us_amount(op.debit_cents) if op.debit_cents else ""
        c = us_amount(op.credit_cents) if op.credit_cents else ""
        lines.append(f"{op.booked.strftime('%d/%m/%Y')},{op.label},{d},{c},{us_amount(bal)}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def ofx_td() -> bytes:
    ops = sample_ops()
    closing = expected_closing()
    trn = []
    for i, op in enumerate(ops, start=1):
        amt = f"{(op.credit_cents - op.debit_cents) / 100:.2f}"
        trn.append(
            f"<STMTTRN><TRNTYPE>OTHER<DTPOSTED>{op.booked.strftime('%Y%m%d')}"
            f"<TRNAMT>{amt}<FITID>TD{i:04d}<NAME>{op.label}<MEMO>{op.label}</STMTTRN>"
        )
    body = (
        "OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><SIGNONMSGSRSV1><SONRS><ORG>TD</ORG></SONRS></SIGNONMSGSRSV1>"
        "<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>TD<ACCTID>1234567890</BANKACCTFROM>"
        f"<BANKTRANLIST><DTSTART>20260101<DTEND>20260131{''.join(trn)}</BANKTRANLIST>"
        f"<LEDGERBAL><BALAMT>{closing / 100:.2f}<DTASOF>20260131</LEDGERBAL>"
        "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n"
    )
    return body.encode("utf-8")


def xlsx_cibc() -> bytes:
    ops = sample_ops()
    bals = running(ops, OPENING, "cheque")
    wb = Workbook()
    ws = wb.active
    ws.append(["CIBC"])
    ws.append(["Date", "Description", "Debit", "Credit", "Balance"])
    ws.append(["2026-01-01", "Opening balance", None, us_amount(OPENING), us_amount(OPENING)])
    for op, bal in zip(ops, bals):
        ws.append(
            [
                op.booked.isoformat(),
                op.label,
                us_amount(op.debit_cents) if op.debit_cents else None,
                us_amount(op.credit_cents) if op.credit_cents else None,
                us_amount(bal),
            ]
        )
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def pdf_desjardins() -> bytes:
    text_csv = csv_desjardins().decode("utf-8")
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 760
    c.setFont("Helvetica", 9)
    c.drawString(40, y, "Desjardins folio 5678901234")
    y -= 16
    for line in text_csv.splitlines():
        c.drawString(40, y, line[:110])
        y -= 14
        if y < 40:
            c.showPage()
            c.setFont("Helvetica", 9)
            y = 760
    c.save()
    return buf.getvalue()


BANK_FILES = {
    "desjardins.csv": csv_desjardins,
    "rbc.csv": csv_rbc,
    "td.csv": csv_td,
    "bmo.csv": csv_bmo,
    "scotia.csv": csv_scotia,
    "cibc.csv": csv_cibc,
    "bnc.csv": csv_bnc,
    "tangerine.csv": csv_tangerine,
    "inconnu.csv": csv_unknown,
    "visa-desjardins.csv": csv_credit_card,
    "td.ofx": ofx_td,
    "cibc.xlsx": xlsx_cibc,
    "desjardins.pdf": pdf_desjardins,
}
