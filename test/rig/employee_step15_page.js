// RIG ONLY – step 15 (18-11-2026, Phase 2) in a browser against a local HR server on :3063 and the local test database (never live):
// a new joiner fills his link on a PHONE-sized screen (e-mail code, papers, a paper he does not have, the policy, submit); the HR office
// checks and approves it (Joining), verifies his papers (Papers to verify), sees who accepted (Company policies) and his new cards.
//   timeout 300 node test/rig/employee_step15_page.js     (made-up people only)
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), http = require('http'), fs = require('fs'), { spawn } = require('child_process');
const { db } = require('../../lib/db');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  // the e-mail service, a stand-in on this computer (it keeps what would be sent)
  const got = [], mailSrv = http.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { got.push(JSON.parse(b || '{}')); res.setHeader('Content-Type', 'application/json'); res.end('{"id":"m1"}'); }); });
  await new Promise(r => mailSrv.listen(0, '127.0.0.1', r));
  Object.assign(process.env, { RESEND_API_KEY: 're_rig_not_a_real_key', MAIL_FROM: 'RCL HR <hr@rig.test>', RESEND_API_BASE: 'http://127.0.0.1:' + mailSrv.address().port });
  const { ACT } = require('../../api/hr');
  const tag = 'PJ' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig join ' + tag, role: 'super' }];
  const ses = role => ({ site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, info: { sites: sites }, origin: 'http://localhost:3063' });
  const SU = ses('super'), shots = process.env.SHOTS || os.tmpdir(), mob = () => '9' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100);
  // a policy for this site; a link for a new joiner
  const pol = await ACT.cpSave(SU, { title: 'Site rules ' + tag, category: 'Safety', mandatory: true, scope: { sites: [site] } }), pv = await ACT.cpVersionSave(SU, { policy: pol.id, body: 'Wear the helmet.\nNo phone near the paver.', effective_from: '2026-01-01' }); await ACT.cpPublish(SU, { version: pv.id });
  const em = ('join.' + tag + '@rig.test').toLowerCase(), inv = await ACT.invMake(SU, { base: 'http://localhost:3063/', prefill: { name: 'Page Joiner', category: 'labour', mobile: mob(), email: em, joined_on: require('../../lib/rules').today() } });
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3063' }), stdio: 'ignore' });
  const sign = async role => { const t = crypto.randomBytes(32).toString('base64url');
    await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig join ' + tag, mods: [] } }], 'return=minimal'); return t; };
  const b = await chromium.launch(), errs = [];
  const files = path.join(os.tmpdir(), 'rcl-hr-' + tag); fs.mkdirSync(files, { recursive: true });
  const pdf = k => { const f = path.join(files, k + '.pdf'); fs.writeFileSync(f, '%PDF-1.4 rig ' + k + '\n%%EOF'); return f; };
  try {
    await new Promise(r => setTimeout(r, 1200));
    // 1 THE NEW JOINER – a phone, no sign-in
    const ph = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }), p = await ph.newPage(); p.on('pageerror', e => errs.push('joiner: ' + e.message)); if (process.env.DBG) p.on('response', async r => { if (r.url().indexOf('api/onboard') > -1) console.log('  <', r.status(), (await r.text()).slice(0, 160)); });
    p.on('dialog', d => d.accept('Applied for it – not received yet'));
    await p.goto(inv.link.replace('http://localhost:3063/', 'http://localhost:3063/')); await p.waitForSelector('#ob_hello', { state: 'visible', timeout: 20000 });
    ok(/Welcome, Page Joiner!/.test(await p.locator('#ob_hello').innerText()), 'his name from the office');
    await p.screenshot({ path: shots + '/S15_join_1_about.png', fullPage: true });
    await p.fill('#f_dob', '1996-04-20'); await p.click('text=Save and next');
    await p.waitForSelector('button:has-text("Send the code")'); await p.click('button:has-text("Send the code")'); await p.waitForSelector('text=The code was sent', { timeout: 10000 }).catch(async er => { console.log('page says:', await p.locator('#ob_step').innerText()); throw er; });
    const code = (JSON.stringify(got[got.length - 1]).match(/code: (\d{6})/) || [])[1]; ok(!!code, 'the code went to his e-mail');
    await p.fill('input[placeholder="6-digit code"]', code); await p.click('button:has-text("Verify")'); await p.waitForSelector('text=E-mail verified', { timeout: 10000 }); ok(true, 'his e-mail verified by the code');
    await p.click('text=Save and next'); await p.waitForSelector('#f_address_current');
    await p.fill('#f_address_current', 'Room 4, Rig camp'); await p.fill('#f_emergency_name', 'Rig Mother'); await p.fill('#f_emergency_relation', 'mother'); await p.fill('#f_emergency_mobile', mob()); await p.fill('#f_pin', '411001');
    await p.screenshot({ path: shots + '/S15_join_2_address.png', fullPage: true });
    await p.click('text=Save and next'); await p.waitForSelector('#f_aadhaar');
    const v = n0 => { const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]], pm = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]], inv0 = [0,4,3,2,1,5,6,7,8,9];
      let c = 0; String(n0).split('').reverse().forEach((x, i) => { c = d[c][pm[(i + 1) % 8][+x]]; }); return n0 + inv0[c]; };
    await p.fill('#f_aadhaar', v('7' + String(Date.now()).slice(-10)));
    await p.click('text=Save and next'); await p.waitForSelector('h2:has-text("Papers")');
    for (const k of ['Photo', 'Aadhaar card', 'Bank passbook / cancelled cheque']) {
      const box = p.locator('.paper', { has: p.locator('b', { hasText: new RegExp('^' + k.replace(/[/()]/g, '.') + ' \\*$') }) });
      await box.locator('input[type=file]').setInputFiles(pdf(k.split(' ')[0])); await box.locator('button', { hasText: /^Attach/ }).click(); await p.waitForTimeout(900);
    }
    const pan = p.locator('.paper', { has: p.locator('b', { hasText: /^PAN card \*$/ }) }); await pan.locator('button', { hasText: 'I do not have it' }).click(); await p.waitForTimeout(900);
    ok(/You do not have it: Applied for it/.test(await p.locator('.paper', { has: p.locator('b', { hasText: /^PAN card \*$/ }) }).innerText()), 'a paper he does not have – with why');
    ok(await p.locator('.st.have').count() === 3, 'three papers attached');
    await p.screenshot({ path: shots + '/S15_join_3_papers.png', fullPage: true });
    await p.click('text=Save and next'); await p.waitForSelector('h2:has-text("Policies")');
    await p.locator('.policy input[type=checkbox]').check(); await p.click('.policy button:has-text("Accept")'); await p.waitForSelector('.policy .ok', { timeout: 10000 }); ok(true, 'the policy accepted');
    await p.click('text=Save and next'); await p.waitForSelector('h2:has-text("Submit")');
    await p.click('button.pri:has-text("Submit")'); await p.waitForSelector('#ob_step .err:not([hidden])', { timeout: 10000 });
    ok(/Tick: "What I have written is true"/.test(await p.locator('#ob_step .err').innerText()), 'without the tick: said what is missing');
    await p.locator('#ob_step input[type=checkbox]').check(); await p.click('button.pri:has-text("Submit")'); await p.waitForSelector('text=Submitted. Thank you', { timeout: 10000 }); ok(true, 'submitted');
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'phone: no sideways scroll');
    await p.screenshot({ path: shots + '/S15_join_4_done.png', fullPage: true });
    // 2 THE HR OFFICE – Joining: check and approve
    const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addCookies([{ name: 'rcl_hr', value: await sign('super'), domain: 'localhost', path: '/' }]); const o = await oc.newPage(); o.on('pageerror', e => errs.push('office: ' + e.message));
    await o.goto('http://localhost:3063/#page=joining'); await o.waitForSelector('#p_15 table', { timeout: 20000 });
    ok(/Submitted – to check/.test(await o.locator('#p_15 tr', { hasText: 'Page Joiner' }).innerText()), 'Joining: the form waits to be checked');
    await o.screenshot({ path: shots + '/S15_office_joining.png' });
    await o.locator('#p_15 tr', { hasText: 'Page Joiner' }).locator('button', { hasText: 'Check…' }).click(); await o.waitForSelector('text=Approve – add the employee', { timeout: 10000 });
    const rv = await o.locator('#p_15').innerText(); ok(/Room 4, Rig camp/.test(rv) && /PAN card – he does not have it|pan – he does not have it/.test(rv) && /e-mail verified/.test(rv), 'the review: what he wrote, the paper he does not have, the e-mail verified');
    await o.screenshot({ path: shots + '/S15_office_review.png', fullPage: true });
    await o.click('text=Approve – add the employee'); await o.waitForSelector('text=Approved – employee added', { timeout: 10000 });
    const e = (await db('GET', 'hr_employees?select=id,code,email_verified_at&site=eq.' + site + '&email=eq.' + em))[0]; ok(!!e && !!e.email_verified_at, 'the employee is made, his e-mail verified');
    // Papers to verify: his three papers; verify them
    await o.goto('http://localhost:3063/#page=papers'); await o.waitForSelector('#p_15 table', { timeout: 20000 });
    ok(await o.locator('#p_15 tbody tr', { hasText: 'Page Joiner' }).count() === 3, 'Papers to verify: his three papers');
    for (const cb of await o.locator('#p_15 tbody input[type=checkbox]').all()) await cb.check();
    await o.screenshot({ path: shots + '/S15_office_papers.png' });
    await o.click('text=Verified – the ticked'); await o.waitForTimeout(1500);
    ok(((await db('GET', 'hr_employee_docs?select=status&employee_id=eq.' + e.id)) || []).every(d => d.status === 'verified'), 'verified from the page');
    // Company policies: accepted 1 of 1
    await o.goto('http://localhost:3063/#page=cpolicies'); await o.waitForSelector('#p_15 .pc15', { timeout: 20000 });
    ok(/1 of 1 accepted/.test(await o.locator('#p_15 .pc15', { hasText: 'Site rules ' + tag }).innerText()), 'Company policies: who accepted');
    await o.screenshot({ path: shots + '/S15_office_policies.png' });
    // his page: reporting, where he may mark, insurance, e-mail and activation
    await o.goto('http://localhost:3063/#page=employees'); await o.waitForSelector('text=Page Joiner', { timeout: 20000 }); await o.click('text=Page Joiner'); await o.waitForSelector('#d_15 h4:has-text("Reporting")', { timeout: 15000 });
    const cards = await o.locator('#d_15').innerText(); ok(/E-mail and activation/.test(cards) && /verified/.test(cards) && /He can sign in \/ out at/.test(cards) && /Medical insurance/.test(cards), 'his page: the new cards');
    await o.screenshot({ path: shots + '/S15_office_employee.png', fullPage: true });
    ok((await o.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'office: no sideways scroll');
  } finally { await b.close(); srv.kill(); mailSrv.close(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
