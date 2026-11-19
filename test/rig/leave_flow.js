// RIG ONLY – (19-11-2026, asked with the Leave screen: "user la aplela takleli leve delet pn krta yawi … leave apply krtanaach attachment
// aswi … status disel ki leave approval kuthh prynt geley ani kona kadhun pending aahe … 1 to 10 … 5 tarkela aloy … sign in … app error
// deil … swatche leve che days kami krnecha option … wadhwayche astil tr approval … approved zali ti delet site hr ho hr super admin …
// user ni keleli changes pn diistel") THE LEAVE OF A PERSON FROM ASKING TO CHANGING, on the server against the local test database
// (never live). Made-up people only.
//   timeout 240 node test/rig/leave_flow.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr'), R = require('../../lib/rules'), D = require('../../lib/day');
(async () => {
  let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const no = async (p, re, t) => { try { await p; ok(false, t + ' (was allowed)'); } catch (e) { ok(e.status >= 400 && e.status < 500 && (!re || re.test(e.message) || re.test(e.code || '')), t + ' → ' + e.status + ' ' + e.message); return e; } };
  const tag = 'LF' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, today = R.today(), day = k => D.addDays(today, k);
  const ses = (role, email, name) => ({ site: site, email: email, name: name || 'Rig ' + role, role: role, info: { sites: [{ code: site, name: 'Rig leave ' + tag }] } });
  const A = ses('admin', 'admin.' + tag.toLowerCase() + '@rig.test', 'Rig Admin'), U = ses('user', 'user.' + tag.toLowerCase() + '@rig.test', 'Rig User'), S = ses('super', 'super.' + tag.toLowerCase() + '@rig.test', 'Rig Super');
  const H = ses('user', 'ho.' + tag.toLowerCase() + '@rig.test', 'Rig HO HR');
  const mail = k => (k + '.' + tag + '@rig.test').toLowerCase(), self = (m, nm) => ({ site: site, email: m, name: nm || 'Self', role: 'self', info: {} });
  let k = 0; const mob = () => '9' + String(Date.now()).slice(-6) + String(100 + (k++)).slice(-3);
  const boss = await ACT.empSave(A, { name: 'Flow Boss', category: 'staff', mobile: mob(), email: mail('boss'), dob: '1980-01-01', joined_on: '2026-01-01' });
  const w = await ACT.empSave(A, { name: 'Flow Worker', category: 'staff', mobile: mob(), email: mail('work'), dob: '1990-01-01', joined_on: '2026-01-01', reports_to: boss.id });
  const solo = await ACT.empSave(A, { name: 'Flow Solo', category: 'staff', mobile: mob(), email: mail('solo'), dob: '1991-01-01', joined_on: '2026-01-01' });
  const me = await ACT.empSave(A, { name: 'Rig Admin', category: 'staff', mobile: mob(), email: A.email, dob: '1985-01-01', joined_on: '2026-01-01' });      // the HR Admin is an employee too
  await ACT.leavePolicySave(S, { per_month: 4, valid_from: today.slice(0, 8) + '01', levels: 2 });
  for (const e of [w, solo, me]) await ACT.leaveAdjust(S, { id: e.id, days: 20, reason: 'opening balance' });
  const W = self(mail('work')), B = self(mail('boss'), 'Flow Boss'), O = self(mail('solo'));
  const paper = async (who, name) => {
    const body = Buffer.from('%PDF-1.4 rig ' + name + ' ' + tag), u = await ACT.myLeavePaperUrl(who, { type: 'application/pdf', bytes: body.length });
    const r = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: body, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('upload ' + r.status);
    return { path: u.path, name: name + '.pdf', bytes: body.length };
  };
  const mine = async (who, id) => (await ACT.myLeave(who)).requests.find(q => q.id === id);
  try {
    // 1. A PAPER WITH EVERY LEAVE
    await no(ACT.leaveAsk(W, { from: day(10), to: day(12), reason: 'Family function' }), /Update the app/, 'an app of before (no "files"): told to update');
    await no(ACT.leaveAsk(W, { from: day(10), to: day(12), reason: 'Family function', files: [] }), /Attach a paper/, 'no paper: the leave is not sent');
    const other = await paper(O, 'other');
    await no(ACT.leaveAsk(W, { from: day(10), to: day(12), reason: 'Family function', files: [other] }), /does not belong/, 'a paper of another person');
    await no(ACT.leaveAsk(W, { from: day(10), to: day(12), reason: 'Family function', files: [{ path: 'leave/' + w.id + '/' + 'c'.repeat(24) + '.pdf', name: 'x.pdf', bytes: 10 }] }), /did not arrive/, 'a paper that never arrived');
    ok(!(await ACT.myLeave(W)).requests.length, 'nothing was made by the refused tries');
    let m = await ACT.leaveAsk(W, { from: day(10), to: day(12), reason: 'Family function', files: [await paper(W, 'card')] }), q1 = m.requests[0];
    ok(m.paper === true && q1.files === 1 && q1.status === 'pending' && q1.level === 1, 'with its paper: asked, 1 paper, it waits');
    // 2. WHERE IT STANDS – WHO IT WAITS FOR
    ok(q1.waits && q1.waits.stage === 'verify' && q1.waits.who[0].name === 'Flow Boss' && q1.waits.text === 'Waits for verify: Flow Boss (Reporting person)', 'it says who it waits for: ' + (q1.waits || {}).text);
    ok(q1.history.length === 1 && q1.history[0].kind === 'asked' && q1.history[0].by === 'Flow Worker', 'its history: asked by him');
    ok(q1.can.delete === true && q1.can.change === true, 'he may delete it and change its days');
    // the last paper stays
    const f1 = (await ACT.myLeaveFiles(W, { request: q1.id })).files[0]; await no(ACT.myLeaveFileRemove(W, { file: f1.id }), /at least one paper/, 'his last paper is not removed');
    await ACT.teamLeaveDecide(B, { id: q1.id, decision: 'approved' }); q1 = await mine(W, q1.id);
    ok(q1.waits.stage === 'approve' && q1.waits.text === 'Waits for approval: HR office' && q1.history[1].kind === 'verified' && q1.history[1].by === 'Flow Boss', 'verified by the reporting person → waits for the HR office');
    // 3. SHORTER while it waits (from the end)
    m = await ACT.leaveChange(W, { id: q1.id, from: day(10), to: day(11) }); q1 = m.requests.find(q => q.id === q1.id);
    ok(m.changed.kind === 'shorter' && q1.days === 2 && q1.to === day(11) && q1.status === 'pending' && q1.history.slice(-1)[0].kind === 'shortened' && q1.history.slice(-1)[0].was.days === 3, 'made shorter at once (still waits): 3 → 2 days, in the history');
    await no(ACT.leaveChange(W, { id: q1.id, from: day(11), to: day(13) }), /one at a time/, 'shorter at one end and longer at the other at once');
    await no(ACT.leaveChange(B, { id: q1.id, from: day(10), to: day(10) }), /not found/, 'another person changes his leave');
    // 4. DELETED by himself while it waits
    m = await ACT.leaveCancel(W, { id: q1.id }); q1 = m.requests.find(q => q.id === q1.id);
    ok(q1.status === 'cancelled' && q1.history.slice(-1)[0].kind === 'deleted' && q1.history.slice(-1)[0].self === true && !q1.can.delete, 'deleted by himself – kept as "Deleted" with who and when');
    // 5. A LEAVE FROM TODAY, waiting: the app is told; no IN (with what to do)
    m = await ACT.leaveAsk(O, { from: today, to: day(4), reason: 'Back home', files: [await paper(O, 'ticket')] }); let q2 = m.requests[0];
    ok(q2.level === 2 && q2.waits.text === 'Waits for approval: HR office', 'nobody above him: it waits for the HR office');
    const att0 = await ACT.myAttend(O, {}); ok(att0.leave && att0.leave.id === q2.id && att0.leave.status === 'pending', 'the app is told: today is a day of his leave (waiting)');
    const P = { client_id: 'rigleave' + tag.toLowerCase() + 'aaaaaaaa', kind: 'in', lat: 18.52, lng: 73.85, accuracy_m: 10, device: { id: 'rig-device-' + tag, model: 'Rig', os: 'rig' } };
    let e = await no(ACT.punch(O, P), /on leave today/, 'IN on a waiting leave day is refused');
    ok(e && e.code === 'onleave' && e.extra && e.extra.leave.id === q2.id && /open Leave, change the days of this leave, then mark IN/.test(e.message), 'with its code, the leave and what to do: ' + (e && e.message));
    await ACT.leaveDecide(A, { id: q2.id, decision: 'approved', note: 'ok' }); q2 = await mine(O, q2.id);
    ok(q2.status === 'approved' && !q2.waits && q2.history.slice(-1)[0].kind === 'approved' && q2.history.slice(-1)[0].by === 'Rig Admin', 'approved – in the history, with who');
    await no(ACT.punch(O, P), /on leave today/, 'IN on an approved leave day is refused too');
    await no(ACT.leaveCancel(O, { id: q2.id }), /deleted by the HR office/, 'an approved leave is not deleted by himself');
    // he came today: the leave starts tomorrow – saved at once, approved stays approved, IN is no longer refused for leave
    m = await ACT.leaveChange(O, { id: q2.id, from: day(1), to: day(4) }); q2 = m.requests.find(q => q.id === q2.id);
    ok(m.changed.kind === 'shorter' && q2.status === 'approved' && q2.from === day(1) && q2.days === 4, 'shorter at once: ' + q2.from + ' – ' + q2.to + ', still approved');
    ok(!(await ACT.myAttend(O, {})).leave, 'today is no leave day any more');
    e = await no(ACT.punch(O, P), null, 'IN goes past the leave check now'); ok(e && e.code !== 'onleave', 'stopped only by what is next (' + (e && e.code) + ': no work place on the rig)');
    // 6. "1 TO 10, BACK ON THE 5TH": an approved leave begun before today – it ends yesterday at the earliest; a day gone stays
    const q3 = (await db('POST', 'hr_leave_requests', [{ employee_id: w.id, site: site, from_day: day(-3), to_day: day(3), part: 'full', days: 7, reason: 'Native place', status: 'approved', level: 2, asked_by: mail('work'), decided_at: new Date().toISOString(), steps: [{ level: 2, by: A.email, name: 'Rig Admin', decision: 'approved', note: '', at: new Date().toISOString() }] }], 'return=representation'))[0];
    await no(ACT.leaveChange(W, { id: q3.id, from: day(-3), to: day(-2) }), /day gone/, 'ending before yesterday – a day gone');
    await no(ACT.leaveChange(W, { id: q3.id, from: day(-2), to: day(3) }), /day gone/, 'taking off its first day (gone)');
    m = await ACT.leaveChange(W, { id: q3.id, from: day(-3), to: day(-1) }); let r3 = m.requests.find(q => q.id === q3.id);
    ok(r3.status === 'approved' && r3.to === day(-1) && r3.days === 3 && m.changed.less === 4, 'ends yesterday: 7 → 3 days, still approved');
    ok(!(await ACT.myAttend(W, {})).leave, 'he marks IN today');
    ok(!r3.can.change && !r3.can.delete, 'over now: nothing more to change by himself');
    // 7. LONGER: the extra days are a new request; the approved days stay approved
    m = await ACT.leaveAsk(O, { from: day(20), to: day(21), reason: 'Wedding', files: [await paper(O, 'card2')] }); let q4 = m.requests[0];
    await ACT.leaveDecide(A, { id: q4.id, decision: 'approved', note: '' });
    await no(ACT.leaveChange(O, { id: q4.id, from: day(20), to: day(23), reason: 'Wedding – two days more', files: [] }), /Attach a paper/, 'longer: the extra days need a paper too');
    await no(ACT.leaveChange(O, { id: q4.id, from: day(20), to: day(23), files: [await paper(O, 'x1')] }), /Reason/, 'longer: the reason of the extra days');
    m = await ACT.leaveChange(O, { id: q4.id, from: day(20), to: day(23), reason: 'Wedding – two days more', files: [await paper(O, 'card3')] });
    const ext = m.requests.find(q => q.id === m.changed.request); q4 = m.requests.find(q => q.id === q4.id);
    ok(m.changed.kind === 'longer' && q4.status === 'approved' && q4.to === day(21) && q4.history.slice(-1)[0].kind === 'extended' && q4.history.slice(-1)[0].request === ext.id, 'the approved days stay approved – its history names the new request');
    ok(ext.status === 'pending' && ext.from === day(22) && ext.to === day(23) && ext.days === 2 && ext.history[0].kind === 'extension' && ext.history[0].of === q4.id && ext.files === 1, 'the 2 extra days: a new request that waits, with its paper');
    // 8. THE HR OFFICE: an HR User sees, never changes; the HR Admin (with the power), the HO HR, the Super Admin change and delete
    let l = await ACT.leaveList(U, { status: 'all' }); ok(l.editor === false && l.rows.length >= 5 && l.rows.every(r => r.edit === false && Array.isArray(r.history)), 'an HR User: every request with its history, no change');
    await no(ACT.leaveEdit(U, { id: q4.id, from: day(20), to: day(22), reason: 'try' }), /Only the HR Admin of the site, the HO HR or the Super Admin/, 'an HR User changes a leave');
    await no(ACT.leaveRemove(U, { id: q4.id, reason: 'try it' }), /Only the HR Admin of the site, the HO HR or the Super Admin/, 'an HR User deletes a leave');
    l = await ACT.leaveList(A, { status: 'all' }); ok(l.editor === true && l.rows.find(r => r.id === q4.id).edit === true, 'the HR Admin may change');
    await no(ACT.leaveEdit(A, { id: q4.id, from: day(20), to: day(22) }), /Reason/, 'a change without the reason');
    await ACT.leaveEdit(A, { id: q4.id, from: day(19), to: day(21), reason: 'Starts a day early – told by phone' }); q4 = await mine(O, q4.id);
    const ed = q4.history.slice(-1)[0];
    ok(q4.status === 'approved' && q4.from === day(19) && q4.days === 3 && ed.kind === 'edited' && ed.by === 'Rig Admin' && ed.note === 'Starts a day early – told by phone' && ed.was.from === day(20), 'changed by the HR office: he sees it in his history, with the reason');
    await no(ACT.leaveEdit(A, { id: q4.id, from: day(19), to: day(22), reason: 'overlap' }), /on these days already/, 'a change onto his other request');
    // the HR Admin's own leave: another person decides
    m = await ACT.leaveAsk(self(A.email), { from: day(30), to: day(30), reason: 'Own work', files: [await paper(self(A.email), 'own')] }); const q5 = m.requests[0];
    await no(ACT.leaveRemove(A, { id: q5.id, reason: 'my own' }), /yourself/, 'his own leave: not by himself');
    // the HO HR (an HR User on the HO HR list) may; the power off: the HR Admin may not
    await db('POST', 'hr_ho_hr?on_conflict=email', [{ email: H.email, active: true, given_by: S.email }], 'resolution=merge-duplicates,return=minimal');
    await ACT.leaveRemove(H, { id: q5.id, reason: 'Asked by mistake' }); const r5 = await mine(self(A.email), q5.id);
    ok(r5.status === 'cancelled' && r5.history.slice(-1)[0].kind === 'deleted' && r5.history.slice(-1)[0].note === 'Asked by mistake' && r5.history.slice(-1)[0].self === false, 'the HO HR deletes it – kept as "Deleted" with the reason');
    await ACT.powerSet(S, { power: 'regularize', allowed: false });
    await no(ACT.leaveRemove(A, { id: ext.id, reason: 'try it' }), /this power/, 'the HR Admin without the power "Decide requests"');
    await ACT.powerSet(S, { power: 'regularize', allowed: true });
    await ACT.leaveRemove(S, { id: q4.id, reason: 'The wedding is called off' }); q4 = await mine(O, q4.id);
    ok(q4.status === 'cancelled' && q4.history.slice(-1)[0].by === 'Rig Super', 'the Super Admin deletes an approved leave');
    await no(ACT.leaveEdit(S, { id: q4.id, from: day(19), to: day(20), reason: 'again' }), /waits or is approved/, 'a deleted leave is not changed');
    l = await ACT.leaveList(A, { status: 'cancelled' }); ok(l.rows.some(r => r.id === q4.id) && l.rows.some(r => r.id === q1.id), 'the deleted ones: in "Deleted"');
    // 9. MANY AT ONCE (ticked on the Leave page): one reason; one that cannot go is left as it is, with why
    const many = [];
    for (const k2 of [40, 42, 44]) { m = await ACT.leaveAsk(O, { from: day(k2), to: day(k2), reason: 'Many ' + k2, files: [await paper(O, 'm' + k2)] }); many.push(m.requests[0].id); }
    await no(ACT.leaveRemoveMany(U, { ids: many, reason: 'try it' }), /Only the HR Admin/, 'an HR User deletes many');
    await no(ACT.leaveRemoveMany(A, { ids: many }), /Reason/, 'many without the reason');
    await no(ACT.leaveRemoveMany(A, { ids: [], reason: 'nothing' }), /Tick/, 'nothing ticked');
    const rm = await ACT.leaveRemoveMany(A, { ids: many.concat([q5.id, 99999999]), reason: 'Season closed' });
    ok(rm.done.length === 3 && rm.skipped.length === 2 && rm.skipped.some(k2 => k2.id === q5.id) && rm.skipped.some(k2 => k2.id === 99999999 && /not found/.test(k2.why)), 'three deleted at once; his own and an unknown one left with why: ' + rm.skipped.map(k2 => k2.why).join(' | '));
    const after = (await ACT.myLeave(O)).requests.filter(q => many.indexOf(q.id) > -1);
    ok(after.length === 3 && after.every(q => q.status === 'cancelled' && q.history.slice(-1)[0].note === 'Season closed'), 'each kept as "Deleted" with the one reason');
    // 10. THE LEAVE POLICY IN ONE PLACE: the Rule Book shows the site's policy of before; a day added by hand still works
    const rb = await ACT.rbList(A); ok(!rb.ready || (rb.old && rb.old.leave && rb.old.leave.per_month === 4 && rb.old.leave.levels === 2), 'the Rule Book shows the leave policy of before: ' + JSON.stringify(rb.old && rb.old.leave));
    // 11. THE WHOLE BALANCE TAKEN OFF for the ticked people (it came by mistake): 0, kept in the record; his own – not by himself
    await no(ACT.leaveZero(U, { ids: [w.id], reason: 'came by mistake' }), /Only the HR Admin/, 'an HR User makes a balance 0');
    await no(ACT.leaveZero(A, { ids: [w.id] }), /Reason/, 'without the reason');
    const b0 = await ACT.leaveBalances(A), bw = b0.rows.find(r => r.id === w.id).balance;
    const z = await ACT.leaveZero(A, { ids: [w.id, solo.id, me.id, boss.id], reason: 'The balance came by mistake' });
    ok(z.zeroed.length === 3 && z.zeroed.some(d => d.id === w.id && d.days === bw) && z.skipped.length === 1 && z.skipped[0].id === me.id && /about you/.test(z.skipped[0].why), 'three made 0 – his own left as it is: ' + z.skipped.map(k2 => k2.why).join(' | '));
    const z2 = await ACT.leaveZero(A, { ids: [w.id], reason: 'again' }); ok(!z2.zeroed.length && /Nothing to take off/.test(z2.skipped[0].why), 'a balance of 0: nothing to take off');
    ok(z.rows.find(r => r.id === w.id).balance === 0 && z.rows.find(r => r.id === solo.id).balance === 0 && (await ACT.myLeave(W)).balance === 0, 'the balance reads 0 – on the list and in his own app');
    const adj = (await db('GET', 'hr_leave_adjust?select=days,reason,entered_by&employee_id=eq.' + w.id + '&order=id.desc&limit=1'))[0];
    ok(+adj.days === -bw && adj.reason === 'The balance came by mistake' && adj.entered_by === A.email, 'kept in the record: −' + bw + ', the reason, who');
    const au = ((await db('GET', 'hr_audit?select=action&site=eq.' + site + '&limit=200')) || []).map(a => a.action);
    ok(['Leave made shorter', 'Leave made longer – the extra days asked', 'Leave changed by the HR office', 'Leave deleted by the HR office', 'Leave request deleted by the person', 'Leaves deleted at once by the HR office', 'Leave balance taken off (made 0)'].every(a => au.indexOf(a) > -1), 'every change is in the audit');
  } catch (x) { console.log('ERR', x.message); bad++; }
  console.log((n - bad) + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
})();
