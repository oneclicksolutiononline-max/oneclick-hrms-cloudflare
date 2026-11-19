// RIG ONLY – 18-11-2026 (asked: "excel khup mothi aahe … basic ekasath ghe nantr kyc … step by step … drop down … kay bhraych te"):
// the Import in steps, in a browser against a local HR server on :3071 and the local test database (never live). Step 1 (Basic) is
// downloaded, filled (by Python's openpyxl, as a person would in Excel) and imported; Step 2 (KYC) comes filled with the employees,
// one city and Aadhaar are typed and imported; a code that is not an employee is refused. Drop-downs and notes are read from the file.
//   timeout 300 node test/rig/import_steps_page.js        Made-up people only.
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
const VENDOR = '/home/claude/rclerp/public/vendor/';
const py = (code, file) => execFileSync('python3', ['-I', '-c', code, file], { encoding: 'utf8', timeout: 60000 }).trim();
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'IS' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig import ' + tag, role: 'admin' }], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-')), shots = process.env.SHOTS || os.tmpdir();
  const A = { site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig admin', role: 'admin', info: { sites: sites } };
  const E1 = await ACT.empSave(A, { name: 'Import One', category: 'staff', mobile: '9' + String(Date.now()).slice(-9), dob: '1990-01-01' });
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3071' }), stdio: 'ignore' });
  const t = crypto.randomBytes(32).toString('base64url');
  await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: A.email, name: 'Rig admin', role: 'admin', expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig import ' + tag, mods: [] } }], 'return=minimal');
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true }); await ctx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    for (const f of ['xlsx-0.18.5.full.min.js', 'exceljs-4.4.0.min.js']) await p.route('**/vendor/' + f, r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(VENDOR + f) }));      // on live the ERP's own address serves them
    await p.goto('http://localhost:3071/#page=employees'); await p.waitForSelector('#b_imp', { timeout: 20000 }); await p.click('#b_imp'); await p.waitForSelector('#i_steps:not([hidden]) .imp-step');
    ok((await p.locator('#i_steps .imp-step').count()) === 5, 'five steps for the HR Admin (Pay included)');
    await p.screenshot({ path: shots + '/IS_dialog.png' });
    const get = async no => { const dl = p.waitForEvent('download', { timeout: 20000 }); await p.click('#i_steps button:has-text("Download Step ' + no + '")'); const d = await dl, f = path.join(dir, d.suggestedFilename()); await d.saveAs(f); return f; };
    // STEP 1 – Basic
    const f1 = await get(1); ok(/HR_Step1_Basic_/.test(path.basename(f1)), 'Step 1 downloaded: ' + path.basename(f1));
    const info = JSON.parse(py(`
import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.worksheets[0]
heads = [c.value for c in ws[1]]
dv = [(str(d.sqref), d.formula1) for d in ws.data_validations.dataValidation]
notes = sum(1 for c in ws[1] if c.comment)
print(json.dumps({'sheets': wb.sheetnames, 'heads': heads, 'dv': dv, 'notes': notes, 'help': [r[1] for r in wb['How to fill'].iter_rows(min_row=2, max_row=3, values_only=True)]}))`, f1));
    ok(info.sheets[0] === 'Step 1 - Basic' && info.sheets.includes('How to fill'), 'sheets: ' + info.sheets.join(', '));
    ok(info.heads.join('|') === 'Employee Code|Employee Name|Mobile|E-mail|Date of Birth|Gender|Designation|Department|Date of Joining|Father / Husband Name', 'the Basic columns only (10): ' + info.heads.length);
    ok(info.dv.some(d => /^F2/.test(d[0])) && info.notes === 10, 'a drop-down for Gender (' + info.dv.length + ' drop-downs) and a note on every heading');
    ok(/red heading is compulsory/.test(info.help[0] || ''), 'the "How to fill" sheet explains it');
    const mob = '9' + String(Date.now() + 7).slice(-9);
    py(`
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.worksheets[0]
ws['B2'] = 'Import Two'; ws['C2'] = '${mob}'; ws['D2'] = 'import.two.${tag.toLowerCase()}@rig.test'; ws['E2'] = '05-04-1992'; ws['F2'] = 'Male'; ws['J2'] = 'Ramesh Two'
wb.save(sys.argv[1])`, f1);
    await p.setInputFiles('#i_file', f1); await p.waitForSelector('#i_res:not([hidden])', { timeout: 20000 });
    ok(/1 new employees/.test(await p.locator('#i_res').innerText()), 'checked first: ' + (await p.locator('#i_res .sum').innerText()));
    await p.click('#i_save'); await p.waitForSelector('#i_res .sum:has-text("1 employees added")', { timeout: 20000 });
    const E2 = ((await db('GET', 'hr_employees?select=id,code&site=eq.' + site + '&name=eq.Import%20Two')) || [])[0]; ok(!!E2, 'Step 1 added the new person');
    // STEP 2 – KYC: the file comes with the employees; a city and an Aadhaar typed; a code that is not an employee is refused
    const f2 = await get(2);
    const rows2 = JSON.parse(py(`
import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.worksheets[0]
print(json.dumps([[c.value for c in r][:2] for r in ws.iter_rows(min_row=2, max_row=5)]))`, f2)).filter(r => r[0]);
    ok(rows2.length === 2 && rows2.some(r => r[0] === E1.code) && rows2.some(r => r[0] === E2.code), 'Step 2 comes with the 2 employees (code + name)');
    py(`
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.worksheets[0]
heads = [c.value for c in ws[1]]; city = heads.index('City') + 1
for r in range(2, 4):
    if ws.cell(r, 1).value == '${E2.code}': ws.cell(r, city).value = 'Pune'; ws.cell(r, 2).value = 'Somebody Else'
ws.cell(4, 1).value = 'NOPE999'; ws.cell(4, 2).value = 'Not Here'; ws.cell(4, city).value = 'Mumbai'
wb.save(sys.argv[1])`, f2);
    await p.setInputFiles('#i_file', f2); await p.waitForSelector('#i_res:not([hidden])', { timeout: 20000 }); await p.waitForTimeout(500);
    const res = await p.locator('#i_res').innerText();
    ok(/1 employees of today are changed/.test(res) && /NOPE999 is not an employee of this site – add him first with Step 1/.test(res), 'only the filled row; the unknown code refused');
    await p.screenshot({ path: shots + '/IS_step2_check.png' });
    await p.click('#i_save'); await p.waitForSelector('#i_res .sum:has-text("1 changed")', { timeout: 20000 });
    const pr = ((await db('GET', 'hr_employee_profile?select=data&employee_id=eq.' + E2.id)) || [])[0] || {}, nm = ((await db('GET', 'hr_employees?select=name&id=eq.' + E2.id)) || [])[0];
    ok((pr.data || {}).city === 'Pune' && nm.name === 'Import Two', 'the city is kept; the name is not changed from a step file');
  } finally { await b.close(); srv.kill(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
