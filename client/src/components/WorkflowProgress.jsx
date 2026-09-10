/**
 * Compact workflow indicator — stages only + focused current/next step.
 * Does not dump every department step (multi-layer detail lives in StageWorkspace).
 */
export default function WorkflowProgress({ lead }) {
  if (!lead?.gates?.length) return null;

  const wf = lead.workflow || {};
  const currentGate = lead.gates.find((g) => g.isCurrent) || lead.gates[0];
  const strip = (currentGate?.stepStrip || []).filter((s) => s.state === "completed" || s.state === "current" || s.state === "next");
  const lockedCount = (currentGate?.stepStrip || []).filter((s) => s.state === "locked").length;

  return (
    <div className="wf-progress">
      <div className="wf-progress__head">
        <div>
          <p className="wf-progress__eyebrow">Multi-department progress</p>
          <h3>
            {lead.status === "completed"
              ? "All stages complete"
              : `${(wf.currentGateName || currentGate?.name || "").replace(/^Stage \d — /, "")} · Active step ${wf.currentStep || currentGate?.currentStep || 1}`}
          </h3>
          <p className="wf-progress__hint">
            {lead.status === "completed"
              ? "Agreement executed — ready for Technology Transfer handoff."
              : "Only the active layer and next handoff are shown below. Full upcoming checklist stays hidden by department."}
          </p>
        </div>
        <div className="wf-progress__pct">
          <b>{lead.progress?.percent ?? 0}%</b>
          <span>{lead.progress?.approvedItems ?? 0}/{lead.progress?.totalItems ?? 0} items</span>
        </div>
      </div>

      <div className="sf-tracker wf-progress__gates">
        <div className="sf-tracker__scroller">
          <ol className="sf-tracker__row">
            {lead.gates.map((g, idx) => {
              const isLast = idx === lead.gates.length - 1;
              const done = g.isComplete || lead.status === "completed";
              const isCurrent = g.isCurrent && lead.status !== "completed";
              return (
                <li key={g.key} className={`sf-tracker__step is-${done ? "completed" : isCurrent ? "current" : "pending"}`}>
                  <div className="sf-tracker__line">
                    <span className={`sf-tracker__rail ${idx === 0 ? "is-hidden" : done || isCurrent ? "is-on" : ""}`} />
                    <span className="sf-tracker__dot">{done ? <i className="fas fa-check" /> : isCurrent ? <span /> : idx + 1}</span>
                    <span className={`sf-tracker__rail ${isLast ? "is-hidden" : done ? "is-on" : ""}`} />
                  </div>
                  <div className="sf-tracker__label">{g.name.replace(/^Stage \d — /, "")}</div>
                  <div className="sf-tracker__state">{done ? "Completed" : isCurrent ? "Active layer" : "Locked"}</div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {strip.length > 0 && lead.status !== "completed" && currentGate && !currentGate.isLocked ? (
        <div className="wf-steps wf-steps--focus">
          <div className="wf-steps__label">Focus layer (not the full stage checklist)</div>
          <ol className="wf-steps__row">
            {strip.map((s) => (
              <li key={s.step} className={`wf-steps__item is-${s.state}`} title={(s.labels || []).join(", ")}>
                <span className="wf-steps__num">{s.state === "completed" ? <i className="fas fa-check" /> : s.step}</span>
                <span className="wf-steps__meta">
                  <b>Step {s.step}</b>
                  <span>
                    {s.state === "completed" && "Done"}
                    {s.state === "current" && "Current department work"}
                    {s.state === "next" && "Next handoff"}
                    {s.roles?.length ? ` · ${s.roles.slice(0, 2).join(", ")}` : ""}
                  </span>
                </span>
              </li>
            ))}
            {lockedCount > 0 ? (
              <li className="wf-steps__item is-locked" title="Future department steps stay hidden">
                <span className="wf-steps__num">…</span>
                <span className="wf-steps__meta">
                  <b>+{lockedCount} later</b>
                  <span>Hidden until prior layers finish</span>
                </span>
              </li>
            ) : null}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
