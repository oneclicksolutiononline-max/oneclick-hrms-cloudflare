// RIG ONLY – (19-11-2026, asked: "ekda employee add zal tyach name rcl employe code te sagle changes krta yawet … 62 employee aahet … mi
// kay karel export karel sagli list detail madhe yeil tya excel madhe mi je changes krel mg employee code aso ki baki gosti prt tich
// import krel tr je changes zalet tech updet hoil") EXPORT → CHANGE IN EXCEL → IMPORT THE SAME FILE, in a browser against a local HR
// server on :3078 and the local test database (never live). The file is changed by Python's openpyxl, as a person would in Excel: one
// employee's code and name, another's mobile, a third left as he is; then a date of birth – asked with a reason. Made-up people only.
//   timeout 300 node test/rig/sheet_roundtrip_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
const VENDOR = '/home/claude/rclerp/public/vendor/';
const py = (code, file) => execFileSync('python3', ['-I', '-c', code, file], { encoding: 'utf8', timeout: 60000 }).trim();
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'RT' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig round trip ' + tag, role: 'admin' }], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-')), shots = process.env.SHOTS || os.tmpdir();
  const A = { site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig admin', role: 'admin', info: { sites: sites } };
  const mob = k => '9' + String(Date.now() + k).slice(-9);
  const mo2 = mob(2), ml1 = 'trip.one.' + tag.toLowerCase() + '@rig.test', ml1b = 'trip.one.new.' + tag.toLowerCase() + '@rig.test', E1 = await ACT.empSave(A, { name: 'Trip One', category: 'staff', mobile: mob(1), email: ml1, dob: '1990-01-01' }), E2 = await ACT.empSave(A, { name: 'Trip Two', category: 'staff', mobile: mo2, dob: '1991-02-02' }), E3 = await ACT.empSave(A, { name: 'Trip Three', category: 'staff', mobile: mob(3), dob: '1992-03-03' });
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3078' }), stdio: 'ignore' });
  const t = crypto.randomBytes(32).toString('base64url');
  await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: A.email, name: 'Rig admin', role: 'admin', expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig round trip ' + tag, mods: [] } }], 'return=minimal');
  const b = await chromium.launch(), errs = [], emp = async id => ((await db('GET', 'hr_employees?select=*&id=eq.' + id)) || [])[0];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true }); await ctx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    for (const f of ['xlsx-0.18.5.full.min.js', 'exceljs-4.4.0.min.js']) await p.route('**/vendor/' + f, r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(VENDOR + f) }));      // on live the ERP's own address serves them
    // (19-11-2026) the Portal's api/hrlogin – a stand-in: what HR tells it of an e-mail changed ("moved")
    const portal = []; await p.route('http://127.0.0.1:9/portal/api/hrlogin', async r => { const j = JSON.parse(r.request().postData() || '{}'); portal.push(j); await r.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(j.moved) ? { ok: true, moved: j.moved.map(() => ({ state: 'moved' })) } : { ok: true, signins: (j.check || []).map(() => 'has'), link: [] }) }); });
    await p.goto('http://localhost:3078/#page=employees'); await p.waitForSelector('#b_exp', { timeout: 20000 }); await p.waitForTimeout(800);
    // 1. EXPORT
    const dl = p.waitForEvent('download', { timeout: 20000 }); await p.click('#b_exp'); const d = await dl, f = path.join(dir, d.suggestedFilename()); await d.saveAs(f);
    const info = JSON.parse(py(`
import sys, json, openpyxl
ws = openpyxl.load_workbook(sys.argv[1]).worksheets[0]; heads = [c.value for c in ws[1]]
print(json.dumps({'heads': heads, 'rows': [[c.value for c in r] for r in ws.iter_rows(min_row=2, values_only=False)]}, default=str))`, f));
    const H = info.heads, col = h => H.indexOf(h), rowOf = id => info.rows.find(r => r[col('HR ID (do not change)')] === id);
    ok(H[H.length - 1] === 'HR ID (do not change)' && info.rows.length === 3 && rowOf(E1.id) && rowOf(E1.id)[col('Employee Code')] === E1.code, 'the export: 3 employees, the last column is the HR ID');
    // 2. CHANGED IN EXCEL: E1's code and name, E2's mobile; E3 as he is
    const nc = 'NEW' + tag.slice(-4), m2 = mob(9);
    py(`
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.worksheets[0]; heads = [c.value for c in ws[1]]
c = lambda h: heads.index(h) + 1
for r in range(2, ws.max_row + 1):
    hid = ws.cell(r, c('HR ID (do not change)')).value
    if hid == '${E1.id}': ws.cell(r, c('Employee Code')).value = '${nc}'; ws.cell(r, c('Employee Name')).value = 'Trip One Renamed'; ws.cell(r, c('E-mail')).value = '${ml1b}'
    if hid == '${E2.id}': ws.cell(r, c('Mobile')).value = '${m2}'
wb.save(sys.argv[1])`, f);
    // 3. IMPORT THE SAME FILE: checked first – what changes, employee by employee
    await p.click('#b_imp'); await p.waitForSelector('#dlg_imp:not([hidden])'); await p.setInputFiles('#i_file', f); await p.waitForSelector('#i_res:not([hidden]) .chg', { timeout: 20000 });
    const res = await p.locator('#i_res').innerText();
    ok(/2 employees of today are changed · 1 stay the same · 0 with a fault/.test(res), 'checked first: ' + res.split('\n')[0]);
    ok(res.indexOf('Employee Code ' + E1.code + ' → ' + nc) > -1 && res.indexOf('Employee Name: Trip One → Trip One Renamed') > -1 && res.indexOf('Mobile: ' + mo2 + ' → ' + m2) > -1, 'what will change is listed');
    ok(await p.locator('#i_save').innerText() === 'Save 2 employees', 'Save – only the 2 that change');
    await p.locator('#i_res .chg').scrollIntoViewIfNeeded(); await p.screenshot({ path: shots + '/RT_1_check.png' });
    const before3 = (await emp(E3.id)).updated_at;
    await p.click('#i_save'); await p.waitForSelector('#i_res .sum:has-text("2 changed")', { timeout: 20000 });
    const e1 = await emp(E1.id), e2 = await emp(E2.id), e3 = await emp(E3.id);
    ok(e1.code === nc && e1.name === 'Trip One Renamed' && e1.email === ml1b && e2.mobile === m2 && e3.updated_at === before3, 'saved: the same employees – his new code, name and e-mail, the new mobile; the third not written');
    for (let i = 0; i < 20 && !portal.some(j => Array.isArray(j.moved)); i++) await p.waitForTimeout(250);
    const mv = portal.filter(j => Array.isArray(j.moved));
    ok(mv.length === 1 && mv[0].moved.length === 1 && mv[0].moved[0].was === ml1 && mv[0].moved[0].email === ml1b && mv[0].site === site, '(19-11-2026) his e-mail changed: the Portal is told once – the e-mail of before and the new one – his sign-in follows');
    await p.screenshot({ path: shots + '/RT_2_saved.png' });
    // 4. A DATE OF BIRTH changed: asked with a reason
    py(`
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.worksheets[0]; heads = [c.value for c in ws[1]]
c = lambda h: heads.index(h) + 1
for r in range(2, ws.max_row + 1):
    if ws.cell(r, c('HR ID (do not change)')).value == '${E3.id}': ws.cell(r, c('Date of Birth')).value = '04-03-1992'
wb.save(sys.argv[1])`, f);
    await p.setInputFiles('#i_file', []); await p.setInputFiles('#i_file', f); await p.waitForSelector('#i_reason', { timeout: 20000 });
    const r2 = await p.locator('#i_res').innerText();
    ok(/1 employees of today are changed · 2 stay the same/.test(r2) && r2.indexOf('Date of Birth: 03-03-1992 → 04-03-1992') > -1, 'the second file: only the date changes (the first changes are in HR now)');
    await p.click('#i_save'); await p.waitForTimeout(500);
    ok(/Write why the dates change/.test(await p.locator('#i_err').innerText()) && (await emp(E3.id)).dob === '1992-03-03', 'no reason – nothing saved');
    await p.fill('#i_reason', 'Corrected from his school certificate'); await p.screenshot({ path: shots + '/RT_3_reason.png' });
    await p.click('#i_save'); await p.waitForSelector('#i_res .sum:has-text("1 changed")', { timeout: 20000 });
    const au = ((await db('GET', 'hr_audit?select=detail&site=eq.' + site + '&action=eq.Employee sheet imported&order=id.desc&limit=1')) || [])[0].detail;
    ok((await emp(E3.id)).dob === '1992-03-04' && au.reason === 'Corrected from his school certificate', 'saved with the reason, kept in the record');
  } finally { await b.close(); srv.kill(); await db('DELETE', 'hr_sessions?site=eq.' + site, undefined, 'return=minimal').catch(() => {}); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
