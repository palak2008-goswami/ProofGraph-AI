import { useEffect, useState } from "react";
import { api, FIELD_LABELS, fmtSize, type Doc } from "../api";
import { useApp } from "../ctx";
import { Badge, Card, Empty, ErrorBox, Loading, Page, useAsync } from "../ui";

const DOC_LABEL: Record<string, [string, string]> = { OK: ["PASS", "Text extracted"], NO_FIELDS: ["MANUAL REVIEW", "No known fields"], NO_TEXT: ["MANUAL REVIEW", "No selectable text"], ENCRYPTED: ["MANUAL REVIEW", "Password-protected"], CORRUPT: ["MANUAL REVIEW", "Corrupt PDF"] };
export default function Workspace() {
  const { appId, tick, go } = useApp(); const [sel, setSel] = useState<number | null>(null); const [pg, setPg] = useState(0);
  const { data: app, error, loading, reload } = useAsync(() => appId ? api.app(appId) : Promise.resolve(null), [appId, tick]);
  useEffect(() => { setSel(null); setPg(0); }, [appId]);
  const docId = sel ?? app?.documents[0]?.id ?? null;
  const { data: doc, loading: dl } = useAsync<Doc | null>(() => (appId && docId ? api.doc(appId, docId) : Promise.resolve(null)), [appId, docId]);
  if (!appId) return <Page title="Document workspace"><Empty title="No application selected" hint="Create or load an application first."><button className="btn primary" onClick={() => go("new")}>New application</button></Empty></Page>;
  if (loading && !app) return <Page title="Document workspace"><Loading /></Page>;
  if (error || !app) return <Page title="Document workspace"><ErrorBox error={error} retry={reload} /></Page>;
  return (
    <Page title="Document workspace" sub={`${app.id} - ${app.institution_name}`}>
      <div className="grid2 wide-right">
        <Card title="Uploaded files">
          <ul className="doclist">{app.documents.map(d => { const [b, l] = DOC_LABEL[d.status] ?? ["MANUAL REVIEW", d.status]; return (
            <li key={d.id}><button className={`docbtn ${d.id === docId ? "on" : ""}`} onClick={() => { setSel(d.id); setPg(0); }}><b>{d.filename}</b><small>{d.page_count} page(s) - {fmtSize(d.size_bytes)} - {Object.keys(d.fields).length} fields</small><Badge status={b}>{l}</Badge></button></li>); })}</ul>
        </Card>
        <div className="stack">
          {dl && !doc ? <Loading /> : doc && <>
            {doc.message && <div className="notice warn">{doc.message}</div>}
            <Card title="Extracted fields">
              <div className="tablewrap"><table><thead><tr><th>Field</th><th>Value</th><th>Page</th><th>Evidence line</th></tr></thead><tbody>
                {Object.entries(FIELD_LABELS).map(([k, label]) => { const f = doc.fields[k]; return <tr key={k}><td>{label}</td>{f ? <><td><b>{f.value}</b></td><td>{f.page}</td><td className="muted">{f.evidence}</td></> : <td colSpan={3} className="muted">Not found in this document</td>}</tr>; })}</tbody></table></div>
            </Card>
            <Card title="Extracted text" action={<div className="chips">{doc.pages?.map((_, i) => <button key={i} className={`chip ${pg === i ? "on" : ""}`} onClick={() => setPg(i)}>Page {i + 1}</button>)}</div>}>
              {doc.pages?.[pg]?.trim() ? <pre className="text">{doc.pages[pg]}</pre> : <p className="muted">No selectable text on this page.</p>}
            </Card></>}
        </div>
      </div>
    </Page>);
}
