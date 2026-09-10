export const GATES = [
  { key: "rfi", order: 1, name: "Stage 1 — RFI (Request for Information)" },
  { key: "rfp", order: 2, name: "Stage 2 — RFP (Request for Proposal)" },
  { key: "agreement", order: 3, name: "Stage 3 — Agreement" },
];

export function gateOrder(key) {
  return GATES.find((g) => g.key === key)?.order ?? 1;
}
export function gateName(key) {
  return GATES.find((g) => g.key === key)?.name ?? key;
}
/** Every gate the lead could be revised back to: itself and any earlier gate. */
export function revisableGates(currentGate) {
  const order = gateOrder(currentGate);
  return GATES.filter((g) => g.order <= order);
}
