// RIG ONLY – (18-11-2026, his answer: "sagle Rule Book madhe", the company policies too) every rule in ONE place: the menu shows only
// "Rule Book"; its row of parts (Policies · Shifts & holidays · Face & requests · HR Admin's powers · Company policies) opens each; the
// face is set once for the whole site there and nothing else of the rules changes; the site's rules of before are shown in the Rule
// Book. A local HR server on :3074 and the local test database on :3140 (never the live site).
//   timeout 240 node test/rig/rulebook_one_place_page.js [folder for the pictures]
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
(async () => { const b = await chromium.launch(), errs = []; let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL ' + t); } else console.log('ok   ' + t); };
  const shots = process.argv[2] || '', site = 'OP' + Date.now().toString(36).toUpperCase().slice(-6), sites = [{ code: site, name: 'Rig one place', role: 'super' }];
  const SU = { site: site, email: 'super.' + site.toLowerCase() + '@rig.test', name: 'Rig super', role: 'super', info: { sites: sites } };
  await ACT.rulesSave(SU, { valid_from: '2026-01-01', full_hours: 9, half_hours: 4.5, grace_min: 10, week_off: [0] });
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3074' }), stdio: 'ignore' });
  const t = crypto.randomBytes(32).toString('base64url'); await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: SU.email, name: 'Rig super', role: 'super', expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig one place', mods: [] } }], 'return=minimal');
  await new Promise(r => setTimeout(r, 1200));
  const cx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await cx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await cx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const parts = () => p.$$eval('#p_booknav button', bs => bs.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')));
  const menuOn = () => p.$$eval('#tabs button.tab.on', bs => bs.map(x => x.dataset.page));
  try {
    await p.goto('http://localhost:3074/'); await p.evaluate(() => localStorage.removeItem('rcl_hr_lang')); await p.goto('http://localhost:3074/#page=rulebook'); await p.waitForSelector('.rb-k', { timeout: 20000 }); await p.waitForTimeout(600);
    const menu = await p.$$eval('#tabs button.tab', bs => bs.map(x => x.dataset.page));
    ok(menu.indexOf('rulebook') > -1 && ['rules', 'rface', 'rpowers', 'cpolicies'].every(k => menu.indexOf(k) < 0), 'the menu: only "Rule Book" – no "Shifts & rules", no "Company policies"');
    ok(JSON.stringify(await parts()) === JSON.stringify(['Policies*', 'Shifts & holidays', 'Face & requests', 'HR Admin\'s powers', 'Company policies']), 'the Rule Book\'s row of parts: ' + JSON.stringify(await parts()));
    const old = await p.locator('.rb-old').innerText(); ok(/9 hours or more/.test(old) && /4.5 hours or more/.test(old), 'Attendance: no policy of the site yet – the rules of before are shown: ' + old.replace(/\s+/g, ' ').slice(0, 120));
    if (shots) await p.screenshot({ path: shots + '/RB1_policies.png' });
    await p.click('#p_booknav button:has-text("Face & requests")'); await p.waitForSelector('#p_mus select', { timeout: 10000 }); await p.waitForTimeout(300);
    ok(JSON.stringify(await menuOn()) === '["rulebook"]' && (await parts())[2] === 'Face & requests*', 'Face & requests open – the menu still on "Rule Book"');
    const sels = p.locator('#p_mus select'); await sels.nth(0).selectOption('yes'); await p.fill('#p_mus input[type=number]', '85'); if (shots) await p.screenshot({ path: shots + '/RB1_face.png' });
    await p.click('#p_mus button:has-text("Save")'); await p.waitForTimeout(1500);
    const now = (await ACT.attSetup(SU)).rules; ok(now.face === true && now.face_min === 85 && now.full_hours === 9 && now.grace_min === 10 && JSON.stringify(now.week_off) === '[0]', 'saved for the whole site: the face needed, 85 % – the hours, the late rule and the weekly off as they were: ' + JSON.stringify(now));
    await p.click('#p_booknav button:has-text("Shifts & holidays")'); await p.waitForTimeout(1200); const sh = await p.locator('#p_mus').innerText();
    ok(/Shifts/.test(sh) && /Holidays/.test(sh) && !/Attendance rules/.test(sh) && !/What the HR Admin may do/.test(sh), 'Shifts & holidays: the shifts and the holidays – no second set of rules');
    await p.click('#p_booknav button:has-text("HR Admin\'s powers")'); await p.waitForTimeout(1200); ok(/What the HR Admin may do on this site/.test(await p.locator('#p_mus').innerText()), 'HR Admin\'s powers');
    await p.click('#p_booknav button:has-text("Company policies")'); await p.waitForSelector('#p_15:not([hidden])', { timeout: 10000 }); await p.waitForTimeout(1000);
    ok((await p.locator('#p_title').innerText()) === 'Rule Book' && /Company policies/.test(await p.locator('#p_sub').innerText()) && JSON.stringify(await menuOn()) === '["rulebook"]', 'Company policies – inside the Rule Book');
    if (shots) await p.screenshot({ path: shots + '/RB1_cpolicies.png' });
    await p.goto('http://localhost:3074/#page=rules'); await p.reload(); await p.waitForTimeout(2500); ok((await parts())[1] === 'Shifts & holidays*' && JSON.stringify(await menuOn()) === '["rulebook"]', 'an old link (#page=rules) still opens – inside the Rule Book');
    ok((await p.evaluate(() => window.HR.pages().map(x => x[0]))).indexOf('rface') > -1, 'Ctrl K still finds "Face & requests"');
    await p.goto('http://localhost:3074/#page=employees'); await p.reload(); await p.waitForTimeout(1500); ok(await p.locator('#p_booknav').isHidden(), 'another page: no Rule Book row');
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0); })().catch(e => { console.log('ERR', e.message.slice(0, 600)); process.exit(1); });
