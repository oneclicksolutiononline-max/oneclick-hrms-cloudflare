// RIG ONLY – (19-11-2026, asked: "site hr admin nasel ok to user asel ani tyala pages wise access deta yawa") AN HR USER'S PAGES, as the
// Portal wrote them into his ticket (kept with his sign-in here): the menu shows only what he has; the server refuses a page with
// No access and the changes of a page with View; his own attendance stays his. A local HR server on :3076 and the local test database
// (never live). Made-up people only.   timeout 240 node test/rig/user_pages_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'UP' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, shots = process.env.SHOTS || os.tmpdir(), H = 'http://localhost:3076';
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3076' }), stdio: 'ignore' });
  const PAGES = { leave: 'None', employees: 'View', rulebook: 'None', reports: 'View' };
  const sign = async (role, pages) => { const t = crypto.randomBytes(32).toString('base64url'); await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: Object.assign({ sites: [{ code: site, name: 'Rig pages ' + tag, role: role }], siteName: 'Rig pages ' + tag, mods: [] }, pages ? { pages: pages } : {}) }], 'return=minimal'); return t; };
  const call = async (tok, action, body) => { const r = await fetch(H + '/api/hr', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RCL': '1', Cookie: 'rcl_hr=' + tok, Origin: H }, body: JSON.stringify(Object.assign({ action: action }, body || {})) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1500));
    const user = await sign('user', PAGES), admin = await sign('admin', PAGES), plain = await sign('user', null);
    // ---- the server
    let r = await call(user, 'init'); ok(r.status === 200 && r.j.pages && r.j.pages.leave === 'None' && r.j.pages.employees === 'View' && r.j.pages.muster === 'Edit', 'init: his pages (not named = as before)');
    r = await call(user, 'empList', {}); ok(r.status === 200, 'Employees – View: the list is read (' + r.status + ')');
    r = await call(user, 'empSave', { name: 'Nobody' }); ok(r.status === 403 && /View access only for Employees in HR/.test(r.j.error), 'Employees – View: a change is refused – ' + r.j.error);
    r = await call(user, 'leaveList', {}); ok(r.status === 403 && /You do not have access to Leave in HR\. Ask the Super Admin\./.test(r.j.error), 'Leave – No access: refused – ' + r.j.error);
    r = await call(user, 'rbList', {}); ok(r.status === 403 && /Rule Book/.test(r.j.error), 'Rule Book – No access: refused');
    r = await call(user, 'muster', { month: new Date().toISOString().slice(0, 7) }); ok(r.status !== 403, 'Muster – not named: as before (' + r.status + ')');
    r = await call(user, 'myAttend', {}); ok(r.status !== 403 || !/access to/.test(String(r.j.error)), 'his own attendance stays his (' + r.status + ' ' + (r.j.error || '') + ')');
    r = await call(admin, 'leaveList', {}); ok(r.status === 200, 'an HR Admin: every page (' + r.status + ')');
    r = await call(plain, 'leaveList', {}); ok(r.status === 200, 'an HR User never given pages: as before (' + r.status + ')');
    const menu = async tok => (await (await fetch(H + '/menu.json', { headers: { Cookie: 'rcl_hr=' + tok } })).json()).pages.map(p => p.key);
    const m1 = await menu(user), m2 = await menu(plain);
    ok(m1.indexOf('leave') < 0 && m1.indexOf('rulebook') < 0 && m1.indexOf('employees') > -1 && m2.indexOf('leave') > -1 && m2.indexOf('rulebook') > -1, 'the menu around HR: only what he has – ' + m1.join(','));
    // ---- the page
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: user, domain: 'localhost', path: '/' }]);
    const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    await p.goto(H + '/#page=leave'); await p.waitForSelector('#tabs .tab', { timeout: 20000 }); await p.waitForTimeout(1200);
    const tabs = await p.$$eval('#tabs .tab', l => l.map(x => x.dataset.page));
    ok(tabs.indexOf('leave') < 0 && tabs.indexOf('rulebook') < 0 && tabs.indexOf('employees') > -1 && tabs.indexOf('muster') > -1, 'his menu: no Leave, no Rule Book – ' + tabs.join(','));
    const here = await p.evaluate(() => { const t = document.querySelector('#tabs .tab.on'); return t ? t.dataset.page : ''; });
    ok(here && here !== 'leave', 'a link to Leave opens his first page instead – ' + here);
    await p.screenshot({ path: shots + '/UP_menu.png' });
  } finally { await b.close(); srv.kill(); await db('DELETE', 'hr_sessions?site=eq.' + site, undefined, 'return=minimal').catch(() => {}); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
