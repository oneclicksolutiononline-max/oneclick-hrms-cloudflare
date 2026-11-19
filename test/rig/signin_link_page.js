// RIG ONLY – (19-11-2026, his picture of Users & Access: "user id khali email as banat aahet tya mule user jo email takto tya weli wrong
// email or pass") the Employees list asks the Portal who has a sign-in; the people it names in "link" (made with the mobile number, an
// e-mail here now) are sent once as "people" – the Portal is a stand-in in the browser (no Portal runs here). A local HR server on :3082
// and the local test database (never live). Made-up people only.
//   timeout 240 node test/rig/signin_link_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'SL' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig sign-in ' + tag, role: 'admin' }];
  const A = { site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig admin', role: 'admin', info: { sites: sites } };
  const mob = '9' + String(Date.now()).slice(-9), mail = 'mobile.' + tag.toLowerCase() + '@rig.test';
  const E = await ACT.empSave(A, { name: 'Mobile Person', category: 'labour', mobile: mob, email: mail, dob: '1990-01-01' });
  await db('PATCH', 'hr_employees?id=eq.' + E.id, { portal_email: mob + '@mobile.id' }, 'return=minimal');      // his sign-in was made with his number (before his e-mail was in HR)
  const F = await ACT.empSave(A, { name: 'Mail Person', category: 'staff', mobile: '8' + String(Date.now() + 7).slice(-9), email: 'mail.' + tag.toLowerCase() + '@rig.test', dob: '1991-01-01' });
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3082' }), stdio: 'ignore' });
  const t = crypto.randomBytes(32).toString('base64url');
  await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: A.email, name: 'Rig admin', role: 'admin', expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig sign-in ' + tag, mods: [] } }], 'return=minimal');
  const b = await chromium.launch(), errs = [], sent = [];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    // the Portal's door, as it answers: the person made with his number is in "link"
    await p.route('http://127.0.0.1:9/portal/api/hrlogin', async r => {
      const j = JSON.parse(r.request().postData() || '{}'); sent.push(j);
      if (Array.isArray(j.check)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, signins: j.check.map(() => 'has'), link: j.check.map((c, i) => (c.known && /@mobile\.id$/.test(c.known) ? i : -1)).filter(i => i > -1) }) });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, people: (j.people || []).map(() => ({ state: 'has' })) }) });
    });
    await p.goto('http://localhost:3082/#page=employees'); await p.waitForSelector('#emp_rows tr', { timeout: 20000 });
    for (let i = 0; i < 40 && !sent.some(j => Array.isArray(j.people)); i++) await p.waitForTimeout(250);
    const check = sent.find(j => Array.isArray(j.check)), people = sent.filter(j => Array.isArray(j.people));
    ok(check && check.check.length === 2, 'the list asked the Portal who has a sign-in (2 people)');
    ok(people.length === 1 && people[0].people.length === 1 && people[0].people[0].email === mail && people[0].people[0].mobile === mob && people[0].people[0].known === mob + '@mobile.id', 'only the one made with his number is sent – with his e-mail, number and user ID');
    ok(await p.locator('#emp_rows td[data-sg] .st', { hasText: 'Given' }).count() === 2, 'the column says "Given" for both – nothing else is shown');
    ok(await p.locator('#toast:not([hidden])').count() === 0 || !/sign-in/i.test(await p.locator('#toast').innerText()), 'quiet: no message');
  } finally { await b.close(); srv.kill(); await db('DELETE', 'hr_sessions?site=eq.' + site, undefined, 'return=minimal').catch(() => {}); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
