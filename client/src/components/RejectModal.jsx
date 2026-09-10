import { useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "./Toast.jsx";
import { Modal, Field } from "./ui.jsx";
import { revisableGates } from "../lib/gates.js";

/**
 * Reject / revise a lead: Senior Management picks which stage the lead
 * should go back to (the current stage or any earlier one), not a specific
 * item — this is a stage-level governance action, not a per-field correction.
 */
export default function RejectModal({ leadId, currentGate, currentGateName, onClose, onDone }) {
  const toast = useToast();
  const gates = revisableGates(currentGate);
  const [targetGate, setTargetGate] = useState(currentGate);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) { toast.error("A reason is required."); return; }
    setBusy(true);
    try {
      const updated = await api.rejectLead(leadId, targetGate, reason.trim());
      toast.success("Lead sent back for revision");
      onDone(updated);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Reject — which stage should this revise?" onClose={onClose}>
      <p className="text-muted" style={{ marginTop: 0 }}>
        Currently at <strong>{currentGateName}</strong>. Choose how far back this should go — every approved item in the
        revised range is reopened for resubmission, and nothing already on file is lost.
      </p>
      <form onSubmit={submit} className="rm-form-grid rm-form-grid--1">
        <Field label="Revise back to" required>
          <select className="form-control" value={targetGate} onChange={(e) => setTargetGate(e.target.value)}>
            {gates.map((g) => (
              <option key={g.key} value={g.key}>{g.name}{g.key === currentGate ? " (current stage)" : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Reason" required>
          <textarea className="form-control" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to be revised, and why…" />
        </Field>
        <div className="form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button type="button" className="btn btn-default" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={busy}>{busy ? "Rejecting…" : "Confirm reject"}</button>
        </div>
      </form>
    </Modal>
  );
}
