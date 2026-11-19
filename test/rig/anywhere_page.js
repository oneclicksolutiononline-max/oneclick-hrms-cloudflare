// RIG ONLY – (19-11-2026, asked: "all over asse kahi lok aahet ki kuthun pn login kru shaktat ass ek option banaw ani ha web warun access
// dila jail app updet chi garaj lagu naye") "ANYWHERE" on the Work places page (By person → Change): given with the reason (none – asked),
// shown on his line, taken back. A local HR server on :3079 and the local test database (never live). Made-up people only.
//   timeout 240 node test/rig/anywhere_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr'), AW = require('../../lib/anywhere');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'AW' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig anywhere ' + tag, role: 'admin' }], shots = process.env.SHOTS || os.tmpdir();
  const A = { site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig admin', role: 'admin', info: { sites: sites } };
  const E = await ACT.empSave(A, { name: 'Travel Person', category: 'staff', mobile: '9' + String(Date.now()).slice(-9), dob: '1990-01-01' });
  await ACT.empSave(A, { name: 'Site Person', category: 'labour', mobile: '8' + String(Date.now() + 3).slice(-9), dob: '1991-01-01' });
  await ACT.placeSave(A, { name: 'Gate ' + tag, kind: 'office', lat: 18.52, lng: 73.85, radius_m: 200, valid_from: '2026-01-01' });
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3079' }), stdio: 'ignore' });
  const t = crypto.randomBytes(32).toString('base64url');
  await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: A.email, name: 'Rig admin', role: 'admin', expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig anywhere ' + tag, mods: [] } }], 'return=minimal');
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    await p.goto('http://localhost:3079/#page=places'); await p.waitForSelector('#pv_person', { timeout: 20000 }); await p.click('#pv_person'); await p.waitForSelector('.pm-change', { timeout: 15000 });
    const line = () => p.locator('#p_att tbody tr', { hasText: E.code }).first();
    await line().locator('.pm-change').click(); await p.waitForSelector('.pm-anybox', { timeout: 10000 });
    ok(/Anywhere – Travel Person may mark attendance from ANY place/.test(await p.locator('.pm-anybox').innerText()) && !(await p.locator('.pm-anyon').isChecked()), 'his row offers "Anywhere" (not given yet)');
    await p.check('.pm-anyon'); await p.click('.pm-anysave'); await p.waitForTimeout(900);
    ok(await p.locator('#toast.bad:not([hidden])').count() === 1 && !(await AW.on(site, E.id, require('../../lib/rules').today())), 'no reason: it asks for it, nothing is kept');
    await p.fill('.pm-anywhy', 'Head office staff – travels to the sites'); await p.screenshot({ path: shots + '/AW_1_give.png' });
    await p.click('.pm-anysave'); await p.waitForSelector('.pm-any', { timeout: 15000 });
    ok((await line().locator('.pm-any').innerText()) === 'Anywhere' && !!(await AW.on(site, E.id, require('../../lib/rules').today())), 'saved: his line says "Anywhere"');
    await p.screenshot({ path: shots + '/AW_2_line.png' });
    // up to a date
    await line().locator('.pm-change').click(); await p.waitForSelector('.pm-anybox'); ok(await p.locator('.pm-anyon').isChecked(), 'the box shows it given');
    const until = require('../../lib/day').addDays(require('../../lib/rules').today(), 5); await p.fill('.pm-anyuntil', until); await p.fill('.pm-anywhy', 'Till the end of the visit'); await p.click('.pm-anysave');
    await p.waitForFunction(u => { const x = document.querySelector('.pm-any'); return x && x.textContent.indexOf(u) > -1; }, until.split('-').reverse().join('-'), { timeout: 15000 });
    ok((await AW.on(site, E.id, until)) && !(await AW.on(site, E.id, require('../../lib/day').addDays(until, 1))), 'up to a date: counts until then');
    // taken back
    await line().locator('.pm-change').click(); await p.waitForSelector('.pm-anybox'); await p.uncheck('.pm-anyon'); await p.fill('.pm-anywhy', 'Back at the site'); await p.click('.pm-anysave'); await p.waitForTimeout(1200);
    ok(await line().locator('.pm-any').count() === 0 && !(await AW.on(site, E.id, require('../../lib/rules').today())), 'taken back: his line has only his work place');
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no sideways scroll');
  } finally { await b.close(); srv.kill(); await db('DELETE', 'hr_sessions?site=eq.' + site, undefined, 'return=minimal').catch(() => {}); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
