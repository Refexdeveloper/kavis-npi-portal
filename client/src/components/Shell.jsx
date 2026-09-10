import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../api/AuthContext.jsx";
import NotificationBell from "./NotificationBell.jsx";

const NARROW_MQ = "(max-width: 991px)";

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(NARROW_MQ).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

const NAV = [
  { to: "/", label: "Dashboard", icon: "fa-gauge-high", end: true },
  { to: "/funnel", label: "Sales Funnel", icon: "fa-filter" },
  { to: "/leads", label: "Pipeline", icon: "fa-diagram-project" },
  { to: "/leads/new", label: "New Lead", icon: "fa-plus-circle" },
];

const TITLES = {
  "/": ["Command Center", "Create, track and approve every stage"],
  "/funnel": ["Sales Funnel", "RFI to Agreement, stage by stage"],
  "/leads": ["Pipeline", "Every lead across every gate"],
  "/leads/new": ["New Lead", "Opens Stage 1 — RFI"],
  "/users": ["Users & Access", "Kavis Pharma cross-function logins"],
  "/account": ["Account", "Your sign-in"],
};

export default function Shell() {
  const isNarrow = useIsNarrow();
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(NARROW_MQ).matches : false,
  );
  const [userOpen, setUserOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, isAdmin, roleLabel, displayName } = useAuth();
  const path = location.pathname;
  const [title, subtitle] = /^\/leads\/\d+/.test(path)
    ? ["Lead Workspace", "Gates, items, approvals and history"]
    : (TITLES[path] || ["Kavis Pharma", "NPI Portal"]);
  const drawerOpen = isNarrow && !collapsed;

  useEffect(() => {
    setCollapsed(isNarrow);
  }, [isNarrow]);

  useEffect(() => {
    if (isNarrow) setCollapsed(true);
    setUserOpen(false);
    setCreateOpen(false);
  }, [location.pathname, isNarrow]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const closeDrawer = () => { if (isNarrow) setCollapsed(true); };

  const searchSubmit = (e) => {
    e.preventDefault();
    navigate(`/leads?q=${encodeURIComponent(q.trim())}`);
  };

  const items = [
    ...NAV,
    ...(isAdmin ? [{ to: "/users", label: "Users & Access", icon: "fa-user-shield" }] : []),
  ];

  return (
    <div className={`wrapper ${collapsed ? "sidebar-collapse" : ""} ${!collapsed ? "sidebar-open" : ""}${isNarrow ? " is-narrow" : ""}`}>
      {drawerOpen ? (
        <button type="button" className="sidebar-backdrop" aria-label="Close menu" onClick={closeDrawer} />
      ) : null}
      <header className="main-header">
        <NavLink to="/" className="logo" aria-label="Kavis Pharma" onClick={closeDrawer}>
          <span className="header-logo header-logo--mark">KV</span>
        </NavLink>
        <nav className="navbar">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
          >
            <i className="fas fa-bars" />
          </button>
          <form className="header-search" onSubmit={searchSubmit}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads, clients…" />
            <button type="submit"><i className="fas fa-search" /></button>
          </form>
          <div className="navbar-custom-menu">
            <ul className="navbar-nav">
              <li><NavLink to="/leads" title="Pipeline"><i className="fas fa-diagram-project" /></NavLink></li>
              <li><NavLink to="/funnel" title="Sales Funnel"><i className="fas fa-filter" /></NavLink></li>
              {isAdmin ? <li><NavLink to="/users" title="Users"><i className="fas fa-user-shield" /></NavLink></li> : null}
              <NotificationBell />
              <li className={`dropdown ${createOpen ? "open" : ""}`}>
                <button type="button" className="nav-icon-btn" onClick={() => setCreateOpen((o) => !o)}>
                  <i className="fas fa-plus" />
                </button>
                <div className="dropdown-menu">
                  <NavLink to="/leads/new" onClick={() => setCreateOpen(false)}>New lead</NavLink>
                  {isAdmin ? <NavLink to="/users" onClick={() => setCreateOpen(false)}>New user</NavLink> : null}
                </div>
              </li>
              <li className={`dropdown ${userOpen ? "open" : ""}`}>
                <button type="button" className="nav-icon-btn nav-user-btn" onClick={() => setUserOpen((o) => !o)}>
                  <i className="fas fa-user" aria-hidden="true" />
                  <span className="nav-user-name">{displayName}</span>
                </button>
                <div className="dropdown-menu">
                  <div style={{ padding: "6px 14px 10px", fontSize: 12, color: "var(--color-muted)" }}>{roleLabel}{isAdmin ? " · Admin" : ""}</div>
                  <NavLink to="/account" onClick={() => setUserOpen(false)}>Change Password</NavLink>
                  <div className="divider" />
                  <button type="button" onClick={() => { logout(); navigate("/login"); }}>Logout</button>
                </div>
              </li>
            </ul>
          </div>
        </nav>
      </header>

      <aside className="main-sidebar" aria-hidden={isNarrow && collapsed}>
        <ul className="sidebar-menu">
          {items.map((item) => (
            <li key={item.to} className={item.end ? (path === "/" ? "active" : "") : path.startsWith(item.to) ? "active" : ""}>
              <NavLink to={item.to} end={item.end} onClick={closeDrawer}>
                <i className={`fas ${item.icon} fa-fw`} /><span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      <div className="content-wrapper">
        <section className="content-header">
          <h1>
            {title}
            {subtitle ? <small>{subtitle}</small> : null}
          </h1>
          <div className="content-header__right">
            <ol className="breadcrumb">
              <li><NavLink to="/">Home</NavLink></li>
              <li>{title}</li>
            </ol>
          </div>
        </section>
        <section className="content">
          <Outlet />
        </section>
      </div>

      <footer className="main-footer">
        <strong>Extrovis &copy; {new Date().getFullYear()}</strong> Kavis Pharma &middot; NPI Portal.
      </footer>
    </div>
  );
}
