import { useState } from "react";
import { api, slug, STATUSES, type Finding } from "../api";
import { useApp } from "../ctx";
import { Badge, Card, Conf, Empty, ErrorBox, Loading, Page, StatusChips, useAsync } from "../ui";

export default function Findings() {
  const { appId, tick, go } = useApp(); const [f, setF] = useState("ALL"); const [sel, setSel] = useState<number | null>(null);
  const { data: app, error, loading, reload } = useAsync(() => appId ? api.app(appId) : Promise.resolve(null), [appId, tick]);
  if (!appId) return <Page title="Evidence graph"><Empty title="No application selected" hint="Create or load an application first."><button className="btn primary" onClick={() => go("new")}>New application</button></Empty></Page>;
  if (loading && !app) return <Page title="Evidence graph"><Loading /></Page>;
  if (error || !app) return <Page title="Evidence graph"><ErrorBox error={error} retry={reload} /></Page>;
  const list = app.findings.filter(x => f === "ALL" || x.status === f); const gl = f === "ALL" && list.some(x => x.status !== "PASS") ? list.filter(x => x.status !== "PASS") : list;
  const rulesN = [...new Set(gl.map(x => x.rule_id))], docsN = [...new Set(gl.map(x => x.document))];
  const H = Math.max(rulesN.length, docsN.length) * 34 + 20, ry = (i: number) => 18 + i * 34 + (rulesN.length < docsN.length ? ((docsN.length - rulesN.length) * 17) : 0), dy = (i: number) => 18 + i * 34 + (docsN.length < rulesN.length ? ((rulesN.length - docsN.length) * 17) : 0);
  const COL: Record<string, string> = { PASS: "#137A4B", MISMATCH: "#C0392B", UNVERIFIED: "#6B7599", "MANUAL REVIEW": "#D98E04" };
  return (
    <Page title="Evidence graph and findings" sub={`${app.id} - ${app.institution_name}. Every finding links a rule to the document, page and value it came from.`}>
      <StatusChips value={f} onChange={setF} counts={app.counts} />
      {list.length === 0 ? <Card className="mt"><Empty title="No findings for this filter" hint="Pick another status, or re-run validation." /></Card> : <>
        <Card title="Rule to document links" className="mt">
          <div className="graph"><svg viewBox={`0 0 760 ${H}`} role="img" aria-label="Graph linking validation rules to source documents" preserveAspectRatio="xMidYMid meet">
            {gl.map(x => { const a = ry(rulesN.indexOf(x.rule_id)), b = dy(docsN.indexOf(x.document)), on = sel === x.id; return <path key={x.id} d={`M250 ${a} C 380 ${a}, 380 ${b}, 510 ${b}`} fill="none" stroke={COL[x.status]} strokeWidth={on ? 4 : 1.800} opacity={sel && !on ? 0.25 : 0.85} strokeDasharray={x.status === "UNVERIFIED" ? "5 4" : undefined} onClick={() => setSel(x.id)} style={{ cursor: "pointer" }}><title>{`${x.rule_id} -> ${x.document}: ${x.status}`}</title></path>; })}
            {rulesN.map((r, i) => <g key={r}><rect x="20" y={ry(i) - 13} width="230" height="26" rx="6" className="node" /><text x="32" y={ry(i) + 4}>{r}</text></g>)}
            {docsN.map((d, i) => <g key={d}><rect x="510" y={dy(i) - 13} width="230" height="26" rx="6" className="node doc" /><text x="522" y={dy(i) + 4}>{d.length > 30 ? d.slice(0, 29) + "..." : d}</text></g>)}
          </svg></div>
          <div className="legend row">{STATUSES.map(s => <span key={s} className="lg"><i style={{ background: COL[s] }} />{s}</span>)}<small className="muted">Under All, the graph shows flagged findings only; click a line or card to highlight it.</small></div>
        </Card>
        <div className="cards">{list.map(x => <FindingCard key={x.id} x={x} on={sel === x.id} pick={() => setSel(x.id)} />)}</div></>}
    </Page>);
}
export function FindingCard({ x, on, pick }: { x: Finding; on?: boolean; pick?: () => void }) {
  return (
    <article className={`finding ${slug(x.status)} ${on ? "sel" : ""}`} onClick={pick}>
      <header><Badge status={x.status} /><b>{x.rule_id}</b><span className="muted">{x.rule_name}</span><span className="spacer" /><Badge status={x.review_status === "PENDING" ? "PENDING" : x.review_status === "REVIEWED" ? "PASS" : "MANUAL REVIEW"}>{x.review_status.replace("_", " ").toLowerCase()}</Badge></header>
      <p>{x.explanation}</p>
      <dl><div><dt>Source document</dt><dd>{x.document}</dd></div><div><dt>Page</dt><dd>{x.page ?? "not available"}</dd></div><div><dt>Extracted value</dt><dd>{x.extracted || "-"}</dd></div><div><dt>Expected value</dt><dd>{x.expected || "-"}</dd></div>
        <div><dt>Confidence</dt><dd><Conf v={x.confidence} /></dd></div><div><dt>Uncertainty</dt><dd>{x.uncertainty}</dd></div></dl>
      <p className="next"><b>Recommended next action:</b> {x.action}</p>
      {x.note && <p className="note"><b>Reviewer note:</b> {x.note}</p>}
    </article>);
}
