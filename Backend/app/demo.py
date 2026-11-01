"""Synthetic demo data. Every document is generated locally with reportlab and is clearly marked as fake."""
import io
from datetime import date, timedelta
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from . import db, service

def _pdf(title: str, lines: list[str]) -> bytes:
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica-Bold", 16); c.drawString(60, 790, title)
    c.setFont("Helvetica-Oblique", 9); c.drawString(60, 772, "SYNTHETIC SAMPLE - NOT A REAL DOCUMENT - FOR PROOFGRAPH AI DEMO ONLY")
    c.setFont("Helvetica", 12); y = 735
    for ln in lines: c.drawString(60, y, ln); y -= 22
    c.save(); return buf.getvalue()

def _iso(d): return d.isoformat()
def _dmy(d): return d.strftime("%d-%m-%Y")
def _long(d): return d.strftime("%d %B %Y")

def load() -> list[str]:
    t = date.today(); issue = t - timedelta(days=200); expiry = t + timedelta(days=700); old_exp = t - timedelta(days=40)
    ids = []
    specs = [
        ("PG-DEMO-2026-001", "Synthetic Institute of Technology", "New Institution Approval", [
            ("demo_approval_certificate.pdf", _pdf("Approval Certificate (Synthetic)", [
                "Institution Name: Synthetic Institute of Technology", "Institution ID: SYN-INST-0042",
                "Address: Plot 12, Sector 5, Demo Nagar,", "Ahmedabad 380001",
                f"Issue Date: {_dmy(issue)}", f"Expiry Date: {_dmy(expiry)}",
                "Certificate Number: SYN-CERT-2026-0017", "Application ID: PG-DEMO-2026-001"])),
            ("demo_application_form.pdf", _pdf("Application Form (Synthetic)", [
                "Institution Name: SYNTHETIC  INSTITUTE   OF TECHNOLOGY", "Institution ID: SYN-INST-0042",
                "Address: Survey No. 88, Ring Road, Sample Colony,", "Ahmedabad 380015",
                f"Issue Date: {_long(issue)}", f"Expiry Date: {_iso(expiry)}", "Application ID: PG-DEMO-2026-001"]))]),
        ("PG-DEMO-2026-002", "Sample College of Commerce", "Extension of Approval", [
            ("demo_expired_certificate.pdf", _pdf("Approval Certificate (Synthetic)", [
                "Institution Name: Sample College of Commerce", "Institution ID: SYN-INST-0107",
                f"Issue Date: {_dmy(t - timedelta(days=800))}", f"Expiry Date: {_dmy(old_exp)}", "Certificate Number: SYN-CERT-2024-0310"]))]),
        ("PG-DEMO-2026-003", "Example Polytechnic", "Annual Compliance Filing", [
            ("demo_filing_certificate.pdf", _pdf("Approval Certificate (Synthetic)", [
                "Institution Name: Example Polytechnic", "Institution ID: SYN-INST-0555", "Address: 4 Sample Road, Demo City 390001",
                f"Issue Date: {_dmy(issue)}", f"Expiry Date: {_dmy(expiry)}", "Certificate Number: SYN-CERT-2026-0555", "Application ID: PG-DEMO-2026-003"])),
            ("demo_filing_form.pdf", _pdf("Annual Filing Form (Synthetic)", [
                "Institution Name: Example Polytechnic", "Institution ID: SYN-INST-0555", "Address: 4, Sample Road, Demo City 390001",
                f"Issue Date: {_dmy(issue)}", f"Expiry Date: {_dmy(expiry)}", "Certificate Number: SYN-CERT-2026-0555", "Application ID: PG-DEMO-2026-003"]))]),
    ]
    for app_id, inst, typ, files in specs:
        if db.one("SELECT 1 FROM applications WHERE id=?", (app_id,)): continue
        service.ingest(app_id, inst, typ, files, is_demo=True); ids.append(app_id)
    return ids

def reset() -> list[str]:
    db.execute("DELETE FROM applications WHERE is_demo=1")
    db.execute("DELETE FROM activity WHERE app_id LIKE 'PG-DEMO-%'")
    service.log("Synthetic demo data reset")
    return load()
