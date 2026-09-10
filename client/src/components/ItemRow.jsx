import { useState } from "react";
import ItemEntryPanel from "./ItemEntryPanel.jsx";
import { useAuth } from "../api/AuthContext.jsx";
import { itemMeta, dueMeta } from "../lib/status.js";

/**
 * Compact checklist row — never expands inline.
 * Clicking Update / Open launches the premium entry panel.
 */
export default function ItemRow({ lead, gate, item, onChange }) {
  const { role, isAdmin, isTeamHead } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);

  const meta = itemMeta(item.status);
  const due = dueMeta(item);
  const detailLocked = !!item.detailLocked || item.visibility === "summary" || item.visibility === "hidden";
  const isNextPreview = item.step === gate.currentStep + 1 && !gate.isComplete;
  const ownerMatch = role === item.role || (item.supportRoles || []).includes(role) || (isTeamHead && role === item.role);
  const canAct = (isAdmin || ownerMatch) && gate.isCurrent && !gate.isLocked && lead.status === "active" && item.step === gate.currentStep && !detailLocked;
  const canSubmit = canAct && (item.status === "pending" || item.status === "sent_back");
  const canApprove = isAdmin && item.status === "submitted" && gate.isCurrent && item.step === gate.currentStep && !detailLocked;

  let cta = "Open";
  let ctaClass = "btn btn-default btn-sm";
  if (canSubmit) { cta = "Update entry"; ctaClass = "btn btn-theme btn-sm"; }
  else if (canApprove) { cta = "Review"; ctaClass = "btn btn-success btn-sm"; }
  else if (detailLocked) { cta = isNextPreview ? "Preview" : "Restricted"; ctaClass = "btn btn-default btn-sm"; }
  else if (item.status === "approved") { cta = "View record"; }

  return (
    <>
      <div className={`item-row item-row--compact${item.status === "not_applicable" ? " is-na" : ""}${detailLocked ? " is-locked-detail" : ""}${isNextPreview ? " is-next-preview" : ""}${canSubmit ? " needs-action" : ""}`}>
        <div className="item-row__main">
          <span className={`item-row__icon item-row__icon--${meta.tone}`}><i className={`fas ${meta.icon}`} /></span>
          <span className="item-row__info">
            <b>{item.label}</b>
            <span>
              {item.roleLabel}
              {item.supportRoleLabels?.length ? ` · with ${item.supportRoleLabels.join(", ")}` : ""}
              {item.tatDays ? ` · TAT ${item.tatDays}d` : ""}
              {isNextPreview ? " · Next for assigned dept" : ""}
            </span>
          </span>
        </div>
        <div className="item-row__aside">
          {detailLocked ? <span className="label label-default"><i className="fas fa-lock" /> Team only</span> : null}
          {due && !detailLocked ? <span className={`label label-${due.labelTone}`}>{due.text}</span> : null}
          <span className={`label label-${meta.labelTone}`}>{isNextPreview ? "Next" : meta.label}</span>
          <button type="button" className={ctaClass} onClick={() => setPanelOpen(true)}>
            {cta} <i className="fas fa-arrow-up-right-from-square" style={{ marginLeft: 4, fontSize: 11 }} />
          </button>
        </div>
      </div>

      {panelOpen ? (
        <ItemEntryPanel
          lead={lead}
          gate={gate}
          item={item}
          onClose={() => setPanelOpen(false)}
          onChange={onChange}
        />
      ) : null}
    </>
  );
}
