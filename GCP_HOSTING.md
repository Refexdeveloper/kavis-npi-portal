# =============================================================================
# Kavis Pharma NPI Portal — Architecture, Languages & GCP Hosting Guide
# =============================================================================
# Single source of truth for: stack choices, deployment plan, GCP resources,
# and every credential / environment variable you must configure.
# =============================================================================

## 1. What this product is

**Kavis Pharma NPI Portal** — CDMO New Product Introduction stage-gate CRM  
(RFI → RFP → Agreement), with role-based team ACL, document attachments, and
audit history.

One deployable unit: **frontend + API on the same Cloud Run service**, same
domain. Database and document files live in **managed GCP services** (not in
the container filesystem).

```
GitHub
  │
  ▼
Docker build (Vite client → client/out + Node server)
  │
  ▼
Cloud Run (1 service)
  ├── Serves SPA  (/ , /pipeline, assets…)
  └── Serves API  (/api/v1/…)
        │
        ├── Cloud SQL for MySQL  ← structured app data
        └── Cloud Storage bucket ← confidential CDMO documents
```

---

## 2. Languages & technologies — what each is used for

| Layer | Language / tool | Used for |
|-------|-----------------|----------|
| **Frontend UI** | **JavaScript (React 18)** + JSX | Screens: login, dashboard, leads, stage workspace, document upload UI |
| **Frontend build** | **Vite 5** | Dev server, production bundle into `client/out/` (HTML/JS/CSS) |
| **Frontend routing** | **React Router** (`BrowserRouter`) | Client-side routes; Cloud Run SPA fallback to `index.html` |
| **Frontend motion/icons** | Framer Motion, Lucide | UI animation and icons |
| **Backend API** | **TypeScript** on **Node.js ≥ 22** | Express routes, JWT auth, ACL, stage-gate business rules |
| **HTTP framework** | **Express 5** | `/api/v1/*`, static SPA hosting, multipart uploads |
| **Database access** | **mysql2** (Node) | Connection pool to MySQL / Cloud SQL |
| **SQL schema** | **SQL (MySQL dialect)** | Tables: users, leads, lead_items, lead_documents, gate_approvals, history |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt | Login tokens; password hashing |
| **Document I/O** | Local FS **or** **@google-cloud/storage** | Upload/download behind ACL (never public bucket URLs) |
| **Config** | `.env` / Cloud Run env vars | Secrets and service endpoints |
| **Container** | **Docker** multi-stage | Cloud Run image: built SPA + API process |
| **Cloud hosting** | **Google Cloud Run** | HTTPS, autoscaling, single URL for UI + API |
| **Cloud database** | **Cloud SQL for MySQL 8** | Durable relational data |
| **Cloud files** | **Cloud Storage (GCS)** | Separate private bucket for documents |
| **IaC / CLI** | `gcloud` (commands below) | Create project resources and deploy |

### Why this split (planning rationale)

1. **One Cloud Run service** — CDMO users hit one HTTPS origin; no CORS pain; SPA + API versioned together.
2. **MySQL (Cloud SQL)** — relational stage-gate model (leads → items → docs → history) fits SQL; matches local MySQL already used in development.
3. **Separate GCS bucket** — Cloud Run disks are **ephemeral** and not shared across instances. Documents must live outside the container. A dedicated bucket keeps file storage cleanly separated from DB and from static web assets.
4. **API-proxied downloads** — documents stay private; ACL (team / Senior Management) stays in Express; no public GCS object URLs.
5. **Vite `outDir: out`** — Express serves `../client/out` in place; **no copy** of frontend into `server/`.

---

## 3. Clean architecture (local vs GCP)

| Concern | Local development | GCP production |
|---------|-------------------|----------------|
| App process | `npm run build && npm start` (or Vite + API separately) | Cloud Run container |
| UI | Vite `client/out` served by Express when built | Same, baked into image |
| Database | Homebrew / local MySQL `kavis_npi` | **Cloud SQL** instance + database `kavis_npi` |
| Documents | `server/uploads/` (`STORAGE_BACKEND=local`) | **GCS bucket** (`STORAGE_BACKEND=gcs`) |
| Secrets | `server/.env` (gitignored) | Cloud Run env + Secret Manager (recommended) |
| Identity to GCP | n/a | Cloud Run **service account** (ADC — no key file in image) |

