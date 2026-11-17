import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";

const FILTERS = [
  ["all", "All"],
  ["failed", "Failures"],
  ["skipped", "Skipped (SMTP pending)"],
  ["sent", "Sent"],
];

export default function MailLogs() {
  const toast = useToast();
  const [status, setStatus] = useState("failed");
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ sent: 0, failed: 0, skipped: 0, total: 0 });
  const [busy, setBusy] = useState(false);

  function load(nextStatus = status) {
    return api.mailLogs(nextStatus)
      .then((data) => {
        setRows(data.rows || []);
        setStats(data.stats || { sent: 0, failed: 0, skipped: 0, total: 0 });
      })
      .catch((e) => toast.error(e.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function runSweep() {
    setBusy(true);
    try {
      await api.runMailSlaSweep();
      toast.success("SLA email sweep finished. Refreshing log…");
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rm-page">
      <div className="rm-page-head">
        <div>
          <h1>Email notification log</h1>
          <p>Stage, approval and SLA emails. Failures and skipped sends (SMTP not set yet) stay here for review. Existing in-app TAT alerts are unchanged.</p>
        </div>
        <button type="button" className="btn btn-default btn-sm" disabled={busy} onClick={runSweep}>
          {busy ? "Running…" : "Run SLA sweep now"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span className="badge" style={{ background: "#ecfdf5", color: "#047857" }}>Sent {stats.sent}</span>
        <span className="badge" style={{ background: "#fef2f2", color: "#b91c1c" }}>Failed {stats.failed}</span>
        <span className="badge" style={{ background: "#fff7ed", color: "#c2410c" }}>Skipped {stats.skipped}</span>
        <span className="badge" style={{ background: "#eef2f7", color: "#334155" }}>Total {stats.total}</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`btn btn-sm ${status === key ? "btn-theme" : "btn-default"}`}
            onClick={() => setStatus(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rm-panel">
        <div className="table-responsive">
          <table className="table table-striped data-list-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Event</th>
                <th>Lead</th>
                <th>To</th>
                <th>Subject</th>
                <th>Attachments</th>
                <th>Error / note</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} style={{ color: "var(--color-muted)" }}>No rows for this filter.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{row.created_at}</td>
                  <td>
                    <span className={`status-pill status-pill--${row.status === "sent" ? "good" : row.status === "failed" ? "bad" : "warn"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.event_type}</td>
                  <td>{row.ref_code || "—"}</td>
                  <td style={{ maxWidth: 180, wordBreak: "break-word", fontSize: 12 }}>{row.recipients || "—"}</td>
                  <td style={{ maxWidth: 240, fontSize: 12 }}>{row.subject}</td>
                  <td style={{ fontSize: 12 }}>{row.attachment_names || "—"}</td>
                  <td style={{ maxWidth: 260, fontSize: 12, color: row.status === "failed" ? "#b91c1c" : "var(--color-muted)" }}>
                    {row.error_message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
