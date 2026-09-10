import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../api/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { Box } from "../components/ui.jsx";
import LeadForm from "../components/LeadForm.jsx";

export default function AddLead() {
  const { role, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const allowed = role === "business_development" || isAdmin;

  async function create(form) {
    setBusy(true);
    try {
      const lead = await api.createLead(form);
      toast.success(`${lead.ref_code} created — Stage 1 RFI is now open.`);
      navigate(`/leads/${lead.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="rm-page">
        <Box title="New lead"><p>Only Business Development or Senior Management can create a new lead.</p></Box>
      </div>
    );
  }

  return (
    <div className="rm-page">
      <Box title="New lead" tools={<span className="text-muted">Opens Stage 1 — RFI with all 9 items ready</span>}>
        <LeadForm onSubmit={create} busy={busy} />
      </Box>
    </div>
  );
}