### Code touchpoints

- `server/src/services/storage.ts` — `local` | `gcs` backends  
- `server/src/db/index.ts` — TCP (`DB_HOST`) or Cloud SQL Unix socket (`INSTANCE_CONNECTION_NAME`)  
- `Dockerfile` — single image for Cloud Run  
- `package.json` (repo root) — `npm run build` / `npm start`

---

## 4. Credentials & environment variables (complete list)

**Never commit real secrets.** Put production values in Cloud Run / Secret Manager only.

### 4.1 Application / security

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `JWT_SECRET` | **Yes (prod)** | Long random string (32+ chars). Signs login tokens. |
| `NODE_ENV` | Recommended | `production` on Cloud Run |
| `PORT` | Auto on Cloud Run | Cloud Run sets this (`8080`). Local default `4300`. |
| `HOST` | Optional | `0.0.0.0` |
| `FORCE_HTTPS` | Optional | `true` behind HTTPS only if you want HSTS |
| `CLIENT_ORIGIN` | Optional | Comma-separated allowed CORS origins. Same-origin UI usually needs none. Include custom domains if any. |
| `JSON_BODY_LIMIT` | Optional | Default `4mb` (JSON only; files use multer 25MB) |

### 4.2 MySQL / Cloud SQL

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `DB_NAME` | Yes | `kavis_npi` |
| `DB_USER` | Yes | e.g. `kavis_app` |
| `DB_PASSWORD` | Yes | Strong password; store in Secret Manager |
| `DB_HOST` | Local / public IP | `127.0.0.1` or Cloud SQL public IP |
| `DB_PORT` | With host | `3306` |
| `INSTANCE_CONNECTION_NAME` | **Cloud Run + Cloud SQL connector** | `PROJECT_ID:REGION:INSTANCE_NAME` → socket `/cloudsql/...` |
| `DB_SOCKET_PATH` | Optional override | Full socket path if not using `INSTANCE_CONNECTION_NAME` |
| `DB_POOL_SIZE` | Optional | Default `10` |

**Prefer on Cloud Run:** set `INSTANCE_CONNECTION_NAME` and attach the Cloud SQL instance to the service (Unix socket). Do **not** expose Cloud SQL publicly unless you must.

### 4.3 Document storage (GCS)

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `STORAGE_BACKEND` | Yes for prod | `gcs` on Cloud Run; `local` on laptop |
| `GCS_BUCKET` | Yes if gcs | e.g. `kavis-npi-docs-PROD_PROJECT` |
| `GCS_PREFIX` | Optional | Default `npi-docs/` object prefix |
| `UPLOAD_DIR` | Local only | Default `server/uploads` |

**Auth to GCS:** Cloud Run service account with `roles/storage.objectAdmin` (or tighter custom role) on that bucket. **No JSON key file in the Docker image.**

