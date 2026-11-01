"""ProofGraph AI - FastAPI backend. All processing is local; uploaded files are never sent to external services."""
import csv, io, json, re
from pathlib import Path
from typing import List
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from . import db, demo, engine, service

app = FastAPI(title="ProofGraph AI", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def _startup(): db.init()

APP_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$")
STATUSES = ["PASS", "MISMATCH", "UNVERIFIED", "MANUAL REVIEW"]

def _counts(rows):
    out = {}
    for r in rows:
        out.setdefault(r["app_id"], {s: 0 for s in STATUSES})[r["status"]] = r["n"]
    return out

def _summaries(where="", args=()):
    apps = db.q(f"SELECT a.*, (SELECT COUNT(*) FROM documents d WHERE d.app_id=a.id) AS docs FROM applications a {where} ORDER BY a.created_at DESC, a.rowid DESC", args)
    counts = _counts(db.q("SELECT app_id,status,COUNT(*) n FROM findings GROUP BY app_id,status"))
    pend = {r["app_id"]: r["n"] for r in db.q("SELECT app_id,COUNT(*) n FROM findings WHERE status!='PASS' AND review_status='PENDING' GROUP BY app_id")}
    for a in apps:
        a["counts"] = counts.get(a["id"], {s: 0 for s in STATUSES}); a["status"] = service.app_status(a["counts"]); a["pending"] = pend.get(a["id"], 0)
    return apps

@app.get("/api/health")
def health(): return {"ok": True}

@app.get("/api/integrations")
def integrations():
    names = ["AICTE portal / registry", "DigiLocker", "Issuer certificate verification", "OCR for scanned PDFs"]
    return [{"name": n, "status": "UNAVAILABLE", "detail": "Not implemented in this local prototype."} for n in names]

@app.get("/api/dashboard")
def dashboard():
    apps = _summaries()
    dist = {s: 0 for s in STATUSES}
    for r in db.q("SELECT status,COUNT(*) n FROM findings GROUP BY status"): dist[r["status"]] = r["n"]
    docs = db.one("SELECT COUNT(*) total, SUM(status IN ('OK','NO_FIELDS')) ok FROM documents")
    return {"total_applications": len(apps), "documents_total": docs["total"] or 0, "documents_processed": docs["ok"] or 0,
            "flagged": dist["MISMATCH"] + dist["MANUAL REVIEW"], "pending_reviews": sum(a["pending"] for a in apps), "distribution": dist,
            "recent": apps[:6], "activity": db.q("SELECT * FROM activity ORDER BY id DESC LIMIT 12"), "has_demo": any(a["is_demo"] for a in apps)}

@app.get("/api/applications")
def list_apps(): return _summaries()

def _detail(app_id):
    a = next(iter(_summaries("WHERE a.id=?", (app_id,))), None)
    if not a: raise HTTPException(404, f"Application '{app_id}' was not found.")
    docs = db.q("SELECT id,app_id,filename,size_bytes,page_count,status,message,fields_json,created_at FROM documents WHERE app_id=? ORDER BY id", (app_id,))
    for d in docs: d["fields"] = json.loads(d.pop("fields_json"))
    a["documents"] = docs
    a["findings"] = db.q("SELECT * FROM findings WHERE app_id=? ORDER BY id", (app_id,))
    return a

@app.get("/api/applications/{app_id}")
def get_app(app_id: str): return _detail(app_id)

@app.get("/api/applications/{app_id}/documents/{doc_id}")
def get_doc(app_id: str, doc_id: int):
    d = db.one("SELECT * FROM documents WHERE id=? AND app_id=?", (doc_id, app_id))
    if not d: raise HTTPException(404, "Document not found.")
    d["pages"] = json.loads(d.pop("pages_json")); d["fields"] = json.loads(d.pop("fields_json")); return d

@app.post("/api/applications", status_code=201)
async def create_app(application_id: str = Form(...), institution_name: str = Form(...), application_type: str = Form(...), files: List[UploadFile] = File(...)):
    application_id, institution_name = application_id.strip(), re.sub(r"\s+", " ", institution_name.strip())
    if not APP_ID_RE.match(application_id): raise HTTPException(422, "Application ID must be 3-40 characters: letters, digits, dot, dash or underscore.")
    if len(institution_name) < 3 or len(institution_name) > 200: raise HTTPException(422, "Institution name must be 3-200 characters.")
    if application_type not in service.get_settings()["categories"]: raise HTTPException(422, "Unknown application type. Add it under Settings first.")
    if db.one("SELECT 1 FROM applications WHERE id=?", (application_id,)): raise HTTPException(409, f"Application ID '{application_id}' already exists.")
    if not files or len(files) > service.MAX_FILES: raise HTTPException(422, f"Upload between 1 and {service.MAX_FILES} PDF files.")
    loaded = []
    for f in files:
        name = Path(f.filename or "").name
        data = await f.read(service.MAX_FILE_BYTES + 1)
        if not name.lower().endswith(".pdf"): raise HTTPException(422, f"'{name}' is not a PDF. Only .pdf files are accepted.")
        if len(data) > service.MAX_FILE_BYTES: raise HTTPException(413, f"'{name}' exceeds the {service.MAX_FILE_BYTES // 1048576} MB limit.")
        if not data.lstrip()[:5] == b"%PDF-": raise HTTPException(422, f"'{name}' does not look like a PDF (missing %PDF header).")
        loaded.append((name, data))
    results = service.ingest(application_id, institution_name, application_type, loaded)
    return {"application": _detail(application_id), "results": results}

@app.post("/api/applications/{app_id}/validate")
def revalidate(app_id: str):
    _detail(app_id); service.run_validation(app_id); return _detail(app_id)

@app.delete("/api/applications/{app_id}")
def delete_app(app_id: str):
    _detail(app_id); db.execute("DELETE FROM applications WHERE id=?", (app_id,)); service.log(f"Application {app_id} deleted"); return {"ok": True}

class ReviewIn(BaseModel):
    review_status: str
    note: str = ""

@app.get("/api/findings")
def list_findings(status: str | None = None, review: str | None = None, app_id: str | None = None):
    sql, args = "SELECT f.*, a.institution_name FROM findings f JOIN applications a ON a.id=f.app_id WHERE 1=1", []
    for col, val in (("f.status", status), ("f.review_status", review), ("f.app_id", app_id)):
        if val: sql += f" AND {col}=?"; args.append(val)
    return db.q(sql + " ORDER BY CASE f.status WHEN 'MISMATCH' THEN 0 WHEN 'MANUAL REVIEW' THEN 1 WHEN 'UNVERIFIED' THEN 2 ELSE 3 END, f.id", args)

@app.patch("/api/findings/{fid}")
def review_finding(fid: int, body: ReviewIn):
    if body.review_status not in ("PENDING", "REVIEWED", "NEEDS_CLARIFICATION"): raise HTTPException(422, "Invalid review status.")
    if len(body.note) > 2000: raise HTTPException(422, "Note is too long (max 2000 characters).")
    f = db.one("SELECT * FROM findings WHERE id=?", (fid,))
    if not f: raise HTTPException(404, "Finding not found.")
    db.execute("UPDATE findings SET review_status=?, note=?, reviewed_at=? WHERE id=?", (body.review_status, body.note.strip(), None if body.review_status == "PENDING" else service.now(), fid))
    service.log(f"Reviewer marked {f['rule_id']} on {f['app_id']} as {body.review_status.replace('_', ' ').lower()}", f["app_id"])
    return db.one("SELECT * FROM findings WHERE id=?", (fid,))

def _safe(v):  # neutralise CSV/Excel formula injection from document-derived text
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s

def _csv(rows, name):
    out = io.StringIO(); w = csv.writer(out)
    w.writerow(["application_id", "institution", "rule_id", "rule", "status", "document", "page", "field", "extracted_value", "expected_value", "explanation", "confidence", "recommended_action", "review_status", "reviewer_note", "reviewed_at", "finding_created_at"])
    for r in rows:
        w.writerow([_safe(x) for x in (r["app_id"], r["institution_name"], r["rule_id"], r["rule_name"], r["status"], r["document"], r["page"], r["field"], r["extracted"], r["expected"], r["explanation"],
                                       "n/a" if r["confidence"] is None else r["confidence"], r["action"], r["review_status"], r["note"], r["reviewed_at"], r["created_at"])])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})

