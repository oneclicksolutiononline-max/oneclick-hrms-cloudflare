/* THE EMPLOYEE SHEET (13-11-2026) – ONE Excel format to bring employees in and to take them out.
 * Asked with the company's own sheet ("Employee Detail All"): "je excel madhe column aahet te same column sagle aaple attendance
 * madhe hawet … mala ha data import karaycha aahe … apli excel pn same asel import export sathi … excel madhle code as it is …
 * adhar pan … bank details … ifsc … sagle kahi import export excel madhe asel … yes no je aahe te softwer madhe tas".
 *   – The first 29 columns are the company's sheet, heading for heading, in its order. After them: mobile, e-mail, date of birth,
 *     designation, department, Aadhaar, the family number, the addresses, PF / ESIC / bank and the rest of the profile.
 *   – NO "Category" column (his word: "categery colum remove kruya ani designation he theu yatun categery samjun yete"): a
 *     DESIGNATION carries its category (Staff / Operator / Driver / Labour – the HR Admin sets it on the Designations page); an
 *     employee without a designation is Staff. A file that still has a Category column is read as before.
 *   – IMPORT = add or change. A row whose Employee Code is an employee of this site CHANGES him – only the cells that are filled,
 *     an empty cell changes nothing. A row with a new code (or none: the code is made) ADDS him – and a new employee needs a
 *     MOBILE NUMBER OR AN E-MAIL ("he nasel tr import nahi honar": he signs in with one of them). A row with a fault is not saved
 *     and comes back with its line and why; the good rows are saved. check: 1 = only look, nothing is saved.
 *   – The codes of the sheet are kept as they are; the counter of the codes made by themselves is moved past them.
 *   – Pay (CTC and the pay details, Deduct PF / ESIC / PT) is read only from the HR Admin / Super Admin. The monthly CTC becomes
 *     the employee's SALARY, approved at once, only when the HO HR / Super Admin imports ("import kelel thew pagar pakad").
 *   – EXPORT gives the same columns (the template = the same file without rows). Numbers that are secret (Aadhaar, UAN, PF, ESIC,
 *     bank account) and the pay are written only for the HR Admin / Super Admin. Every import and export is in the audit –
 *     never a number.
 *   – (19-11-2026, asked: "ekda employee add zal tyach name rcl employe code te sagle changes krta yawet … 62 employee aahet saglenche
 *     change kraych aahet … export karel … tya excel madhe mi je changes krel mg employee code aso ki baki gosti prt tich import krel tr
 *     je changes zalet tech updet hoil") EXPORT → CHANGE → IMPORT THE SAME FILE. The export's last column, "HR ID (do not change)", is
 *     the employee himself: a row with it changes HIM – also his Employee Code and his name (never to another employee's code). Only
 *     what differs is saved; the check first lists, employee by employee, what will change (and how many stay the same). A changed date
 *     of birth / joining date needs ONE reason for the file (kept with the change, as on his page). A row without the HR ID (an old
 *     file, a step file, a new person) is found by its Employee Code as before.
 * No code of any other HR product is used. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const P = require('./act_profile');
const PAY = require('./act_pay');
const { isHo } = require('./act_month');
const BK = require('./act_bank');      // (step 14) a bank change waits for the HO HR / Super Admin

const isAdmin = s => s.role === 'admin' || s.role === 'super';
const soft = p => p.catch(e => { if (e && e.code === 'notinstalled') return null; throw e; });
const blank = v => v === undefined || v === null || String(v).trim() === '';
const norm = v => String(v === undefined || v === null ? '' : v).toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, '');
const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');
const yn = v => { if (v === true || v === false) return v; const t = String(v).trim().toLowerCase(); return ['yes', 'y', 'true', '1'].indexOf(t) > -1 ? true : ['no', 'n', 'false', '0'].indexOf(t) > -1 ? false : null; };
const inList = async (path, ids, size) => { const out = []; for (let i = 0; i < ids.length; i += size || 80) ((await db('GET', path + '=in.(' + ids.slice(i, i + (size || 80)).join(',') + ')')) || []).forEach(r => out.push(r)); return out; };

/* a column: key (what the page sends), head (the heading of the file), where it is kept, other headings read as this one.
 * kind: emp (the Employee Master) | master | priv (his own details) | prof [group, detail] | tick (PF / ESIC / PT) | none */
