import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authApi } from "../api/client.js";
import { useAuth } from "../api/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { Box, Field } from "../components/ui.jsx";

export default function Account() {
  const { user, refreshUser, displayName, roleLabel } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const forced = params.get("forced") === "1";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (newPassword !== confirm) { toast.error("New passwords do not match"); return; }
    setBusy(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success("Password updated");
      setCurrentPassword(""); setNewPassword(""); setConfirm("");
      await refreshUser();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rm-page" style={{ maxWidth: 560 }}>
      <div className="rm-page-head">
        <div>
          <h1>Account</h1>
          <p>{displayName} · {roleLabel}</p>
        </div>
      </div>

      {forced || user?.must_change_password ? (
        <div className="rm-summary-row" style={{ background: "#fff7ed", border: "1px solid #ea580c", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <div>
            <b style={{ display: "block" }}>Please set your own password</b>
            <span>Your account is still using a password Senior Management set for you.</span>
          </div>
        </div>
      ) : null}

      <Box title="Change password">
        <form onSubmit={submit}>
          <Field label="Current password" required>
            <input className="form-control" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <Field label="New password" required hint="At least 8 characters.">
            <input className="form-control" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" required>
            <input className="form-control" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-theme" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
          </div>
        </form>
      </Box>
    </div>
  );
}
