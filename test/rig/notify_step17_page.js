// RIG ONLY – step 17 (18-11-2026, Phase 4) in a browser against a local HR server on :3065 and the local test database (never live):
// the Notifications page – the switches, the site's shift reminders switched on, a failed message sent again.
//   timeout 240 node test/rig/notify_step17_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'PN' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig note ' + tag, role: 'super' }];
  const A = { site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig admin', role: 'admin', info: { sites: sites } }, shots = process.env.SHOTS || os.tmpdir();
  const e = await ACT.empSave(A, { name: 'Note Page', category: 'staff', mobile: '9' + String(Date.now()).slice(-9), dob: '1990-01-01' });
  const row = (await db('POST', 'hr_notify_queue', [{ site: site, employee_id: e.id, channel: 'email', kind: 'doc_pending', to_addr: 'note.page@rig.test', title: 'Papers due', body: 'b', dedupe: 'page17|' + tag, status: 'failed', attempts: 4, error: 'the e-mail service refused (500)' }], 'return=representation'))[0];
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3065' }), stdio: 'ignore' });
  const sign = async role => { const t = crypto.randomBytes(32).toString('base64url');
    await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig note ' + tag, mods: [] } }], 'return=minimal'); return t; };
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: await sign('super'), domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    await p.goto('http://localhost:3065/#page=notices'); await p.waitForSelector('text=Shift reminders – OFF', { timeout: 20000 });
    ok(/Messages: OFF/.test(await p.locator('#p_15').innerText()), 'the switches are shown (off)');
    ok(/the e-mail service refused/.test(await p.locator('#p_15 tr', { hasText: 'Papers due' }).innerText()), 'a failed message with why; the address masked: ' + /n…@rig\.test/.test(await p.locator('#p_15 tr', { hasText: 'Papers due' }).innerText()));
    await p.locator('#p_15 .pc15 select').first().selectOption('1'); await p.click('button:has-text("Save")'); await p.waitForSelector('text=Shift reminders – ON', { timeout: 10000 }); ok(true, 'the site\'s reminders switched on');
    await p.screenshot({ path: shots + '/S17_notices.png', fullPage: true });
    await p.locator('#p_15 tr', { hasText: 'Papers due' }).locator('button:has-text("Send again")').click(); await p.waitForTimeout(1200);
    ok(((await db('GET', 'hr_notify_queue?select=status&id=eq.' + row.id))[0] || {}).status === 'queued', 'sent again from the page');
    await db('POST', 'hr_settings?on_conflict=site,key', [{ site: site, key: 'notify', value: { shift_on: false, offsets: [-15, 0, 15, 30] } }], 'resolution=merge-duplicates,return=minimal');
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
