# Kavis NPI Portal — Completion Report

**Date:** 10 Sep 2026  
**Project:** `Extrovis NPCI Stage/kavis-npi-portal`  
**References:** BRD `Kavis_Kissflow-CDMO_NPI_Stage_Gate_Workflow - 25Aug26.docx`, sample charter `Kavis_Atomoxetine project charter.xlsb`, UI patterns from `Project_Management_App`

---

## 1. What was changed

### Server (ACL + workflow)
- Added `server/src/services/permissions.ts` — team/step visibility rules (full / summary / hidden).
- Extended users with `is_team_head` (schema + migrate + seed + user CRUD).
- Seeded **BD Team Head** `bd.head` (Neha Patil) alongside **Vinay** `bd.vinay`; other functions marked as team heads.
- Reworked `getLeadFullForUser` so detail is redacted per role; Senior Management still sees full revealed steps.
- Reveals **current step + immediate next step** (next only to the teams who own that next work).
- Document download now requires owning team / support role / Team Head / SM (`documents.ts`).
- Item submit allows **support roles**; **BRD-mandatory docs cannot be waived** by the submitter.
- Pending queues / notifications include support-role assignments.
- Lead create accepts optional charter notes (batch size, API vendor, etc.).
- Workflow payload: `workflow` + per-gate `stepStrip` for the common progress UI.

### Client (CRM UI)
- New `WorkflowProgress` — gate tracker + within-stage step strip (completed / current / next / locked).
- `ItemRow` — restricted banner, no doc/remarks when locked; structured submit form; mandatory upload enforced in UI.
- `GateGroup` — current/next step badges; safer empty/locked messaging.
- `LeadForm` — composer-style layout (main + aside) aligned with Project Management App patterns; charter fields from Atomoxetine sample.
- Dashboard: BD (not only SM) can create leads.
- Users admin: Team Head flag + badge.
- Auth context exposes `isTeamHead`.
- Styles for progress strip, access banner, composer layout (`npi.css`).

---

## 2. What was fixed

| Issue | Fix |
|--------|-----|
| Any internal user could open every revealed checklist item and download docs | Team-based detail ACL + document download ACL |
| Future workflow visible once a gate opened | Steps beyond current+1 stay locked; next-step detail only for owning teams |
| Step 1 CDA not limited to Vinay + BD Team Head | Only BD role / BD Team Head / SM get `visibility: full` on CDA |
| `supportRoles` were display-only | Support roles can submit and see full detail |
| Submitters could toggle off mandatory uploads | Server forces `docRequired` when BRD says so |
| Progress UI was gate-only | Common indicator shows stage + step states |
| Conditional Safety (NA) incorrectly marked step 8 “completed” on strip | Strip uses step position vs `currentStep`, not NA status alone |
| Lead form was minimal vs PM App composers | Sectioned form + side panel “what opens next” |

---

## 3. How the workflow now works

1. **Gates:** RFI → RFP → Agreement (unchanged BRD order).
2. **Steps within a gate:** Items sharing a step number open together; next step number stays locked until the current step is fully approved / NA.
3. **Progress indicator (top of lead):** Shows all 3 stages + steps of the current stage as Completed / Current / Next / Locked. Locked steps are not expandable into confidential detail.
4. **Handoff:** Approve all items in a step → next step activates (TAT clocks start) → when all gate items approved, SM closes the gate → next gate opens.
5. **Documents:** Upload on submit, versioned per item, follow the item through stage progression; only the assigned team (and SM) can download.

---

## 4. Permissions implemented

| Actor | Sees |
|--------|------|
| **Senior Management / Admin** | Full detail for current + next revealed steps; gate approve/reject; all downloads |
| **Owning role** (e.g. Vinay on CDA) | Full detail + submit on their items |
| **Team Head** of owning role (e.g. `bd.head`) | Full detail on that function’s items |
| **Support roles** on an item | Full detail + submit |
| **Other internal teams** | Summary of current step (label/status/owner); **no** remarks/docs; next-step **preview only if they own that next work** |
| **Client** | Only client-owned items (e.g. proposal acceptance); no internal checklist / audit history |

Example (fresh RFI Step 1):
- `bd.vinay` / `bd.head` → CDA **full**
- `mfg.suresh` → CDA **summary** + composition (Step 2) **summary** next preview
- `client.meridian` → no internal RFI items

---

## 5. Document visibility

- Documents are nested under checklist items.
- API strips `documents` / `remarks` / approval fields when `visibility !== full`.
- `GET /documents/:id/download` returns **403** unless the user may access that item’s details (verified: BD OK, Manufacturing forbidden on CDA).

---

## 6. What was tested

API scenarios on running server (`localhost:4300`):

1. Fresh RFI lead (Omeprazole) — Vinay, BD Head, Manufacturing, SM, Client visibility matrices.
2. Atomoxetine mid-RFP — Manufacturing sees full only on mfg/support items; other depts summary.
3. Document download ACL on CDA attachment.
4. Step strip states after NA-step fix (`1:current, 2:next, 3–9:locked`).
5. `tsc --noEmit` on server — pass.
6. Migrate + seed — `is_team_head` column + `bd.head` user created.

**Demo logins** (password `Kavis@123`):  
`bd.vinay`, `bd.head`, `mfg.suresh`, `quality.karthik`, `sr.rajesh`, `client.meridian`, …

---

## 7. Remaining issues / dependencies

1. **Existing DB leads** were not reseeded (7 leads already present). New ACL applies immediately; only new user `bd.head` was added. To rebuild demo pipeline from scratch, delete `server/data/kavis_npi.sqlite` and re-run migrate/seed.
2. **Charter fields** (batch size, API vendor) are stored in history notes on create, not as first-class lead columns — enough for BD handoff; promote to columns if reporting needs them.
3. **Vite client** may need a refresh/restart if it was already running so `WorkflowProgress` / form changes load.
4. **Server must be restarted** after pull (done in this session on `:4300`). Production/deploy should run `npm run migrate` then restart the API process.
5. No automated Jest/Playwright suite yet — verification was manual API scripts; recommend adding permission regression tests before production go-live.

---

## 8. How to verify when you connect

1. Start API (`server`: `npm run dev` / `npm start`) and client (`client`: `npm run dev`).
2. Login as `bd.vinay` → open a fresh RFI lead → confirm CDA full + progress strip.
3. Login as `mfg.suresh` on same lead → CDA shows Restricted; composition appears as Next preview without docs.
4. Login as `bd.head` → CDA full (Team Head).
5. Try downloading a CDA file as Manufacturing → expect forbidden.
6. Create a lead with Atomoxetine-like charter fields and confirm history note + Step 1 opens for BD.
