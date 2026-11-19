import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MeResponse, PublicConfig, PublicPlan } from "@shared/api";
import { api } from "./api";

type Session = {
  config: PublicConfig | null;
  plans: PublicPlan[];
  me: MeResponse | null;
  ready: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setMe(await api<MeResponse>("/me"));
  }, []);

  useEffect(() => {
    Promise.all([api<PublicConfig>("/config"), api<PublicPlan[]>("/plans"), api<MeResponse>("/me")])
      .then(([c, p, m]) => {
        setConfig(c);
        setPlans(p);
        setMe(m);
      })
      .catch((err) => console.error("Could not load session", err))
      .finally(() => setReady(true));
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ config, plans, me, ready, refresh, logout }),
    [config, plans, me, ready, refresh, logout]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

/** True when downloads and previews come without watermark. */
export function hasCleanAccess(me: MeResponse | null): boolean {
  const c = me?.customer;
  return !!c && c.planStatus === "active" && !c.watermark;
}
