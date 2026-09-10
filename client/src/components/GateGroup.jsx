import { useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../api/AuthContext.jsx";
import { useToast } from "./Toast.jsx";
import ItemRow from "./ItemRow.jsx";
import RejectModal from "./RejectModal.jsx";
import { GATE_COLORS } from "../lib/status.js";

function stepGroups(items) {
  const bySteps = new Map();
  for (const item of items) {
    if (!bySteps.has(item.step)) bySteps.set(item.step, []);
    bySteps.get(item.step).push(item);
  }
  return [...bySteps.entries()].sort((a, b) => a[0] - b[0]).map(([step, items]) => ({ step, items }));
}

export default function GateGroup({ lead, gate, defaultOpen, onChange }) {
  const { role, isAdmin } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);

  const pct = gate.itemCount ? Math.round((gate.approvedCount / gate.itemCount) * 100) : 0;
  const canGateApprove = isAdmin && gate.isCurrent && gate.allMandatoryApproved && lead.status === "active";
  const canReject = isAdmin && lead.status === "active" && (gate.isCurrent || gate.isComplete);

  let stateLabel = "Pending";
  let stateTone = "default";
  if (gate.isComplete) { stateLabel = "Complete"; stateTone = "success"; }
  else if (gate.isCurrent) { stateLabel = gate.allMandatoryApproved ? "Ready to close" : "In progress"; stateTone = gate.allMandatoryApproved ? "warning" : "info"; }
  else if (gate.isLocked) { stateLabel = "Locked"; stateTone = "default"; }

  async function approveGate() {
    setBusy(true);
    try {
      const updated = await api.approveGate(lead.id, gate.key, comments || undefined);
      toast.success(`${gate.name} approved`);
      setApproveOpen(false);
      setComments("");
      onChange(updated);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`gate-group${open ? " is-open" : ""}${gate.isLocked ? " is-locked" : ""}`}>
      <button type="button" className="gate-group__head" onClick={() => setOpen((v) => !v)}>
        <span className="gate-group__dot" style={{ background: GATE_COLORS[gate.key] }} />
        <span className="gate-group__info">
          <b>{gate.name} <span className={`label label-${stateTone}`}>{stateLabel}</span></b>
          <span>{gate.crossFunctionLabels?.length ? `Cross-functions: ${gate.crossFunctionLabels.join(", ")}` : (gate.isLocked ? "Locked until prior gate closes" : "Stage checklist")}</span>
        </span>
        <span className="gate-group__bar"><i style={{ width: `${pct}%`, background: GATE_COLORS[gate.key] }} /></span>
        <span className="gate-group__count mono">{gate.approvedCount}/{gate.itemCount}</span>
        <i className="fas fa-chevron-right gate-group__chev" />
      </button>

      {open ? (
        <div className="gate-group__body">
          <p className="gate-group__meta"><b>Trigger:</b> {gate.trigger || "—"}</p>
          {gate.exitCriteria ? <p className="gate-group__meta"><b>Exit criteria:</b> {gate.exitCriteria}</p> : null}
          {gate.crossFunctionLabels?.length ? (
            <p className="gate-group__meta"><b>Cross-functions:</b> {gate.crossFunctionLabels.join(", ")}</p>
          ) : null}

          {gate.items.length === 0 ? (
            <p className="text-muted" style={{ fontStyle: "italic" }}>
              {role === "client"
                ? "This stage is being progressed internally by the Kavis Pharma team — nothing needs your input right now."
                : gate.isLocked
                  ? "Stage locked — complete the prior gate first. Future workflow detail is hidden until this stage opens for your team."
                  : "No items visible for your role at this stage yet."}
            </p>
          ) : (
            stepGroups(gate.items).map(({ step, items }) => {
              const isCurrent = step === gate.currentStep && !gate.isComplete;
              const isNext = step === gate.currentStep + 1 && !gate.isComplete;
              return (
                <div key={step} className={`step-group${isCurrent ? " is-current" : ""}${isNext ? " is-next" : ""}`}>
                  <div className="step-group__head">
                    <span>Step {step} of {gate.totalSteps}</span>
                    {items.length > 1 ? <span className="label label-info">{items.length} items open together, one per department</span> : null}
                    {isCurrent ? <span className="label label-warning">Current</span> : null}
                    {isNext ? <span className="label label-default">Next step</span> : null}
                  </div>
                  <div className="item-list">
                    {items.map((item) => (
                      <ItemRow key={`${gate.key}-${item.key}-${item.status}-${item.approvedAt || item.submittedAt || item.visibility || ""}`} lead={lead} gate={gate} item={item} onChange={onChange} />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {gate.outputs?.length && (gate.isComplete || isAdmin || gate.isCurrent) ? (
            <div className="gate-outputs">
              <h4>Gate output (auto-summarised once approved)</h4>
              <ul>{gate.outputs.map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
          ) : null}

          {gate.gateApproval ? (
            <div className="approval-box">
              <div className="approval-box__label">Gate approved</div>
              <div>{gate.gateApproval.approved_by_name} · {gate.gateApproval.approved_at}{gate.gateApproval.comments ? ` — ${gate.gateApproval.comments}` : ""}</div>
            </div>
          ) : null}

          {(canGateApprove || canReject) ? (
            approveOpen ? (
              <div className="action-block action-block--approve">
                <div className="rm-field">
                  <label>Gate approval comments</label>
                  <textarea className="form-control" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Confirm feasibility / costing / data package is complete…" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-default btn-sm" onClick={() => setApproveOpen(false)}>Cancel</button>
                  <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={approveGate}>{busy ? "Approving…" : `Approve ${gate.name.split(" — ")[0]}`}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {canGateApprove ? (
                  <button type="button" className="btn btn-theme" onClick={() => setApproveOpen(true)}>
                    <i className="fas fa-stamp" /> All mandatory items approved — close this gate
                  </button>
                ) : null}
                {canReject ? (
                  <button type="button" className="btn btn-danger" onClick={() => setRejectOpen(true)}>
                    <i className="fas fa-rotate-left" /> Reject stage
                  </button>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {rejectOpen ? (
        <RejectModal
          leadId={lead.id}
          currentGate={gate.key}
          currentGateName={gate.name}
          onClose={() => setRejectOpen(false)}
          onDone={onChange}
        />
      ) : null}
    </div>
  );
}
