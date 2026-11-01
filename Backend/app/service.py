"""Application-level workflows shared by the API and the demo loader."""
import json
from datetime import datetime, timezone
from . import db, engine

MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_FILES = 10
SEV = {"MISMATCH": 3, "MANUAL REVIEW": 2, "UNVERIFIED": 1, "PASS": 0}

def now() -> str: return datetime.now(timezone.utc).isoformat(timespec="seconds")

def log(msg: str, app_id: str | None = None): db.execute("INSERT INTO activity(ts,message,app_id) VALUES(?,?,?)", (now(), msg, app_id))

def get_settings() -> dict:
    stored = {r["key"]: json.loads(r["value"]) for r in db.q("SELECT * FROM settings")}
    enabled = stored.get("rules_enabled", {})
    rules = [{**r, "enabled": enabled.get(r["id"], r["enabled"])} for r in engine.DEFAULT_RULES]
    return {"rules": rules, "categories": stored.get("categories", engine.DEFAULT_CATEGORIES), "expiry_warn_days": stored.get("expiry_warn_days", 60)}

def save_setting(key, value): db.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value)))

def ingest(app_id: str, institution: str, app_type: str, files: list[tuple[str, bytes]], is_demo=False) -> list[dict]:
    db.execute("INSERT INTO applications(id,institution_name,app_type,is_demo,created_at) VALUES(?,?,?,?,?)", (app_id, institution, app_type, int(is_demo), now()))
    out = []
    for name, data in files:
        ex = engine.extract_pdf(data)
        fields = engine.extract_fields(ex["pages"]) if ex["status"] == "OK" else {}
        status, msg = ex["status"], ex["message"]
        if status == "OK" and not fields:
            status, msg = "NO_FIELDS", "Text was extracted, but none of the known labels (e.g. 'Institution Name:') were found."
        db.execute("INSERT INTO documents(app_id,filename,size_bytes,page_count,status,message,pages_json,fields_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                   (app_id, name, len(data), ex["page_count"], status, msg, json.dumps(ex["pages"]), json.dumps(fields), now()))
        out.append({"filename": name, "status": status, "message": msg, "page_count": ex["page_count"], "fields_found": len(fields)})
    log(f"Application {app_id} created with {len(files)} document(s)" + (" (synthetic demo)" if is_demo else ""), app_id)
    run_validation(app_id)
    return out

def run_validation(app_id: str) -> int:
    app = db.one("SELECT * FROM applications WHERE id=?", (app_id,))
    docs = db.q("SELECT * FROM documents WHERE app_id=? ORDER BY id", (app_id,))
    for d in docs: d["fields"] = json.loads(d["fields_json"])
    s = get_settings()
    new = engine.validate(app, docs, s["rules"], s["expiry_warn_days"])
    old = {(f["rule_id"], f["document"], f["field"]): f for f in db.q("SELECT * FROM findings WHERE app_id=?", (app_id,))}
    db.execute("DELETE FROM findings WHERE app_id=?", (app_id,))
    ts, rows = now(), []
    for f in new:
        o = old.get((f["rule_id"], f["document"], f["field"]))
        same = bool(o and o["status"] == f["status"] and o["extracted"] == f["extracted"])
        rows.append((app_id, f["rule_id"], f["rule_name"], f["status"], f["document"], f["page"], f["field"], f["extracted"], f["expected"], f["explanation"],
                     f["confidence"], f["uncertainty"], f["action"], o["review_status"] if same else "PENDING", o["note"] if o else "", o["reviewed_at"] if same else None, ts))
    db.executemany("INSERT INTO findings(app_id,rule_id,rule_name,status,document,page,field,extracted,expected,explanation,confidence,uncertainty,action,review_status,note,reviewed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    db.execute("UPDATE applications SET validated_at=? WHERE id=?", (ts, app_id))
    log(f"Validation run for {app_id}: {len(rows)} finding(s)", app_id)
    return len(rows)

def app_status(counts: dict) -> str:
    present = [s for s, n in counts.items() if n]
    return max(present, key=lambda s: SEV[s]) if present else "PENDING"
