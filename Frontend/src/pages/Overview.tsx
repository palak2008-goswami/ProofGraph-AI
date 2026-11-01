import { api, fmtDate, STATUSES } from "../api";
import { useApp } from "../ctx";
import { Badge, Card, DemoTag, Empty, ErrorBox, Loading, Page, useAsync } from "../ui";

const COLORS: Record<string, string> = { PASS: "#137A4B", MISMATCH: "#C0392B", UNVERIFIED: "#6B7599", "MANUAL REVIEW": "#D98E04" };
export default function Overview() {
  const { tick, reload, toast, go, setAppId, confirm } = useApp();
  const { data: d, error, loading, reload: again } = useAsync(api.dashboard, [tick]);
  const load = () => api.demoLoad().then(r => { toast(`Loaded ${r.loaded.length} synthetic demo applications`); reload(); }).catch(e => toast(e.message, "err"));
  const reset = () => confirm("Reset synthetic demo data? Demo applications and any reviewer notes on them will be deleted and recreated. Your own uploads are not touched.", () => api.demoReset().then(() => { toast("Demo data reset"); reload(); }).catch(e => toast(e.message, "err")));
  if (loading && !d) return <Page title="Overview"><Loading /></Page>;
  if (error || !d) return <Page title="Overview"><ErrorBox error={error} retry={again} /></Page>;
  const total = STATUSES.reduce((s, k) => s + (d.distribution[k] ?? 0), 0); let off = 0; const R = 54, C = 2 * Math.PI * R;
  const stats: [string, number, string][] = [["Applications", d.total_applications, "submitted for review"], ["Documents processed", d.documents_processed, `of ${d.documents_total} uploaded`], ["Flagged issues", d.flagged, "mismatch or manual review"], ["Pending reviews", d.pending_reviews, "awaiting a reviewer"]];
  return (
    <Page title="Overview" sub="Where every application stands, and what a reviewer should look at next." actions={<>
      <button className="btn" onClick={load}>Load demo data</button>{d.has_demo && <button className="btn ghost" onClick={reset}>Reset demo data</button>}<button className="btn primary" onClick={() => go("new")}>New application</button></>}>
      {d.has_demo && <div className="notice">Synthetic demo data is loaded. All institutions, IDs and documents are fictional and were generated locally.</div>}
      <div className="grid4">{stats.map(([l, v, s]) => <div className="stat" key={l}><span>{l}</span><b>{v}</b><small>{s}</small></div>)}</div>
      <div className="grid2">
        <Card title="Finding status distribution">
          {total === 0 ? <Empty title="No findings yet" hint="Create an application or load the demo to see results."><button className="btn" onClick={load}>Load demo data</button></Empty> :
            <div className="donut-wrap"><svg viewBox="0 0 140 140" width="170" height="170" role="img" aria-label="Finding status distribution donut chart">
              <circle cx="70" cy="70" r={R} fill="none" stroke="#E6EAF5" strokeWidth="16" />
              {STATUSES.map(s => { const n = d.distribution[s] ?? 0, len = (n / total) * C, el = <circle key={s} cx="70" cy="70" r={R} fill="none" stroke={COLORS[s]} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />; off += len; return el; })}
              <text x="70" y="68" textAnchor="middle" className="donut-n">{total}</text><text x="70" y="86" textAnchor="middle" className="donut-l">findings</text></svg>
              <ul className="legend">{STATUSES.map(s => <li key={s}><i style={{ background: COLORS[s] }} /><Badge status={s} /><b>{d.distribution[s] ?? 0}</b></li>)}</ul></div>}
        </Card>
        <Card title="Activity log">
          {d.activity.length === 0 ? <Empty title="No activity yet" /> : <ul className="log">{d.activity.map(a => <li key={a.id}><time>{fmtDate(a.ts)}</time>{a.message}</li>)}</ul>}
        </Card>
      </div>
      <Card title="Recent applications">
        {d.recent.length === 0 ? <Empty title="No applications yet" hint="Upload PDFs for a new application, or load the synthetic demo."><button className="btn primary" onClick={() => go("new")}>Start an application</button></Empty> :
          <div className="tablewrap"><table><thead><tr><th>Application</th><th>Institution</th><th>Type</th><th>Docs</th><th>Status</th><th>Pending</th><th>Created</th></tr></thead><tbody>
            {d.recent.map(a => <tr key={a.id} className="click" tabIndex={0} onClick={() => { setAppId(a.id); go("findings"); }} onKeyDown={e => e.key === "Enter" && (setAppId(a.id), go("findings"))}>
              <td><b>{a.id}</b> {a.is_demo ? <DemoTag /> : null}</td><td>{a.institution_name}</td><td>{a.app_type}</td><td>{a.docs}</td><td><Badge status={a.status} /></td><td>{a.pending}</td><td>{fmtDate(a.created_at)}</td></tr>)}</tbody></table></div>}
      </Card>
    </Page>);
}