const c = (key, head, kind, more) => Object.assign({ key: key, head: head, kind: kind }, more || {});
const pf = (key, head, group, more) => c(key, head, 'prof', Object.assign({ group: group, field: (more && more.field) || key }, more || {}));
const COLS = [
  // ── the company's own sheet: its 29 columns, as they are ──
  pf('company', 'Name of Company', 'job', { fill: true }), pf('branch', 'Branch Name', 'job', { fill: true }), pf('project', 'Current Project Name', 'job'),
  pf('uan', 'UAN No.', 'secret', { also: ['uan', 'uannumber'] }), c('name', 'Employee Name', 'emp', { also: ['name', 'नाव'] }), c('code', 'Employee Code', 'emp', { also: ['code', 'empcode', 'employeeid', 'employeeno'] }),
  pf('ctc', 'Auto Monthly CTC', 'pay', { field: 'ctc_monthly', also: ['monthlyctc', 'ctc'] }), c('joined_on', 'Date of Joining', 'emp', { also: ['doj', 'joiningdate', 'joining', 'joinedon', 'joined'] }),
  pf('employment_type', 'Employee Status', 'job'), pf('retained', 'Employee Retained', 'job'), pf('sign_in', 'Sign In', 'job'), pf('sign_out', 'Sign Out', 'job'),
  c('pan', 'PAN', 'priv', { also: ['panno', 'pannumber'] }), c('pf', 'Deduct PF', 'tick'), pf('probation_days', 'Probation Period In Days', 'job'),
  pf('esic_contribution_rate', 'ESIC Contribution Rate', 'pay'), c('esic', 'Deduct ESIC', 'tick'), pf('esic_type', 'ESIC Type', 'pay'), pf('esic_deduction_rate', 'ESIC Deduction Rate', 'pay'),
  c('pt', 'Deduct PT', 'tick'), pf('tds_type', 'TDS Type', 'pay'), pf('attach', 'Attach', 'pay'), pf('basic', 'Basic', 'pay'), pf('pay_period', 'Check Time', 'pay'),
  pf('annual_bonus', 'Annual Bonus', 'pay'), pf('deduct_income_tax', 'Deduct Income Tax', 'pay'), pf('annual_medical', 'Annual Medical Reimbursement', 'pay'), pf('annual_lta', 'Annual LTA', 'pay'),
  c('totals', 'Totals', 'none'),
  // ── what a person signs in with, and the rest of his record ──
  c('mobile', 'Mobile', 'emp', { also: ['mobileno', 'mobilenumber', 'phone', 'phoneno', 'contact', 'contactno', 'contactnumber'] }), c('email', 'E-mail', 'emp', { also: ['emailid', 'emailaddress', 'mail'] }),
  c('dob', 'Date of Birth', 'emp', { also: ['dob', 'birthdate'] }), c('gender', 'Gender', 'emp', { also: ['sex'] }),
  c('designation', 'Designation', 'master', { also: ['post'] }), c('department', 'Department', 'master', { also: ['dept'] }),
  c('aadhaar', 'Aadhaar', 'priv', { also: ['aadhar', 'adhar', 'aadhaarno', 'aadharno', 'adharno', 'aadhaarnumber', 'aadharnumber'] }), c('mobile2', 'Second Mobile', 'priv', { also: ['secondarymobile', 'alternatemobile'] }),
  c('family_name', 'Family Member Name', 'priv'), c('family_relation', 'Family Relation', 'priv'), c('family_mobile', 'Family Mobile', 'priv', { also: ['familynumber', 'familymobileno'] }),
  c('address_current', 'Current Address', 'priv', { also: ['address', 'presentaddress'] }), c('address_permanent', 'Permanent Address', 'priv'),
  pf('prefix', 'Prefix', 'profile'), pf('father_name', 'Father / Husband Name', 'profile', { also: ['fathersname', 'fathername', 'husbandname', 'fathershusbandsname'] }), pf('marital', 'Marital Status', 'profile'), pf('blood', 'Blood Group', 'profile'),
  pf('nationality', 'Nationality', 'profile'), pf('disability', 'Physical Disability', 'profile'), pf('official_email', 'Official E-mail', 'profile'), pf('cug', 'CUG Number', 'profile'), pf('name_aadhaar', 'Name as on Aadhaar', 'profile'),
  pf('employee_type', 'Employee Type', 'job'), pf('worker_type', 'Type of Worker', 'job'), pf('skill_category', 'Skill Category', 'job'), pf('probation_end', 'Probation Ends On', 'job'), pf('confirmation_date', 'Confirmation Date', 'job'),
  pf('notice_days', 'Notice Period (Days)', 'job'), pf('retirement_age', 'Retirement Age', 'job'), pf('overtime', 'Overtime Applicable', 'job'),
  pf('pf_no', 'PF Number', 'secret', { also: ['pfno'] }), pf('pf_join', 'PF Joining Date', 'secret'), pf('esic_no', 'ESIC Number', 'secret', { also: ['esicno'] }), pf('esic_join', 'ESIC Joining Date', 'secret'),
  pf('bank_name', 'Bank', 'secret', { also: ['bankname'] }), pf('bank_ifsc', 'Bank IFSC Code', 'secret', { also: ['ifsc', 'ifsccode', 'bankifsc'] }), pf('bank_account', 'Bank Account Number', 'secret', { also: ['accountno', 'accountnumber', 'bankaccountno', 'bankaccount'] }), pf('bank_holder', 'Name as on Bank', 'secret'),
  // (18-11-2026, Phase 2 – step 15) the new details of the record (the Restricted ones only for the HR Admin / Super Admin, like the pay)
  pf('city', 'City', 'profile'), pf('state', 'State', 'profile'), pf('pin', 'PIN Code', 'profile', { also: ['pin'] }),
  pf('emergency_name', 'Emergency Contact Name', 'profile'), pf('emergency_relation', 'Emergency Contact Relation', 'profile'), pf('emergency_mobile', 'Emergency Contact Mobile', 'profile'),
  pf('territory', 'Territory', 'job'), pf('employee_role', 'Employee Role', 'job'), pf('drives', 'Drives a Vehicle', 'job'), pf('licence_class', 'Driving Licence Class', 'job', { also: ['licenceclass', 'licenseclass', 'dlclass'] }),
  pf('caste', 'Caste', 'restricted'), pf('caste_category', 'Caste Category', 'restricted'),
  // (19-11-2026) the employee himself – written by the export, read by the import: a row with it changes HIM (also his code and name)
  c('hr_id', 'HR ID (do not change)', 'id', { also: ['hrid'] }),
];
// a file of before (Phase 1) may still have this column – read, never written
const OLD = [c('category', 'Category', 'emp', { also: ['employeecategory'] })];
const fieldOf = col => P.GROUPS[col.group].fields.find(d => d.key === col.field);
COLS.forEach(col => { if (col.kind === 'prof' && !fieldOf(col)) throw new Error('sheet column without its detail: ' + col.key); });
// (18-11-2026, Phase 1 – the audit's E6) the PAN too: an HR User gets the column empty (an empty cell keeps the number at import)
const SECRET_COLS = COLS.filter(col => col.key === 'aadhaar' || col.key === 'pan' || (col.kind === 'prof' && col.group === 'secret' && P.MASKED.indexOf(col.field) > -1)).map(col => col.key);
const PAY_COLS = COLS.filter(col => col.kind === 'tick' || (col.kind === 'prof' && P.GROUPS[col.group].adminOnly)).map(col => col.key);
const colsOut = () => COLS.concat(OLD).map(col => ({ key: col.key, head: col.head, fill: !!col.fill, old: OLD.indexOf(col) > -1, names: [norm(col.head)].concat(col.also || []) }));

