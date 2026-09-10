import { getApiBase } from "./baseUrl.js";

const TOKEN_KEY = "kavis_npi_token";

export function token() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function request(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (options.json !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data.messages) ? data.messages.join(", ") : data.messages || data.message || res.statusText;
    throw new Error(String(msg));
  }
  return data;
}

export const authApi = {
  login: (username, password) => request("/login", { method: "POST", json: { username, password } }),
  me: () => request("/user"),
  logout: () => request("/logout", { method: "POST" }).catch(() => undefined),
  changePassword: (currentPassword, newPassword) =>
    request("/password/change", { method: "POST", json: { currentPassword, newPassword } }),
};

export const api = {
  // dashboard
  pending: () => request("/dashboard/pending"),
  kpis: () => request("/dashboard/kpis"),
  actionLog: () => request("/dashboard/action-log"),
  notifications: () => request("/dashboard/notifications"),

  // leads
  leads: () => request("/leads"),
  lead: (id) => request(`/leads/${id}`),
  createLead: (body) => request("/leads", { method: "POST", json: body }),
  patchLead: (id, body) => request(`/leads/${id}`, { method: "PATCH", json: body }),
  holdLead: (id, reason) => request(`/leads/${id}/hold`, { method: "POST", json: { reason } }),
  resumeLead: (id) => request(`/leads/${id}/resume`, { method: "POST", json: {} }),
  dropLead: (id, reason) => request(`/leads/${id}/drop`, { method: "POST", json: { reason } }),
  moveLead: (id, gate) => request(`/leads/${id}/move`, { method: "POST", json: { gate } }),
  approveGate: (id, gate, comments) => request(`/leads/${id}/gates/${gate}/approve`, { method: "POST", json: { comments } }),
  rejectLead: (id, targetGate, reason) => request(`/leads/${id}/reject`, { method: "POST", json: { targetGate, reason } }),
  history: (id) => request(`/leads/${id}/history`),

  // items — multipart (remarks, docRequired, file) since a document may be attached
  submitItem: (leadId, gate, key, formData) =>
    request(`/leads/${leadId}/gates/${gate}/items/${key}/submit`, { method: "POST", body: formData }),
  approveItem: (leadId, gate, key, comments) =>
    request(`/leads/${leadId}/gates/${gate}/items/${key}/approve`, { method: "POST", json: { comments } }),

  // users (admin)
  users: () => request("/users"),
  roles: () => request("/users/roles"),
  createUser: (body) => request("/users", { method: "POST", json: body }),
  patchUser: (id, body) => request(`/users/${id}`, { method: "PATCH", json: body }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),
};

// A plain <a href> can't carry an Authorization header, and the download
// route deliberately isn't a static file server (documents are confidential),
// so downloads go through fetch + a blob URL instead of a bare link.
export async function downloadDocument(docId, filename) {
  const res = await fetch(`${getApiBase()}/documents/${docId}/download`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error("Could not download this document");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
