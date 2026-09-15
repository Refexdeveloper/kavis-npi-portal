-- =============================================================================
-- Kavis Pharma NPI Portal — MySQL schema
-- CDMO NPI stage-gate (RFI -> RFP -> Agreement)
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  role VARCHAR(64) NOT NULL,
  client_company VARCHAR(255) NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  is_team_head TINYINT(1) NOT NULL DEFAULT 0,
  can_act_all TINYINT(1) NOT NULL DEFAULT 0,
  activated TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  last_login DATETIME NULL,
  deleted_at DATETIME NULL,
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ref_code VARCHAR(32) NOT NULL,
  product VARCHAR(255) NOT NULL,
  strength VARCHAR(128) NULL,
  dosage_form VARCHAR(128) NULL,
  client_name VARCHAR(255) NOT NULL,
  client_country VARCHAR(128) NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'Standard',
  potent_molecule TINYINT(1) NOT NULL DEFAULT 0,
  current_gate VARCHAR(32) NOT NULL DEFAULT 'rfi',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  hold_reason TEXT NULL,
  drop_reason TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_leads_ref (ref_code),
  KEY idx_leads_status (status),
  KEY idx_leads_gate (current_gate),
  KEY idx_leads_client (client_name),
  CONSTRAINT fk_leads_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_id INT UNSIGNED NOT NULL,
  gate VARCHAR(32) NOT NULL,
  item_key VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  doc_required TINYINT(1) NOT NULL DEFAULT 0,
  activated_at DATETIME NULL,
  remarks TEXT NULL,
  submitted_by INT UNSIGNED NULL,
  submitted_at DATETIME NULL,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  approval_comments TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_lead_items (lead_id, item_key),
  KEY idx_lead_items_lead (lead_id),
  KEY idx_lead_items_gate (lead_id, gate),
  KEY idx_lead_items_status (status),
  CONSTRAINT fk_lead_items_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lead_items_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_items_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_documents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_item_id INT UNSIGNED NOT NULL,
  version INT NOT NULL,
  original_filename VARCHAR(512) NOT NULL,
  stored_filename VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NULL,
  size_bytes INT NULL,
  uploaded_by INT UNSIGNED NULL,
  uploaded_at DATETIME NOT NULL,
  KEY idx_lead_documents_item (lead_item_id),
  CONSTRAINT fk_lead_documents_item FOREIGN KEY (lead_item_id) REFERENCES lead_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_lead_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gate_approvals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_id INT UNSIGNED NOT NULL,
  gate VARCHAR(32) NOT NULL,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NOT NULL,
  comments TEXT NULL,
  superseded TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_gate_approvals_lead (lead_id, gate),
  CONSTRAINT fk_gate_approvals_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_gate_approvals_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS history (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_id INT UNSIGNED NOT NULL,
  actor_user_id INT UNSIGNED NULL,
  actor_name VARCHAR(255) NOT NULL,
  action VARCHAR(64) NOT NULL,
  detail TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_history_lead (lead_id),
  CONSTRAINT fk_history_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
