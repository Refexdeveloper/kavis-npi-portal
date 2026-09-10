import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import FunnelBars, { FUNNEL_COLORS } from "../components/FunnelBars.jsx";
import { Box } from "../components/ui.jsx";
import { GATES } from "../lib/gates.js";

export default function Funnel() {
  const toast = useToast();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    api.kpis().then(setKpis).catch((e) => toast.error(e.message));
    api.leads().then((r) => setLeads(r.rows)).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!kpis) return <p className="text-muted">Loading funnel…</p>;

  function goToStage(gateKey) {
    navigate(`/leads?gate=${gateKey}`);
  }

  return (
    <div className="rm-page">
      <Box title="Stage-wise sales funnel" tools={<span className="text-muted">Click a stage to see its leads</span>}>
        <FunnelBars
          onSelect={(item) => goToStage(item.id)}
          items={[
            ...GATES.map((g) => ({
              id: g.key,
              title: `${g.order}. ${g.name.replace(/^Stage \d — /, "")}`,
              subtitle: `Active leads currently at this gate`,
              value: `${kpis.byGate[g.key]} lead${kpis.byGate[g.key] === 1 ? "" : "s"}`,
              color: FUNNEL_COLORS[g.key],
            })),
            { id: "completed", title: "4. Completed", subtitle: "All 3 gates approved", value: `${kpis.completed} lead${kpis.completed === 1 ? "" : "s"}`, color: FUNNEL_COLORS.completed },
          ]}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <div className="col-sm-6">
            <FunnelBars
              onSelect={() => navigate("/leads?status=on_hold")}
              items={[{ id: "on_hold", title: "On hold", subtitle: "Paused by Senior Management", value: `${kpis.onHold} lead${kpis.onHold === 1 ? "" : "s"}`, color: FUNNEL_COLORS.onHold }]}
            />
          </div>
          <div className="col-sm-6">
            <FunnelBars
              onSelect={() => navigate("/leads?status=dropped")}
              items={[{ id: "dropped", title: "Dropped", subtitle: "Discontinued", value: `${kpis.dropped} lead${kpis.dropped === 1 ? "" : "s"}`, color: FUNNEL_COLORS.dropped }]}
            />
          </div>
        </div>
      </Box>

      <Box title="Stage-wise lead count">
        <div className="rm-chart-box" style={{ display: "flex", alignItems: "flex-end", gap: 24, padding: "10px 20px 0", height: 220 }}>
          {[...GATES.map((g) => ({ label: g.name.replace(/^Stage \d — /, ""), value: kpis.byGate[g.key], color: FUNNEL_COLORS[g.key] })), { label: "Completed", value: kpis.completed, color: FUNNEL_COLORS.completed }].map((bar) => {
            const max = Math.max(1, kpis.total);
            const h = Math.max(6, Math.round((bar.value / max) * 170));
            return (
              <div key={bar.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{bar.value}</div>
                <div style={{ width: "100%", maxWidth: 64, height: h, background: bar.color, borderRadius: "8px 8px 0 0" }} />
                <div style={{ fontSize: 11.5, color: "#64748b", textAlign: "center", fontWeight: 650 }}>{bar.label}</div>
              </div>
            );
          })}
        </div>
      </Box>

      <Box title="All leads" tools={<span className="text-muted">{leads.length} total</span>}>
        <div className="table-responsive">
          <table className="table table-striped table-hover data-list-table">
            <thead>
              <tr><th>Ref</th><th>Product</th><th>Client</th><th>Stage</th><th>Progress</th><th>Status</th></tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/leads/${l.id}`)}>
                  <td className="mono">{l.refCode}</td>
                  <td><strong>{l.product}</strong></td>
                  <td>{l.clientName}</td>
                  <td>{l.currentGateName}</td>
                  <td>{l.approvedItems}/{l.totalItems} · {l.progressPercent}%</td>
                  <td><span className={`label label-${l.status === "active" ? "success" : l.status === "on_hold" ? "warning" : l.status === "dropped" ? "danger" : "success"}`}>{l.status.replace("_", " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>
    </div>
  );
}
