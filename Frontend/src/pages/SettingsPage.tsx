import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../ctx";
import { Badge, Card, Loading, Page, useAsync } from "../ui";

export default function SettingsPage() {
  const { settings, reload, toast, confirm } = useApp(); const { data: integ } = useAsync(api.integrations, []);
  const [en, setEn] = useState<Record<string, boolean>>({}); const [cats, setCats] = useState<string[]>([]); const [warn, setWarn] = useState(60); const [nc, setNc] = useState("");
  useEffect(() => { if (settings) { setEn(Object.fromEntries(settings.rules.map(r => [r.id, r.enabled]))); setCats(settings.categories); setWarn(settings.expiry_warn_days); } }, [settings]);
  if (!settings) return <Page title="Settings"><Loading /></Page>;
  const save = () => api.saveSettings({ rules_enabled: en, categories: cats, expiry_warn_days: warn }).then(() => { toast("Settings saved and all applications re-validated"); reload(); }).catch(e => toast(e.message, "err"));
  const addCat = () => { const c = nc.trim(); if (!c) return; if (cats.includes(c)) return toast("That category already exists", "err"); setCats([...cats, c]); setNc(""); };
  return (
    <Page title="Settings" sub="Demo rules, application categories and local data. Saving re-validates every application; reviewer notes are kept." actions={<button className="btn primary" onClick={save}>Save settings</button>}>
      <div className="grid2">
        <Card title="Validation rules"><ul className="toggles">{settings.rules.map(r => <li key={r.id}><label><input type="checkbox" checked={en[r.id] ?? true} onChange={e => setEn({ ...en, [r.id]: e.target.checked })} /><span><b>{r.id}</b> {r.name}<small>{r.description}</small></span></label></li>)}</ul>
          <label className="inline pad">Expiry warning window (days)<input type="number" min={0} max={730} value={warn} onChange={e => setWarn(Number(e.target.value))} style={{ width: 90 }} /></label></Card>
        <div className="stack">
          <Card title="Application categories"><p className="muted pad">Demo categories for this prototype. They are not official regulatory categories.</p>
            <ul className="files">{cats.map(c => <li key={c}><span>{c}</span><button className="btn ghost sm" disabled={cats.length < 2} onClick={() => setCats(cats.filter(x => x !== c))}>Remove</button></li>)}</ul>
            <div className="row pad"><input value={nc} onChange={e => setNc(e.target.value)} placeholder="New category name" onKeyDown={e => e.key === "Enter" && addCat()} /><button className="btn" onClick={addCat}>Add</button></div></Card>
          <Card title="Integrations"><ul className="files">{integ?.map(i => <li key={i.name}><span>{i.name}</span><Badge status="UNVERIFIED">Unavailable</Badge><p className="muted full">{i.detail}</p></li>)}</ul></Card>
          <Card title="Demo data"><p className="muted pad">Synthetic applications and PDFs are generated locally. Reset deletes only demo applications.</p>
            <div className="row pad"><button className="btn" onClick={() => api.demoLoad().then(() => { toast("Demo data loaded"); reload(); }).catch(e => toast(e.message, "err"))}>Load demo data</button>
              <button className="btn danger" onClick={() => confirm("Reset all synthetic demo data, including reviewer notes on demo findings?", () => api.demoReset().then(() => { toast("Demo data reset"); reload(); }).catch(e => toast(e.message, "err")))}>Reset demo data</button></div></Card>
        </div>
      </div>
    </Page>);
}
