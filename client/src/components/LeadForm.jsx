import { useState } from "react";
import { Field } from "./ui.jsx";

const DOSAGE_FORMS = ["Oral Solution", "Oral Suspension", "Syrup", "Tablet", "Capsule", "Pellets (capsule fill)", "Other"];

const empty = {
  product: "",
  strength: "",
  dosageForm: "Oral Solution",
  clientName: "",
  clientCountry: "",
  priority: "Standard",
  potentMolecule: false,
  batchSizeNote: "",
  apiVendor: "",
  projectNotes: "",
};

/**
 * NPI lead intake — structured like Project Management App composers:
 * main fields in a 2-col grid + side context for process hints.
 * Sample charter reference: Atomoxetine OS 4 mg/mL.
 */
export default function LeadForm({ onSubmit, submitLabel = "Create lead", busy }) {
  const [form, setForm] = useState(empty);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await onSubmit({
      product: form.product,
      strength: form.strength,
      dosageForm: form.dosageForm,
      clientName: form.clientName,
      clientCountry: form.clientCountry,
      priority: form.priority,
      potentMolecule: form.potentMolecule,
      // Notes are folded into the first BD history entry via remarks on create —
      // keep create API stable; extra context goes to product if needed.
      notes: [form.batchSizeNote && `Batch size: ${form.batchSizeNote}`, form.apiVendor && `API vendor: ${form.apiVendor}`, form.projectNotes]
        .filter(Boolean)
        .join(" | ") || undefined,
    });
  }

  return (
    <div className="pc-layout">
      <form onSubmit={handleSubmit} className="pc-main">
        <section className="pc-section">
          <header className="pc-section__head">
            <h3>Product &amp; client</h3>
            <p>Matches Stage 1 RFI intake from the CDMO NPI stage-gate BRD.</p>
          </header>
          <div className="rm-form-grid rm-form-grid--2">
            <Field label="Product" required>
              <input className="form-control" required value={form.product} onChange={(e) => set("product", e.target.value)} placeholder="e.g. Atomoxetine Oral Solution" />
            </Field>
            <Field label="Strength">
              <input className="form-control" value={form.strength} onChange={(e) => set("strength", e.target.value)} placeholder="e.g. 4 mg/mL" />
            </Field>
            <Field label="Dosage form">
              <select className="form-control" value={form.dosageForm} onChange={(e) => set("dosageForm", e.target.value)}>
                {DOSAGE_FORMS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className="form-control" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                <option>Standard</option>
                <option>High</option>
              </select>
            </Field>
            <Field label="Client company" required>
              <input className="form-control" required value={form.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="e.g. Extrovis / Meridian Health" />
            </Field>
            <Field label="Client country">
              <input className="form-control" value={form.clientCountry} onChange={(e) => set("clientCountry", e.target.value)} placeholder="e.g. India" />
            </Field>
          </div>
        </section>

        <section className="pc-section">
          <header className="pc-section__head">
            <h3>Charter context (optional)</h3>
            <p>Captured for BD handoff — mirrors project-charter fields used on Atomoxetine.</p>
          </header>
          <div className="rm-form-grid rm-form-grid--2">
            <Field label="Indicative batch size">
              <input className="form-control" value={form.batchSizeNote} onChange={(e) => set("batchSizeNote", e.target.value)} placeholder="e.g. 300 L / 100 mL fill · 3000 bottles" />
            </Field>
            <Field label="API vendor">
              <input className="form-control" value={form.apiVendor} onChange={(e) => set("apiVendor", e.target.value)} placeholder="e.g. Teva API" />
            </Field>
            <Field label="Project notes" full>
              <textarea className="form-control" rows={3} value={form.projectNotes} onChange={(e) => set("projectNotes", e.target.value)} placeholder="Scope, target EB date, commercial volume…" />
            </Field>
            <Field label="Potent molecule" full hint="Turns on the conditional Safety Information item at Stage 1 (BRD #7).">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
                <input type="checkbox" checked={form.potentMolecule} onChange={(e) => set("potentMolecule", e.target.checked)} />
                <span>This is a potent molecule</span>
              </label>
            </Field>
          </div>
        </section>

        <div className="pc-actions">
          <button type="submit" className="btn btn-theme" disabled={busy}>{busy ? "Creating…" : submitLabel}</button>
        </div>
      </form>

      <aside className="pc-aside">
        <div className="pc-aside__card">
          <h4>What opens next</h4>
          <ol>
            <li><b>Step 1 — CDA</b> · BD (Vinay) + BD Team Head</li>
            <li><b>Step 2+</b> · Manufacturing / Analytical in sequence</li>
            <li>Senior Management gate approval before RFP</li>
          </ol>
          <p className="text-muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>Other teams only see their assigned step and the immediate next step — not the full upcoming checklist.</p>
        </div>
      </aside>
    </div>
  );
}
