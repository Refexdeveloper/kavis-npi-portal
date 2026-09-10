import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../api/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { Box, Kpi, Modal, EmptyState } from "../components/ui.jsx";
import LeadForm from "../components/LeadForm.jsx";
import RejectModal from "../components/RejectModal.jsx";
import FunnelBars, { FUNNEL_COLORS } from "../components/FunnelBars.jsx";
import { GATES, gateName } from "../lib/gates.js";

export default function Dashboard() {
  const { displayName, roleLabel, isAdmin, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [pending, setPending] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const canCreate = isAdmin || role === "business_development";

  function reload() {
    api.kpis().then(setKpis).catch((e) => toast.error(e.message));
    api.pending().then(setPending).catch((e) => toast.error(e.message));
  }
  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createLead(form) {
    setCreateBusy(true);
    try {
      const lead = await api.createLead(form);
      toast.success(`${lead.ref_code} created — Stage 1 RFI is now open.`);
      setCreateOpen(false);
      navigate(`/leads/${lead.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="rm-page">
      <div className="rm-page-head">
        <div>
          <h1>{isAdmin ? "Command Center" : `Welcome, ${displayName.split(" ")[0]}`}</h1>
          <p>{roleLabel}{isAdmin ? " — create leads, and approve or reject every stage from right here." : ""}</p>
        </div>
        {(canCreate) ? (
          <div className="rm-page-actions">
            <button type="button" className="btn btn-theme" onClick={() => setCreateOpen(true)}><i className="fas fa-plus" /> New lead</button>
          </div>
        ) : null}
      </div>

      {kpis ? (
        <div className="rm-kpi-row rm-kpi-row--6" style={{ marginBottom: 16 }}>
          <Kpi label="Total leads" value={kpis.total} tone="teal" icon="fa-diagram-project" />
          <Kpi label="Active" value={kpis.active} tone="green" icon="fa-bolt" />
          <Kpi label="Awaiting gate approval" value={kpis.gateAwaitingApproval} tone="amber" icon="fa-stamp" />
          <Kpi label="On hold" value={kpis.onHold} tone="slate" icon="fa-pause" />
          <Kpi label="Completed" value={kpis.completed} tone="green" icon="fa-check-double" />
          <Kpi label="Dropped" value={kpis.dropped} tone="rose" icon="fa-xmark" />
        </div>
      ) : null}

      {isAdmin ? (
        <AdminApprovalCenter pending={pending} onChanged={reload} />
      ) : (
        <RolePendingBox pending={pending} />
      )}

      <div className="row" style={{ marginTop: 0 }}>
        <div className="col-sm-7">
          <Box title="Governed workflow" subtitle="Kavis CDMO NPI stage-gate process">
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {GATES.map((g) => (
                <li key={g.key} style={{ padding: "10px 0", borderBottom: "1px dashed #e2e8f0" }}>
                  <b style={{ display: "block", fontSize: 13.5 }}>{g.name}</b>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>
                    {g.key === "rfi" && "Feasibility, indicative timelines & CAPEX."}
                    {g.key === "rfp" && "Costing, supply price, firm CAPEX, proposal acceptance."}
                    {g.key === "agreement" && "LOI/MSA/QTA executed + validated technical & quality data package."}
                  </span>
                </li>
              ))}
            </ol>
          </Box>
        </div>
        <div className="col-sm-5">
          <Box title="Stage-wise funnel" tools={<Link to="/funnel" className="text-muted" style={{ fontSize: 12.5 }}>Full view &rarr;</Link>}>
            {kpis ? (
              <FunnelBars
                onSelect={(item) => navigate(`/leads?gate=${item.id}`)}
                items={GATES.map((g) => ({
                  id: g.key,
                  title: g.name.replace(/^Stage \d — /, ""),
                  value: `${kpis.byGate[g.key]} lead${kpis.byGate[g.key] === 1 ? "" : "s"}`,
                  color: FUNNEL_COLORS[g.key],
                }))}
              />
            ) : null}
          </Box>
        </div>
      </div>

      {createOpen ? (
        <Modal title="New lead" onClose={() => setCreateOpen(false)} wide>
          <LeadForm onSubmit={createLead} busy={createBusy} />
        </Modal>
      ) : null}
    </div>
  );
}

function RolePendingBox({ pending }) {
  if (!pending) return null;
  return (
    <Box title="Your pending items" subtitle="Assigned to your function across all active leads">
      {!pending.itemsToAction?.length ? (
        <EmptyState icon="fa-circle-check" title="Nothing pending" hint="Everything assigned to your function is up to date." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {pending.itemsToAction.map((it) => (
            <li key={`${it.leadId}-${it.itemKey}`}>
              <Link to={`/leads/${it.leadId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 12, textDecoration: "none", color: "inherit" }}>
                <span>
                  <b style={{ display: "block", fontSize: 13.5 }}>{it.itemLabel}</b>
                  <span className="text-muted" style={{ fontSize: 12 }}>{it.refCode} · {it.product} · {it.clientName}</span>
                </span>
                <span className={`label label-${it.status === "sent_back" ? "warning" : "info"}`}>{it.status === "sent_back" ? "Sent back" : it.gateName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

function AdminApprovalCenter({ pending, onChanged }) {
  const [rejectTarget, setRejectTarget] = useState(null);
  if (!pending) return null;
  const nothing = !pending.itemsAwaitingApproval?.length && !pending.gatesAwaitingApproval?.length;

  return (
    <Box title="Approve or reject" subtitle="Every submission and gate ready to close, across the whole pipeline — act here without opening each lead">
      {nothing ? (
        <EmptyState icon="fa-circle-check" title="Nothing awaiting approval" hint="All caught up across the pipeline." />
      ) : (
        <>
          {pending.gatesAwaitingApproval?.length ? (
            <>
              <h4 className="subhead" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: "0 0 10px" }}>Gates ready to close</h4>
              {pending.gatesAwaitingApproval.map((g) => (
                <GateQueueRow key={`${g.leadId}-${g.gate}`} g={g} onChanged={onChanged} onReject={() => setRejectTarget({ leadId: g.leadId, gate: g.gate, gateName: g.gateName })} />
              ))}
            </>
          ) : null}
          {pending.itemsAwaitingApproval?.length ? (
            <>
              <h4 className="subhead" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: "16px 0 10px" }}>Items awaiting approval</h4>
              {pending.itemsAwaitingApproval.map((it) => (
                <ItemQueueRow key={`${it.leadId}-${it.itemKey}`} it={it} onChanged={onChanged} onReject={() => setRejectTarget({ leadId: it.leadId, gate: it.gate, gateName: it.gateName })} />
              ))}
            </>
          ) : null}
        </>
      )}

      {rejectTarget ? (
        <RejectModal
          leadId={rejectTarget.leadId}
          currentGate={rejectTarget.gate}
          currentGateName={rejectTarget.gateName}
          onClose={() => setRejectTarget(null)}
          onDone={onChanged}
        />
      ) : null}
    </Box>
  );
}

function ItemQueueRow({ it, onChanged, onReject }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      await api.approveItem(it.leadId, it.gate, it.itemKey, comments || "Approved from Command Center.");
      toast.success(`"${it.itemLabel}" approved`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-queue-row">
      <div className="admin-queue-row__info">
        <Link to={`/leads/${it.leadId}`}><b>{it.itemLabel}</b></Link>
        <span>{it.refCode} · {it.product} · {it.clientName} · {it.gateName}</span>
      </div>
      {open ? (
        <div style={{ flex: "1 1 100%" }}>
          <textarea className="form-control" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Approval comments…" style={{ marginBottom: 8 }} />
          <div className="admin-queue-row__actions">
            <button type="button" className="btn btn-default btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={approve}>{busy ? "Approving…" : "Confirm approve"}</button>
          </div>
        </div>
      ) : (
        <div className="admin-queue-row__actions">
          <button type="button" className="btn btn-success btn-sm" onClick={() => setOpen(true)}><i className="fas fa-check" /> Approve</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onReject}><i className="fas fa-rotate-left" /> Reject</button>
        </div>
      )}
    </div>
  );
}

function GateQueueRow({ g, onChanged, onReject }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      await api.approveGate(g.leadId, g.gate, comments || "All mandatory items verified — gate approved from Command Center.");
      toast.success(`${gateName(g.gate)} approved`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-queue-row" style={{ borderColor: "#059669" }}>
      <div className="admin-queue-row__info">
        <Link to={`/leads/${g.leadId}`}><b>{g.gateName}</b></Link>
        <span>{g.refCode} · {g.product} · {g.clientName} · all mandatory items approved</span>
      </div>
      {open ? (
        <div style={{ flex: "1 1 100%" }}>
          <textarea className="form-control" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Gate approval comments…" style={{ marginBottom: 8 }} />
          <div className="admin-queue-row__actions">
            <button type="button" className="btn btn-default btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={approve}>{busy ? "Approving…" : "Confirm gate approval"}</button>
          </div>
        </div>
      ) : (
        <div className="admin-queue-row__actions">
          <button type="button" className="btn btn-success btn-sm" onClick={() => setOpen(true)}><i className="fas fa-stamp" /> Close gate</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onReject}><i className="fas fa-rotate-left" /> Reject</button>
        </div>
      )}
    </div>
  );
}
