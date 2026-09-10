import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../api/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { Box, Field } from "../components/ui.jsx";
import StageWorkspace from "../components/StageWorkspace.jsx";
import WorkflowProgress from "../components/WorkflowProgress.jsx";
import { leadMeta } from "../lib/status.js";
import { GATES } from "../lib/gates.js";

export default function LeadView() {
  const { id } = useParams();
  const { role, isAdmin } = useAuth();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropReason, setDropReason] = useState("");
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [moveGate, setMoveGate] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(() => {
    api.lead(id).then(setLead).catch((e) => toast.error(e.message));
    api.history(id).then(setHistory).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function onChange(updated) {
    setLead(updated);
    api.history(id).then(setHistory).catch(() => undefined);
  }

  if (!lead) return <div className="rm-page"><p className="text-muted">Loading…</p></div>;

  const meta = leadMeta(lead.status);
  const canDrop = (role === "business_development" || isAdmin) && lead.status === "active";
  const canEdit = role === "business_development" || isAdmin;

  async function drop() {
    if (!dropReason.trim()) { toast.error("A reason is required."); return; }
    try {
      const updated = await api.dropLead(lead.id, dropReason.trim());
      toast.success("Lead dropped");
      setDropOpen(false); setDropReason("");
      onChange(updated);
    } catch (err) { toast.error(err.message); }
  }

  async function toggleHold() {
    try {
      if (lead.status === "on_hold") {
        const updated = await api.resumeLead(lead.id);
        toast.success("Lead resumed");
        onChange(updated);
      } else {
        if (!holdReason.trim()) { toast.error("A reason is required to place a hold."); return; }
        const updated = await api.holdLead(lead.id, holdReason.trim());
        toast.success("Lead placed on hold");
        setHoldOpen(false); setHoldReason("");
        onChange(updated);
      }
    } catch (err) { toast.error(err.message); }
  }

  async function move() {
    if (!moveGate) return;
    try {
      const updated = await api.moveLead(lead.id, moveGate);
      toast.success("Lead moved");
      onChange(updated);
    } catch (err) { toast.error(err.message); }
  }

  function startEdit() {
    setEditForm({ product: lead.product, strength: lead.strength || "", dosageForm: lead.dosage_form || "", clientName: lead.client_name, clientCountry: lead.client_country || "", priority: lead.priority });
    setEditOpen(true);
  }
  async function saveEdit(e) {
    e.preventDefault();
    try {
      const updated = await api.patchLead(lead.id, editForm);
      toast.success("Lead details updated");
      setEditOpen(false);
      onChange(updated);
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className="rm-page">
      <Box>
        <div className="pc-hero">
          <div style={{ flex: 1, minWidth: 260 }}>
            <span className="mono text-muted" style={{ fontSize: 12 }}>{lead.ref_code}</span>
            {editOpen ? (
              <form onSubmit={saveEdit} className="rm-form-grid rm-form-grid--2" style={{ marginTop: 10 }}>
                <Field label="Product"><input className="form-control" value={editForm.product} onChange={(e) => setEditForm({ ...editForm, product: e.target.value })} /></Field>
                <Field label="Strength"><input className="form-control" value={editForm.strength} onChange={(e) => setEditForm({ ...editForm, strength: e.target.value })} /></Field>
                <Field label="Client"><input className="form-control" value={editForm.clientName} onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })} /></Field>
                <Field label="Country"><input className="form-control" value={editForm.clientCountry} onChange={(e) => setEditForm({ ...editForm, clientCountry: e.target.value })} /></Field>
                <div className="rm-field--full" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-default btn-sm" onClick={() => setEditOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-theme btn-sm">Save</button>
                </div>
              </form>
            ) : (
              <>
                <h1 style={{ fontSize: 22, margin: "4px 0 4px", fontFamily: "var(--font-display)", fontWeight: 800 }}>{lead.product}{lead.strength ? ` · ${lead.strength}` : ""}</h1>
                <p className="text-muted" style={{ margin: 0 }}>{lead.client_name} · {lead.client_country || "—"} · {lead.dosage_form || "—"} · Priority: {lead.priority}
                  {lead.potent_molecule ? <span className="label label-warning" style={{ marginLeft: 8 }}>Potent molecule</span> : null}
                </p>
              </>
            )}
          </div>
          <div className="pc-hero__aside">
            <span className={`label label-${meta.labelTone}`} style={{ fontSize: 12, padding: "5px 12px" }}>{meta.label}</span>
            {canEdit && !editOpen ? <button type="button" className="btn btn-default btn-sm" onClick={startEdit}>Edit details</button> : null}
            {canDrop ? <button type="button" className="btn btn-danger btn-sm" onClick={() => setDropOpen((v) => !v)}>Drop lead</button> : null}
            {isAdmin ? <button type="button" className="btn btn-warning btn-sm" onClick={() => (lead.status === "on_hold" ? toggleHold() : setHoldOpen((v) => !v))}>{lead.status === "on_hold" ? "Resume" : "Put on hold"}</button> : null}
          </div>
        </div>

        {lead.status === "on_hold" ? (
          <div className="rm-summary-row" style={{ background: "#fff7ed", border: "1px solid #ea580c", borderRadius: 12, padding: "12px 14px", marginTop: 14 }}><div><b style={{ display: "block" }}>On hold</b><span>{lead.hold_reason}</span></div></div>
        ) : lead.status === "dropped" ? (
          <div className="rm-summary-row" style={{ background: "#fee2e2", border: "1px solid #dc2626", borderRadius: 12, padding: "12px 14px", marginTop: 14 }}><div><b style={{ display: "block" }}>Dropped</b><span>{lead.drop_reason}</span></div></div>
        ) : lead.status === "completed" ? (
          <div className="rm-summary-row" style={{ background: "#ecfdf5", border: "1px solid #059669", borderRadius: 12, padding: "12px 14px", marginTop: 14 }}><div><b style={{ display: "block" }}>All 3 gates complete</b><span>Agreement executed — ready for Technology Transfer / NPI execution handoff.</span></div></div>
        ) : null}

        {dropOpen ? (
          <div className="action-block action-block--warn" style={{ marginTop: 14 }}>
            <div className="rm-field"><label>Reason (required)</label><textarea className="form-control" value={dropReason} onChange={(e) => setDropReason(e.target.value)} /></div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-default btn-sm" onClick={() => setDropOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={drop}>Confirm drop</button>
            </div>
          </div>
        ) : null}
        {holdOpen ? (
          <div className="action-block" style={{ marginTop: 14 }}>
            <div className="rm-field"><label>Reason for hold</label><textarea className="form-control" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} /></div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-default btn-sm" onClick={() => setHoldOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-warning btn-sm" onClick={toggleHold}>Confirm hold</button>
            </div>
          </div>
        ) : null}

        <WorkflowProgress lead={lead} />
      </Box>

      {isAdmin ? (
        <Box title="Senior Management controls">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
            <Field label="Move lead to gate">
              <div style={{ display: "flex", gap: 8 }}>
                <select className="form-control" value={moveGate} onChange={(e) => setMoveGate(e.target.value)}>
                  <option value="">Choose…</option>
                  {GATES.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
                </select>
                <button type="button" className="btn btn-default" onClick={move} disabled={!moveGate}>Move</button>
              </div>
            </Field>
            <p className="text-muted" style={{ margin: 0, fontSize: 12.5, maxWidth: 420 }}>Moving the pointer does not auto-complete skipped items — use it to correct the lead&apos;s position. For a governed revision with a reason on record, use &quot;Reject stage&quot; within a gate below instead.</p>
          </div>
        </Box>
      ) : null}

      <div className="gate-list">
        <StageWorkspace lead={lead} onChange={onChange} />
      </div>

      {role !== "client" ? (
        <Box
          title="Full audit history"
          tools={<button type="button" className="btn btn-default btn-sm" onClick={() => setShowHistory((v) => !v)}>{showHistory ? "Hide" : `Show ${history.length}`}</button>}
        >
          {showHistory ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {history.map((h) => (
                <li key={h.id} style={{ padding: "9px 0", borderBottom: "1px dashed #e2e8f0", fontSize: 13.5 }}>
                  <b>{h.actor_name}</b> — {h.action}: {h.detail}
                  <span className="text-muted" style={{ display: "block", fontSize: 11.5, marginTop: 2 }}>{h.created_at}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted" style={{ margin: 0 }}>{history.length} recorded events — every submission, approval, rejection and status change.</p>}
        </Box>
      ) : null}
    </div>
  );
}
