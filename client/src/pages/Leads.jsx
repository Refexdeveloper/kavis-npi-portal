import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import { Box, EmptyState } from "../components/ui.jsx";
import { leadMeta } from "../lib/status.js";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "gate", label: "Awaiting gate approval" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
  { key: "dropped", label: "Dropped" },
];

export default function Leads() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState(params.get("status") || "all");
  const gateFilter = params.get("gate");

  useEffect(() => {
    api.leads().then((r) => setRows(r.rows)).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (gateFilter) list = list.filter((r) => r.currentGate === gateFilter && r.status === "active");
    else if (filter === "gate") list = list.filter((r) => r.gateAwaitingApproval);
    else if (filter !== "all") list = list.filter((r) => r.status === filter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((r) => `${r.refCode} ${r.product} ${r.clientName} ${r.clientCountry}`.toLowerCase().includes(needle));
    }
    return list;
  }, [rows, filter, q, gateFilter]);

  return (
    <div className="rm-page">
      <div className="rm-page-head">
        <div>
          <h1>Pipeline</h1>
          <p>Every lead, its current gate, and overall progress — visible across all functions.</p>
        </div>
        <div className="rm-page-actions">
          <Link to="/leads/new" className="btn btn-theme"><i className="fas fa-plus" /> New lead</Link>
        </div>
      </div>

      <Box>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <div className="header-search" style={{ position: "static", flex: 1, minWidth: 220 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ref, product, client, country…" />
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`btn btn-sm ${filter === f.key && !gateFilter ? "btn-theme" : "btn-default"}`}
                onClick={() => { setFilter(f.key); navigate("/leads", { replace: true }); }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="fa-inbox" title="No leads match this filter" />
        ) : (
          <div className="table-responsive">
            <table className="table table-striped table-hover data-list-table">
              <thead>
                <tr>
                  <th>Ref</th><th>Product</th><th>Client</th><th>Country</th><th>Priority</th>
                  <th>Current stage</th><th>Progress</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const meta = leadMeta(r.status);
                  return (
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/leads/${r.id}`)}>
                      <td className="mono">{r.refCode}</td>
                      <td><strong>{r.product}</strong>{r.strength ? <div className="text-muted" style={{ fontSize: 12 }}>{r.strength}</div> : null}</td>
                      <td>{r.clientName}</td>
                      <td>{r.clientCountry || "—"}</td>
                      <td>{r.priority}</td>
                      <td>{r.currentGateName}</td>
                      <td>
                        <div className="dash-status-track" style={{ width: 90 }}><div className="dash-status-fill" style={{ width: `${r.progressPercent}%` }} /></div>
                        <span className="text-muted" style={{ fontSize: 11.5 }}>{r.approvedItems}/{r.totalItems} · {r.progressPercent}%</span>
                      </td>
                      <td>
                        <span className={`label label-${meta.labelTone}`}>{meta.label}</span>
                        {r.gateAwaitingApproval ? <span className="label label-warning" style={{ marginLeft: 6 }}>Gate ready</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </div>
  );
}
