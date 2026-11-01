"""SQLite persistence (no-cost, local, auto-initialised on startup)."""
import os, sqlite3
from pathlib import Path

DB_PATH = Path(os.environ.get("PROOFGRAPH_DB", Path(__file__).resolve().parent.parent / "data" / "proofgraph.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS applications(
  id TEXT PRIMARY KEY, institution_name TEXT NOT NULL, app_type TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, validated_at TEXT);
CREATE TABLE IF NOT EXISTS documents(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0, page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
  pages_json TEXT NOT NULL DEFAULT '[]', fields_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS findings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL, rule_name TEXT NOT NULL, status TEXT NOT NULL,
  document TEXT NOT NULL, page INTEGER, field TEXT NOT NULL DEFAULT '',
  extracted TEXT NOT NULL DEFAULT '', expected TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL, confidence REAL, uncertainty TEXT NOT NULL DEFAULT '', action TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'PENDING', note TEXT NOT NULL DEFAULT '', reviewed_at TEXT,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, message TEXT NOT NULL, app_id TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_findings_app ON findings(app_id);
CREATE INDEX IF NOT EXISTS idx_docs_app ON documents(app_id);
"""

def _conn():
    c = sqlite3.connect(DB_PATH, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c

def init():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = _conn(); c.executescript(SCHEMA); c.commit(); c.close()

def q(sql, args=()):
    c = _conn()
    try: return [dict(r) for r in c.execute(sql, args).fetchall()]
    finally: c.close()

def one(sql, args=()):
    r = q(sql, args); return r[0] if r else None

def execute(sql, args=()):
    c = _conn()
    try:
        cur = c.execute(sql, args); c.commit(); return cur.lastrowid
    finally: c.close()

def executemany(sql, rows):
    c = _conn()
    try: c.executemany(sql, rows); c.commit()
    finally: c.close()