@app.get("/api/reports/findings.csv")
def csv_all(): return _csv(db.q("SELECT f.*, a.institution_name FROM findings f JOIN applications a ON a.id=f.app_id ORDER BY f.app_id, f.id"), "proofgraph_all_findings.csv")

@app.get("/api/applications/{app_id}/report.csv")
def csv_app(app_id: str):
    _detail(app_id); return _csv(db.q("SELECT f.*, a.institution_name FROM findings f JOIN applications a ON a.id=f.app_id WHERE f.app_id=? ORDER BY f.id", (app_id,)), f"proofgraph_{app_id}.csv")

class SettingsIn(BaseModel):
    rules_enabled: dict[str, bool]
    categories: list[str]
    expiry_warn_days: int

@app.get("/api/settings")
def get_settings(): return service.get_settings()

@app.put("/api/settings")
def put_settings(s: SettingsIn):
    cats = [re.sub(r"\s+", " ", c.strip()) for c in s.categories if c.strip()]
    if not cats or len(set(cats)) != len(cats) or any(len(c) > 80 for c in cats): raise HTTPException(422, "Provide at least one unique category (max 80 characters each).")
    if not 0 <= s.expiry_warn_days <= 730: raise HTTPException(422, "Expiry warning window must be between 0 and 730 days.")
    known = {r["id"] for r in engine.DEFAULT_RULES}
    if set(s.rules_enabled) - known: raise HTTPException(422, "Unknown rule id in request.")
    service.save_setting("rules_enabled", s.rules_enabled); service.save_setting("categories", cats); service.save_setting("expiry_warn_days", s.expiry_warn_days)
    for a in db.q("SELECT id FROM applications"): service.run_validation(a["id"])
    service.log("Settings updated; all applications re-validated")
    return service.get_settings()

@app.post("/api/demo/load")
def demo_load():
    ids = demo.load()
    if not ids: raise HTTPException(409, "Demo data is already loaded.")
    return {"loaded": ids}

@app.post("/api/demo/reset")
def demo_reset(): return {"loaded": demo.reset()}

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists(): app.mount("/", StaticFiles(directory=DIST, html=True), name="ui")
