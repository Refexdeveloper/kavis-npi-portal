import { useMemo, useState } from "react";
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

/**
 * Multi-department stage workspace:
 * - Layer 1: compact stage rail (RFI / RFP / Agreement) — not all open
 * - Layer 2: only the active stage's current + next step shown in detail
 * - Past steps collapsed; locked future stages not expanded
 */
export default function StageWorkspace({ lead, onChange }) {
  const { role, isAdmin } = useAuth();
  const toast = useToast();
  const [layer, setLayer] = useState(() => lead.gates.find((g) => g.isCurrent)?.key || lead.gates[0]?.key);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPastSteps, setShowPastSteps] = useState(false);

  const gate = useMemo(
    () => lead.gates.find((g) => g.key === layer) || lead.gates.find((g) => g.isCurrent) || lead.gates[0],
    [lead.gates, layer],
  );

  if (!gate) return null;

  const pct = gate.itemCount ? Math.round((gate.approvedCount / gate.itemCount) * 100) : 0;
  const canGateApprove = isAdmin && gate.isCurrent && gate.allMandatoryApproved && lead.status === "active";
  const canReject = isAdmin && lead.status === "active" && (gate.isCurrent || gate.isComplete);
  const groups = stepGroups(gate.items || []);
  const currentGroups = groups.filter((g) => g.step === gate.currentStep || g.step === gate.currentStep + 1);
  const pastGroups = groups.filter((g) => g.step < gate.currentStep);

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
      const next = updated.gates?.find((g) => g.isCurrent);
      if (next) setLayer(next.key);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stage-workspace">
      <div className="stage-rail" role="tablist" aria-label="NPI stages">
        {lead.gates.map((g) => {
          const active = g.key === gate.key;
          const locked = g.isLocked && !isAdmin;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`stage-rail__tab${active ? " is-active" : ""}${g.isComplete ? " is-done" : ""}${g.isLocked ? " is-locked" : ""}${g.isCurrent ? " is-current" : ""}`}
              onClick={() => setLayer(g.key)}
              style={{ "--stage-accent": GATE_COLORS[g.key] }}
            >
              <span className="stage-rail__num">{g.isComplete ? <i className="fas fa-check" /> : g.order}</span>
              <span className="stage-rail__text">
                <b>{g.name.replace(/^Stage \d — /, "")}</b>
                <span>
                  {g.isComplete ? "Completed" : g.isCurrent ? `Step ${g.currentStep} of ${g.totalSteps}` : g.isLocked ? "Not open yet" : "Available"}
                  {locked ? " · detail limited" : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="stage-panel">
        <header className="stage-panel__head">
          <div>
            <p className="stage-panel__eyebrow">Layer · Active department work</p>
            <h3>{gate.name} <span className={`label label-${stateTone}`}>{stateLabel}</span></h3>
            <p className="stage-panel__sub">
              {gate.isLocked
                ? "This stage opens after the previous gate is closed. Multi-department checklist stays hidden until then."
                : gate.isComplete
                  ? "Stage complete — switch layers only if you need the audit record for your function."
                  : `Focus: Step ${gate.currentStep}. Other departments see only their assigned layer — not the full upcoming checklist.`}
            </p>
          </div>
          <div className="stage-panel__meter">
            <span className="mono">{gate.approvedCount}/{gate.itemCount}</span>
            <span className="stage-panel__bar"><i style={{ width: `${pct}%`, background: GATE_COLORS[gate.key] }} /></span>
          </div>
        </header>

        {!gate.isLocked && gate.trigger ? (
          <p className="gate-group__meta"><b>Trigger:</b> {gate.trigger}</p>
        ) : null}

        {gate.isLocked || gate.items.length === 0 ? (
          <div className="stage-empty">
            <i className="fas fa-layer-group" />
            <b>{gate.isLocked ? "Stage locked" : "Nothing for your department here"}</b>
            <p>
              {role === "client"
                ? "Internal Kavis teams are progressing this stage."
                : gate.isLocked
                  ? "Complete the prior stage first. Future multi-department steps are intentionally not shown."
                  : "No checklist items are visible for your role at this layer yet."}
            </p>
          </div>
        ) : (
          <>
            {pastGroups.length > 0 ? (
              <div className="stage-past">
                <button type="button" className="stage-past__toggle" onClick={() => setShowPastSteps((v) => !v)}>
                  <i className={`fas fa-chevron-${showPastSteps ? "down" : "right"}`} />
                  {pastGroups.reduce((n, g) => n + g.items.length, 0)} completed step{pastGroups.length > 1 ? "s" : ""} in this stage
                  <span>{showPastSteps ? "Hide" : "Show"}</span>
                </button>
                {showPastSteps ? pastGroups.map(({ step, items }) => (
                  <div key={step} className="step-group step-group--past">
                    <div className="step-group__head"><span>Step {step} · done</span></div>
                    <div className="item-list">
                      {items.map((item) => (
                        <ItemRow key={`${gate.key}-${item.key}-past`} lead={lead} gate={gate} item={item} onChange={onChange} />
                      ))}
                    </div>
                  </div>
                )) : null}
              </div>
            ) : null}

            {currentGroups.map(({ step, items }) => {
              const isCurrent = step === gate.currentStep && !gate.isComplete;
              const isNext = step === gate.currentStep + 1 && !gate.isComplete;
              return (
                <div key={step} className={`step-group${isCurrent ? " is-current" : ""}${isNext ? " is-next" : ""}`}>
                  <div className="step-group__head">
                    <span>{isCurrent ? "Your active layer" : "Next layer"} · Step {step} of {gate.totalSteps}</span>
                    {items.length > 1 ? <span className="label label-info">{items.length} departments in parallel</span> : null}
                    {isCurrent ? <span className="label label-warning">Current</span> : null}
                    {isNext ? <span className="label label-default">Next</span> : null}
                  </div>
                  <div className="item-list">
                    {items.map((item) => (
                      <ItemRow key={`${gate.key}-${item.key}-${item.status}-${item.visibility || ""}`} lead={lead} gate={gate} item={item} onChange={onChange} />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {gate.outputs?.length && (gate.isComplete || (isAdmin && gate.isCurrent)) ? (
          <div className="gate-outputs">
            <h4>Gate output</h4>
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
                <textarea className="form-control" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Confirm stage exit criteria…" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-default btn-sm" onClick={() => setApproveOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={approveGate}>{busy ? "Approving…" : `Close ${gate.name.split(" — ")[0]}`}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {canGateApprove ? (
                <button type="button" className="btn btn-theme" onClick={() => setApproveOpen(true)}>
                  <i className="fas fa-stamp" /> Close this stage
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
