// RIG ONLY – step 18 (18-11-2026, Phase 5) in a browser against a local HR server on :3066 and the local test database (never live):
// the payroll page's new parts – Structures, the pay sheet's LWF / TDS and a person's structure, Release & payment, Registers,
// Compare (a file of the present method), Full & final, the settings' new numbers and the CA's check.
//   timeout 300 node test/rig/payroll_step18_page.js        Made-up people and numbers only.
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr'), D = require('../../lib/day'), MO = require('../../lib/month'), R = require('../../lib/rules');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'PY' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig pay ' + tag, role: 'super' }], shots = process.env.SHOTS || os.tmpdir();
  const ses = (role, who) => ({ site: site, email: (who || role) + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, info: { sites: sites } });
  const DLG = 'body > div.dlg:last-of-type', A = ses('admin'), S = ses('super'), S2 = ses('super', 'super2'), today = R.today(), month = D.addDays(today.slice(0, 8) + '01', -1).slice(0, 7), nDays = +MO.lastDay(month).slice(8);
  const mk = async (name, k) => ACT.empSave(A, { name: name, category: 'staff', mobile: '9' + String(Date.now()).slice(-6) + String(100 + k), email: 'p' + k + '.' + tag.toLowerCase() + '@rig.test', dob: '1990-05-05', joined_on: '2022-01-01' });
  const E1 = await mk('Pay Page One', 1), E2 = await mk('Pay Page Two', 2);
  for (const e of [E1, E2]) { await ACT.daySet(S, { id: e.id, day: month + '-05', in_time: '09:00', out_time: '18:00', reason: 'rig' }); const g = await ACT.salaryAsk(A, { id: e.id, pay_type: 'monthly', amount: String(nDays * 600) }); await ACT.salaryDecide(S, { id: g.waiting.id, decision: 'approved' }); }
  const st = (await ACT.structSave(S, { name: 'Page structure ' + tag })).rows.find(r => r.name === 'Page structure ' + tag);
  const v = (await ACT.structVersionSave(S2, { structure: st.id, parts: [{ name: 'Basic', pct: 50 }, { name: 'HRA', pct: 20 }, { name: 'Special' }], valid_from: month + '-01' })).rows.find(r => r.id === st.id).versions[0];
  await ACT.monthVerify(A, { month: month, ids: [E1.id, E2.id] }); await ACT.monthApprove(S, { month: month });
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3066' }), stdio: 'ignore' });
  const sign = async role => { const t = crypto.randomBytes(32).toString('base64url');
    await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 1800000).toISOString(), info: { sites: sites, siteName: 'Rig pay ' + tag, mods: [] } }], 'return=minimal'); return t; };
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: await sign('super'), domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    await p.route('**/vendor/xlsx-0.18.5.full.min.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('/home/claude/rclerp/public/vendor/xlsx-0.18.5.full.min.js') }));      // on live the ERP's own address serves it
    await p.goto('http://localhost:3066/#page=payroll'); await p.waitForSelector('#p_roll button:has-text("Structures")', { timeout: 20000 });
    ok((await p.locator('#p_roll > .tools').first().locator('button').allInnerTexts()).join('|') === 'Pay sheet|Release & payment|Registers|Compare|Advances|Full & final|Structures|PF · ESIC · PT', 'the eight parts of the payroll page');
    // the settings: the new numbers and their source
    await p.click('#p_roll button:has-text("PF · ESIC · PT")'); await p.waitForSelector('text=The employer\'s shares', { timeout: 10000 });
    const set = async (label, val) => p.locator('#p_roll .grid > div', { has: p.locator('label', { hasText: label }) }).locator('input').first().fill(val);
    await set('PF – employee\'s share', '12'); await set('PF – counted on at most', '15000'); await set('ESIC – employee\'s share', '0.75'); await set('ESIC – only up to', '21000');
    await p.locator('#p_roll .grid > div', { has: p.locator('label', { hasText: 'PF is counted on' }) }).locator('select').selectOption('basic');
    for (const [l, x] of [['Employer PF – whole %', '12'], ['EPS (pension) %', '8.33'], ['EPS – counted on at most', '15000'], ['EDLI %', '0.5'], ['PF admin charges %', '0.5'], ['Employer ESIC %', '3.25'], ['Employee (₹)', '6'], ['Employer (₹)', '18'], ['In the months', String(+month.slice(5))], ['Days\' wages a year', '15'], ['Divided by', '26'], ['From how many years', '2'], ['The notification', 'Rig – made-up numbers ' + tag]]) await set(l, x);
    await p.locator('#p_roll input[type=date]').last().fill(month + '-01'); await p.click('#p_roll button:has-text("Save the settings")'); await p.waitForTimeout(1500);
    const now = await ACT.paySettings(S); ok(now.settings.pf_base === 'basic' && now.settings.eps_pct === 8.33 && now.settings.source === 'Rig – made-up numbers ' + tag && now.settings.lwf_months.length === 1, 'the settings are saved with the new numbers and their source');
    await p.waitForSelector('text=Checked by the CA', { timeout: 10000 }); await p.locator('#p_roll li', { hasText: 'Rig – made-up numbers ' + tag }).locator('button:has-text("Checked…")').click();
    await p.locator('#p_roll li', { hasText: 'Rig – made-up numbers ' + tag }).locator('input').fill('CA – rig check'); await p.locator('#p_roll li', { hasText: 'Rig – made-up numbers ' + tag }).locator('button:has-text("Checked…")').click();
    await p.waitForSelector('text=CA – rig check', { timeout: 10000 }); ok(true, 'the CA\'s check is written');
    await p.screenshot({ path: shots + '/S18_settings.png', fullPage: true });
    // Structures: the draft of another person is approved here
    await p.click('#p_roll button:has-text("Structures")'); await p.waitForSelector('text=Page structure ' + tag, { timeout: 10000 });
    ok(/DRAFT by super2/.test(await p.locator('#p_roll .dz-card', { hasText: 'Page structure ' + tag }).innerText()), 'the draft of another person is shown');
    await p.locator('#p_roll .dz-card', { hasText: 'Page structure ' + tag }).locator('button:has-text("Approve")').click(); await p.waitForSelector('text=approved by super.', { timeout: 10000 });
    await p.screenshot({ path: shots + '/S18_structures.png', fullPage: true });
    // the pay sheet: a person's structure, LWF and TDS
    await p.click('#p_roll button:has-text("Pay sheet")'); await p.locator('#p_roll input[type=month]').fill(month); await p.locator('#p_roll input[type=month]').dispatchEvent('change');
    await p.waitForSelector('#p_roll tr:has-text("Pay Page One")', { timeout: 15000 });
    await p.locator('#p_roll tr', { hasText: 'Pay Page One' }).locator('button:has-text("Set…")').click(); await p.waitForSelector(DLG + ' select', { timeout: 10000 });
    await p.locator(DLG + ' label.ck', { hasText: 'PF' }).first().locator('input').check(); await p.locator(DLG + ' .grid > div', { has: p.locator('label', { hasText: 'Salary structure' }) }).locator('select').selectOption({ label: 'Page structure ' + tag });
    await p.locator(DLG + ' label.ck', { hasText: 'Labour Welfare Fund' }).locator('input').check(); await p.locator(DLG + ' .grid > div', { has: p.locator('label', { hasText: 'TDS of a month' }) }).locator('input').fill('50');
    await p.click(DLG + ' button:has-text("Save")'); await p.waitForSelector('#p_roll th:has-text("LWF")', { timeout: 15000 });
    const r1 = (await ACT.payList(S, { month: month })).rows.find(r => r.code === E1.code);
    ok(r1.components && r1.components[0].amount === 300 && r1.pf === 36 && r1.lwf === 6 && r1.tds === 50 && r1.employer && r1.employer.eps === 25, 'his structure, PF on the Basic, LWF, TDS and the employer\'s shares: ' + JSON.stringify([r1.components, r1.pf, r1.lwf, r1.tds, r1.employer]));
    await p.screenshot({ path: shots + '/S18_sheet.png', fullPage: true });
    await ACT.payLock(S, { month: month });
    // release & payment
    await p.click('#p_roll button:has-text("Release & payment")'); await p.waitForSelector('#p_roll tr:has-text("Pay Page One")', { timeout: 15000 });
    await p.locator('#p_roll thead input[type=checkbox]').check(); await p.click('#p_roll button:has-text("Ready to pay")'); await p.waitForSelector('#p_roll td:has-text("Ready to pay")', { timeout: 10000 });
    await p.locator('#p_roll thead input[type=checkbox]').check(); await p.click('#p_roll button:has-text("Paid…")'); await p.locator(DLG + ' .grid > div', { has: p.locator('label', { hasText: 'Reference' }) }).locator('input').fill('UTR-PAGE-' + tag);
    await p.click(DLG + ' button:has-text("Mark paid")'); await p.waitForSelector('#p_roll td:has-text("UTR-PAGE-' + tag + '")', { timeout: 10000 }); ok(true, 'ready, then paid with the reference');
    await p.screenshot({ path: shots + '/S18_release.png', fullPage: true });
    // registers
    await p.click('#p_roll .tools button:has-text("Registers")'); await p.locator('#p_roll select').first().selectOption('pf'); await p.waitForSelector('#p_roll th:has-text("Employer EPS")', { timeout: 10000 });
    ok(/Pay Page One/.test(await p.locator('#p_roll table').innerText()), 'the PF register');
    const dl = p.waitForEvent('download', { timeout: 15000 }); await p.click('#p_roll button:has-text("Excel")'); const f = await dl; ok(/^PF_register_\d{4}-\d{2}\.(xlsx|csv)$/.test(f.suggestedFilename()), 'the register as Excel: ' + f.suggestedFilename());
    await p.screenshot({ path: shots + '/S18_registers.png', fullPage: true });
    // compare: a CSV of the present method
    const r2 = (await ACT.payList(S, { month: month })).rows, csv = path.join(os.tmpdir(), 'present_' + tag + '.csv');
    fs.writeFileSync(csv, 'Emp Code,Gross,Net Pay\n' + r2.map((r, i) => r.code + ',' + r.gross + ',' + (i ? r.net - 10 : r.net)).join('\n'));
    await p.click('#p_roll .tools button:has-text("Compare")'); await p.setInputFiles('#p_roll input[type=file]', csv); await p.waitForSelector('text=1 the same · 1 differ', { timeout: 15000 }); ok(true, 'the present method beside the ERP: one the same, one differs');
    await p.screenshot({ path: shots + '/S18_compare.png', fullPage: true });
    // full & final: E1 relieved in the locked month
    await ACT.empExit(A, { id: E1.id, on: month + '-20', reason: 'Resigned (rig)' });
    await p.click('#p_roll .tools button:has-text("Full & final")'); await p.waitForSelector('text=Make a full & final', { timeout: 10000 }); await p.waitForTimeout(800);
    await p.locator('#p_roll .dz-card select').selectOption({ index: 1 }); await p.click('#p_roll button:has-text("Make it")'); await p.waitForSelector(DLG + ' h2:has-text("Full & final")', { timeout: 15000 });
    ok(await p.evaluate(sel => Array.from(document.querySelectorAll(sel + ' input')).some(i => i.value === 'Gratuity (5 years)'), DLG), 'the gratuity line is filled (4 years 9 months = 5)');
    await p.screenshot({ path: shots + '/S18_fnf.png', fullPage: true });
    await p.click(DLG + ' button:has-text("Checked")'); await p.waitForSelector('#p_roll td:has-text("Checked – to be approved")', { timeout: 10000 }); ok(true, 'checked (the Super Admin may check what he made)');
  } finally {
    await b.close(); srv.kill();
    await ACT.paySettingsSave(S, { valid_from: month + '-01' });      // the rig's settings back to empty
  }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
