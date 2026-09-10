// `tone` drives the custom item-row icon classes (npi.css); `labelTone` maps
// to the borrowed .label-* pill classes (success/danger/warning/info/default).
export const ITEM_STATUS_META = {
  pending: { label: "Pending", tone: "neutral", labelTone: "default", icon: "fa-circle" },
  sent_back: { label: "Sent back — needs resubmission", tone: "sentback", labelTone: "warning", icon: "fa-rotate-left" },
  submitted: { label: "Submitted — awaiting approval", tone: "warning", labelTone: "info", icon: "fa-clock" },
  approved: { label: "Approved", tone: "good", labelTone: "success", icon: "fa-check" },
  not_applicable: { label: "Not applicable", tone: "muted", labelTone: "default", icon: "fa-minus" },
};

export const LEAD_STATUS_META = {
  active: { label: "Active", labelTone: "success" },
  on_hold: { label: "On Hold", labelTone: "warning" },
  dropped: { label: "Dropped", labelTone: "danger" },
  completed: { label: "Completed", labelTone: "success" },
};

export const GATE_COLORS = {
  rfi: "#1f8a5f",
  rfp: "#c2701c",
  agreement: "#1e5f74",
};

export function itemMeta(status) {
  return ITEM_STATUS_META[status] || ITEM_STATUS_META.pending;
}
export function leadMeta(status) {
  return LEAD_STATUS_META[status] || LEAD_STATUS_META.active;
}

/** Renders a due-date pill spec {text, labelTone} for an item with a TAT clock running, or null. */
export function dueMeta(item) {
  if (!item.dueAt || item.status === "approved" || item.status === "not_applicable") return null;
  const diffMs = new Date(item.dueAt).getTime() - Date.now();
  const days = Math.round(Math.abs(diffMs) / (24 * 60 * 60 * 1000));
  if (item.overdue) return { text: `Overdue by ${days || 1}d`, labelTone: "danger" };
  if (diffMs < 24 * 60 * 60 * 1000) return { text: "Due today", labelTone: "warning" };
  return { text: `Due in ${days}d`, labelTone: "default" };
}
