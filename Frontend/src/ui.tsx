import { useEffect, useState, type ReactNode } from "react";
import { slug, type Status } from "./api";

const GLYPH: Record<string, string> = { PASS: "\u2713", MISMATCH: "\u2715", UNVERIFIED: "?", "MANUAL REVIEW": "!", PENDING: "\u2026" };
export const Badge = ({ status, children }: { status: string; children?: ReactNode }) => <span className={`badge ${slug(status)}`}><span aria-hidden>{GLYPH[status] ?? "\u2022"}</span> {children ?? status}</span>;
export const Card = ({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>{(title || action) && <header className="card-h"><h2>{title}</h2>{action}</header>}{children}</section>);
export const Empty = ({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) => <div className="empty"><div className="empty-mark" aria-hidden>{"\u25CC"}</div><strong>{title}</strong>{hint && <p>{hint}</p>}{children}</div>;
export const Loading = ({ label = "Loading" }: { label?: string }) => <div className="loading" role="status"><span className="spin" />{label}...</div>;
export const ErrorBox = ({ error, retry }: { error: string; retry?: () => void }) => <div className="errbox" role="alert"><strong>Something went wrong.</strong> {error}{retry && <button className="btn ghost sm" onClick={retry}>Retry</button>}</div>;
export const Page = ({ title, sub, actions, children }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode }) => (
  <div className="page"><div className="page-h"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div><div className="row">{actions}</div></div>{children}</div>);
export const DemoTag = () => <span className="demo-tag" title="Synthetic sample data, not a real application">Synthetic demo</span>;

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [n, setN] = useState(0);
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    fn().then(d => { if (live) setData(d); }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, loading, reload: () => setN(x => x + 1) };
}
export const StatusChips = ({ value, onChange, counts }: { value: string; onChange: (s: string) => void; counts?: Record<string, number> }) => (
  <div className="chips" role="group" aria-label="Filter by status">
    {["ALL", "PASS", "MISMATCH", "UNVERIFIED", "MANUAL REVIEW"].map(s => <button key={s} className={`chip ${value === s ? "on" : ""}`} aria-pressed={value === s} onClick={() => onChange(s)}>{s === "ALL" ? "All" : s}{counts && s !== "ALL" ? ` (${counts[s as Status] ?? 0})` : ""}</button>)}
  </div>);
export const Conf = ({ v }: { v: number | null }) => v == null ? <span className="muted">n/a (no source)</span> : <span className="conf" title={`Extraction confidence ${Math.round(v * 100)}%`}><span className="bar"><i style={{ width: `${v * 100}%` }} /></span>{Math.round(v * 100)}%</span>;
