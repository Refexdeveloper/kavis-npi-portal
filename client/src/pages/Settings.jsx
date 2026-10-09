import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";

const PERM_COLUMNS = [
  ["can_see_full_workflow", "Full dashboard"],
  ["can_create_lead", "Create leads"],
  ["can_submit_any", "Update any step"],
  ["can_approve", "Approve & close stages"],
  ["can_manage_users", "User access"],
  ["can_delete_leads", "Delete projects"],
];

export default function Settings() {
  const toast = useToast();
  const [tab, setTab] = useState("workflow");
  const [gates, setGates] = useState([]);
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.workflowSettings().then((data) => {
      setGates(data.gates || []);
      setRoles(data.roles || []);
    }).catch((e) => toast.error(e.message));
    api.rolePermissions().then((data) => setPerms(data.roles || [])).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateItem(gateKey, itemKey, patch) {
    setGates((list) => list.map((gate) => gate.key !== gateKey ? gate : {
      ...gate,
      items: gate.items.map((item) => item.key === itemKey ? { ...item, ...patch } : item),
    }));
  }

  function toggleSupport(gateKey, item, role) {
    const has = (item.supportRoles || []).includes(role);
    const supportRoles = has
      ? item.supportRoles.filter((r) => r !== role)
      : [...(item.supportRoles || []), role];
    updateItem(gateKey, item.key, { supportRoles });
  }

  function togglePerm(role, flag) {
    setPerms((rows) => rows.map((row) => row.role === role ? { ...row, [flag]: !row[flag] } : row));
  }

  async function saveWorkflow() {
    setBusy(true);
    try {
      const items = gates.flatMap((gate) => gate.items.map((item) => ({
        gate: gate.key,
        key: item.key,
        role: item.role,
        supportRoles: item.supportRoles || [],
        step: Number(item.step) || 1,
      })));
      const data = await api.saveWorkflowSettings(items);
      setGates(data.gates || gates);
      toast.success("Workflow saved. Open leads use the new owners and step order.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePerms() {
    setBusy(true);
    try {
      const data = await api.saveRolePermissions(perms);
      setPerms(data.roles || perms);
      toast.success("Role permissions saved. Users pick them up when they refresh.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rm-page">
      <div className="rm-page-head">
        <div>
          <h1>Workflow &amp; role permissions</h1>
          <p>Two separate settings. Vinay and Admin always keep full access. Other people follow the role you set here.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" className={`btn btn-sm ${tab === "workflow" ? "btn-theme" : "btn-default"}`} onClick={() => setTab("workflow")}>Workflow</button>
        <button type="button" className={`btn btn-sm ${tab === "roles" ? "btn-theme" : "btn-default"}`} onClick={() => setTab("roles")}>Role permissions</button>
      </div>

      {tab === "workflow" ? (
        <div className="rm-panel">
          <div className="rm-panel__bar">
            <h2>Checklist ownership <span>choose the role and step for each item</span></h2>
            <button type="button" className="btn btn-theme btn-sm" disabled={busy} onClick={saveWorkflow}>{busy ? "Saving…" : "Save workflow"}</button>
          </div>
          {gates.map((gate) => (
            <div key={gate.key} style={{ padding: "8px 16px 18px" }}>
              <h3 style={{ fontSize: 15, margin: "12px 0" }}>{gate.name}</h3>
              <div className="table-responsive">
                <table className="table table-striped data-list-table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th>Checklist item</th>
                      <th>Owning role</th>
                      <th>Also visible to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gate.items.map((item) => (
                      <tr key={item.key}>
                        <td style={{ width: 80 }}>
                          <input
                            className="form-control"
                            type="number"
                            min={1}
                            value={item.step}
                            onChange={(e) => updateItem(gate.key, item.key, { step: Number(e.target.value) })}
                          />
                        </td>
                        <td><strong>{item.label}</strong></td>
                        <td style={{ minWidth: 180 }}>
                          <select className="form-control" value={item.role} onChange={(e) => updateItem(gate.key, item.key, { role: e.target.value, supportRoles: (item.supportRoles || []).filter((r) => r !== e.target.value) })}>
                            {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 420 }}>
                            {roles.filter((r) => r.role !== item.role && r.role !== "senior_management").map((r) => (
                              <label key={r.role} style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={(item.supportRoles || []).includes(r.role)}
                                  onChange={() => toggleSupport(gate.key, item, r.role)}
                                />
                                {r.label}
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rm-panel">
          <div className="rm-panel__bar">
            <h2>Role permissions <span>what each role can do</span></h2>
            <button type="button" className="btn btn-theme btn-sm" disabled={busy} onClick={savePerms}>{busy ? "Saving…" : "Save permissions"}</button>
          </div>
          <div className="table-responsive">
            <table className="table table-striped data-list-table">
              <thead>
                <tr>
                  <th>Role</th>
                  {PERM_COLUMNS.map(([key, label]) => <th key={key}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {perms.map((row) => (
                  <tr key={row.role}>
                    <td><strong>{row.role_label}</strong></td>
                    {PERM_COLUMNS.map(([key]) => (
                      <td key={key}>
                        <input type="checkbox" checked={!!row[key]} onChange={() => togglePerm(row.role, key)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