// which category a designation is (kept beside the designations – no change of the database): { designation id: category }
const DES_SITE = '*', DES_KEY = 'designation_category';
async function desCats() { const r = ((await soft(db('GET', 'hr_settings?select=value&site=eq.' + enc(DES_SITE) + '&key=eq.' + DES_KEY))) || [])[0]; return (r && r.value && r.value.by) || {}; }
async function desCatSave(desId, cat, who) {
  const by = Object.assign({}, await desCats()); if (cat) by[desId] = cat; else delete by[desId];
  await db('POST', 'hr_settings?on_conflict=site,key', [{ site: DES_SITE, key: DES_KEY, value: { by: by }, updated_by: who, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');
  return by;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const eqv = (a, b) => String(a === undefined || a === null ? '' : a).trim() === String(b === undefined || b === null ? '' : b).trim();
const HEAD = {}; COLS.forEach(col => { HEAD[col.key] = col.head; });
const MASTER = [['name', 'Employee Name'], ['mobile', 'Mobile'], ['email', 'E-mail'], ['gender', 'Gender'], ['dob', 'Date of Birth'], ['joined_on', 'Date of Joining'], ['category', 'Category']];
// (19-11-2026) what the employees of today have now: their own details, their profile, their PF / ESIC / PT ticks
async function nowOf(ids, m) {
  if (!ids.length) return { priv: {}, prof: {}, tick: {} };
  const by = rows => { const o = {}; (rows || []).forEach(r => { o[r.employee_id] = r; }); return o; };
  const [pv, pr, tk] = await Promise.all([soft(inList('hr_employee_private?select=employee_id,' + PRIV_KEYS.join(',') + '&employee_id', ids, 80)), soft(inList('hr_employee_profile?select=employee_id,data,secret&employee_id', ids, 80)), soft(inList('hr_pay_emp?select=employee_id,pf,esic,pt&employee_id', ids, 80))]);
  return { priv: by(pv), prof: by(pr), tick: by(tk), m: m };
}
const PRIV_KEYS = ['aadhaar', 'pan', 'mobile2', 'family_name', 'family_relation', 'family_mobile', 'address_current', 'address_permanent'];
/* (19-11-2026) what one row changes of an employee of today: [{ kind, say }] – the Employee Master with its old and new value; his
 * own details, the profile, the bank, the ticks only by their names (never a secret number) */
function whatChanges(p, was, m) {
  const ex = p.ex, out = [], nm = (list, id) => ((list || []).find(d => d.id === id) || {}).name || '', dmy2 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('-') : '–');
  if (p.newCode) out.push({ kind: 'emp', say: 'Employee Code ' + ex.code + ' → ' + p.newCode });
  MASTER.forEach(([k, label]) => { if (!eqv(p.emp[k], ex[k])) out.push({ kind: 'emp', say: label + ': ' + (k === 'dob' || k === 'joined_on' ? dmy2(ex[k]) + ' → ' + dmy2(p.emp[k]) : (ex[k] || '–') + ' → ' + (p.emp[k] || '–')) }); });
  [['designation', 'designation_id', m.designations], ['department', 'department_id', m.departments]].forEach(([k, idk, list]) => { const n = p.names[k]; if (n && n.toLowerCase() !== nm(list, ex[idk]).toLowerCase()) out.push({ kind: 'emp', say: HEAD[k] + ': ' + (nm(list, ex[idk]) || '–') + ' → ' + n }); });
  const pv = was.priv[ex.id] || {}, pr = was.prof[ex.id] || {}, tk = was.tick[ex.id];
  Object.keys(p.priv).forEach(k => { if (!eqv(p.priv[k], pv[k])) out.push({ kind: 'priv', say: HEAD[k] || k }); });
  const pdata = pr.data || {}, psec = pr.secret || {};
  Object.keys(p.data).forEach(k => { if (!eqv(p.data[k], pdata[k])) out.push({ kind: 'prof', say: headOf(k) }); });
  Object.keys(p.secret).forEach(k => { if (!eqv(p.secret[k], psec[k])) out.push({ kind: BK.BANK.indexOf(k) > -1 ? 'bank' : 'prof', say: headOf(k) + (BK.BANK.indexOf(k) > -1 ? ' (waits for approval)' : '') }); });
  p.lists.forEach(l => out.push({ kind: 'prof', say: headOf(l.key) }));      // a value new to the lists is a change too
  Object.keys(p.ticks).forEach(k => { if (!tk || !!tk[k] !== !!p.ticks[k]) out.push({ kind: 'tick', say: HEAD[k] }); });
  return out;
}
// the heading of a detail of the profile (its key there may differ from the column's: ctc_monthly → "Auto Monthly CTC")
const headOf = k => { const col = COLS.find(c => c.kind === 'prof' && (c.field === k || c.key === k)); return col ? col.head : k; };

module.exports = function (H) {
  const EMP = 'id,code,name,category,gender,dob,mobile,email,site,department_id,designation_id,joined_on,left_on,status,email_verified_at,portal_email';
  const PRIV = ['aadhaar', 'pan', 'mobile2', 'family_name', 'family_relation', 'family_mobile', 'address_current', 'address_permanent'];

  // one row of the file → what it would save: { errs, emp, priv, prof: { data, secret }, ticks, ctc, names }
  function read(r, ctx) {
    const errs = [], out = { priv: {}, data: {}, secret: {}, ticks: {}, lists: [], names: {} }, ex = ctx.ex, given = k => !blank(r[k]);
    // ── the Employee Master: for an employee of today an empty cell keeps what he has ──
    const src = { name: given('name') ? r.name : ex ? ex.name : '', gender: given('gender') ? r.gender : ex ? ex.gender : '', mobile: given('mobile') ? r.mobile : ex ? ex.mobile : '', email: given('email') ? r.email : ex ? ex.email : '',
      dob: given('dob') ? r.dob : ex ? ex.dob : '', joined_on: given('joined_on') ? r.joined_on : ex ? ex.joined_on : '' };
    out.names.designation = given('designation') ? R.str(r.designation, 60) : ''; out.names.department = given('department') ? R.str(r.department, 60) : '';
    const desId = out.names.designation ? ctx.desByName[out.names.designation.toLowerCase()] : ex ? ex.designation_id : null;
    src.category = given('category') ? r.category : (out.names.designation || !ex) ? (desId && ctx.desCat[desId]) || 'staff' : ex.category;
    const e = R.employee(src, undefined, ex); e.errors.forEach(x => errs.push(x)); out.emp = e.row; out.missing = e.missing;
    if (!ex && !e.row.mobile && !e.row.email) errs.push('Mobile or E-mail: a new employee needs one of them – he signs in with it.');
    // (18-11-2026, Phase 2) the birth date / joining date of an employee of today is changed with a reason – (19-11-2026) from the sheet
    // too: ONE reason for the file (sheetImport asks it before saving)
    out.dates = ex ? ['dob', 'joined_on'].filter(k => ex[k] && String(ex[k]) !== String(e.row[k] || '')) : [];
    // ── his own details ──
    PRIV.forEach(k => { if (given(k)) out.priv[k] = r[k]; });
    if (Object.keys(out.priv).length) {
      const p = out.priv;
      if ('pan' in p) { const v = R.pan(p.pan); if (v === null) errs.push('PAN: 10 letters and digits like ABCDE1234F.'); else p.pan = v; }
      if ('aadhaar' in p) { const v = R.aadhaar(p.aadhaar); if (v === null) errs.push('Aadhaar: 12 digits – please check the number.'); else p.aadhaar = v; }
      if ('mobile2' in p) { const v = R.mobile(p.mobile2); if (v === null) errs.push('Second Mobile: a 10-digit mobile number.'); else p.mobile2 = v; }
      if ('family_mobile' in p) { const v = R.mobile(p.family_mobile); if (v === null) errs.push('Family Mobile: a 10-digit mobile number.'); else p.family_mobile = v; }
      if ('family_relation' in p) { const v = R.str(p.family_relation, 12).toLowerCase(); if (R.REL.indexOf(v) < 0) errs.push('Family Relation: ' + R.REL.join(', ') + '.'); else p.family_relation = v; }
      ['family_name', 'address_current', 'address_permanent'].forEach(k => { if (k in p) p[k] = R.str(p[k], k === 'family_name' ? 80 : 300); });
    }
    // ── the profile, the statutory & bank details, the pay details ──
    COLS.filter(col => col.kind === 'prof' && given(col.key)).forEach(col => {
      const G = P.GROUPS[col.group], d = fieldOf(col), to = G.secret ? out.secret : out.data;
      if (G.adminOnly && !ctx.admin) { ctx.skipped.pay = true; return; }
      let raw = r[col.key];
      if (d.type === 'list') {      // by its name; a name that is not in the list is added to it (HR Admin / Super Admin)
        const name = R.str(raw, 60), hit = (ctx.lists[d.list] || []).find(v => v.name.toLowerCase() === name.toLowerCase());
        if (hit) to[d.key] = hit.id; else if (ctx.admin) out.lists.push({ kind: d.list, name: name, key: d.key }); else errs.push(col.head + ': "' + name + '" is not in the list – the HR Admin adds it.');
        return;
      }
      if (d.type === 'yesno') { const v = yn(raw); if (v === null) { errs.push(col.head + ': Yes or No.'); return; } raw = v; }
      if (d.type === 'int' || d.type === 'num') raw = String(raw).trim().replace(/\.0+$/, '');
      if (d.type === 'digits') raw = String(raw).trim().replace(/\.0+$/, '').replace(/^'/, '');
      const cl = P.clean([d], { [d.key]: raw }, {}, {}); if (cl.errors.length) errs.push(cl.errors.join(' ').replace(d.label + ':', col.head + ':')); else if (d.key in cl.row) to[d.key] = cl.row[d.key];
    });
    // ── for whom PF / ESIC / Profession Tax is deducted ──
    ['pf', 'esic', 'pt'].forEach(k => { if (!given(k)) return; if (!ctx.admin) { ctx.skipped.pay = true; return; } const v = yn(r[k]); if (v === null) errs.push('Deduct ' + k.toUpperCase() + ': Yes or No.'); else out.ticks[k] = v; });
    // ── the month's CTC as his salary (0 = none) ──
    if (out.secret.ctc_monthly > 0) out.ctc = out.secret.ctc_monthly;
    out.errs = errs; return out;
  }

  const ACT = {
    // the columns of the sheet – the page reads a file with them and writes one
    async sheetCols(s) { H.needOffice(s); return { cols: colsOut(), pay: isAdmin(s) }; },

    async sheetImport(s, x) {
      H.needOffice(s);
      const list = Array.isArray(x.rows) ? x.rows : []; if (!list.length) throw fail(400, 'The file has no rows.', 'rows'); if (list.length > 1000) throw fail(400, 'At most 1000 rows in one file – split it.', 'rows');
      const admin = isAdmin(s), [m, desCat, listsBy, ho] = await Promise.all([H.masters(), desCats(), soft(P.listsAll()), isHo(s)]);
      const desByName = {}; m.designations.forEach(d => { desByName[d.name.toLowerCase()] = d.id; });
      const codes = list.map(r => H.codeTyped(r.code)), known = {}, byId = {};
      (await inList('hr_employees?select=' + EMP + '&code', [...new Set(codes.filter(Boolean))].map(v => '"' + v.replace(/"/g, '') + '"').map(enc), 60)).forEach(e => { known[e.code] = e; });
      // (19-11-2026) the export's "HR ID": the employee himself, whatever the row's code now says
      const hids = list.map(r => blank(r.hr_id) ? '' : String(r.hr_id).trim().toLowerCase()), okIds = [...new Set(hids.filter(v => UUID.test(v)))];
      if (okIds.length) (await inList('hr_employees?select=' + EMP + '&id', okIds, 60)).forEach(e => { byId[e.id] = e; });
      const ctx0 = { admin: admin, lists: listsBy || {}, desCat: desCat, desByName: desByName, skipped: {} };
      /* (18-11-2026, asked: "basic ekasath ghe nantr kyc ek sath … step by step") a STEP file (2 KYC & address, 3 Bank & PF, 4 Job,
       * 5 Pay) only fills in employees already added with step 1 – its rows are found by the Employee Code; its name column is only
       * shown (never changes the name); a row with a code that is not an employee of this site is refused. */
      const part = ['kyc', 'bank', 'job', 'pay'].indexOf(String(x.part || '')) > -1 ? String(x.part) : '';
      const lines = [], good = [], seen = { code: {}, mobile: {}, email: {}, pan: {}, aadhaar: {}, hid: {} };
      const parsed = list.map((r, i) => {
        const line = Number(r._line) > 0 ? Number(r._line) : i + 2, hid = part ? '' : hids[i], errs = [];
        let code = codes[i], ex = null, newCode = '';
        if (hid) {      // (19-11-2026) the row is HIM: a code that differs is his new code – never another employee's
          ex = UUID.test(hid) ? byId[hid] || null : null;
          if (!ex) errs.push('HR ID: not an employee of HR – keep this column as the export wrote it (empty for a new person).');
          else if (seen.hid[hid]) errs.push('HR ID is twice in the file (line ' + seen.hid[hid] + ').');
          else {
            seen.hid[hid] = line;
            if (code && code !== ex.code) { if (known[code] && known[code].id !== ex.id) errs.push('Employee Code ' + code + ' already belongs to another employee.'); else newCode = code; }
            if (!code) code = ex.code;
          }
        } else ex = code ? known[code] || null : null;
        if (code && !H.CODE_OK.test(code)) errs.push('Employee Code: 2 to 20 capital letters and digits (also - and /).');
        if (ex && ex.site !== s.site) errs.push('Employee Code ' + code + ' is an employee of the site ' + ex.site + ' – he is changed there.');
        if (ex && ex.status === 'left') errs.push('Employee ' + code + ' has left – his details are not changed.');
        if (code) { if (seen.code[code]) errs.push('Employee Code is twice in the file (line ' + seen.code[code] + ').'); else seen.code[code] = line; }
        if (part) { if (!ex) errs.push(code ? 'Employee Code ' + code + ' is not an employee of this site – add him first with Step 1 (Basic).' : 'Employee Code: needed – this step fills in employees already added.'); r = Object.assign({}, r); delete r.name; }
        const p = read(r, Object.assign({ ex: ex && ex.site === s.site ? ex : null }, ctx0));
        return Object.assign(p, { line: line, code: code, newCode: ex && ex.site === s.site ? newCode : '', ex: ex && ex.site === s.site ? ex : null, errs: errs.concat(p.errs) });
      });
      // a mobile number, an e-mail, a PAN, an Aadhaar belong to ONE employee – in the file and among the employees
      const t = await H.taken(parsed.map(p => p.emp), ''), pans = [...new Set(parsed.map(p => p.priv.pan).filter(Boolean))], aads = [...new Set(parsed.map(p => p.priv.aadhaar).filter(Boolean))], owner = { pan: {}, aadhaar: {} };
      if (pans.length || aads.length) {
        const got = [].concat(pans.length ? (await soft(inList('hr_employee_private?select=employee_id,pan&pan', pans, 60))) || [] : [], aads.length ? (await soft(inList('hr_employee_private?select=employee_id,aadhaar&aadhaar', aads, 60))) || [] : []);
        got.forEach(g => { if (g.pan) owner.pan[g.pan] = g.employee_id; if (g.aadhaar) owner.aadhaar[g.aadhaar] = g.employee_id; });
      }
      parsed.forEach(p => {
        const mine = p.ex ? p.ex.code : '\u0000', e = p.emp;
        [['mobile', 'Mobile'], ['email', 'E-mail']].forEach(k => { const v = e[k[0]]; if (!v) return;
          if (t[k[0]][v] && t[k[0]][v] !== mine) p.errs.push(k[1] + ' already belongs to employee ' + t[k[0]][v] + '.'); else if (seen[k[0]][v]) p.errs.push(k[1] + ' is twice in the file (line ' + seen[k[0]][v] + ').'); else seen[k[0]][v] = p.line; });
        [['pan', 'PAN'], ['aadhaar', 'Aadhaar']].forEach(k => { const v = p.priv[k[0]]; if (!v) return;
          if (owner[k[0]][v] && (!p.ex || owner[k[0]][v] !== p.ex.id)) p.errs.push(k[1] + ' already belongs to another employee.'); else if (seen[k[0]][v]) p.errs.push(k[1] + ' is twice in the file (line ' + seen[k[0]][v] + ').'); else seen[k[0]][v] = p.line; });
        if (p.errs.length) lines.push({ line: p.line, name: p.emp.name || '', code: p.code, ok: false, why: p.errs.join(' ') }); else good.push(p);
      });
      const add = good.filter(p => !p.ex), notes = [];
      // (19-11-2026) ONLY WHAT CHANGES: each employee of today beside what he has now – a row that changes nothing is left as it is
      const was = await nowOf(good.filter(p => p.ex).map(p => p.ex.id), m);
      good.filter(p => p.ex).forEach(p => { p.what = whatChanges(p, was, m); });
      const upd = good.filter(p => p.ex && p.what.length), same = good.filter(p => p.ex && !p.what.length);
      const dated = upd.filter(p => p.dates.length), reason = R.str(x.reason, 300);
      if (dated.length) notes.push('The date of birth / joining date of ' + dated.length + ' employees change – write the reason before saving (it is kept with the change).');
      if (ctx0.skipped.pay) notes.push('The pay columns (CTC, Basic, Deduct PF / ESIC / PT …) were not read: only the HR Admin or the Super Admin brings them in.');
      // (18-11-2026, Phase 1 – his answer "बदल मंजुरीला जाईल") bank details of the file are ASKED, not saved: the HO HR / Super Admin approves
      const withBank = good.filter(p => BK.BANK.some(k => k in p.secret)).length;
      if (withBank) notes.push(s.role === 'super' ? 'Bank details of ' + withBank + ' employees: a change counts at once (Super Admin) and the employee is told by e-mail.' : 'Bank details of ' + withBank + ' employees: a change is NOT saved now – it waits for the HO HR / Super Admin to approve it (Approvals → Bank changes); until then the old details stay. The employee is told by e-mail.');
      const withPay = good.filter(p => p.ctc).length;
      if (withPay) notes.push(ho ? 'The monthly CTC of ' + withPay + ' employees becomes their approved salary.' : 'The monthly CTC is kept as a detail only: a salary counts when the HO HR / Super Admin imports the sheet (or approves it on the employee\'s page).');
      const newLists = {}; good.forEach(p => p.lists.forEach(l => { newLists[l.kind + '\u0001' + l.name.toLowerCase()] = l; }));
      const sum = { rows: list.length, faults: lines.length, toAdd: add.length, toChange: upd.length, same: same.length, needReason: dated.length > 0, incomplete: add.filter(p => p.missing.length).length, notes: notes, willMake: Object.keys(newLists).map(k => newLists[k].kind + ': ' + newLists[k].name),
        changes: upd.slice(0, 1000).map(p => ({ line: p.line, code: p.ex.code, name: p.ex.name, what: p.what.map(w => w.say) })) };
      if (x.check || !(add.length || upd.length)) return Object.assign({ saved: 0, added: 0, changed: 0, salaries: 0, checked: !!x.check || !good.length, lines: lines, made: [] }, sum);
      if (dated.length && reason.length < 5) throw fail(400, 'Reason: the date of birth / joining date of ' + dated.length + ' employees change – write why (at least 5 letters).', 'reason');

      // ── SAVE ──
      if (good.some(p => BK.BANK.some(k => k in p.secret))) await BK.needReady();      // (step 14) nothing is saved when a bank change cannot be asked
      const made = [], people = [], now = new Date().toISOString(), today = R.today(), dep = {}, des = {};      // people: the new employees – (18-11-2026) the page gives their sign-ins (the Portal)
      const keep = add.concat(upd);      // (19-11-2026) a row that changes nothing is not written
      for (const p of keep) {
        const dn = p.names.department, gn = p.names.designation;
        if (dn && !(dn.toLowerCase() in dep)) dep[dn.toLowerCase()] = await H.masterId('department', dn, s.email, made);
        if (gn && !(gn.toLowerCase() in des)) des[gn.toLowerCase()] = await H.masterId('designation', gn, s.email, made);
        p.department_id = dn ? dep[dn.toLowerCase()] : p.ex ? p.ex.department_id : null; p.designation_id = gn ? des[gn.toLowerCase()] : p.ex ? p.ex.designation_id : null;
      }
      for (const k of Object.keys(newLists)) {      // the list values the file brought (added once each)
        const l = newLists[k], row = (await db('POST', 'hr_lists', [{ kind: l.kind, name: l.name, sort: 999, created_by: s.email, updated_by: s.email }], 'return=representation'))[0];
        l.id = row.id; made.push(l.kind + ': ' + l.name);
      }
      keep.forEach(p => p.lists.forEach(l => { const id = newLists[l.kind + '\u0001' + l.name.toLowerCase()].id, G = Object.keys(P.GROUPS).find(g => P.GROUPS[g].fields.some(d => d.key === l.key)); (P.GROUPS[G].secret ? p.secret : p.data)[l.key] = id; }));
      // the new employees: the code of the sheet, or one made by itself
      const fresh = await H.newCodes(add.filter(p => !p.code).length); let fi = 0; add.forEach(p => { if (!p.code) p.code = fresh[fi++]; });
      for (let i = 0; i < add.length; i += 200) {
        const part = add.slice(i, i + 200), rows = part.map(p => Object.assign({ code: p.code, site: s.site, status: R.statusOf(p.emp, ''), created_by: s.email, updated_by: s.email, department_id: p.department_id, designation_id: p.designation_id, reports_to: null }, p.emp));
        const back = await db('POST', 'hr_employees', rows, 'return=representation'), byCode = {}; back.forEach(b => { byCode[b.code] = b; people.push({ id: b.id, code: b.code, name: b.name, email: b.email || '', mobile: b.mobile || '', site: b.site }); });
        part.forEach(p => { p.id = byCode[p.code].id; });
        await db('POST', 'hr_employment', back.map(b => ({ employee_id: b.id, site: s.site, department_id: b.department_id, designation_id: b.designation_id, valid_from: b.joined_on || today, note: 'Joined (import)', created_by: s.email })), 'return=minimal');
      }
      // the employees of today: what the file gave, nothing else
      const changedKeys = {}, moved = [];      // (19-11-2026) whose e-mail changes – the page tells the Portal: he signs in with the new one
      for (const p of upd) {
        const was = p.ex, row = Object.assign({}, p.emp, { department_id: p.department_id, designation_id: p.designation_id });
        row.status = R.statusOf(p.emp, was.status === 'active' && p.emp.email === was.email ? 'active' : '');
        if (p.newCode) row.code = p.newCode;      // (19-11-2026) his new code – punches, papers and the history hang on HIM, not on the code
        const diff = Object.keys(row).filter(k => String(row[k] === null || row[k] === undefined ? '' : row[k]) !== String(was[k] === null || was[k] === undefined ? '' : was[k]));
        p.id = was.id; if (p.newCode) p.code = p.newCode; if (!diff.length) continue;
        if (p.emp.email !== was.email) row.email_verified_at = null;
        await db('PATCH', 'hr_employees?id=eq.' + was.id + '&site=eq.' + enc(s.site), Object.assign(row, { updated_by: s.email, updated_at: now }), 'return=minimal');
        if (p.emp.email && p.emp.email !== was.email) moved.push({ id: was.id, code: row.code || was.code, name: row.name || was.name, was: was.email || '', email: p.emp.email, mobile: p.emp.mobile || was.mobile || '', known: was.portal_email || '' });
        if (diff.indexOf('department_id') > -1 || diff.indexOf('designation_id') > -1) {
          await db('PATCH', 'hr_employment?employee_id=eq.' + was.id + '&valid_to=is.null', { valid_to: today }, 'return=minimal');
          await db('POST', 'hr_employment', [{ employee_id: was.id, site: s.site, department_id: p.department_id, designation_id: p.designation_id, valid_from: today, note: 'Changed (import)', created_by: s.email }], 'return=minimal');
        }
        changedKeys[was.code] = diff;
        if (p.dates.length) changedKeys[was.code] = diff.concat(['reason: ' + reason]);
      }
      const ids = keep.map(p => p.id);
      // his own details (Aadhaar, PAN …): the cells given are laid over what is kept
      const withPriv = keep.filter(p => Object.keys(p.priv).length && (!p.ex || p.what.some(w => w.kind === 'priv')));
      if (withPriv.length) {
        const had = {}; ((await inList('hr_employee_private?select=employee_id,' + PRIV.join(',') + '&employee_id', withPriv.map(p => p.id), 80)) || []).forEach(v => { had[v.employee_id] = v; });
        const rows = withPriv.map(p => { const w = had[p.id] || {}, o = { employee_id: p.id, updated_by: s.email, updated_at: now }; PRIV.forEach(k => { o[k] = k in p.priv ? p.priv[k] : w[k] || ''; }); return o; });
        for (let i = 0; i < rows.length; i += 200) await db('POST', 'hr_employee_private?on_conflict=employee_id', rows.slice(i, i + 200), 'resolution=merge-duplicates,return=minimal');
      }
      // the profile and the secret / pay details
      const bankOf = {}; keep.forEach(p => { const b = {}; BK.BANK.forEach(k => { if (k in p.secret) { b[k] = p.secret[k]; delete p.secret[k]; } }); if (Object.keys(b).length) bankOf[p.id] = b; });      // asked below – never saved here
      keep.forEach(p => { if (p.ex && bankOf[p.id] && !p.what.some(w => w.kind === 'bank')) delete bankOf[p.id]; });      // (the same bank details: nothing is asked)
      const withProf = keep.filter(p => (Object.keys(p.data).length || Object.keys(p.secret).length || bankOf[p.id]) && (!p.ex || p.what.some(w => w.kind === 'prof' || w.kind === 'bank'))), had = {};
      if (withProf.length) {
        ((await inList('hr_employee_profile?select=employee_id,data,secret&employee_id', withProf.map(p => p.id), 80)) || []).forEach(v => { had[v.employee_id] = v; });
        const rows = withProf.filter(p => Object.keys(p.data).length || Object.keys(p.secret).length).map(p => { const w = had[p.id] || {}; return { employee_id: p.id, data: Object.assign({}, w.data || {}, p.data), secret: Object.assign({}, w.secret || {}, p.secret), updated_by: s.email, updated_at: now }; });
        for (let i = 0; i < rows.length; i += 200) await db('POST', 'hr_employee_profile?on_conflict=employee_id', rows.slice(i, i + 200), 'resolution=merge-duplicates,return=minimal');
      }
      // the bank details of the file: a change is asked (the cells given laid over what he has now)
      const bankAsk = keep.filter(p => bankOf[p.id]).map(p => { const before = (had[p.id] || {}).secret || {}; return { emp: { id: p.id, code: p.code, name: p.emp.name || (p.ex && p.ex.name) || '', email: p.emp.email || (p.ex && p.ex.email) || '', site: s.site }, before: before, after: Object.assign({}, before, bankOf[p.id]) }; });
      const bank = bankAsk.length ? await BK.ask(s, bankAsk, 'sheet') : { waiting: 0, applied: 0, mailed: 0 };
      // for whom PF / ESIC / PT is deducted
      const withTick = keep.filter(p => Object.keys(p.ticks).length && (!p.ex || p.what.some(w => w.kind === 'tick')));
      if (withTick.length) {
        const had = {}; ((await soft(inList('hr_pay_emp?select=employee_id,pf,esic,pt&employee_id', withTick.map(p => p.id), 80))) || []).forEach(v => { had[v.employee_id] = v; });
        const rows = withTick.map(p => { const w = had[p.id] || {}; return { employee_id: p.id, pf: 'pf' in p.ticks ? p.ticks.pf : !!w.pf, esic: 'esic' in p.ticks ? p.ticks.esic : !!w.esic, pt: 'pt' in p.ticks ? p.ticks.pt : !!w.pt, updated_by: s.email, updated_at: now }; });
        for (let i = 0; i < rows.length; i += 200) await db('POST', 'hr_pay_emp?on_conflict=employee_id', rows.slice(i, i + 200), 'resolution=merge-duplicates,return=minimal');
      }
      // the salary: the month's CTC, approved at once – only from the HO HR / Super Admin, and only when it is not his salary already
      let salaries = 0;
      const withCtc = ho ? keep.filter(p => p.ctc) : [];
      if (withCtc.length) {
        const had = {}; ((await soft(inList('hr_salaries?select=id,employee_id,pay_type,amount,valid_from,status&employee_id', withCtc.map(p => p.id), 80))) || []).forEach(v => { (had[v.employee_id] = had[v.employee_id] || []).push(v); });
        const rows = [];
        withCtc.forEach(p => { const mine = had[p.id] || [], cur = PAY.current(mine, today); if (mine.some(v => v.status === 'pending')) return; if (cur && cur.pay_type === 'monthly' && +cur.amount === p.ctc) return;
          rows.push({ employee_id: p.id, site: s.site, pay_type: 'monthly', amount: p.ctc, valid_from: cur ? today : p.emp.joined_on && p.emp.joined_on <= today ? p.emp.joined_on : today, note: 'From the employee sheet', status: 'approved', asked_by: s.email, decided_by: s.email, decided_at: now, decide_note: 'Imported' }); });
        for (let i = 0; i < rows.length; i += 200) await db('POST', 'hr_salaries', rows.slice(i, i + 200), 'return=minimal');
        salaries = rows.length;
      }
      // the counter of the codes made by themselves goes past the RCL… codes of the sheet
      const top = Math.max(0, ...keep.map(p => { const mm = /^RCL(\d{1,9})$/.exec(p.code); return mm ? +mm[1] : 0; }));
      if (top) { await db('POST', 'hr_numbers?on_conflict=kind', [{ kind: 'emp', next_no: top + 1 }], 'resolution=ignore-duplicates,return=minimal'); await db('PATCH', 'hr_numbers?kind=eq.emp&next_no=lt.' + (top + 1), { next_no: top + 1 }, 'return=minimal'); }
      const codesNew = upd.filter(p => p.newCode).map(p => [p.ex.code, p.newCode]);
      await audit(s.site, s.email, 'Employee sheet imported', add.length + ' added, ' + upd.length + ' changed', { added: add.map(p => p.code).slice(0, 400), changed: changedKeys, codes: codesNew, same: same.length, reason: dated.length ? reason : undefined, faults: lines.length, made: made, salaries: salaries, details: withPriv.length, profile: withProf.length, bank_waiting: bank.waiting, bank_applied: bank.applied });      // never a number
      return Object.assign({ saved: keep.length, added: add.length, changed: upd.length, salaries: salaries, checked: false, lines: lines, made: made, people: people, moved: moved, ids: ids.length, bank: { waiting: bank.waiting, applied: bank.applied, mailed: bank.mailed } }, sum);
    },

    /* the sheet as a file: the people the list shows (search, status, category), or no rows (the format). */
    async sheetExport(s, x) {
      H.needOffice(s); const admin = isAdmin(s), cols = COLS, heads = cols.map(col => col.head);
      if (x.template) return { site: s.site, heads: heads, rows: [], full: admin };
      const q = R.str(x.q, 60).replace(/[%_*,()\\"]/g, ' ').trim(), st = ['incomplete', 'pending', 'active', 'left'].indexOf(x.status) > -1 ? x.status : x.status === 'all' ? 'all' : '', cat = R.CATS.indexOf(x.category) > -1 ? x.category : '';
      let path = 'hr_employees?select=' + EMP + '&site=eq.' + enc(s.site) + (st === 'all' ? '' : st ? '&status=eq.' + st : '&status=neq.left') + (cat ? '&category=eq.' + cat : '');
      if (q) path += '&or=' + enc('(name.ilike.*' + q + '*,code.ilike.*' + q + '*,mobile.ilike.*' + q + '*,email.ilike.*' + q + '*)');
      const emps = []; for (let off = 0; off < 100000; off += 1000) { const r = (await db('GET', path + '&order=code,id&limit=1000&offset=' + off)) || []; r.forEach(v => emps.push(v)); if (r.length < 1000) break; }
      const ids = emps.map(e => e.id), by = rows => { const o = {}; (rows || []).forEach(r => { o[r.employee_id] = r; }); return o; };
      const [m, listsBy, pv, pr, tk, sal] = await Promise.all([H.masters(), soft(P.listsAll()), soft(inList('hr_employee_private?select=employee_id,' + PRIV.join(',') + '&employee_id', ids, 80)), soft(inList('hr_employee_profile?select=employee_id,data,secret&employee_id', ids, 80)),
        admin ? soft(inList('hr_pay_emp?select=employee_id,pf,esic,pt&employee_id', ids, 80)) : null, admin ? soft(inList('hr_salaries?select=id,employee_id,pay_type,amount,valid_from,status&status=eq.approved&employee_id', ids, 80)) : null]);
      const priv = by(pv), prof = by(pr), tick = by(tk), sals = {}; (sal || []).forEach(v => { (sals[v.employee_id] = sals[v.employee_id] || []).push(v); });
      const nm = (list, v) => ((list || []).find(d => d.id === v) || {}).name || '', today = R.today();
      const rows = emps.map(e => {
        const pv1 = priv[e.id] || {}, p1 = prof[e.id] || { data: {}, secret: {} }, cur = PAY.current(sals[e.id] || [], today);
        return cols.map(col => {
          if (!admin && (PAY_COLS.indexOf(col.key) > -1 || SECRET_COLS.indexOf(col.key) > -1)) return '';
          if (col.kind === 'none') return col.key === 'totals' ? 1 : '';
          if (col.kind === 'id') return e.id;
          if (col.kind === 'emp') return col.key === 'dob' || col.key === 'joined_on' ? dmy(e[col.key]) : col.key === 'gender' ? (e.gender ? e.gender.charAt(0).toUpperCase() + e.gender.slice(1) : '') : e[col.key] || '';
          if (col.kind === 'master') return col.key === 'designation' ? nm(m.designations, e.designation_id) : nm(m.departments, e.department_id);
          if (col.kind === 'priv') return col.key === 'family_relation' && pv1[col.key] ? pv1[col.key].charAt(0).toUpperCase() + pv1[col.key].slice(1) : pv1[col.key] || '';
          if (col.kind === 'tick') return tick[e.id] ? (tick[e.id][col.key] ? 'Yes' : 'No') : '';
          const d = fieldOf(col), v = ((P.GROUPS[col.group].secret ? p1.secret : p1.data) || {})[d.key];
          if (col.key === 'ctc' && cur && cur.pay_type === 'monthly') return +cur.amount;      // the salary that counts today
          if (v === undefined || v === null || v === '') return '';
          return d.type === 'list' ? nm((listsBy || {})[d.list], v) : d.type === 'yesno' ? (v ? 'Yes' : 'No') : d.type === 'date' ? dmy(v) : v;
        });
      });
      await audit(s.site, s.email, 'Employee sheet exported', rows.length + ' employees', { status: st, category: cat, q: q, full: admin });
      return { site: s.site, heads: heads, rows: rows, full: admin };
    },
  };
  return { ACT: ACT };
};
module.exports.COLS = COLS; module.exports.colsOut = colsOut; module.exports.norm = norm; module.exports.yn = yn; module.exports.desCats = desCats; module.exports.desCatSave = desCatSave;
