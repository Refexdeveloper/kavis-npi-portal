-- =============================================================================
-- Kavis Pharma NPI Portal — SQLite schema
-- Built for Extrovis BD <-> Kavis Pharma CDMO, modelled directly on
-- "Kavis_Kissflow-CDMO_NPI_Stage_Gate_Workflow" (RFI -> RFP -> Agreement).
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  client_company TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_team_head INTEGER NOT NULL DEFAULT 0,
  activated INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login TEXT,
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_code TEXT NOT NULL UNIQUE,
  product TEXT NOT NULL,
  strength TEXT,
  dosage_form TEXT,
  client_name TEXT NOT NULL,
  client_country TEXT,
  priority TEXT NOT NULL DEFAULT 'Standard',
  potent_molecule INTEGER NOT NULL DEFAULT 0,
  current_gate TEXT NOT NULL DEFAULT 'rfi',
  status TEXT NOT NULL DEFAULT 'active',
  hold_reason TEXT,
  drop_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_gate ON leads(current_gate);
CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_name);

CREATE TABLE IF NOT EXISTS lead_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  gate TEXT NOT NULL,
  item_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  doc_required INTEGER NOT NULL DEFAULT 0,
  activated_at TEXT,
  remarks TEXT,
  submitted_by INTEGER REFERENCES users(id),
  submitted_at TEXT,
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  approval_comments TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(lead_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_lead_items_lead ON lead_items(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_items_gate ON lead_items(lead_id, gate);
CREATE INDEX IF NOT EXISTS idx_lead_items_status ON lead_items(status);

CREATE TABLE IF NOT EXISTS lead_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_item_id INTEGER NOT NULL REFERENCES lead_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_documents_item ON lead_documents(lead_item_id);

CREATE TABLE IF NOT EXISTS gate_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  gate TEXT NOT NULL,
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT NOT NULL,
  comments TEXT,
  superseded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gate_approvals_lead ON gate_approvals(lead_id, gate);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_lead ON history(lead_id);
