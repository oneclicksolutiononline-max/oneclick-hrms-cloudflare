// RIG ONLY – (18-11-2026, his correction) a company policy is of the site open at the top: the form shows the site (nothing to type),
// the policy is kept for that site, its card says so, and another site does not list it. A local HR server on :3073 and the local
// test database on :3140 (never the live site).   timeout 200 node test/rig/cpolicy_site_page.js [folder for the pictures]
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
(async () => { const b = await chromium.launch(), errs = []; let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL ' + t); } };
  const shots = process.argv[2] || '', site = 'CS' + Date.now().toString(36).toUpperCase().slice(-6), site2 = site + 'B', title = 'Site rules ' + site;
  const sites = [{ code: site, name: 'Rig policy', role: 'super' }, { code: site2, name: 'Rig policy two', role: 'super' }];
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3073' }), stdio: 'ignore' });
  const t = crypto.randomBytes(32).toString('base64url'); await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: 'super.' + site.toLowerCase() + '@rig.test', name: 'Rig super', role: 'super', expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig policy', mods: [] } }], 'return=minimal');
  await new Promise(r => setTimeout(r, 1200));
  const cx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await cx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await cx.newPage(); p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto('http://localhost:3073/'); await p.evaluate(() => localStorage.removeItem('rcl_hr_lang')); await p.goto('http://localhost:3073/#page=cpolicies'); await p.waitForSelector('text=New policy', { timeout: 20000 });
    await p.click('button:has-text("New policy")'); await p.waitForSelector('#cp_form .pc15');
    const form = await p.locator('#cp_form').innerText();
    ok(/Site\s+/.test(form) && form.indexOf(site + ' – only this site; for another site, open that site at the top') > -1, 'the site open at the top is shown, nothing to type');
    ok(await p.locator('#cp_form input[placeholder*="every site"]').count() === 0, 'no "empty = every site" box any more');
    await p.fill('#cp_form input[type=text] >> nth=0', title); if (shots) await p.screenshot({ path: shots + '/CP_site_form.png' });
    await p.click('#cp_form button:has-text("Save")'); await p.waitForSelector('.pc15 h3:has-text("' + title + '")', { timeout: 10000 });
    const row = (await db('GET', 'hr_cpolicies?select=id,scope&title=eq.' + encodeURIComponent(title)))[0];
    ok(row && JSON.stringify(row.scope) === JSON.stringify({ sites: [site] }), 'kept for this site only: ' + JSON.stringify(row && row.scope));
    ok(/for: site /.test(await p.locator('.pc15', { hasText: title }).innerText()) && (await p.locator('.pc15', { hasText: title }).innerText()).indexOf('for: site ' + site) > -1, 'its card says its site');
    await p.locator('.pc15', { hasText: title }).locator('button:has-text("Change")').last().click(); await p.waitForSelector('#cp_form .pc15');
    const f2 = await p.locator('#cp_form').innerText(); ok(f2.indexOf(site) > -1 && f2.indexOf('only this site') < 0, 'changing it: its site is shown'); if (shots) await p.screenshot({ path: shots + '/CP_site_change.png' });
    const other = await ACT.cpList({ site: site2, email: 'super.x@rig.test', role: 'super', info: { sites: sites } });
    ok(row && !other.rows.some(r => r.id === row.id), 'another site does not list it – the Super Admin too');
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0); })().catch(e => { console.log('ERR', e.message.slice(0, 600)); process.exit(1); });
