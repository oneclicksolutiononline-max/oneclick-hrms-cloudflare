// RIG ONLY – 18-11-2026 (asked: "employee add krtana document upload sagle kahi"): Add employee in ONE form of 8 steps, in a browser
// against a local HR server on :3070 and the local test database (never live) – Who / Work / Contact → Save & continue → Bank & PF →
// Reporting → Work place → Documents (a paper attached) → Insurance + Activate → Finish. Made-up person only.
//   timeout 240 node test/rig/addemp_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'AE' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig add ' + tag, role: 'admin' }], shots = process.env.SHOTS || os.tmpdir(), D = 'body > div.dlg:last-of-type';
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3070' }), stdio: 'ignore' });
  const t = crypto.randomBytes(32).toString('base64url');
  await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig admin', role: 'admin', expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig add ' + tag, mods: [] } }], 'return=minimal');
  const jpg = path.join(os.tmpdir(), 'ae_' + tag + '.jpg'); fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]));
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    await p.goto('http://localhost:3070/#page=employees'); await p.waitForSelector('#b_add', { timeout: 20000 }); await p.click('#b_add'); await p.waitForSelector('#f_name', { state: 'visible' });
    ok((await p.locator('#f_nsteps').innerText()) === '8 steps' && (await p.locator('#f_steps .fm-st').count()) === 8, 'the form shows 8 steps');
    await p.fill('#f_name', 'Asha Wizard'); await p.selectOption('#f_cat', 'staff'); await p.fill('#f_dob', '1992-04-05'); await p.fill('#f_father', 'Ramesh Wizard');
    await p.screenshot({ path: shots + '/AE_1_who.png', fullPage: true });
    await p.click('#f_next'); await p.fill('#f_join', '2026-11-01'); await p.click('#f_next');
    await p.fill('#f_mobile', '9' + String(Date.now()).slice(-9)); await p.fill('#f_email', 'asha.' + tag.toLowerCase() + '@rig.test'); await p.fill('#f_city', 'Pune'); await p.fill('#f_state', 'Maharashtra'); await p.fill('#f_pin', '411001'); await p.fill('#f_emn', 'Ramesh Wizard'); await p.fill('#f_emr', 'Father'); await p.fill('#f_emm', '9876543210');
    await p.click('#f_save'); await p.waitForSelector('#f_more:not([hidden])', { timeout: 15000 });
    ok(/Step 4 of 8/i.test(await p.locator('#f_stepno').innerText()) && /Bank & PF/.test(await p.locator('#f_stepname').innerText()), 'saved – the same form goes on at step 4');
    const e = ((await db('GET', 'hr_employees?select=id,code&site=eq.' + site + '&name=eq.Asha%20Wizard')) || [])[0]; ok(!!e, 'the employee is made');
    await p.waitForTimeout(800); const pr = ((await db('GET', 'hr_employee_profile?select=data&employee_id=eq.' + e.id)) || [])[0] || {}; ok((pr.data || {}).father_name === 'Ramesh Wizard' && (pr.data || {}).pin === '411001', 'father\'s name, address and emergency contact are kept');
    await p.waitForSelector('#f_more input', { timeout: 10000 }); await p.screenshot({ path: shots + '/AE_4_bank.png', fullPage: true });
    const box = async (label, v) => p.locator('#f_more .grid > div', { has: p.locator('label', { hasText: label }) }).locator('input').first().fill(v);
    await box('Bank IFSC code', 'SBIN0001234'); await box('Bank account number', '123456789012'); await box('Bank', 'State Bank'); await box('Name as on bank', 'Asha Wizard');
    await p.click('#f_more button:has-text("Save & next")'); await p.waitForSelector('#f_stepname:has-text("Reporting")', { timeout: 10000 }); ok(true, 'bank saved (it waits for the HO HR) – step 5');
    ok(((await db('GET', 'hr_bank_changes?select=status&employee_id=eq.' + e.id)) || []).length === 1, 'the bank change waits for approval');
    await p.waitForSelector('#f_more .ep-card h4', { timeout: 10000 }); await p.screenshot({ path: shots + '/AE_5_reporting.png', fullPage: true });
    await p.click('#f_more button:has-text("Next")'); await p.waitForSelector('#f_stepname:has-text("Work place")'); await p.waitForSelector('#f_more .ep-card h4', { timeout: 10000 }); ok(true, 'step 6 – work place');
    await p.click('#f_more button:has-text("Next")'); await p.waitForSelector('#f_stepname:has-text("Documents")'); await p.waitForSelector('#f_more input[type=file]', { timeout: 10000 });
    ok(/Still to attach/.test(await p.locator('#f_more').innerText()), 'the papers still needed are shown');
    await p.screenshot({ path: shots + '/AE_7_documents.png', fullPage: true });
    await p.setInputFiles('#f_more input[type=file]', jpg); await p.click('#f_more button:has-text("Attach this paper")'); await p.waitForSelector('#f_more li:has-text("submitted")', { timeout: 15000 });
    ok(((await db('GET', 'hr_employee_docs?select=id&employee_id=eq.' + e.id)) || []).length === 1, 'a paper attached while adding');
    await p.click('#f_more button:has-text("Next")'); await p.waitForSelector('#f_stepname:has-text("Insurance")'); await p.waitForTimeout(1200); await p.screenshot({ path: shots + '/AE_8_insurance.png', fullPage: true });
    await p.click('#f_more button:has-text("Finish")'); await p.waitForSelector('#dlg_form', { state: 'hidden', timeout: 10000 }); ok(true, 'finished – back to the list');
    await p.click('#b_add'); await p.waitForSelector('#f_name', { state: 'visible' }); ok((await p.locator('#f_more').isHidden()) && (await p.locator('#f_save').isVisible()), 'the next Add starts clean at step 1');
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
