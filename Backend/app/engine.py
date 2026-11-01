"""PDF text extraction, labelled-field extraction and the rule engine. Fully local; no network calls."""
import difflib, io, re
from datetime import date, datetime
from pypdf import PdfReader

FIELDS = {
    "institution_name": ("Institution Name", r"institution\s+name|name\s+of\s+(?:the\s+)?institution|institute\s+name"),
    "institution_id": ("Institution ID", r"institution\s+id|institute\s+id|institution\s+code|permanent\s+id"),
    "address": ("Address", r"(?:registered\s+|campus\s+)?address"),
    "issue_date": ("Issue Date", r"issue\s+date|date\s+of\s+issue|issued\s+on"),
    "expiry_date": ("Expiry Date", r"expiry\s+date|date\s+of\s+expiry|valid\s+(?:until|till|upto|up\s+to)"),
    "certificate_number": ("Certificate Number", r"certificate\s+(?:no\.?|number)|approval\s+(?:no\.?|number)|reference\s+(?:no\.?|number)"),
    "application_id": ("Application ID", r"application\s+(?:id|no\.?|number)"),
}
DATE_FIELDS = {"issue_date", "expiry_date"}
LABEL_RE = {k: re.compile(r"^\s*(?:%s)\s*[:\-\u2013]\s*(.*?)\s*$" % p, re.I) for k, (_, p) in FIELDS.items()}
ANY_LABEL = re.compile(r"^\s*[A-Za-z][A-Za-z .'/()]{1,40}\s*:")

DEFAULT_RULES = [
    {"id": "DOC-READABLE", "name": "Documents contain selectable text", "kind": "readable", "field": None, "enabled": True,
     "description": "Flags PDFs that are corrupt, password-protected or image-only (OCR is not available)."},
    {"id": "REQ-INST-NAME", "name": "Institution Name present", "kind": "required", "field": "institution_name", "enabled": True, "description": "Field found in at least one document."},
    {"id": "REQ-INST-ID", "name": "Institution ID present", "kind": "required", "field": "institution_id", "enabled": True, "description": "Field found in at least one document."},
    {"id": "REQ-ADDRESS", "name": "Address present", "kind": "required", "field": "address", "enabled": True, "description": "Field found in at least one document."},
    {"id": "REQ-ISSUE-DATE", "name": "Issue Date present", "kind": "required", "field": "issue_date", "enabled": True, "description": "Field found in at least one document."},
    {"id": "REQ-EXPIRY-DATE", "name": "Expiry Date present", "kind": "required", "field": "expiry_date", "enabled": True, "description": "Field found in at least one document."},
    {"id": "REQ-CERT-NO", "name": "Certificate Number present", "kind": "required", "field": "certificate_number", "enabled": True, "description": "Field found in at least one document."},
    {"id": "DATE-PARSE-ISSUE", "name": "Issue Date is parseable", "kind": "date_parse", "field": "issue_date", "enabled": True, "description": "Date must match a supported format (DD-MM-YYYY, YYYY-MM-DD, 12 January 2026 ...)."},
    {"id": "DATE-PARSE-EXPIRY", "name": "Expiry Date is parseable", "kind": "date_parse", "field": "expiry_date", "enabled": True, "description": "Date must match a supported format."},
    {"id": "DATE-EXPIRY", "name": "Document not expired", "kind": "expiry", "field": "expiry_date", "enabled": True, "description": "Expired = MISMATCH; expiring within the warning window = MANUAL REVIEW."},
    {"id": "DATE-ORDER", "name": "Issue Date precedes Expiry Date", "kind": "date_order", "field": None, "enabled": True, "description": "Issue date must not be after expiry or in the future."},
    {"id": "CMP-INST-NAME", "name": "Institution Name consistent", "kind": "compare", "field": "institution_name", "enabled": True, "description": "Compared across documents and the application form entry."},
    {"id": "CMP-INST-ID", "name": "Institution ID consistent", "kind": "compare", "field": "institution_id", "enabled": True, "description": "Compared across documents."},
    {"id": "CMP-ADDRESS", "name": "Address consistent", "kind": "compare", "field": "address", "enabled": True, "description": "Compared across documents after case/whitespace/punctuation normalisation."},
    {"id": "CMP-ISSUE-DATE", "name": "Issue Date consistent", "kind": "compare", "field": "issue_date", "enabled": True, "description": "Dates compared after parsing, so formatting differences do not matter."},
    {"id": "CMP-EXPIRY-DATE", "name": "Expiry Date consistent", "kind": "compare", "field": "expiry_date", "enabled": True, "description": "Dates compared after parsing."},
    {"id": "CMP-CERT-NO", "name": "Certificate Number consistent", "kind": "compare", "field": "certificate_number", "enabled": True, "description": "Compared across documents."},
    {"id": "CMP-APP-ID", "name": "Application ID consistent", "kind": "compare", "field": "application_id", "enabled": True, "description": "Compared with the Application ID entered at submission."},
    {"id": "ISSUER-VERIFY", "name": "Authoritative issuer verification", "kind": "issuer", "field": None, "enabled": True, "description": "No issuer/registry integration exists in this prototype, so this is always UNVERIFIED."},
]
DEFAULT_CATEGORIES = ["New Institution Approval", "Extension of Approval", "Change of Name or Address", "Annual Compliance Filing", "Closure of Institution"]
UNC = "Values come from label-based text extraction; unusual layouts or typos in labels can cause misses."


