import { Fragment, useState } from "react";
import { api, fmtDate, type Finding, type Review } from "../api";
import { useApp } from "../ctx";
import { Badge, Card, Empty, ErrorBox, Loading, Page, StatusChips, useAsync } from "../ui";
import { FindingCard } from "./Findings";

export default function Queue() {
  const { tick, reload, toast, go } = useApp(); const [st, setSt] = useState("ALL"); const [rv, setRv] = useState("ALL"); const [open, setOpen] = useState<number | null>(null); const [notes, setNotes] = useState<Record<number, string>>({});
  const { data, error, loading, reload: again } = useAsync(() => api.findings({ ...(st !== "ALL" && { status: st }), ...(rv !== "ALL" && { review: rv }) }), [st, rv, tick]);
  const save = (x: Finding, s: Review) => api.review(x.id, s, notes[x.id] ?? x.note).then(() => { toast(s === "REVIEWED" ? "Marked as reviewed" : s === "PENDING" ? "Reset to pending" : "Marked as needing clarification"); reload(); }).catch(e => toast(e.message, "err"));
  return (
    <Page title="Reviewer queue" sub="Every finding that needs a human decision. Notes and decisions are saved to the local database.">
      <div className="row wrap"><StatusChips value={st} onChange={setSt} />
        <label className="inline">Review state<select value={rv} onChange={e => setRv(e.target.value)}><option value="ALL">All</option><option value="PENDING">Pending</option><option value="REVIEWED">Reviewed</option><option value="NEEDS_CLARIFICATION">Needs clarification</option></select></label></div>
      <Card className="mt">
        {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={again} /> : !data?.length ? <Empty title="Nothing in the queue" hint="No findings match these filters."><button className="btn" onClick={() => go("new")}>New application</button></Empty> :
          <div className="tablewrap"><table><thead><tr><th>Status</th><th>Application</th><th>Rule</th><th>Document</th><th>Review</th><th></th></tr></thead><tbody>
            {data.map(x => <Fragment key={x.id}>
              <tr className="click" onClick={() => setOpen(open === x.id ? null : x.id)}><td><Badge status={x.status} /></td><td><b>{x.app_id}</b><br /><small>{x.institution_name}</small></td><td>{x.rule_id}</td><td>{x.document}{x.page ? ` (p.${x.page})` : ""}</td>
                <td><Badge status={x.review_status === "PENDING" ? "PENDING" : x.review_status === "REVIEWED" ? "PASS" : "MANUAL REVIEW"}>{x.review_status.replace("_", " ").toLowerCase()}</Badge></td><td><button className="btn ghost sm" aria-expanded={open === x.id}>{open === x.id ? "Close" : "Review"}</button></td></tr>
              {open === x.id && <tr className="detail"><td colSpan={6}><FindingCard x={x} />
                <label className="notebox">Reviewer note<textarea rows={3} maxLength={2000} value={notes[x.id] ?? x.note} onChange={e => setNotes({ ...notes, [x.id]: e.target.value })} placeholder="Record what you checked and why you decided this way." /></label>
                <div className="row"><button className="btn primary" onClick={() => save(x, "REVIEWED")}>Mark reviewed</button><button className="btn" onClick={() => save(x, "NEEDS_CLARIFICATION")}>Needs clarification</button><button className="btn ghost" onClick={() => save(x, "PENDING")}>Reset to pending</button>{x.reviewed_at && <small className="muted">Last decision {fmtDate(x.reviewed_at)}</small>}</div></td></tr>}</Fragment>)}</tbody></table></div>}
      </Card>
    </Page>);
}
