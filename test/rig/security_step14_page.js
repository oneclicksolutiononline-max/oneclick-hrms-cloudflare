// RIG ONLY – step 14 (18-11-2026, Phase 1) in a browser against a local HR server on :3062 and the local test database (never live):
// the waiting bank change on the employee's page, Approvals → Bank changes, the face panel's consent and photo holds, the PAN mask.
//   timeout 240 node test/rig/security_step14_page.js     (made-up people only)
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'PG' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig page ' + tag, role: 'super' }];
  const ses = (role, email) => ({ site: site, email: email || role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, info: { sites: sites } });
  const SU = ses('super'), U = ses('user'), shots = process.env.SHOTS || os.tmpdir();
  const mob = () => '9' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100);
  // the data: an employee with a bank account, a change asked by an HR User, his PAN, his consent
  const e = await ACT.empSave(U, { name: 'Page Bank', category: 'staff', mobile: mob(), email: ('page.' + tag + '@rig.test').toLowerCase(), dob: '1990-01-01' });
  await ACT.profSave(SU, { id: e.id, group: 'secret', data: { bank_account: '111122223333', bank_ifsc: 'SBIN0001234', bank_name: 'Rig Bank' } });
  await ACT.profSave(U, { id: e.id, group: 'secret', data: { bank_account: '444455556666', bank_ifsc: 'SBIN0001234', bank_name: 'Rig Bank' } });
  await ACT.privSave(SU, { id: e.id, pan: 'ABCDE' + String(Date.now()).slice(-4) + 'F' });
  await db('POST', 'hr_face_consents', [{ employee_id: e.id, site: site, version: require('../../lib/consent').VERSION, lang: 'mr', given_by: 'page@rig.test' }], 'return=minimal');
  // the HR server of this computer, signed in as the Super Admin (a sign-in row of the test database – the Portal is not asked)
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3062' }), stdio: 'ignore' });
  const token = crypto.randomBytes(32).toString('base64url'), sign = async (role, email) => { const t = crypto.randomBytes(32).toString('base64url');
    await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: email || role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: { mods: [], sites: sites.map(x => Object.assign({}, x, { role: role })), siteName: 'Rig page ' + tag } }], 'return=minimal'); return t; };
  const b = await chromium.launch(), errs = [];
  const page = async (role) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: await sign(role), domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message)); return p; };
  try {
    await new Promise(r => setTimeout(r, 1200));
    // 1 the HR User: his page shows the change waiting, masked, and no Approve
    let p = await page('user');
    await p.goto('http://localhost:3062/#page=employees'); await p.waitForSelector('text=Page Bank', { timeout: 20000 }); await p.click('text=Page Bank'); await p.waitForTimeout(1500);
    await p.click('text=Statutory & bank'); await p.waitForSelector('.bk-wait', { timeout: 10000 });
    const wu = await p.locator('.bk-wait').innerText(); ok(/Waiting for approval/.test(wu) && /XXXX6666/.test(wu) && !/444455556666/.test(wu) && /ending 3333/.test(wu), 'HR User: the waiting change, the new account masked: ' + wu.replace(/\n/g, ' | '));
    ok(await p.locator('.bk-wait .mz-ok').count() === 0, 'HR User: no Approve');
    await p.screenshot({ path: shots + '/S14_bank_wait_user.png' });
    // 2 the Super Admin: Approvals → Bank changes, the account whole, Approve
    p = await page('super');
    await p.goto('http://localhost:3062/#page=approvals'); await p.waitForSelector('.rb-tabs button', { timeout: 20000 });
    ok(await p.locator('.rb-tabs button', { hasText: 'Bank changes' }).count() === 1, 'Approvals has the tab "Bank changes"');
    await p.click('.rb-tabs button:has-text("Bank changes")'); const row = p.locator('#p_book tbody tr', { hasText: 'Page Bank' }); await row.waitFor({ timeout: 15000 });
    const rt = await row.innerText(); ok(/444455556666/.test(rt) && /was …3333/.test(rt) && /Not told: e-mail is not set up/.test(rt) && /Waits for approval/.test(rt), 'the row: whole account for the Super Admin, the old one, what the employee was told: ' + rt.replace(/\s+/g, ' '));
    await p.screenshot({ path: shots + '/S14_bank_approvals.png' });
    await row.locator('.mz-ok').click(); await p.waitForTimeout(1500);
    ok(((await db('GET', 'hr_employee_profile?select=secret&employee_id=eq.' + e.id))[0].secret.bank_account) === '444455556666', 'approved from the page: the new account counts');
    ok(await p.locator('#p_book tbody tr', { hasText: 'Page Bank' }).count() === 0, 'it waits no more');
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0, 'no sideways scroll');
    // 3 the face panel: consent and the photo holds
    await p.goto('about:blank'); await p.goto('http://localhost:3062/#page=employees'); await p.waitForSelector('text=Page Bank', { timeout: 20000 }); await p.click('text=Page Bank'); await p.waitForTimeout(1500);
    const faceBtn = p.locator('button', { hasText: /^Face/ }).first(); if (await faceBtn.count()) await faceBtn.click(); else await p.click('text=Face for attendance');
    await p.waitForSelector('text=Consent: given on', { timeout: 10000 }); ok(/मराठी/.test(await p.locator('text=Consent: given on').innerText()), 'the consent: when and in which language');
    await p.waitForSelector('text=Keep these photos'); const fs = p.locator('.sheet:visible', { hasText: 'Keep these photos' }).last(), inputs = fs.locator('input[type=date]');
    await p.screenshot({ path: shots + '/S14_face_panel_before.png' }); await inputs.nth(0).fill('2026-01-01'); await inputs.nth(1).fill('2026-01-31');
    await fs.locator('input[placeholder="Why these photos are kept"]').fill('Page dispute ' + tag); await fs.locator('button', { hasText: 'Keep these photos' }).click(); await p.waitForSelector('text=Page dispute ' + tag, { timeout: 10000 });
    ok(((await db('GET', 'hr_selfie_holds?select=reason&employee_id=eq.' + e.id)) || []).length === 1, 'a hold is put from the page');
    await p.screenshot({ path: shots + '/S14_face_panel.png' });
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