def extract_pdf(data: bytes) -> dict:
    """Return status OK | NO_TEXT | ENCRYPTED | CORRUPT with per-page text."""
    try:
        r = PdfReader(io.BytesIO(data))
        if r.is_encrypted:
            try: ok = r.decrypt("")
            except Exception: ok = 0
            if not ok:
                return dict(status="ENCRYPTED", message="Password-protected PDF. Remove the password and upload it again.", pages=[], page_count=0)
        pages = []
        for p in r.pages:
            try: pages.append(p.extract_text() or "")
            except Exception: pages.append("")
    except Exception as e:  # corrupt / truncated / not really a PDF
        return dict(status="CORRUPT", message=f"The PDF could not be parsed ({type(e).__name__}). It may be corrupt or truncated.", pages=[], page_count=0)
    if not any(t.strip() for t in pages):
        return dict(status="NO_TEXT", message="No selectable text found. This looks like a scanned/image PDF. OCR is not supported in this prototype, so fields were not extracted.", pages=pages, page_count=len(pages))
    return dict(status="OK", message="", pages=pages, page_count=len(pages))


def extract_fields(pages: list[str]) -> dict:
    found = {}
    for pi, text in enumerate(pages, 1):
        lines = text.splitlines()
        for i, line in enumerate(lines):
            for key, rx in LABEL_RE.items():
                if key in found: continue
                m = rx.match(line)
                if not m: continue
                value, ev = m.group(1).strip(), line.strip()
                if key == "address":
                    j = i + 1
                    while j < len(lines) and j <= i + 3 and lines[j].strip() and not ANY_LABEL.match(lines[j]):
                        value = (value + " " + lines[j].strip()).strip(); ev += " / " + lines[j].strip(); j += 1
                if value:
                    found[key] = {"value": value, "page": pi, "evidence": ev}
    return found


DATE_FORMATS = ["%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d.%m.%Y", "%d %B %Y", "%d %b %Y", "%B %d, %Y", "%b %d, %Y", "%d-%b-%Y", "%d %B, %Y"]
_DATE_TOKENS = [re.compile(r"\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}"), re.compile(r"\d{1,2}[ -][A-Za-z]{3,9},?[ -]\d{4}"), re.compile(r"[A-Za-z]{3,9} \d{1,2}, \d{4}")]

def parse_date(s: str):
    s = re.sub(r"\s+", " ", s.strip().rstrip("."))
    cands = [s] + [m.group(0) for rx in _DATE_TOKENS for m in [rx.search(s)] if m]
    for c in cands:
        for f in DATE_FORMATS:
            try: return datetime.strptime(c, f).date()
            except ValueError: pass
    return None


