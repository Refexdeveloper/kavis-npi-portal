// =============================================================================
// Kavis Pharma — CDMO NPI stage-gate definition
//
// Transcribed directly from "Kavis_Kissflow-CDMO_NPI_Stage_Gate_Workflow —
// 25Aug26.docx" (RFI -> RFP -> Agreement). This is the single source of truth
// for what every lead must produce at each gate; it intentionally lives in
// code, not the database, because the process itself is a fixed, audited
// standard — only the per-lead *instances* of these items are database rows.
// =============================================================================

export type Role =
  | 'business_development'
  | 'safety'
  | 'manufacturing'
  | 'analytical'
  | 'quality'
  | 'costing'
  | 'regulatory'
  | 'legal'
  | 'supply_chain'
  | 'rd'
  | 'engineering'
  | 'client'
  | 'senior_management'

export type GateKey = 'rfi' | 'rfp' | 'agreement'

export interface GateItemDef {
  key: string
  label: string
  role: Role
  supportRoles?: Role[]
  mandatory: true | 'conditional'
  docRequired: boolean
  tatDays?: number
  outputCaptured: string
  note?: string
  /**
   * The doc's own "#" column: items sharing a step number open together in
   * parallel (one per department) the moment the step is reached; the next
   * step number stays hidden from everyone until every item in the current
   * step is approved. A step with a single item is just a sequential gate
   * of one. This is the literal sequencing the source document encodes —
   * not an inferred grouping.
   */
  step: number
}

export interface GateDef {
  key: GateKey
  order: number
  name: string
  trigger: string
  crossFunctions: Role[]
  exitCriteria: string
  outputs: string[]
  items: GateItemDef[]
}

export const ROLE_LABELS: Record<Role, string> = {
  business_development: 'Business Development',
  safety: 'Safety',
  manufacturing: 'Manufacturing',
  analytical: 'Analytical',
  quality: 'Quality',
  costing: 'Costing',
  regulatory: 'Regulatory',
  legal: 'Legal',
  supply_chain: 'Supply Chain',
  rd: 'R&D',
  engineering: 'Engineering',
  client: 'Client',
  senior_management: 'Senior Management',
}

export const ROLE_LIST = Object.keys(ROLE_LABELS) as Role[]
export const GATE_ORDER: GateKey[] = ['rfi', 'rfp', 'agreement']
export const GATE_LABELS: Record<GateKey, string> = {
  rfi: 'Stage 1 — RFI (Request for Information)',
  rfp: 'Stage 2 — RFP (Request for Proposal)',
  agreement: 'Stage 3 — Agreement',
}

