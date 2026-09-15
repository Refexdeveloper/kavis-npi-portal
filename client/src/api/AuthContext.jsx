import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, setToken, token as getToken } from "./client.js";

const Ctx = createContext(null);

/**
 * Capabilities are derived from the live user payload (/user), which reloads
 * role / flags from MySQL on every API request. Changing a role in Admin → Users
 * takes effect after the affected user refreshes (focus/visibility) or re-logs in.
 */
function capsFromUser(user) {
  if (!user) {
    return {
      isAdmin: false,
      isTeamHead: false,
      canActAll: false,
      canSeeFullWorkflow: false,
      canCreateLead: false,
    };
  }
  const isAdmin = !!user.is_admin;
  const canActAll = !!user.can_act_all;
  const isBd = user.role === "business_development";
  return {
    isAdmin,
    isTeamHead: !!user.is_team_head,
    canActAll,
    // Full funnel / command UI: Senior Management, or BD without act-all (e.g. BD Team Head).
    // Vinay (can_act_all) gets task-only dashboard while still able to update any item.
    canSeeFullWorkflow: isAdmin || (isBd && !canActAll),
    canCreateLead: isAdmin || isBd,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return null;
    }
    try {
      const u = await authApi.me();
      setUser(u);
      return u;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  // Pick up admin role / flag changes without forcing a full re-login.
  useEffect(() => {
    function onFocus() {
      if (getToken()) refreshUser().catch(() => undefined);
    }
    function onVisibility() {
      if (document.visibilityState === "visible" && getToken()) {
        refreshUser().catch(() => undefined);
      }
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshUser]);

  const caps = capsFromUser(user);

  const value = useMemo(
    () => ({
      user,
      loading,
      ...caps,
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
      refreshUser,
    }),
    [user, loading, caps, refreshUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
