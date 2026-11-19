// RIG ONLY – (18-11-2026, asked: "employee add zala ki auto jayla hawa … te pass apan tharwla tas same first pass"; his answers: the
// first password by the rule of 13-11-2026, Ramesh@1234; in HR, when an employee is added / imported / approved from a joining link)
// A new employee's sign-in is asked of the Portal by itself – the Portal's api/hrlogin is a stand-in here (the browser's own route),
// so nothing reaches a real Portal. A local HR server on :3075 and the local test database (never live). Made-up people only.
//   timeout 240 node test/rig/auto_signin_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://localhost:3075/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'AS' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, shots = process.env.SHOTS || os.tmpdir();
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3075' }), stdio: 'ignore' });
  const sign = async role => { const t = crypto.randomBytes(32).toString('base64url'); await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: [{ code: site, name: 'Rig auto ' + tag, role: role }], siteName: 'Rig auto ' + tag, mods: [] } }], 'return=minimal'); return t; };
  const b = await chromium.launch(), errs = [], asked = [];
  const open = async role => { const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: await sign(role), domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    // the Portal's api/hrlogin – a stand-in: a new user is "made"; his user ID is his e-mail, or <number>@mobile.id
    await p.route('**/portal/api/hrlogin', async r => { const x = JSON.parse(r.request().postData() || '{}'); asked.push(x); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, people: (x.people || []).map(q => ({ state: 'made', id: q.email || (q.mobile + '@mobile.id'), first: true })) }) }); });
    await p.goto('http://localhost:3075/#page=employees'); await p.waitForSelector('#b_add', { timeout: 20000 }); return p; };
  const add = async (p, name, email, mobile) => {
    await p.click('#b_add'); await p.waitForSelector('#f_name', { state: 'visible' });
    await p.fill('#f_name', name); await p.selectOption('#f_cat', 'staff'); await p.fill('#f_dob', '1992-04-05'); await p.click('#f_next'); await p.fill('#f_join', '2026-11-01'); await p.click('#f_next');
    if (mobile) await p.fill('#f_mobile', mobile); if (email) await p.fill('#f_email', email); await p.click('#f_save'); };
  try {
    await new Promise(r => setTimeout(r, 1200));
    // 1 the HR Admin adds an employee with an e-mail: his sign-in is asked by itself, and he is told the first password
    let p = await open('admin'); const em = 'ravi.' + tag.toLowerCase() + '@rig.test', mob = '9' + String(Date.now()).slice(-9);
    await add(p, 'Ravi Kumar Patil', em, mob); await p.waitForSelector('#toast:has-text("Sign-in given")', { timeout: 15000 });
    const t1 = await p.locator('#toast').innerText(); await p.screenshot({ path: shots + '/AS_1_added.png' });
    ok(asked.length === 1 && asked[0].site === site && Array.isArray(asked[0].people) && asked[0].people.length === 1 && asked[0].people[0].email === em && asked[0].people[0].name === 'Ravi Kumar Patil', 'asked of the Portal by itself – ONLY new users ("people"), this site');
    ok(/Ravi Kumar Patil: ravi\./.test(t1) && /first password Ravi@1234/.test(t1) && /he sets his own at the first sign-in/.test(t1), 'told: how he signs in and his first password – ' + t1);
    // 2 an employee with a mobile number only: the Portal's user ID (<number>@mobile.id) is kept on him
    const mob2 = '8' + String(Date.now()).slice(-9); await p.click('#f_more button:has-text("Finish")').catch(() => {}); await p.waitForTimeout(800);
    await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(400);
    await add(p, 'Sunita More', '', mob2); await p.waitForSelector('#toast:has-text("Sunita More")', { timeout: 15000 });
    ok(asked.length === 2 && asked[1].people[0].mobile === mob2 && !asked[1].people[0].email, 'mobile only: asked with his number');
    await p.waitForTimeout(1200); const e2 = ((await db('GET', 'hr_employees?select=portal_email&site=eq.' + site + '&name=eq.Sunita%20More')) || [])[0];
    ok(e2 && e2.portal_email === mob2 + '@mobile.id', 'his user ID kept on him: ' + (e2 && e2.portal_email));
    // 3 an HR User adds one: the Portal is not asked – the HR Admin gives it
    const u = await open('user'); const before = asked.length; await add(u, 'Ganesh Shinde', 'ganesh.' + tag.toLowerCase() + '@rig.test', '7' + String(Date.now()).slice(-9));
    await u.waitForSelector('#toast:has-text("Ganesh Shinde")', { timeout: 15000 }).catch(() => {}); const t3 = await u.locator('#toast').innerText().catch(() => '');
    ok(asked.length === before && /HR Admin or the Super Admin gives it/.test(t3), 'an HR User: the Portal is not asked – said who gives it: ' + t3);
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