def norm(field: str, v: str) -> str:
    v = re.sub(r"\s+", " ", v.strip().lower())
    if field == "address":
        v = re.sub(r"\s+", " ", re.sub(r"[,.;]", " ", v)).strip()
    elif field in ("institution_id", "certificate_number", "application_id"):
        v = re.sub(r"\s", "", v).rstrip(".")
    else:
        v = v.rstrip(".")
    return v


def similarity(field: str, a: str, b: str) -> float:
    if field in DATE_FIELDS:
        pa, pb = parse_date(a), parse_date(b)
        if pa and pb: return 1.0 if pa == pb else 0.0
    na, nb = norm(field, a), norm(field, b)
    return 1.0 if na == nb else difflib.SequenceMatcher(None, na, nb).ratio()


def validate(app: dict, docs: list[dict], rules: list[dict], warn_days: int, today: date | None = None) -> list[dict]:
    today = today or date.today()
    readable = [d for d in docs if d["status"] in ("OK", "NO_FIELDS")]
    out: list[dict] = []

    def add(r, status, document, page, field, extracted, expected, explanation, action, conf, unc=UNC):
        out.append(dict(rule_id=r["id"], rule_name=r["name"], status=status, document=document, page=page, field=field,
                        extracted=extracted, expected=expected, explanation=explanation, action=action, confidence=conf, uncertainty=unc))

    for r in rules:
        if not r["enabled"]: continue
        k, fld = r["kind"], r.get("field")
        label = FIELDS[fld][0] if fld else ""
        if k == "readable":
            bad = [d for d in docs if d["status"] in ("NO_TEXT", "ENCRYPTED", "CORRUPT")]
            for d in bad:
                add(r, "MANUAL REVIEW", d["filename"], None, "document", "(unreadable)", "Selectable text",
                    d["message"], "Review the original document manually, or upload a text-based unprotected PDF.", 0.95,
                    "Scanned documents need OCR, which is unavailable here.")
            if docs and not bad:
                add(r, "PASS", "(all documents)", None, "document", f"{len(docs)} readable", "Selectable text", "Every uploaded PDF contained selectable text.", "No action needed.", 0.95)
        elif k == "required":
            found = [(d, d["fields"][fld]) for d in readable if fld in d["fields"]]
            if found:
                d, f = found[0]
                add(r, "PASS", d["filename"], f["page"], label, f["value"], "Present in at least one document",
                    f"'{label}' was found in {len(found)} document(s).", "No action needed.", 0.9)
            else:
                add(r, "MANUAL REVIEW", "(all documents)", None, label, "(not found)", "Present in at least one document",
                    f"The label '{label}' was not found in the selectable text of any uploaded document. It may be genuinely missing or in a layout the extractor cannot read.",
                    f"Ask the applicant for a document stating the {label}, or confirm it manually.", 0.5)
        elif k == "date_parse":
            for d in readable:
                if fld in d["fields"]:
                    f = d["fields"][fld]
                    if parse_date(f["value"]):
                        add(r, "PASS", d["filename"], f["page"], label, f["value"], "A valid date", f"'{f['value']}' was read as {parse_date(f['value']).isoformat()}.", "No action needed.", 0.9)
                    else:
                        add(r, "MANUAL REVIEW", d["filename"], f["page"], label, f["value"], "A valid date",
                            f"'{f['value']}' does not match any supported date format.", "Read the date from the original document and record it manually.", 0.6)
        elif k == "expiry":
            for d in readable:
                f = d["fields"].get("expiry_date"); p = parse_date(f["value"]) if f else None
                if not p: continue
                n = (p - today).days
                if n < 0:
                    add(r, "MISMATCH", d["filename"], f["page"], label, f["value"], f"On or after {today.isoformat()}",
                        f"Expiry date {p.isoformat()} is {-n} day(s) before today ({today.isoformat()}).", "Ask the applicant for a current/renewed document. A reviewer decides the outcome.", 0.9)
                elif n <= warn_days:
                    add(r, "MANUAL REVIEW", d["filename"], f["page"], label, f["value"], f"More than {warn_days} days from today",
                        f"Expires in {n} day(s), inside the {warn_days}-day warning window.", "Confirm whether renewal is in progress.", 0.9)
                else:
                    add(r, "PASS", d["filename"], f["page"], label, f["value"], f"On or after {today.isoformat()}", f"Valid for another {n} day(s).", "No action needed.", 0.9)
        elif k == "date_order":
            for d in readable:
                fi, fe = d["fields"].get("issue_date"), d["fields"].get("expiry_date")
                pi, pe = (parse_date(fi["value"]) if fi else None), (parse_date(fe["value"]) if fe else None)
                if not (pi and pe): continue
                if pi > pe:
                    add(r, "MISMATCH", d["filename"], fi["page"], "Issue Date / Expiry Date", f"{fi['value']} > {fe['value']}", "Issue Date before Expiry Date",
                        "The issue date is later than the expiry date.", "Verify both dates against the original document.", 0.9)
                elif pi > today:
                    add(r, "MANUAL REVIEW", d["filename"], fi["page"], "Issue Date", fi["value"], f"On or before {today.isoformat()}", "The issue date is in the future.", "Confirm the date with the applicant.", 0.8)
                else:
                    add(r, "PASS", d["filename"], fi["page"], "Issue Date / Expiry Date", f"{fi['value']} -> {fe['value']}", "Issue Date before Expiry Date", "Dates are in a valid order.", "No action needed.", 0.9)
        elif k == "compare":
            src = [(d["filename"], d["fields"][fld]["value"], d["fields"][fld]["page"]) for d in readable if fld in d["fields"]]
            declared = {"institution_name": app["institution_name"], "application_id": app["id"]}.get(fld)
            if declared: src.append(("Application form entry", declared, None))
            lacking = [d for d in readable if fld not in d["fields"]]
            if not src: continue  # the required-field rule reports this
            rd, rv, rp = src[0]
            for sd, sv, sp in src[1:]:
                s = similarity(fld, rv, sv)
                head = f"'{label}' reads \u201c{rv}\u201d in {rd}" + (f" (p.{rp})" if rp else "") + f" and \u201c{sv}\u201d in {sd}" + (f" (p.{sp})" if sp else "") + "."
                if s >= 1.0:
                    add(r, "PASS", sd, sp, label, sv, rv, head + " They match after normalising case, spacing and punctuation.", "No action needed.", 0.9)
                elif s >= 0.92:
                    add(r, "MANUAL REVIEW", sd, sp, label, sv, rv, head + f" Very similar (similarity {s:.0%}) but not identical; could be a typo or formatting difference.", "A reviewer should confirm whether these refer to the same value.", 0.6)
                else:
                    add(r, "MISMATCH", sd, sp, label, sv, rv, head + f" Similarity {s:.0%}. A mismatch is not proof of fraud; it needs human review.",
                        f"Ask the applicant to confirm the correct {label} and provide supporting evidence.", 0.9)
            for d in lacking:
                add(r, "MANUAL REVIEW", d["filename"], None, label, "(absent)", rv,
                    f"'{label}' appears in {rd} but was not found in this document. Absence is not treated as a match.", "Check the original document for this field.", 0.5)
            if len(src) == 1 and not lacking:
                add(r, "UNVERIFIED", rd, rp, label, rv, "A second independent source", f"Only one source states the {label}, so cross-document consistency cannot be checked.", "Upload a second document that states this field.", None,
                    "No second source available.")
        elif k == "issuer":
            cn = next((d["fields"]["certificate_number"] for d in readable if "certificate_number" in d["fields"]), None)
            add(r, "UNVERIFIED", next((d["filename"] for d in readable if "certificate_number" in d["fields"]), "(all documents)"), cn["page"] if cn else None, "Certificate Number",
                cn["value"] if cn else "(not found)", "Confirmation from the issuing authority",
                "No issuer, registry or DigiLocker integration is implemented in this local prototype, so authenticity was not checked.",
                "Verify the certificate directly with the issuing authority before any decision.", None, "Not applicable: no authoritative source was consulted.")
    return out
