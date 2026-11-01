import { useRef, useState } from "react";
import { api, fmtSize, type UploadResult } from "../api";
import { useApp } from "../ctx";
import { Badge, Card, ErrorBox, Page } from "../ui";

const MAX = 15 * 1024 * 1024;
export default function NewApplication() {
  const { settings, toast, reload, setAppId, go } = useApp();
  const [id, setId] = useState(""); const [inst, setInst] = useState(""); const [type, setType] = useState(""); const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [res, setRes] = useState<UploadResult | null>(null); const [drag, setDrag] = useState(false); const input = useRef<HTMLInputElement>(null);
  const cats = settings?.categories ?? [];
  const add = (list: FileList | File[]) => {
    const bad: string[] = [], ok = [...files];
    for (const f of Array.from(list)) {
      if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") bad.push(`${f.name}: not a PDF`);
      else if (f.size > MAX) bad.push(`${f.name}: larger than 15 MB`);
      else if (ok.some(o => o.name === f.name && o.size === f.size)) bad.push(`${f.name}: already added`);
      else ok.push(f);
    }
    if (ok.length > 10) bad.push("A maximum of 10 files is allowed"); setFiles(ok.slice(0, 10)); setErr(bad.join(" | "));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setRes(null);
    if (!files.length) return setErr("Add at least one PDF document.");
    const fd = new FormData(); fd.append("application_id", id); fd.append("institution_name", inst); fd.append("application_type", type || cats[0] || ""); files.forEach(f => fd.append("files", f));
    setBusy(true);
    try { const r = await api.create(fd); setRes(r); setAppId(r.application.id); reload(); toast(`Application ${r.application.id} processed`); setFiles([]); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Page title="New application" sub="Upload the PDFs for one institutional application. They are read on this machine and never sent to an external service.">
      <div className="grid2 wide-left">
        <Card title="Application details">
          <form onSubmit={submit} className="form">
            <label>Application ID<input value={id} onChange={e => setId(e.target.value)} placeholder="e.g. APP-2026-0142" required minLength={3} maxLength={40} /></label>
            <label>Institution name<input value={inst} onChange={e => setInst(e.target.value)} placeholder="As entered on the application form" required minLength={3} /></label>
            <label>Application type<select value={type || cats[0] || ""} onChange={e => setType(e.target.value)}>{cats.map(c => <option key={c}>{c}</option>)}</select></label>
            <div className={`drop ${drag ? "over" : ""}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
              <p><b>Drop PDF files here</b> or</p><button type="button" className="btn" onClick={() => input.current?.click()}>Choose files</button>
              <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
              <small>Up to 10 text-based PDFs, 15 MB each. Scanned images are flagged because OCR is not available.</small></div>
            {err && <ErrorBox error={err} />}
            <button className="btn primary" disabled={busy}>{busy ? "Processing documents..." : "Upload and validate"}</button>
          </form>
        </Card>
        <Card title={`Selected files (${files.length})`}>
          {files.length === 0 ? <p className="muted">No files selected yet.</p> : <ul className="files">{files.map(f => <li key={f.name + f.size}><span>{f.name}</span><small>{fmtSize(f.size)}</small><button className="btn ghost sm" onClick={() => setFiles(files.filter(x => x !== f))} aria-label={`Remove ${f.name}`}>Remove</button></li>)}</ul>}
          {busy && <div className="progress" role="status"><i /></div>}
          {res && <div className="result"><h3>Processing status</h3><ul className="files">{res.results.map(r => <li key={r.filename}><span>{r.filename}</span><Badge status={r.status === "OK" ? "PASS" : "MANUAL REVIEW"}>{r.status === "OK" ? `${r.page_count} page(s), ${r.fields_found} fields` : r.status.replace("_", " ")}</Badge>{r.message && <p className="muted full">{r.message}</p>}</li>)}</ul>
            <div className="row"><button className="btn" onClick={() => go("workspace")}>Open workspace</button><button className="btn primary" onClick={() => go("findings")}>View findings ({res.application.findings.length})</button></div></div>}
        </Card>
      </div>
    </Page>);
}