export const GATES: GateDef[] = [
  {
    key: 'rfi',
    order: 1,
    name: GATE_LABELS.rfi,
    trigger: 'BD Team / Client submits the New Product Introduction (NPI) form and executed CDA.',
    crossFunctions: ['safety', 'manufacturing', 'analytical'],
    exitCriteria: 'High-level feasibility assessment, indicative timelines, indicative CAPEX (if any).',
    outputs: [
      'High-level manufacturing / technical feasibility (go / no-go / conditional)',
      'Indicative project timelines',
      'Indicative CAPEX, if any new equipment/line is required',
      'Escalation / involvement / advice by / with Senior Management',
      'Go / No-Go',
    ],
    items: [
      { key: 'cda', label: 'Confidentiality Agreement (CDA)', role: 'business_development', mandatory: true, docRequired: true, tatDays: 2, outputCaptured: 'Confidentiality agreement executed', step: 1 },
      { key: 'composition', label: 'Molecule & Product Composition (Qualitative)', role: 'manufacturing', supportRoles: ['analytical'], mandatory: true, docRequired: true, outputCaptured: 'Composition record; triggers feasibility screen', step: 2 },
      { key: 'route_admin', label: 'Route of Administration', role: 'manufacturing', mandatory: true, docRequired: false, outputCaptured: 'Dosage-form compatibility flag', step: 3 },
      { key: 'dosage_form', label: 'Dosage Form', role: 'manufacturing', mandatory: true, docRequired: false, outputCaptured: 'Line / equipment fit check', step: 4 },
      { key: 'batch_size', label: 'Batch Size', role: 'manufacturing', mandatory: true, docRequired: false, outputCaptured: 'Capacity fit check', step: 5 },
      { key: 'forecast_volume', label: 'Forecasted Annual Volumes (Units)', role: 'manufacturing', supportRoles: ['costing'], mandatory: true, docRequired: false, outputCaptured: 'Capacity & indicative CAPEX trigger', step: 6 },
      { key: 'process_flow', label: 'Manufacturing / Packaging Process — Draft Flow Chart (CPPs)', role: 'manufacturing', mandatory: true, docRequired: true, outputCaptured: 'CPP list; process fit assessment', step: 7 },
      { key: 'safety_info', label: 'Safety Information (flavor, toxicity, OEL/PEL, SDS, alcohol content)', role: 'safety', mandatory: 'conditional', docRequired: true, outputCaptured: 'Containment / handling requirement flag', note: 'Potent molecules only — applies when the lead is flagged as a potent molecule.', step: 8 },
      { key: 'reg_strategy', label: 'Regulatory Filing Strategy', role: 'regulatory', supportRoles: ['analytical'], mandatory: true, docRequired: false, outputCaptured: 'Filing-pathway tag (ANDA / 505(b)(2) / other)', step: 9 },
    ],
  },
  {
    key: 'rfp',
    order: 2,
    name: GATE_LABELS.rfp,
    trigger: 'Client requests a formal proposal following a positive RFI outcome.',
    crossFunctions: ['costing', 'manufacturing', 'quality', 'analytical'],
    exitCriteria: 'Costing, supply price, detailed timelines, firm CAPEX numbers.',
    outputs: [
      'Go / No-Go',
      'Detailed costing (COGS build-up)',
      'Supply price',
      'Detailed project timelines',
      'Firm CAPEX numbers',
      'Technical / commercial alignment',
      'Proposal submission & acceptance',
      'Escalation / involvement / advice by / with Senior Management',
    ],
    items: [
      { key: 'sow', label: 'Scope of Work', role: 'business_development', mandatory: true, docRequired: true, tatDays: 3, outputCaptured: 'SOW record attached to deal', step: 1 },
      { key: 'cleaning_method', label: 'Product Cleaning Method', role: 'quality', mandatory: true, docRequired: true, outputCaptured: 'Cleaning validation approach on file', step: 2 },
      { key: 'excipient_spec_rfp', label: 'Excipient Specification, CoA & MSDS', role: 'analytical', supportRoles: ['quality'], mandatory: true, docRequired: true, outputCaptured: 'Excipient master data', step: 2 },
      { key: 'method_spec', label: 'Specifications & Test Methods (API / RM / PM)', role: 'analytical', mandatory: true, docRequired: true, outputCaptured: 'Method register', step: 2 },
      { key: 'packaging_spec_rfp', label: 'Packaging Material / Component Specification, CoA, MSDS', role: 'quality', supportRoles: ['manufacturing'], mandatory: true, docRequired: true, outputCaptured: 'Packaging master data', step: 2 },
      { key: 'amt_reagents', label: 'List of Reagents / Columns for AMT', role: 'analytical', mandatory: true, docRequired: true, outputCaptured: 'AMT reagent / consumables list', step: 2 },
      { key: 'costing_buildup', label: 'Costing Build-up', role: 'costing', mandatory: true, docRequired: true, outputCaptured: 'Cost sheet (COGS, overheads)', step: 2 },
      { key: 'supply_price', label: 'Supply Price', role: 'costing', supportRoles: ['business_development'], mandatory: true, docRequired: false, outputCaptured: 'Quoted unit price', step: 2 },
      { key: 'detailed_timeline', label: 'Detailed Timelines', role: 'manufacturing', supportRoles: ['analytical'], mandatory: true, docRequired: true, outputCaptured: 'Project timeline (Gantt)', step: 2 },
      { key: 'capex_firm', label: 'CAPEX Numbers (Firm)', role: 'engineering', supportRoles: ['manufacturing'], mandatory: true, docRequired: true, outputCaptured: 'Approved CAPEX estimate', step: 2 },
      { key: 'techno_commercial', label: 'Technical / Commercial Alignment', role: 'business_development', mandatory: true, docRequired: false, tatDays: 2, outputCaptured: 'Technical call outcome (go / no-go possibility)', note: 'Not necessarily paper — this can close on a call.', step: 3 },
      { key: 'proposal_draft', label: 'Proposal Drafting', role: 'business_development', mandatory: true, docRequired: true, tatDays: 1, outputCaptured: 'Proposal document', step: 4 },
      { key: 'proposal_submit', label: 'Proposal Submission to Client', role: 'business_development', mandatory: true, docRequired: true, tatDays: 1, outputCaptured: 'Proposal sent for client review', step: 4 },
      { key: 'proposal_acceptance', label: 'Client Acceptance of Proposal', role: 'client', mandatory: true, docRequired: false, outputCaptured: 'Proposal submission & acceptance', step: 5 },
    ],
  },
  {
    key: 'agreement',
    order: 3,
    name: GATE_LABELS.agreement,
    trigger: 'Client accepts the RFP / commercial terms.',
    crossFunctions: ['legal', 'quality', 'regulatory', 'supply_chain', 'analytical', 'manufacturing'],
    exitCriteria: 'Executed agreements + validated technical data package (specs, protocols, records).',
    outputs: [
      'LOI / TS / MSA / QTA',
      'Validated technical & quality data package (specifications, protocols, records, reports)',
    ],
    items: [
      { key: 'loi_msa_qta', label: 'LOI, TS/MSA, QTA', role: 'legal', supportRoles: ['business_development'], mandatory: true, docRequired: true, tatDays: 7, outputCaptured: 'Executed agreement set (e-signed, filed)', step: 1 },
      { key: 'sampling_protocol', label: 'Sampling Protocols (bulk hold, stability, thermal cycling, etc.)', role: 'quality', mandatory: true, docRequired: true, tatDays: 3, outputCaptured: 'Approved sampling protocol', step: 2 },
      { key: 'bom', label: 'Bill of Material', role: 'supply_chain', mandatory: true, docRequired: true, outputCaptured: 'BOM record', step: 2 },
      { key: 'mfg_record', label: 'Manufacturing Record', role: 'manufacturing', mandatory: true, docRequired: true, outputCaptured: 'Batch manufacturing record (BMR) template', step: 2 },
      { key: 'pkg_record', label: 'Packaging Record', role: 'manufacturing', mandatory: true, docRequired: true, outputCaptured: 'Batch packaging record (BPR) template', step: 2 },
      { key: 'dev_report', label: 'Interim Product Development Report', role: 'rd', supportRoles: ['analytical'], mandatory: true, docRequired: true, outputCaptured: 'Development report on file', step: 2 },
      { key: 'dmf', label: 'API DMF Open Part', role: 'regulatory', mandatory: true, docRequired: true, outputCaptured: 'DMF reference on file', step: 2 },
      { key: 'api_spec', label: 'API Specification, CoA & MSDS', role: 'quality', supportRoles: ['analytical'], mandatory: true, docRequired: true, outputCaptured: 'API master data', step: 2 },
      { key: 'excipient_spec_agr', label: 'Excipient Specification, CoA & MSDS (Confirmed)', role: 'quality', supportRoles: ['analytical'], mandatory: true, docRequired: true, outputCaptured: 'Excipient master data (confirmed)', step: 2 },
      { key: 'packaging_spec_agr', label: 'Packaging Material / Component Specification, CoA & MSDS (Confirmed)', role: 'quality', mandatory: true, docRequired: true, outputCaptured: 'Packaging master data (confirmed)', step: 2 },
      { key: 'amt_protocol', label: 'Analytical Method Transfer Protocols', role: 'analytical', mandatory: true, docRequired: true, outputCaptured: 'AMT protocol on file', step: 2 },
      { key: 'amt_dev_report', label: 'Analytical Development Reports', role: 'analytical', mandatory: true, docRequired: true, outputCaptured: 'Development report on file', step: 2 },
      { key: 'ipqc_spec', label: 'In-Process Specifications', role: 'quality', mandatory: true, docRequired: true, outputCaptured: 'IPQC spec sheet', step: 2 },
      { key: 'release_spec', label: 'Release Specifications', role: 'quality', mandatory: true, docRequired: true, outputCaptured: 'Release spec sheet', step: 2 },
      { key: 'stability_spec', label: 'Stability Specifications', role: 'quality', mandatory: true, docRequired: true, outputCaptured: 'Stability spec sheet', step: 2 },
      { key: 'feasibility_batch_protocol', label: 'Feasibility Batch Protocol', role: 'manufacturing', supportRoles: ['rd'], mandatory: true, docRequired: true, outputCaptured: 'Approved feasibility batch protocol', step: 2 },
      { key: 'spec_rationale', label: 'Specification Rationale', role: 'regulatory', supportRoles: ['quality'], mandatory: true, docRequired: true, outputCaptured: 'Rationale document on file', step: 2 },
      { key: 'test_results', label: 'Analytical / Microbial Testing Results', role: 'analytical', mandatory: true, docRequired: true, outputCaptured: 'Test result data set', step: 2 },
    ],
  },
]

export function findGate(key: string): GateDef | undefined {
  return GATES.find((g) => g.key === key)
}

export function findItem(gateKey: string, itemKey: string): GateItemDef | undefined {
  return findGate(gateKey)?.items.find((i) => i.key === itemKey)
}

export function nextGate(key: GateKey): GateKey | null {
  const idx = GATE_ORDER.indexOf(key)
  return idx >= 0 && idx < GATE_ORDER.length - 1 ? GATE_ORDER[idx + 1] : null
}

export function maxStep(gateKey: string): number {
  const g = findGate(gateKey)
  return g ? Math.max(...g.items.map((i) => i.step)) : 1
}

export const TOTAL_ITEM_COUNT = GATES.reduce((n, g) => n + g.items.length, 0)
