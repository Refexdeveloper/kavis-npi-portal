import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";

const POLL_MS = 60_000;

export default function NotificationBell() {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.notifications().then((rows) => { if (!cancelled) setAlerts(rows); }).catch(() => undefined);
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const overdueCount = alerts.filter((a) => a.overdue).length;

  return (
    <li className={`dropdown ${open ? "open" : ""}`}>
      <button type="button" className="nav-icon-btn" onClick={() => setOpen((o) => !o)} aria-label="TAT notifications">
        <i className="fas fa-bell" />
        {alerts.length ? <span className={`notif-badge${overdueCount ? " is-overdue" : ""}`}>{alerts.length}</span> : null}
      </button>
      <div className="dropdown-menu dropdown-menu--wide">
        <div style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          TAT alerts
        </div>
        {alerts.length === 0 ? (
          <div style={{ padding: "10px 14px 14px", fontSize: 13, color: "var(--color-muted)" }}>Nothing overdue — all clear.</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {alerts.map((a) => (
              <Link key={`${a.leadId}-${a.itemKey}`} to={`/leads/${a.leadId}`} className="notif-row" onClick={() => setOpen(false)}>
                <span className={`notif-dot ${a.overdue ? "is-overdue" : "is-soon"}`} />
                <span className="notif-row__text">
                  <b>{a.itemLabel}</b>
                  <span>{a.refCode} · {a.product} · {a.roleLabel}</span>
                  <span className={a.overdue ? "notif-overdue-text" : "notif-soon-text"}>
                    {a.overdue ? `Overdue by ${a.overdueDays}d (TAT ${a.tatDays}d)` : `Due today (TAT ${a.tatDays}d)`}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
