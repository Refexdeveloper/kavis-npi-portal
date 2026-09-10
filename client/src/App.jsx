import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./api/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import Shell from "./components/Shell.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Funnel from "./pages/Funnel.jsx";
import Leads from "./pages/Leads.jsx";
import LeadView from "./pages/LeadView.jsx";
import AddLead from "./pages/AddLead.jsx";
import Users from "./pages/Users.jsx";
import Account from "./pages/Account.jsx";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-screen">Loading&hellip;</div>;
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

function RequirePasswordReady({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-screen">Loading&hellip;</div>;
  if (user?.must_change_password && location.pathname !== "/account") {
    return <Navigate to="/account?forced=1" replace />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading&hellip;</div>;
  if (!isAdmin) return <div className="loading-screen">Only Senior Management / Admin can access this page.</div>;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <RequirePasswordReady>
              <Shell />
            </RequirePasswordReady>
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/funnel" element={<Funnel />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/new" element={<AddLead />} />
        <Route path="/leads/:id" element={<LeadView />} />
        <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
