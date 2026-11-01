import { api, fmtDate, STATUSES } from "../api";
import { useApp } from "../ctx";
import { Badge, DemoTag, Empty, ErrorBox, Loading, Page, useAsync } from "../ui";

export default function Reports() {
  const { appId, tick, go } = useApp();
  const { data: app, error, loading, reload } = useAsync(() => appId ? api.app(appId) : Promise.resolve(null), [appId, tick]);
  if (!appId) return <Page title="Reports"><Empty title="No application selected" hint="Create or load an application first."><button className="btn primary" onClick={() => go("new")}>New application</button></Empty></Page>;
  if (loading && !app) return <Page title="Reports"><Loading /></Page>;
  if (error || !app) return <Page title="Reports"><ErrorBox error={error} retry={reload} /></Page>;
  return (
    <Page title="Reports" sub="Download the evidence as CSV or print a report for the case file." actions={<>
      <a className="btn" href={`/api/applications/${encodeURIComponent(app.id)}/report.csv`} download>Download CSV (this application)</a><a className="btn ghost" href="/api/reports/findings.csv" download>CSV (all applications)</a><button className="btn primary" onClick={() => window.print()}>Print report</button></>}>
      <article className="report">
        <header><h2>ProofGraph AI - Application compliance report</h2><p className="muted">Generated {fmtDate(new Date().toISOString())}</p></header>
        {app.is_demo ? <div className="notice">This report uses synthetic demo data. <DemoTag /></div> : null}
        <div className="notice warn">This report is a reviewer aid. It does not state official approval, authentication or fraud. A mismatch is not proof of wrongdoing, UNVERIFIED means no authoritative source was consulted, and final decisions require human review.</div>
        <h3>Application summary</h3>
        <dl className="sumdl"><div><dt>Application ID</dt><dd>{app.id}</dd></div><div><dt>Institution</dt><dd>{app.institution_name}</dd></div><div><dt>Type</dt><dd>{app.app_type}</dd></div><div><dt>Created</dt><dd>{fmtDate(app.created_at)}</dd></div><div><dt>Last validated</dt><dd>{fmtDate(app.validated_at)}</dd></div>
          <div><dt>Documents</dt><dd>{app.documents.map(d => `${d.filename} (${d.page_count} p.)`).join(", ")}</dd></div><div><dt>Overall status</dt><dd><Badge status={app.status} /></dd></div><div><dt>Counts</dt><dd>{STATUSES.map(s => `${s}: ${app.counts[s] ?? 0}`).join("  |  ")}</dd></div></dl>
        <h3>Findings and evidence</h3>
        <div className="tablewrap"><table className="report-t"><thead><tr><th>Status</th><th>Rule</th><th>Document / page</th><th>Extracted</th><th>Expected</th><th>Explanation and action</th><th>Review</th></tr></thead><tbody>
          {app.findings.filter(f => f.status !== "PASS").concat(app.findings.filter(f => f.status === "PASS")).map(f => <tr key={f.id}><td><Badge status={f.status} /></td><td><b>{f.rule_id}</b></td><td>{f.document}{f.page ? `, p.${f.page}` : ""}</td><td>{f.extracted}</td><td>{f.expected}</td>
            <td>{f.explanation}<br /><b>Next:</b> {f.action}<br /><small className="muted">Found {fmtDate(f.created_at)}</small></td><td>{f.review_status.replace("_", " ").toLowerCase()}{f.note && <><br /><i>"{f.note}"</i></>}{f.reviewed_at && <><br /><small>{fmtDate(f.reviewed_at)}</small></>}</td></tr>)}</tbody></table></div>
      </article>
    </Page>);
}