### 4.4 Client (build-time, usually leave unset in prod)

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_URL` | No | Prod uses same-origin `/api/v1` |
| `VITE_API_PORT` | Dev only | Vite proxy to API (`4300`) |

### 4.5 Demo / seed accounts (app data, not GCP)

After migrate/seed (or first Cloud Run start):

| Username | Role | Password |
|----------|------|----------|
| `bd.vinay` | Business Development | `Kavis@123` |
| `bd.head` | BD Team Head | `Kavis@123` |
| `sr.rajesh` | Senior Management (admin) | `Kavis@123` |
| … | other seeded teams | `Kavis@123` |

**Change these passwords in production** (or disable seed / skip demo data).

### 4.6 GCP project identities (platform credentials)

| Credential | Purpose |
|------------|---------|
| Your user / `gcloud auth login` | Create resources, deploy |
| Cloud Run **runtime service account** | Talk to Cloud SQL + GCS via ADC |
| Cloud SQL user `DB_USER` / `DB_PASSWORD` | App DB login |
| Artifact Registry push identity | `gcloud builds` / CI |

---

## 5. Create GCP resources (step-by-step)

Replace placeholders:

- `PROJECT_ID` — e.g. `kavis-npi-prod`
- `REGION` — e.g. `asia-south1` (Mumbai) or `asia-south2`
- `SQL_INSTANCE` — e.g. `kavis-npi-mysql`
- `DOCS_BUCKET` — must be **globally unique**, e.g. `kavis-npi-docs-yourorg`
- `SERVICE` — e.g. `kavis-npi-portal`
- `SA_NAME` — e.g. `kavis-npi-run`

```bash
# --- Project & APIs ---
gcloud config set project PROJECT_ID
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  sql.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com

# --- Runtime service account ---
gcloud iam service-accounts create SA_NAME \
  --display-name="Kavis NPI Cloud Run"

SA_EMAIL="SA_NAME@PROJECT_ID.iam.gserviceaccount.com"

# --- Cloud SQL for MySQL ---
gcloud sql instances create SQL_INSTANCE \
  --database-version=MYSQL_8_0 \
  --tier=db-f1-micro \
  --region=REGION \
  --storage-size=20GB \
  --storage-auto-increase \
  --root-password='REPLACE_ROOT_PASSWORD'

gcloud sql databases create kavis_npi --instance=SQL_INSTANCE

gcloud sql users create kavis_app \
  --instance=SQL_INSTANCE \
  --password='REPLACE_APP_PASSWORD'

# Cloud Run SA needs Cloud SQL Client
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client"

# --- Dedicated documents bucket (private) ---
gcloud storage buckets create gs://DOCS_BUCKET \
  --location=REGION \
  --uniform-bucket-level-access

# Block public access (default on many orgs; enforce explicitly)
gcloud storage buckets update gs://DOCS_BUCKET --public-access-prevention

gcloud storage buckets add-iam-policy-binding gs://DOCS_BUCKET \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"

# --- Secrets (recommended) ---
echo -n 'REPLACE_APP_PASSWORD' | gcloud secrets create kavis-db-password --data-file=-
echo -n 'REPLACE_LONG_RANDOM_JWT_SECRET' | gcloud secrets create kavis-jwt-secret --data-file=-

gcloud secrets add-iam-policy-binding kavis-db-password \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding kavis-jwt-secret \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor"
```

**Connection name** (save this):

```bash
gcloud sql instances describe SQL_INSTANCE --format='value(connectionName)'
# → PROJECT_ID:REGION:SQL_INSTANCE
```

---

## 6. Build & deploy to Cloud Run

From the **repository root** (where `Dockerfile` lives):

```bash
export PROJECT_ID=...
export REGION=...
export SERVICE=kavis-npi-portal
export SA_EMAIL=SA_NAME@PROJECT_ID.iam.gserviceaccount.com
export SQL_CONNECTION=PROJECT_ID:REGION:SQL_INSTANCE
export DOCS_BUCKET=...

# Build & push (Cloud Build)
gcloud builds submit --tag gcr.io/${PROJECT_ID}/${SERVICE}:latest .

# Deploy single service (UI + API)
gcloud run deploy ${SERVICE} \
  --image gcr.io/${PROJECT_ID}/${SERVICE}:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --service-account ${SA_EMAIL} \
  --add-cloudsql-instances ${SQL_CONNECTION} \
  --set-env-vars "NODE_ENV=production,DB_NAME=kavis_npi,DB_USER=kavis_app,INSTANCE_CONNECTION_NAME=${SQL_CONNECTION},STORAGE_BACKEND=gcs,GCS_BUCKET=${DOCS_BUCKET},GCS_PREFIX=npi-docs/,FORCE_HTTPS=true" \
  --set-secrets "DB_PASSWORD=kavis-db-password:latest,JWT_SECRET=kavis-jwt-secret:latest" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10
