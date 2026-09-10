import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import { Field, Modal } from "../components/ui.jsx";

const empty = { username: "", full_name: "", email: "", role: "business_development", client_company: "", password: "", is_team_head: false };

export default function Users() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);

  const load = () => api.users().then((r) => setRows(r.rows)).catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
    api.roles().then(setRoles).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e) {
    e.preventDefault();
    try {
      await api.createUser(form);
      toast.success(`Account created for ${form.full_name}`);
      setForm(empty);
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function toggleActive(u) {
    try {
      await api.patchUser(u.id, { activated: u.activated ? 0 : 1 });
      toast.success(u.activated ? "Account deactivated" : "Account reactivated");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="rm-page">
      <div className="rm-panel">
        <div className="rm-panel__bar">
          <h2>Users &amp; access <span>{rows.length} accounts</span></h2>
          <button type="button" className="btn btn-theme btn-sm" onClick={() => setOpen(true)}>
            <i className="fas fa-plus" /> New user
          </button>
        </div>
        <div className="table-responsive">
          <table className="table table-striped table-hover data-list-table">
            <thead>
              <tr>{["Name", "Username", "Role", "Scope", "Status", ""].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.full_name}</strong></td>
                  <td className="mono">{u.username}</td>
                  <td>
                    {u.role_label}
                    {u.is_admin ? <span className="label label-primary" style={{ marginLeft: 6 }}>Admin</span> : null}
                    {u.is_team_head ? <span className="label label-info" style={{ marginLeft: 6 }}>Team Head</span> : null}
                  </td>
                  <td>{u.client_company || "Internal — all leads"}</td>
                  <td><span className={`label ${u.activated ? "label-success" : "label-danger"}`}>{u.activated ? "Active" : "Off"}</span></td>
                  <td className="actions">
                    <button type="button" className="btn btn-default btn-xs" onClick={() => toggleActive(u)}>{u.activated ? "Deactivate" : "Reactivate"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <Modal title="New user account" onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label="Full name" required>
              <input className="form-control" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Username" required hint="Used to sign in — lowercase, no spaces.">
              <input className="form-control" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.trim() })} placeholder="e.g. quality.newperson" />
            </Field>
            <Field label="Email">
              <input className="form-control" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Role" required>
              <select className="form-control" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            {form.role === "client" ? (
              <Field label="Client company" required hint="Restricts this login to leads for this client only.">
                <input className="form-control" required value={form.client_company} onChange={(e) => setForm({ ...form, client_company: e.target.value })} placeholder="Must match the Client Company on their leads" />
              </Field>
            ) : (
              <Field label="Team Head" hint="Team Heads see complete details for their function's checklist items (e.g. BD Team Head + Vinay on Step 1 CDA).">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input type="checkbox" checked={!!form.is_team_head} onChange={(e) => setForm({ ...form, is_team_head: e.target.checked })} />
                  <span>Mark as Team Head for this role</span>
                </label>
              </Field>
            )}
            <Field label="Temporary password" required hint="At least 8 characters — the user is asked to change it on first login.">
              <input className="form-control" required minLength={8} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-default" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-theme" type="submit">Create account</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
