// RIG ONLY – Phase 8 (18-11-2026): how long the heavy pages take with a site of 300 people and a month of attendance (made-up people
// on the local test database – never live). Seeds once per run under its own site code; prints each time; fails over 10 seconds.
//   timeout 600 node test/rig/perf.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; delete process.env.VERCEL_ENV;
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr'), D = require('../../lib/day'), R = require('../../lib/rules');
(async () => {
  const tag = 'PF' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, N = +process.env.PERF_PEOPLE || 300, LIMIT = 10000;
  const A = { site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig admin', role: 'admin', info: { sites: [{ code: site, name: 'Rig perf' }] } }, S = Object.assign({}, A, { role: 'super', email: 'super.' + tag.toLowerCase() + '@rig.test' });
  const today = R.today(), month = today.slice(0, 7), t0 = Date.now(), rows = [];
  await ACT.rulesSave(A, { week_off: [0] }).catch(() => {});
  await ACT.shiftSave(A, { name: 'General ' + tag, start_time: '09:00', end_time: '18:00', auto_out: '23:50', valid_from: '2026-01-01' });
  for (let i = 0; i < N; i++) rows.push({ code: tag + String(i).padStart(4, '0'), name: 'Perf Person ' + i, category: ['staff', 'labour', 'operator', 'driver'][i % 4], site: site, dob: '1990-01-01', joined_on: '2024-01-01', status: 'active', created_by: 'rig' });
  const emps = []; for (let i = 0; i < rows.length; i += 200) ((await db('POST', 'hr_employees', rows.slice(i, i + 200), 'return=representation')) || []).forEach(e => emps.push(e));
  const ent = []; for (let d = month + '-01'; d < today; d = D.addDays(d, 1)) emps.forEach((e, i) => { if ((i + +d.slice(8)) % 9 === 0) return; const late = i % 7 === 0 ? 25 : 0; ent.push({ employee_id: e.id, site: site, day: d, in_at: new Date(Date.parse(d + 'T09:' + String(late).padStart(2, '0') + ':00+05:30')).toISOString(), out_at: new Date(Date.parse(d + 'T18:00:00+05:30')).toISOString(), source: 'manual', reason: 'rig perf', entered_by: 'rig' }); });
  for (let i = 0; i < ent.length; i += 1000) await db('POST', 'hr_day_entries', ent.slice(i, i + 1000), 'return=minimal');
  console.log('seeded ' + emps.length + ' people, ' + ent.length + ' days in ' + (Date.now() - t0) + ' ms');
  let bad = 0; const time = async (name, fn) => { const a = Date.now(); const r = await fn(); const ms = Date.now() - a; if (ms > LIMIT) bad++; console.log((ms > LIMIT ? 'SLOW ' : 'ok   ') + name.padEnd(36) + String(ms).padStart(6) + ' ms' + (r ? '  (' + r + ')' : '')); };
  await time('Muster of the month', async () => (await ACT.muster(A, { month })).rows.length + ' rows');
  await time('Dashboard', async () => { await ACT.attDash(A); return ''; });
  await time('Report: monthly summary', async () => (await ACT.repRun(A, { key: 'att_month', month })).rows.length + ' rows');
  await time('Report: late arrivals', async () => (await ACT.repRun(A, { key: 'att_late', from: month + '-01', to: today })).rows.length + ' rows');
  await time('Report: attendance of a day', async () => (await ACT.repRun(A, { key: 'att_day', day: D.addDays(today, -1) })).rows.length + ' rows');
  await time('Leave balances', async () => (await ACT.leaveBalances(A)).rows.length + ' rows');
  await time('Employee list', async () => (await ACT.empList(A, {})).rows.length + ' rows');
  await time('AI checks', async () => (await ACT.aiChecks(S, {})).rows.length + ' rows');
  console.log(bad ? bad + ' over ' + LIMIT / 1000 + ' s' : 'all under ' + LIMIT / 1000 + ' s'); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