```

Open the service URL printed by `gcloud run deploy`.  
Check: `https://YOUR_RUN_URL/api/v1/status` → should show `"database":"mysql","storage":"gcs","serve_client":true`.

### Optional: map custom domain

```bash
gcloud run domain-mappings create --service ${SERVICE} --domain npi.yourdomain.com --region ${REGION}
```

Set `CLIENT_ORIGIN` if you use additional front-door domains.

---

## 7. Local production-like run (before GCP)

```bash
# MySQL local + .env (STORAGE_BACKEND=local)
cd server && cp .env.example .env   # edit DB_* / JWT_SECRET

# From repo root
npm run install:all
npm run build && npm start
# → http://localhost:4300  (SPA + API)
```

To smoke-test GCS from a laptop (optional):

```bash
gcloud auth application-default login
# in server/.env:
# STORAGE_BACKEND=gcs
# GCS_BUCKET=your-dev-bucket
```

---

## 8. Security checklist (CDMO documents)

- [ ] GCS bucket **not** public; Uniform bucket-level access ON  
- [ ] Downloads only via authenticated `/api/v1/documents/:id/download`  
- [ ] Strong `JWT_SECRET` and DB password in Secret Manager  
- [ ] Cloud SQL not publicly open (use Cloud Run connector / private IP)  
- [ ] Change or remove demo seed passwords before real users  
- [ ] IAM: least privilege on SA (Cloud SQL Client + objectAdmin on **one** docs bucket)

---

## 9. Operational notes

- **Migrate/seed on boot:** the server runs schema migrate (and seed if empty) at startup. For production you may later split seed off; first deploy creates schema automatically.
- **Cost:** `db-f1-micro` is for trials; size up for production load. GCS is pay-per-storage/ops. Cloud Run scales to zero when idle (`min-instances 0`).
- **Backups:** enable automated Cloud SQL backups; optionally object versioning on the docs bucket.
- **CI:** point GitHub Actions / Cloud Build at the root `Dockerfile` and redeploy Cloud Run on `main`.

---

## 10. Quick reference — file map

| Path | Role |
|------|------|
| `client/` | React + Vite SPA |
| `server/` | Express + TypeScript API |
| `server/src/services/storage.ts` | Local vs GCS documents |
| `server/src/db/` | MySQL schema, migrate, seed |
| `Dockerfile` | Cloud Run image |
| `package.json` | Root `build` / `start` |
| `GCP_HOSTING.md` | This document |

---

## 11. Live deployment (this project)

| Item | Value |
|------|--------|
| GCP project | `master-diorama-489103-u2` |
| Region | `asia-south1` |
| Cloud Run | `kavis-npi-portal` |
| App URL | https://kavis-npi-portal-dhwffeu7pq-el.a.run.app |
| Cloud SQL instance | **`kavis-npi-mysql`** (dedicated — not shared with P2P) |
| Connection name | `master-diorama-489103-u2:asia-south1:kavis-npi-mysql` |
| Database / user | `kavis_npi` / `kavis_app` |
| Docs bucket | `gs://kavis-npi-docs-master-diorama-489103-u2` |
| Archive bucket | `gs://kavis-npi-archive-master-diorama-489103-u2` |
| Runtime SA | `kavis-npi-run@master-diorama-489103-u2.iam.gserviceaccount.com` |
| Image | `asia-south1-docker.pkg.dev/master-diorama-489103-u2/kavis/kavis-npi-portal:latest` |
| Secrets | `kavis-db-password`, `kavis-jwt-secret` |
| GitHub | https://github.com/Refexdeveloper/kavis-npi-portal |

**Isolation check:** Cloud Run is attached only to `kavis-npi-mysql`. The shared `p2p-mysql` instance no longer has a `kavis_npi` database.

Demo login: `bd.vinay` / `Kavis@123`

*Last updated after migrating to a dedicated Cloud SQL instance and Kavis-only GCS buckets.*
