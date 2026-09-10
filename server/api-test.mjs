const BASE = 'http://localhost:4300/api/v1';
let failures = 0;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok  -', msg);
}

async function login(username, password = 'Kavis@123') {
  const r = await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const data = await r.json();
  if (!r.ok) throw new Error(`login failed for ${username}: ${JSON.stringify(data)}`);
  return data.token;
}

async function api(token, method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload = body;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data };
}

async function submitForm(token, path, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data };
}

(async () => {
  // --- login as every role works ---
  const tokens = {};
  for (const u of ['bd.vinay', 'safety.ananya', 'mfg.suresh', 'analytical.priya', 'quality.karthik', 'costing.deepa', 'regulatory.farah', 'legal.advait', 'supplychain.rohan', 'rd.meera', 'engineering.arjun', 'sr.rajesh', 'client.meridian', 'client.solara']) {
    tokens[u] = await login(u);
  }
  assert(Object.values(tokens).every(Boolean), 'all 14 seeded users can log in');

  const bad = await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'bd.vinay', password: 'wrong' }) });
  assert(bad.status === 401, 'wrong password is rejected with 401');

  // --- unauthenticated request is rejected ---
  const noAuth = await fetch(`${BASE}/leads`);
  assert(noAuth.status === 401, 'unauthenticated request to /leads is rejected');

  // --- list leads: internal role sees all 7, client sees only its own ---
  const allLeads = await api(tokens['bd.vinay'], 'GET', '/leads');
  assert(allLeads.data.rows.length === 7, `BD sees all 7 leads (got ${allLeads.data.rows.length})`);
  const meridianLeads = await api(tokens['client.meridian'], 'GET', '/leads');
  assert(meridianLeads.data.rows.length === 2 && meridianLeads.data.rows.every(l => l.clientName === 'Meridian Health'), 'client.meridian only sees its own 2 leads');

  // roles without a company-matched seeded client user fall back to Senior Management,
  // which (like every admin action) is authorized to act on any item regardless of role/company.
  const ROLE_TOKEN = {
    business_development: tokens['bd.vinay'], safety: tokens['safety.ananya'], manufacturing: tokens['mfg.suresh'],
    analytical: tokens['analytical.priya'], quality: tokens['quality.karthik'], costing: tokens['costing.deepa'],
    regulatory: tokens['regulatory.farah'], legal: tokens['legal.advait'], supply_chain: tokens['supplychain.rohan'],
    rd: tokens['rd.meera'], engineering: tokens['engineering.arjun'], client: tokens['sr.rajesh'],
  };

  // --- create a brand-new lead as BD ---
  const created = await api(tokens['bd.vinay'], 'POST', '/leads', {
    product: 'Ibuprofen Oral Suspension', strength: '100 mg/5 mL', dosageForm: 'Suspension',
    clientName: 'Test Client Co', clientCountry: 'Ghana', priority: 'Standard',
  });
  assert(created.status === 201, 'BD can create a new lead');
  const leadId = created.data.id;
  assert(created.data.current_gate === 'rfi' && created.data.status === 'active', 'new lead starts at RFI, active');
  assert(created.data.gates[0].items.length === 1 && created.data.gates[0].items[0].key === 'cda', 'RFI reveals only step 1 (CDA) — the other 8 steps stay hidden until reached');
  assert(created.data.gates[0].currentStep === 1 && created.data.gates[0].totalSteps === 9, 'RFI gate reports step 1 of 9');
  assert(created.data.gates[1].isLocked === true, 'RFP gate is locked until RFI gate-approves');
  assert(created.data.gates[0].items[0].activatedAt, 'step 1 activates its TAT clock immediately on lead creation');

  // --- non-owning role cannot submit someone else's item ---
  const wrongRole = await api(tokens['legal.advait'], 'POST', `/leads/${leadId}/gates/rfi/items/cda/submit`, { remarks: 'nope' });
  assert(wrongRole.status === 403, 'Legal cannot submit a Business Development item (403)');

  // --- submit with mandatory doc missing is blocked ---
  const noDoc = await api(tokens['bd.vinay'], 'POST', `/leads/${leadId}/gates/rfi/items/cda/submit`, { remarks: 'CDA sent' });
  assert(noDoc.status === 400 && /document is required/i.test(noDoc.data.messages?.[0] || ''), 'submit blocked when mandatory doc missing');

  // --- submit with multipart file succeeds ---
  {
    const r = await submitForm(tokens['bd.vinay'], `/leads/${leadId}/gates/rfi/items/cda/submit`, { remarks: 'CDA countersigned by client.', file: new Blob(['dummy pdf bytes'], { type: 'application/pdf' }) });
    assert(r.ok, 'submit with file attached succeeds');
    const cdaItem = r.data.gates[0].items.find(i => i.key === 'cda');
    assert(cdaItem.status === 'submitted' && cdaItem.documents.length === 1, 'cda item is submitted with 1 document version');
  }

  // --- a later step cannot be actioned before the step ahead of it is reached ---
  const skipAhead = await api(tokens['mfg.suresh'], 'POST', `/leads/${leadId}/gates/rfi/items/route_admin/submit`, { remarks: 'jumping ahead' });
  assert(skipAhead.status === 400, 'a step-3 item cannot be submitted while step 1 is still open (not reached yet)');

  // --- non-admin cannot approve ---
  const nonAdminApprove = await api(tokens['bd.vinay'], 'POST', `/leads/${leadId}/gates/rfi/items/cda/approve`, { comments: 'ok' });
  assert(nonAdminApprove.status === 403, 'non-Senior-Management cannot approve an item (403)');

  // --- Senior Management approves it — this should reveal step 2 ---
  const approved = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/gates/rfi/items/cda/approve`, { comments: 'Verified against signed copy.' });
  assert(approved.ok && approved.data.gates[0].items.find(i => i.key === 'cda').status === 'approved', 'Senior Management approves the item');
  assert(approved.data.gates[0].currentStep === 2, 'approving step 1 advances the gate to step 2');
  assert(approved.data.gates[0].items.map(i => i.key).join(',') === 'cda,composition', 'step 2 (composition) is now visible, alongside the completed step 1');

  // --- gate cannot be approved until every mandatory item is approved ---
  const earlyGate = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/gates/rfi/approve`, {});
  assert(earlyGate.status === 400, 'gate approval blocked while other mandatory items remain (400)');

  /** Submits + approves every currently-visible, not-yet-approved item in one gate, advancing step by step. */
  async function completeGate(leadId, gateKey, suffix = '') {
    for (let guard = 0; guard < 40; guard++) {
      const lead = (await api(tokens['sr.rajesh'], 'GET', `/leads/${leadId}`)).data;
      const gate = lead.gates.find(g => g.key === gateKey);
      if (gate.allMandatoryApproved) return lead;
      const todo = gate.items.filter(i => i.status !== 'approved' && i.status !== 'not_applicable');
      if (!todo.length) return lead; // nothing actionable left visible but not yet all approved — caller will see allMandatoryApproved is false
      for (const item of todo) {
        const token = ROLE_TOKEN[item.role];
        if (item.status !== 'submitted') {
          if (item.docRequiredActual) {
            await submitForm(token, `/leads/${leadId}/gates/${gateKey}/items/${item.key}/submit`, { remarks: `${item.key} provided${suffix}.`, file: new Blob(['dummy'], { type: 'application/pdf' }) });
          } else {
            await api(token, 'POST', `/leads/${leadId}/gates/${gateKey}/items/${item.key}/submit`, { remarks: `${item.key} provided${suffix}.` });
          }
        }
        await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/gates/${gateKey}/items/${item.key}/approve`, { comments: 'ok' });
      }
    }
    throw new Error(`completeGate(${gateKey}) did not converge`);
  }

  // --- finish RFI (steps 2 through 9 — safety_info at step 8 is conditional and auto-skipped since this lead isn't a potent molecule) ---
  const afterAll = await completeGate(leadId, 'rfi');
  const rfiGate = afterAll.gates[0];
  assert(rfiGate.items.filter(i => i.status !== 'not_applicable').every(i => i.status === 'approved'), 'all applicable RFI items now approved');
  assert(rfiGate.items.find(i => i.key === 'safety_info').status === 'not_applicable', 'safety_info (conditional, step 8) correctly not_applicable — not potent');
  assert(rfiGate.allMandatoryApproved, 'RFI gate reports all mandatory items approved');

  // --- now the gate can be approved, and it advances the lead to RFP ---
  const gateApproved = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/gates/rfi/approve`, { comments: 'RFI gate clear.' });
  assert(gateApproved.ok && gateApproved.data.current_gate === 'rfp', 'RFI gate-approval advances lead to RFP');
  assert(gateApproved.data.gates[1].isLocked === false, 'RFP gate is now unlocked');
  assert(gateApproved.data.gates[1].items.length === 1 && gateApproved.data.gates[1].items[0].key === 'sow', 'RFP reveals only step 1 (Scope of Work) — the 9-item parallel step 2 batch stays hidden');

  // --- submit (but don't approve) the RFP step-1 item, so we can verify a reject-to-RFI correctly strands it ---
  await submitForm(tokens['bd.vinay'], `/leads/${leadId}/gates/rfp/items/sow/submit`, { remarks: 'Scope of work agreed with client procurement.', file: new Blob(['dummy'], { type: 'application/pdf' }) });
  const beforeReject = await api(tokens['sr.rajesh'], 'GET', '/dashboard/pending');
  assert(beforeReject.data.itemsAwaitingApproval.some(i => i.leadId === leadId && i.itemKey === 'sow'), 'submitted RFP item appears in the approval queue while RFP is the current gate');

  // --- non-admin cannot reject ---
  const nonAdminReject = await api(tokens['bd.vinay'], 'POST', `/leads/${leadId}/reject`, { targetGate: 'rfi', reason: 'x' });
  assert(nonAdminReject.status === 403, 'non-admin cannot reject/revise a stage');

  // --- reject without a reason or target gate is rejected ---
  const rejectNoReason = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/reject`, { targetGate: 'rfi' });
  assert(rejectNoReason.status === 400, 'reject without a reason is rejected');
  const rejectBadGate = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/reject`, { targetGate: 'agreement', reason: 'x' });
  assert(rejectBadGate.status === 400, 'cannot reject forward to a gate beyond the current one');

  // --- Senior Management rejects, choosing to revise back to RFI; should reopen the RFI gate ---
  const rejected = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/reject`, { targetGate: 'rfi', reason: 'Client re-issued the CDA under a new legal entity name.' });
  assert(rejected.ok, 'reject with a valid target gate and reason succeeds');
  assert(rejected.data.current_gate === 'rfi', 'lead pointer reverted to the chosen stage (RFI)');
  assert(rejected.data.gates[0].currentStep === 1, 'RFI gate correctly recomputes back to step 1');
  assert(rejected.data.gates[0].items.find(i => i.key === 'cda').status === 'sent_back', 'cda item (previously approved) is now sent_back');
  assert(rejected.data.gates[0].items.every(i => i.status !== 'approved'), 'every approved RFI item was reopened, not just one');
  assert(rejected.data.gates[0].gateApproval === null, 'the superseded RFI gate-approval no longer shows as active');
  assert(rejected.data.status === 'active', 'lead status is active again (was not completed/dropped)');

  // --- the stranded RFP "sow" item (submitted, never approved, now in a locked gate) must drop out of the queue ---
  const afterReject = await api(tokens['sr.rajesh'], 'GET', '/dashboard/pending');
  assert(!afterReject.data.itemsAwaitingApproval.some(i => i.leadId === leadId && i.itemKey === 'sow'), 'stranded submitted item in the now-locked RFP gate is hidden from the approval queue');
  const approveLockedGate = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/gates/rfp/items/sow/approve`, { comments: 'should be blocked' });
  assert(approveLockedGate.status === 400, 'approving an item in a non-current (locked) gate is blocked');

  // --- re-complete RFI, then RFP, then Agreement, restoring forward progress and exercising every parallel step batch ---
  await completeGate(leadId, 'rfi', '-v2');
  const regateApproved = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/gates/rfi/approve`, { comments: 'Re-cleared after reject.' });
  assert(regateApproved.ok && regateApproved.data.current_gate === 'rfp', 'RFI gate re-approved and lead is back on RFP');

  const rfpDone = await completeGate(leadId, 'rfp');
  assert(rfpDone.gates[1].allMandatoryApproved, 'RFP fully completed, including the 9-item parallel step 2 batch and the 2-item step 4 batch');
  const rfpGateApproved = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/gates/rfp/approve`, { comments: 'RFP clear.' });
  assert(rfpGateApproved.ok && rfpGateApproved.data.current_gate === 'agreement', 'RFP gate-approval advances the lead to Agreement');
  assert(rfpGateApproved.data.gates[2].items.length === 1 && rfpGateApproved.data.gates[2].items[0].key === 'loi_msa_qta', 'Agreement reveals only step 1 (LOI/MSA/QTA) — the 17-item parallel step 2 batch stays hidden');

  const agreementDone = await completeGate(leadId, 'agreement');
  assert(agreementDone.gates[2].allMandatoryApproved, 'Agreement fully completed, including its 17-item parallel step 2 batch');
  const agreementGateApproved = await api(tokens['sr.rajesh'], 'POST', `/leads/${leadId}/gates/agreement/approve`, { comments: 'Agreement executed.' });
  assert(agreementGateApproved.ok && agreementGateApproved.data.status === 'completed', 'Agreement gate-approval completes the lead (all 3 gates done)');

  // --- history retained everything (created, submits, approvals, reject, re-approvals across all 3 gates) ---
  const hist = await api(tokens['bd.vinay'], 'GET', `/leads/${leadId}/history`);
  assert(hist.data.length >= 30, `full audit history retained across the whole lifecycle (${hist.data.length} entries)`);

  // --- client-role view is restricted to stage-level; internal department items are hidden from them ---
  {
    const clientUser = await api(tokens['sr.rajesh'], 'POST', '/users', { username: 'test.clientco', full_name: 'Test Client Co Contact', role: 'client', client_company: 'Test Client Co', password: 'ClientPass123' });
    assert(clientUser.status === 201, 'admin can create a client-scoped user for the test lead\'s own company');
    const clientToken = await login('test.clientco', 'ClientPass123');
    const asClient = await api(clientToken, 'GET', `/leads/${leadId}`);
    assert(asClient.ok, 'the matching client user can view its own lead');
    for (const g of asClient.data.gates) {
      assert(g.items.every(i => i.role === 'client'), `client view of ${g.key} only ever includes items owned by the client role (internal department items hidden)`);
    }
  }

  // --- notifications: TAT-overdue items are surfaced, scoped by role ---
  {
    // Drop a fresh lead purely to inspect a just-created, not-yet-overdue notification-eligible item
    const freshLead = await api(tokens['bd.vinay'], 'POST', '/leads', { product: 'Notification Test Product', clientName: 'Notify Co' });
    const freshNotifs = await api(tokens['bd.vinay'], 'GET', '/dashboard/notifications');
    assert(Array.isArray(freshNotifs.data), 'notifications endpoint returns an array');
    assert(!freshNotifs.data.some(n => n.leadId === freshLead.data.id), 'a lead created moments ago is not yet overdue (TAT=2 days on CDA)');
    const adminNotifs = await api(tokens['sr.rajesh'], 'GET', '/dashboard/notifications');
    assert(Array.isArray(adminNotifs.data), 'Senior Management also gets a notifications feed (broader scope)');
  }

  // --- drop flow ---
  const dropLead = await api(tokens['bd.vinay'], 'POST', '/leads', { product: 'Drop Test Product', clientName: 'Drop Test Client' });
  const dropNoReason = await api(tokens['bd.vinay'], 'POST', `/leads/${dropLead.data.id}/drop`, {});
  assert(dropNoReason.status === 400, 'drop without a reason is rejected');
  const dropped = await api(tokens['bd.vinay'], 'POST', `/leads/${dropLead.data.id}/drop`, { reason: 'Client went with a competitor.' });
  assert(dropped.ok && dropped.data.status === 'dropped', 'drop with reason succeeds');
  const submitAfterDrop = await api(tokens['bd.vinay'], 'POST', `/leads/${dropLead.data.id}/gates/rfi/items/cda/submit`, { remarks: 'x' });
  assert(submitAfterDrop.status === 400, 'cannot submit on a dropped lead');

  // --- hold / resume (admin only) — leadId is 'completed' by now, so use a fresh active lead ---
  const holdLead = await api(tokens['bd.vinay'], 'POST', '/leads', { product: 'Hold Test Product', clientName: 'Hold Test Client' });
  const holdByNonAdmin = await api(tokens['bd.vinay'], 'POST', `/leads/${holdLead.data.id}/hold`, { reason: 'x' });
  assert(holdByNonAdmin.status === 403, 'non-admin cannot place a lead on hold');
  const held = await api(tokens['sr.rajesh'], 'POST', `/leads/${holdLead.data.id}/hold`, { reason: 'Pausing for budget review.' });
  assert(held.ok && held.data.status === 'on_hold', 'admin can place an active lead on hold');
  const resumed = await api(tokens['sr.rajesh'], 'POST', `/leads/${holdLead.data.id}/resume`, {});
  assert(resumed.ok && resumed.data.status === 'active', 'admin can resume a held lead');

  // --- admin: create a user, then log in as them ---
  const newUser = await api(tokens['sr.rajesh'], 'POST', '/users', { username: 'test.newhire', full_name: 'Test Newhire', role: 'quality', password: 'TempPass123' });
  assert(newUser.status === 201, 'admin can create a new user account');
  const newUserToken = await login('test.newhire', 'TempPass123');
  assert(!!newUserToken, 'newly created user can log in with the password Admin set');
  const nonAdminCreate = await api(tokens['bd.vinay'], 'POST', '/users', { username: 'x', full_name: 'x', role: 'quality', password: 'TempPass123' });
  assert(nonAdminCreate.status === 403, 'non-admin cannot create users');

  // --- dashboard: pending queues are role-scoped ---
  const bdPending = await api(tokens['bd.vinay'], 'GET', '/dashboard/pending');
  assert(Array.isArray(bdPending.data.itemsToAction), 'BD pending dashboard returns itemsToAction');
  const srPending = await api(tokens['sr.rajesh'], 'GET', '/dashboard/pending');
  assert(Array.isArray(srPending.data.itemsAwaitingApproval) && Array.isArray(srPending.data.gatesAwaitingApproval), 'Senior Management pending dashboard returns approval queues');

  // --- document download is access-controlled ---
  {
    const finalLead = await api(tokens['bd.vinay'], 'GET', `/leads/${leadId}`);
    const doc = finalLead.data.gates[0].items.find(i => i.key === 'cda').documents[0];
    if (doc) {
      const asOwner = await fetch(`${BASE}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${tokens['bd.vinay']}` } });
      assert(asOwner.ok, 'BD can download a document on a lead it can see');
      const asOtherClient = await fetch(`${BASE}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${tokens['client.solara']}` } });
      assert(asOtherClient.status === 403, "client.solara cannot download a document from a lead that isn't theirs");
    }
  }

  console.log(failures ? `\n=== ${failures} CHECK(S) FAILED ===` : '\n=== ALL CHECKS PASSED ===');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
