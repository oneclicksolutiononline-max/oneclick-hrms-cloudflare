// RIG ONLY – Phase 6 (18-11-2026) in a browser against a local HR server on :3067 and the local test database (never live): the Reports
// page – the reports of the role, a report shown, as Excel and as PDF; an HR User does not get the Admin / pay reports.
//   timeout 240 node test/rig/reports_page.js        Made-up people only.
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'RP' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig reports ' + tag, role: 'admin' }], shots = process.env.SHOTS || os.tmpdir();
  const A = { site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig admin', role: 'admin', info: { sites: sites } };
  for (const [nm, c] of [['Report One', 'staff'], ['Report Two', 'labour']]) await ACT.empSave(A, { name: nm, category: c, mobile: '9' + String(Date.now()).slice(-6) + String(100 + n++), dob: '1990-01-01', joined_on: '2024-02-01' });
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3067' }), stdio: 'ignore' });
  const sign = async role => { const t = crypto.randomBytes(32).toString('base64url');
    await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig reports ' + tag, mods: [] } }], 'return=minimal'); return t; };
  const b = await chromium.launch(), errs = []; n = 0;
  try {
    await new Promise(r => setTimeout(r, 1200));
    for (const role of ['admin', 'user']) {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: await sign(role), domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
      await p.route('**/vendor/xlsx-0.18.5.full.min.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('/home/claude/rclerp/public/vendor/xlsx-0.18.5.full.min.js') }));
      await p.goto('http://localhost:3067/#page=reports'); await p.waitForSelector('#p_rep table', { timeout: 20000 });
      const opts = await p.locator('#p_rep select[aria-label=Report] option').allInnerTexts();
      if (role === 'admin') {
        ok(opts.length === 22 && opts.includes('Manual entries and corrections') && !opts.some(o => /locked months|Advances|Salaries/.test(o)), 'the HR Admin: 22 reports, no pay report (' + opts.length + ')');
        ok(/Report One/.test(await p.locator('#p_rep table').innerText()), 'the first report is shown (Employee list)');
        await p.locator('#p_rep select[aria-label=Report]').selectOption('headcount'); await p.waitForSelector('#p_rep td:has-text("Total")', { timeout: 10000 }); ok(true, 'headcount');
        await p.screenshot({ path: shots + '/S6_reports.png', fullPage: true });
        const dl = p.waitForEvent('download', { timeout: 15000 }); await p.click('#p_rep button:has-text("Excel")'); const f = await dl; ok(/^Headcount_by_department_and_category_RP\w+_\d{4}-\d{2}-\d{2}\.xlsx$/.test(f.suggestedFilename()), 'Excel: ' + f.suggestedFilename());
        const pop = p.waitForEvent('popup', { timeout: 15000 }); await p.click('#p_rep button:has-text("PDF")'); const w = await pop; await w.waitForSelector('table'); ok(/Headcount by department and category/.test(await w.locator('h1').innerText()), 'the PDF page'); await w.screenshot({ path: shots + '/S6_report_pdf.png' }); await w.close();
      } else ok(opts.length === 20 && !opts.includes('Manual entries and corrections') && !opts.includes('Phones for attendance'), 'the HR User: 20 reports, no Admin report (' + opts.length + ')');
      await ctx.close();
    }
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
