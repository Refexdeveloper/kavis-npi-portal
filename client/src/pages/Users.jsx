import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import { Field, Modal } from "../components/ui.jsx";

const empty = {
  username: "",
  full_name: "",
  email: "",
  role: "business_development",
  client_company: "",
  password: "",
  is_team_head: false,
  can_act_all: false,
};

export default function Users() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(null);

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

  function openEdit(u) {
    setEditUser(u);
    setEditForm({
      full_name: u.full_name || "",
      email: u.email || "",
      role: u.role,
      client_company: u.client_company || "",
      is_team_head: !!u.is_team_head,
      can_act_all: !!u.can_act_all,
      password: "",
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editUser || !editForm) return;
    try {
      const body = {
        full_name: editForm.full_name,
        email: editForm.email || null,
        role: editForm.role,
        client_company: editForm.role === "client" ? editForm.client_company : null,
        is_team_head: !!editForm.is_team_head,
        can_act_all: !!editForm.can_act_all,
      };
      if (editForm.password) body.password = editForm.password;
      await api.patchUser(editUser.id, body);
      toast.success(`Updated ${editForm.full_name} — role/flags apply on their next page refresh.`);
      setEditUser(null);
      setEditForm(null);
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
        <p className="text-muted" style={{ margin: "0 16px 12px", fontSize: 13 }}>
          Changing a user&apos;s <b>role</b> updates permissions across the app (server reads role from the database on every request).
          The user should refresh or re-open the tab to refresh their session UI.
        </p>
        <div className="table-responsive">
          <table className="table table-striped table-hover data-list-table">
            <thead>
              <tr>{["Name", "Username", "Role", "Flags", "Scope", "Status", ""].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.full_name}</strong></td>
                  <td className="mono">{u.username}</td>
                  <td>{u.role_label}</td>
                  <td>
                    {u.is_admin ? <span className="label label-primary" style={{ marginRight: 4 }}>Admin</span> : null}
                    {u.is_team_head ? <span className="label label-info" style={{ marginRight: 4 }}>Team Head</span> : null}
                    {u.can_act_all ? <span className="label label-warning" style={{ marginRight: 4 }}>Act all</span> : null}
                  </td>
                  <td>{u.client_company || "Internal — all leads"}</td>
                  <td><span className={`label ${u.activated ? "label-success" : "label-danger"}`}>{u.activated ? "Active" : "Off"}</span></td>
                  <td className="actions" style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-default btn-xs" onClick={() => openEdit(u)}>Edit</button>{" "}
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
              <>
                <Field label="Team Head" hint="Sees complete details for their function&apos;s checklist items.">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked={!!form.is_team_head} onChange={(e) => setForm({ ...form, is_team_head: e.target.checked })} />
                    <span>Mark as Team Head for this role</span>
                  </label>
                </Field>
                <Field label="Act on all steps" hint="Like Vinay — can update any open checklist item; dashboard stays task-focused.">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked={!!form.can_act_all} onChange={(e) => setForm({ ...form, can_act_all: e.target.checked })} />
                    <span>Allow updates on every function&apos;s open items</span>
                  </label>
                </Field>
              </>
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

      {editUser && editForm ? (
        <Modal title={`Edit — ${editUser.username}`} onClose={() => { setEditUser(null); setEditForm(null); }}>
          <form onSubmit={saveEdit}>
            <Field label="Full name" required>
              <input className="form-control" required value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="form-control" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </Field>
            <Field label="Role" required hint="Changing role updates access rules across the portal immediately on the server.">
              <select className="form-control" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                {roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            {editForm.role === "client" ? (
              <Field label="Client company" required>
                <input className="form-control" required value={editForm.client_company} onChange={(e) => setEditForm({ ...editForm, client_company: e.target.value })} />
              </Field>
            ) : (
              <>
                <Field label="Team Head">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked={!!editForm.is_team_head} onChange={(e) => setEditForm({ ...editForm, is_team_head: e.target.checked })} />
                    <span>Team Head for this role</span>
                  </label>
                </Field>
                <Field label="Act on all steps">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked={!!editForm.can_act_all} onChange={(e) => setEditForm({ ...editForm, can_act_all: e.target.checked })} />
                    <span>Can update any open checklist item</span>
                  </label>
                </Field>
              </>
            )}
            <Field label="Reset password" hint="Leave blank to keep the current password.">
              <input className="form-control" minLength={8} type="text" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Optional new temporary password" />
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-default" onClick={() => { setEditUser(null); setEditForm(null); }}>Cancel</button>
              <button className="btn btn-theme" type="submit">Save changes</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
