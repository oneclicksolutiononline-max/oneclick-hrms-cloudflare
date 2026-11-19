// RIG ONLY – Phase 8 (18-11-2026): a sweep of EVERY action of api/hr.js through the real door (HTTP, a local server on :3069, the local
// test database – never live): no sign-in → 401; a request not from the HR page → 403; an employee ("My HR") → 403 for every office
// action; an unknown action → 400; GET → 405. Prints how long the door takes.
//   timeout 300 node test/rig/security_sweep.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const crypto = require('crypto'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT, SELF } = require('../../api/hr');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'SW' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig sweep', role: 'admin' }], URL0 = 'http://127.0.0.1:3069';
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3069' }), stdio: 'ignore' });
  const sign = async role => { const t = crypto.randomBytes(32).toString('base64url');
    await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig sweep', mods: [] } }], 'return=minimal'); return t; };
  const call = async (action, cookie, hdr) => { const r = await fetch(URL0 + '/api/hr', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'X-RCL': '1', Origin: URL0 }, cookie ? { Cookie: 'rcl_hr=' + cookie } : {}, hdr || {}), body: JSON.stringify({ action: action }) }); return r.status; };
  try {
    await new Promise(r => setTimeout(r, 1200));
    const self = await sign('self'), all = Object.keys(ACT), office = all.filter(a => SELF.indexOf(a) < 0), times = [];
    let s401 = 0, s403 = 0;
    for (const a of all) { const t0 = Date.now(); if ((await call(a, null)) === 401) s401++; times.push(Date.now() - t0); }
    ok(s401 === all.length, 'no sign-in: 401 for all ' + all.length + ' actions (' + s401 + ')');
    for (const a of office) if ((await call(a, self)) === 403) s403++;
    ok(s403 === office.length, 'an employee (My HR): 403 for all ' + office.length + ' office actions (' + s403 + ')');
    ok((await call('empList', self, { 'X-RCL': '' })) === 403, 'a request not from the HR page: 403');
    ok((await call('nothingLikeThis', self)) === 400, 'an unknown action: 400');
    ok((await fetch(URL0 + '/api/hr')).status === 405, 'GET: 405');
    times.sort((x, y) => x - y); console.log('the door without a sign-in: median ' + times[Math.floor(times.length / 2)] + ' ms, slowest ' + times[times.length - 1] + ' ms');
  } finally { srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
