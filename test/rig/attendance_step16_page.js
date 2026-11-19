// RIG ONLY – step 16 (18-11-2026, Phase 3) in a browser against a local HR server on :3064 and the local test database (never live):
// the Super Admin turns the seven-day rule on (Papers to verify → Seven-day rule), sees a late Staff person held and lets him in;
// a waiting bulk correction is taken back in Approvals.        timeout 240 node test/rig/attendance_step16_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'PS' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig seven ' + tag, role: 'super' }];
  const ses = role => ({ site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, info: { sites: sites } });
  const A = ses('admin'), shots = process.env.SHOTS || os.tmpdir(), mob = () => '9' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100);
  const old = new Date(Date.now() - 20 * 86400000 + 19800000).toISOString().slice(0, 10);
  const e = await ACT.empSave(A, { name: 'Late Staff', category: 'staff', mobile: mob(), email: ('late.' + tag + '@rig.test').toLowerCase(), dob: '1990-01-01', joined_on: old });
  const ask = (await db('POST', 'hr_asks', [{ site: site, employee_id: null, kind: 'att_import', day: '2026-11-30', body: { month: '2026-11', changes: [] }, auth: { approve: ['super'] }, stage: 'approve', asked_by: 'super.' + tag.toLowerCase() + '@rig.test' }], 'return=representation'))[0];
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3064' }), stdio: 'ignore' });
  const sign = async role => { const t = crypto.randomBytes(32).toString('base64url');
    await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig seven ' + tag, mods: [] } }], 'return=minimal'); return t; };
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: await sign('super'), domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    p.on('dialog', d => d.accept('The file had the wrong month'));
    await p.goto('http://localhost:3064/#page=papers'); await p.waitForSelector('button:has-text("Seven-day rule")', { timeout: 20000 }); await p.click('button:has-text("Seven-day rule")');
    await p.waitForSelector('text=Seven-day document rule – OFF', { timeout: 10000 }); ok(true, 'off by default');
    await p.locator('#p_15 select').first().selectOption('1'); await p.locator('#p_15 select').nth(1).selectOption('SITE'); await p.click('button:has-text("Save the rule")');
    await p.waitForSelector('text=Seven-day document rule – ON', { timeout: 10000 }); await p.waitForSelector('#p_15 tr:has-text("Late Staff")', { timeout: 10000 });
    ok(/Held – only his papers open/.test(await p.locator('#p_15 tr', { hasText: 'Late Staff' }).innerText()), 'a late Staff person is held');
    await p.screenshot({ path: shots + '/S16_seven_rule.png', fullPage: true });
    const row = p.locator('#p_15 tr', { hasText: 'Late Staff' }); await row.locator('input[type=date]').fill(new Date(Date.now() + 3 * 86400000 + 19800000).toISOString().slice(0, 10)); await row.locator('input[placeholder=why]').fill('His PAN comes on Monday');
    await row.locator('button:has-text("Let in")').click(); await p.waitForSelector('text=Let in up to', { timeout: 10000 }); ok(true, 'let in from the page');
    ok(((await db('GET', 'hr_doc_overrides?select=reason&employee_id=eq.' + e.id)) || []).length === 1, 'written with the reason');
    // Approvals: the waiting bulk correction is taken back
    await p.goto('http://localhost:3064/#page=approvals'); await p.waitForSelector('button:has-text("Take back")', { timeout: 20000 }); await p.click('button:has-text("Take back")'); await p.waitForTimeout(1500);
    ok(((await db('GET', 'hr_asks?select=status&id=eq.' + ask.id))[0] || {}).status === 'cancelled', 'Approvals: taken back');
    await p.screenshot({ path: shots + '/S16_approvals.png' });
    await ACT.docRuleSave(ses('super'), { rule: { on: false } });
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
