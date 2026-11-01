import { api, FIELD_LABELS, STATUSES } from "../api";
import { useApp } from "../ctx";
import { Badge, Card, Empty, ErrorBox, Loading, Page, useAsync } from "../ui";

const GROUPS: [string, string[]][] = [["Required-field checks", ["readable", "required"]], ["Date and expiry checks", ["date_parse", "expiry", "date_order"]], ["Cross-document comparison", ["compare"]], ["Issuer verification", ["issuer"]]];
const norm = (s: string) => s.toLowerCase().replace(/[\s,.;]+/g, " ").trim();
export default function Validation() {
  const { appId, tick, reload, toast, settings, go } = useApp();
  const { data: app, error, loading, reload: again } = useAsync(() => appId ? api.app(appId) : Promise.resolve(null), [appId, tick]);
  const run = () => api.validate(appId).then(() => { toast("Validation complete"); reload(); }).catch(e => toast(e.message, "err"));
  if (!appId) return <Page title="Validation center"><Empty title="No application selected" hint="Create or load an application first."><button className="btn primary" onClick={() => go("new")}>New application</button></Empty></Page>;
  if (loading && !app) return <Page title="Validation center"><Loading /></Page>;
  if (error || !app) return <Page title="Validation center"><ErrorBox error={error} retry={again} /></Page>;
  const readable = app.documents.filter(d => d.status === "OK" || d.status === "NO_FIELDS");
  const cols = [...readable.map(d => ({ name: d.filename, get: (k: string) => d.fields[k]?.value })), { name: "Application form entry", get: (k: string) => (k === "institution_name" ? app.institution_name : k === "application_id" ? app.id : undefined) }];
  const rules = settings?.rules ?? [];
  const byRule = (id: string) => app.findings.filter(f => f.rule_id === id);
  return (
    <Page title="Validation center" sub={`${app.id} - ${app.institution_name}. Rules are configurable under Settings.`} actions={<button className="btn primary" onClick={run}>Re-run validation</button>}>
      <div className="grid4">{STATUSES.map(s => <div className="stat" key={s}><Badge status={s} /><b>{app.counts[s] ?? 0}</b><small>findings</small></div>)}</div>
      <Card title="Cross-document comparison matrix" className="mt">
        <p className="muted pad">Each row shows what every source says for one field. Differences after normalising case, spacing and punctuation are highlighted. A dash means the field was not found, which is never counted as a match.</p>
        <div className="tablewrap"><table className="matrix"><thead><tr><th>Field</th>{cols.map(c => <th key={c.name}>{c.name}</th>)}</tr></thead><tbody>
          {Object.entries(FIELD_LABELS).map(([k, label]) => { const vals = cols.map(c => c.get(k)); const present = vals.filter(Boolean) as string[]; const diff = present.length > 1 && new Set(present.map(norm)).size > 1;
            return <tr key={k} className={diff ? "diffrow" : ""}><td><b>{label}</b></td>{vals.map((v, i) => <td key={i} className={v ? "" : "absent"}>{v ?? "-"}</td>)}</tr>; })}</tbody></table></div>
      </Card>
      {GROUPS.map(([title, kinds]) => { const rs = rules.filter(r => kinds.includes(r.kind)); return (
        <Card key={title} title={title} className="mt"><div className="tablewrap"><table><thead><tr><th>Rule</th><th>Description</th><th>Enabled</th><th>Results</th></tr></thead><tbody>
          {rs.map(r => <tr key={r.id} className={r.enabled ? "" : "off"}><td><b>{r.id}</b><br /><small>{r.name}</small></td><td className="muted">{r.description}</td><td>{r.enabled ? "On" : "Off"}</td>
            <td>{r.enabled ? (byRule(r.id).length ? STATUSES.map(s => { const n = byRule(r.id).filter(f => f.status === s).length; return n ? <span key={s} className="mr"><Badge status={s}>{n} {s}</Badge></span> : null; }) : <span className="muted">No applicable data</span>) : <span className="muted">Skipped</span>}</td></tr>)}</tbody></table></div></Card>); })}
      <div className="row mt"><button className="btn" onClick={() => go("findings")}>Open evidence graph</button><button className="btn ghost" onClick={() => go("settings")}>Configure rules</button></div>
    </Page>);
}
