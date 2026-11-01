export type Status = "PASS" | "MISMATCH" | "UNVERIFIED" | "MANUAL REVIEW";
export type Review = "PENDING" | "REVIEWED" | "NEEDS_CLARIFICATION";
export const STATUSES: Status[] = ["PASS", "MISMATCH", "UNVERIFIED", "MANUAL REVIEW"];
export const FIELD_LABELS: Record<string, string> = { institution_name: "Institution Name", institution_id: "Institution ID", address: "Address", issue_date: "Issue Date", expiry_date: "Expiry Date", certificate_number: "Certificate Number", application_id: "Application ID" };
export interface FieldVal { value: string; page: number | null; evidence: string }
export interface Doc { id: number; app_id: string; filename: string; size_bytes: number; page_count: number; status: string; message: string; fields: Record<string, FieldVal>; created_at: string; pages?: string[] }
export interface Finding { id: number; app_id: string; institution_name?: string; rule_id: string; rule_name: string; status: Status; document: string; page: number | null; field: string; extracted: string; expected: string; explanation: string; confidence: number | null; uncertainty: string; action: string; review_status: Review; note: string; reviewed_at: string | null; created_at: string }
export interface AppSummary { id: string; institution_name: string; app_type: string; is_demo: number; created_at: string; validated_at: string | null; docs: number; status: string; counts: Record<string, number>; pending: number }
export interface AppDetail extends AppSummary { documents: Doc[]; findings: Finding[] }
export interface Rule { id: string; name: string; kind: string; field: string | null; enabled: boolean; description: string }
export interface Settings { rules: Rule[]; categories: string[]; expiry_warn_days: number }
export interface Dashboard { total_applications: number; documents_total: number; documents_processed: number; flagged: number; pending_reviews: number; distribution: Record<string, number>; recent: AppSummary[]; activity: { id: number; ts: string; message: string }[]; has_demo: boolean }
export interface UploadResult { application: AppDetail; results: { filename: string; status: string; message: string; page_count: number; fields_found: number }[] }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(url, init); } catch { throw new Error("Cannot reach the ProofGraph backend. Start it with: uvicorn app.main:app --port 8000"); }
  if (!r.ok) {
    let m = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); m = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: any) => d.msg).join("; ") : m; } catch { /* keep default */ }
    throw new Error(m);
  }
  return r.json();
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const api = {
  dashboard: () => req<Dashboard>("/api/dashboard"),
  apps: () => req<AppSummary[]>("/api/applications"),
  app: (id: string) => req<AppDetail>(`/api/applications/${encodeURIComponent(id)}`),
  doc: (id: string, docId: number) => req<Doc>(`/api/applications/${encodeURIComponent(id)}/documents/${docId}`),
  create: (fd: FormData) => req<UploadResult>("/api/applications", { method: "POST", body: fd }),
  validate: (id: string) => req<AppDetail>(`/api/applications/${encodeURIComponent(id)}/validate`, { method: "POST" }),
  remove: (id: string) => req<{ ok: boolean }>(`/api/applications/${encodeURIComponent(id)}`, { method: "DELETE" }),
  findings: (q: Record<string, string>) => req<Finding[]>("/api/findings?" + new URLSearchParams(q)),
  review: (id: number, review_status: Review, note: string) => req<Finding>(`/api/findings/${id}`, json("PATCH", { review_status, note })),
  settings: () => req<Settings>("/api/settings"),
  saveSettings: (s: { rules_enabled: Record<string, boolean>; categories: string[]; expiry_warn_days: number }) => req<Settings>("/api/settings", json("PUT", s)),
  integrations: () => req<{ name: string; status: string; detail: string }[]>("/api/integrations"),
  demoLoad: () => req<{ loaded: string[] }>("/api/demo/load", { method: "POST" }),
  demoReset: () => req<{ loaded: string[] }>("/api/demo/reset", { method: "POST" }),
};
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-");
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-");
export const fmtSize = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
