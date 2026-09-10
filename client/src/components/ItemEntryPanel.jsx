import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, downloadDocument } from "../api/client.js";
import { useAuth } from "../api/AuthContext.jsx";
import { useToast } from "./Toast.jsx";
import RejectModal from "./RejectModal.jsx";
import { itemMeta, dueMeta } from "../lib/status.js";

/**
 * Premium dedicated form surface for checklist updates.
 * Opens as a slide-over — never inline inside the stage list.
 */
export default function ItemEntryPanel({ lead, gate, item, onClose, onChange }) {
  const { displayName, isAdmin } = useAuth();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [remarks, setRemarks] = useState(item.remarks || "");
  const [comments, setComments] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const meta = itemMeta(item.status);
  const due = dueMeta(item);
  const detailLocked = !!item.detailLocked || item.visibility === "summary" || item.visibility === "hidden";
  const isNextPreview = item.step === gate.currentStep + 1 && !gate.isComplete;
  const docRequired = !!item.docRequired || !!item.docRequiredActual;
  const canSubmit = !detailLocked && gate.isCurrent && lead.status === "active" && item.step === gate.currentStep
    && (item.status === "pending" || item.status === "sent_back") && (item.canSubmit !== false);
  const canApprove = isAdmin && !detailLocked && item.status === "submitted" && gate.isCurrent && item.step === gate.currentStep;
  const canReject = isAdmin && !detailLocked && (item.status === "submitted" || item.status === "approved");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !rejectOpen) onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, rejectOpen]);

  function pickFile(f) {
    if (f) setFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (docRequired && !file) { toast.error("Attach a document — this item requires one."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("remarks", remarks);
      form.append("docRequired", String(docRequired));
      if (file) form.append("file", file);
      const updated = await api.submitItem(lead.id, gate.key, item.key, form);
      toast.success(`"${item.label}" submitted`);
      onChange(updated);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      const updated = await api.approveItem(lead.id, gate.key, item.key, comments || "Approved.");
      toast.success(`"${item.label}" approved`);
      onChange(updated);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const mode = canSubmit ? "Update entry" : canApprove ? "Review & approve" : detailLocked ? "Restricted view" : "Record detail";

  return createPortal(
    <div className="entry-overlay" onClick={onClose}>
      <aside className="entry-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={item.label}>
        <header className="entry-panel__head">
          <div>
            <p className="entry-panel__eyebrow">{gate.name.replace(/^Stage \d — /, "")} · Step {item.step}</p>
            <h2>{item.label}</h2>
            <div className="entry-panel__tags">
              <span className={`label label-${meta.labelTone}`}>{meta.label}</span>
              <span className="label label-default">{item.roleLabel}</span>
              {item.tatDays ? <span className="label label-info">TAT {item.tatDays}d</span> : null}
              {due ? <span className={`label label-${due.labelTone}`}>{due.text}</span> : null}
            </div>
          </div>
          <button type="button" className="entry-panel__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="entry-panel__body">
          <div className="entry-panel__mode">{mode}</div>

          {detailLocked ? (
            <div className="access-banner access-banner--xl">
              <i className="fas fa-shield-halved" />
              <div>
                <b>{isNextPreview ? "Next department step" : "Assigned team only"}</b>
                <p>
                  {isNextPreview
                    ? "This opens after the current step is approved. Your department will get a full entry form when it becomes active."
                    : "Documents and remarks stay with the owning function, its Team Head, and Senior Management."}
                </p>
                <p className="entry-owner">Owner: <b>{item.roleLabel}</b>
                  {item.supportRoleLabels?.length ? <> · Support: {item.supportRoleLabels.join(", ")}</> : null}
                </p>
              </div>
            </div>
          ) : (
            <>
              {item.note ? <p className="item-note"><i className="fas fa-circle-info" /> {item.note}</p> : null}
              {item.outputCaptured ? (
                <div className="entry-card">
                  <span className="entry-card__label">Output captured by tool</span>
                  <p>{item.outputCaptured}</p>
                </div>
              ) : null}

              {(item.submittedBy || item.approvedBy) && item.status !== "pending" ? (
                <div className="entry-card">
                  <span className="entry-card__label">Submission trail</span>
                  {item.submittedBy ? <div className="ro-row"><span>Submitted by</span><span>{item.submittedBy} · {item.submittedAt}</span></div> : null}
                  {item.remarks ? <div className="ro-row"><span>Remarks</span><span>{item.remarks}</span></div> : null}
                  {item.approvedBy ? <div className="ro-row"><span>Approved by</span><span>{item.approvedBy} · {item.approvedAt}</span></div> : null}
                  {item.approvalComments ? <div className="ro-row"><span>Approval comments</span><span>{item.approvalComments}</span></div> : null}
                </div>
              ) : null}

              {item.documents?.length ? (
                <div className="entry-card">
                  <span className="entry-card__label">Attached documents</span>
                  <div className="doc-list">
                    {item.documents.map((d) => (
                      <button key={d.id} type="button" className="doc-chip" onClick={() => downloadDocument(d.id, d.originalFilename)}>
                        <i className="fas fa-file-arrow-down" /> {d.originalFilename} <span>v{d.version}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {canSubmit ? (
                <form className="entry-form" onSubmit={submit}>
                  <div className="entry-card entry-card--form">
                    <span className="entry-card__label">Department entry form</span>
                    <div className="rm-field">
                      <label>Remarks / notes{!docRequired ? " (recommended)" : ""}</label>
                      <textarea
                        className="form-control entry-textarea"
                        rows={5}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder={`Capture findings from ${displayName}…`}
                      />
                    </div>
                    <div className="rm-field">
                      <label>Document upload{docRequired ? " · required" : " · optional"}</label>
                      <div
                        className={`entry-drop${dragOver ? " is-over" : ""}${file ? " has-file" : ""}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                      >
                        {file ? (
                          <div className="entry-drop__file">
                            <i className="fas fa-file-circle-check" />
                            <div>
                              <b>{file.name}</b>
                              <span>{Math.round(file.size / 1024)} KB</span>
                            </div>
                            <button type="button" className="btn btn-default btn-xs" onClick={() => setFile(null)}>Remove</button>
                          </div>
                        ) : (
                          <>
                            <i className="fas fa-cloud-arrow-up" />
                            <b>Drop file here or browse</b>
                            <span>PDF, Word, Excel, images · max 25 MB</span>
                            <label className="btn btn-default btn-sm entry-browse">
                              Choose file
                              <input type="file" hidden onChange={(e) => pickFile(e.target.files?.[0] || null)} />
                            </label>
                          </>
                        )}
                      </div>
                      {docRequired ? <span className="field-hint">BRD marks this checklist item as document-mandatory.</span> : null}
                    </div>
                  </div>
                  <div className="entry-panel__actions">
                    <button type="button" className="btn btn-default" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-theme" disabled={busy}>{busy ? "Submitting…" : "Submit entry"}</button>
                  </div>
                </form>
              ) : null}

              {canApprove ? (
                <div className="entry-card entry-card--approve">
                  <span className="entry-card__label">Senior Management decision</span>
                  <div className="rm-field">
                    <label>Approval comments</label>
                    <textarea className="form-control entry-textarea" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Basis for approval…" />
                  </div>
                  <div className="entry-panel__actions">
                    <button type="button" className="btn btn-danger" onClick={() => setRejectOpen(true)}>Reject stage</button>
                    <button type="button" className="btn btn-success" disabled={busy} onClick={approve}>{busy ? "Approving…" : "Approve item"}</button>
                  </div>
                </div>
              ) : canReject ? (
                <div className="entry-panel__actions">
                  <button type="button" className="btn btn-danger" onClick={() => setRejectOpen(true)}>Reject stage</button>
                </div>
              ) : null}

              {!canSubmit && !canApprove && !canReject ? (
                <div className="entry-panel__actions">
                  <button type="button" className="btn btn-default" onClick={onClose}>Close</button>
                </div>
              ) : null}
            </>
          )}

          {detailLocked ? (
            <div className="entry-panel__actions">
              <button type="button" className="btn btn-default" onClick={onClose}>Close</button>
            </div>
          ) : null}
        </div>
      </aside>

      {rejectOpen ? (
        <RejectModal
          leadId={lead.id}
          currentGate={gate.key}
          currentGateName={gate.name}
          onClose={() => setRejectOpen(false)}
          onDone={(updated) => { onChange(updated); onClose(); }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
