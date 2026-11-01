import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, type AppSummary, type Settings } from "./api";
import { AppCtx } from "./ctx";
import { DemoTag } from "./ui";
import Overview from "./pages/Overview";
import NewApplication from "./pages/NewApplication";
import Workspace from "./pages/Workspace";
import Validation from "./pages/Validation";
import Findings from "./pages/Findings";
import Queue from "./pages/Queue";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/SettingsPage";

const I: Record<string, string> = { overview: "M3 3h8v8H3zM13 3h8v5h-8zM13 11h8v10h-8zM3 14h8v7H3z", new: "M12 5v14M5 12h14", workspace: "M6 3h9l4 4v14H6zM14 3v5h5", validation: "M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z", findings: "M5 6h4M15 6h4M9 6l6 12M5 18h4M15 18h4", queue: "M4 6h16M4 12h16M4 18h10", reports: "M5 21V9M12 21V3M19 21v-8", settings: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" };
const NAV: [string, string][] = [["overview", "Overview"], ["new", "New Application"], ["workspace", "Document Workspace"], ["validation", "Validation Center"], ["findings", "Evidence Graph"], ["queue", "Reviewer Queue"], ["reports", "Reports"], ["settings", "Settings"]];
const PAGES: Record<string, () => ReactNode> = { overview: Overview, new: NewApplication, workspace: Workspace, validation: Validation, findings: Findings, queue: Queue, reports: Reports, settings: SettingsPage };
const route = () => { const r = location.hash.replace(/^#\/?/, ""); return r in PAGES ? r : "overview"; };

export default function App() {
  const [r, setR] = useState(route()); const [apps, setApps] = useState<AppSummary[]>([]); const [settings, setSettings] = useState<Settings | null>(null);
  const [appId, setAppIdState] = useState(localStorage.getItem("pg.app") ?? ""); const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; m: string; kind: string }[]>([]); const [dlg, setDlg] = useState<{ msg: string; yes: () => void } | null>(null); const [apiErr, setApiErr] = useState("");
  useEffect(() => { const f = () => setR(route()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => { api.apps().then(a => { setApps(a); setApiErr(""); }).catch(e => setApiErr(e.message)); api.settings().then(setSettings).catch(() => {}); }, [tick]);
  const current = apps.find(a => a.id === appId) ?? apps[0];
  const setAppId = (s: string) => { localStorage.setItem("pg.app", s); setAppIdState(s); };
  const toast = useCallback((m: string, kind: "ok" | "err" = "ok") => { const id = Date.now() + Math.random(); setToasts(t => [...t, { id, m, kind }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000); }, []);
  const Page = PAGES[r];
  return (
    <AppCtx.Provider value={{ apps, appId: current?.id ?? "", setAppId, tick, reload: () => setTick(t => t + 1), toast, go: x => { location.hash = "/" + x; }, settings, confirm: (msg, yes) => setDlg({ msg, yes }) }}>
      <a href="#main" className="skip">Skip to content</a>
      <aside className="sidebar">
        <div className="brand"><svg viewBox="0 0 32 32" width="34" height="34" aria-hidden><rect width="32" height="32" rx="8" fill="#19B5C9" opacity=".18" /><g stroke="#7EE3F0" strokeWidth="1.800" fill="none"><path d="M9 21l7-10 7 10M9 21h14" /></g><g fill="#fff"><circle cx="9" cy="21" r="3" /><circle cx="16" cy="11" r="3" /><circle cx="23" cy="21" r="3" /></g></svg>
          <div><b>ProofGraph AI</b><span>Evidence-Linked Compliance Validator</span></div></div>
        <nav aria-label="Main">{NAV.map(([id, label]) => <a key={id} href={`#/${id}`} className={r === id ? "on" : ""} aria-current={r === id ? "page" : undefined}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={I[id]} /></svg>{label}</a>)}</nav>
        <p className="side-note">Reviewer aid only. Findings are not official approval decisions and a mismatch is not proof of fraud.</p>
      </aside>
      <div className="main">
        <header className="topbar">
          <label className="appsel">Application
            <select value={current?.id ?? ""} onChange={e => setAppId(e.target.value)} disabled={!apps.length}>{!apps.length && <option>No applications yet</option>}{apps.map(a => <option key={a.id} value={a.id}>{a.id} - {a.institution_name}</option>)}</select></label>
          {current?.is_demo ? <DemoTag /> : null}
          <span className="spacer" /><span className="local-pill" title="Documents are processed on this machine only">Local processing - no external calls</span>
        </header>
        <main id="main">{apiErr ? <div className="errbox" role="alert"><strong>Backend unreachable.</strong> {apiErr}</div> : <Page />}</main>
      </div>
      <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.m}</div>)}</div>
      {dlg && <div className="modal-bg" role="dialog" aria-modal="true"><div className="modal"><p>{dlg.msg}</p><div className="row end"><button className="btn ghost" onClick={() => setDlg(null)}>Cancel</button><button className="btn danger" onClick={() => { const y = dlg.yes; setDlg(null); y(); }}>Confirm</button></div></div></div>}
    </AppCtx.Provider>);
}
