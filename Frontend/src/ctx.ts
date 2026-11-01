import { createContext, useContext } from "react";
import type { AppSummary, Settings } from "./api";
export interface Ctx { apps: AppSummary[]; appId: string; setAppId: (s: string) => void; tick: number; reload: () => void; toast: (m: string, kind?: "ok" | "err") => void; go: (r: string) => void; settings: Settings | null; confirm: (msg: string, onYes: () => void) => void }
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);
