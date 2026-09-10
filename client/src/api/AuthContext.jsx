import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, setToken, token as getToken } from "./client.js";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((u) => setUser(u))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: !!user?.is_admin,
      isTeamHead: !!user?.is_team_head,
      /** BD (Vinay) + Senior Management see full workflow / funnel / instructions. */
      canSeeFullWorkflow: !!user && (!!user.is_admin || user.role === "business_development"),
      canCreateLead: !!user && (!!user.is_admin || user.role === "business_development"),
      role: user?.role || null,
      roleLabel: user?.role_label || "",
      displayName: user?.full_name || user?.username || "User",
      async login(username, password) {
        const res = await authApi.login(username, password);
        setToken(res.token);
        setUser(res.user);
        return res.user;
      },
      logout() {
        authApi.logout();
        setToken(null);
        setUser(null);
      },
      async refreshUser() {
        const u = await authApi.me();
        setUser(u);
      },
    }),
    [user, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
