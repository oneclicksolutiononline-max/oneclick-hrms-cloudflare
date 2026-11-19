/* REPORTING MANAGERS WITH DATES (18-11-2026, Phase 2 – step 15; the master prompt Part 3: "primary reporting manager … secondary /
 * functional … effective dates … history … search by name, code, designation, department, site … prevent self-reporting,
 * inactive managers and circular reporting").
 *   – The PRIMARY manager is, as today, hr_employees.reports_to (leave and regularisation ask him first, the team pages use him);
 *     hr_reporting keeps it WITH DATES, and the old ones stay with their end date.
 *   – Other managers (functional, administrative, project, site) are only a record with dates – they decide nothing in the ERP.
 *   – A manager may be of another site of this sign-in (his decision, the audit's E9: reporting across sites is allowed).
 *   – Nobody reports to himself, to a relieved person, or in a circle (A → B → … → A); nobody changes his own reporting.
 * Until step 15 is run, the primary manager of the Employee Master works exactly as before. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const OWN = require('./own');
const S15 = require('./step15');
const store = require('./store');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const id = v => { v = String(v || '').toLowerCase(); return UUID.test(v) ? v : ''; };
const ROLES = ['primary', 'functional', 'administrative', 'project', 'site', 'other'];
const ROLE_NAME = { primary: 'Primary (reports to)', functional: 'Functional', administrative: 'Administrative', project: 'Project', site: 'Site', other: 'Other' };
const sitesOf = s => { const l = (s.info && Array.isArray(s.info.sites) ? s.info.sites : []).map(x => String(x.code)); if (l.indexOf(s.site) < 0) l.push(s.site); return l; };
const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');
const office = s => { if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role'); };

/* a CIRCLE: does the manager (or anybody above him, by the primary line) report to this employee? [] = no circle, else the names */
async function circle(empId, managerId) {
  const seen = [], names = {}; let at = managerId;
  for (let i = 0; i < 60 && at; i++) {
    if (at === empId) return seen.map(k => names[k]);
    if (seen.indexOf(at) > -1) return [];      // a circle above (not through him) – not his to answer here
    seen.push(at);
    const r = ((await db('GET', 'hr_employees?select=id,code,name,reports_to&id=eq.' + at)) || [])[0]; if (!r) return [];
    names[at] = r.name + ' (' + r.code + ')'; at = r.reports_to;
  }
  return [];
}
// the checks of one manager for one employee (every way in: the form, a transfer, this page)
async function checkManager(empId, managerId) {
  if (!managerId) return null;
  if (managerId === empId) throw fail(400, 'Reporting person: a person cannot report to himself.', 'reports_to');
  const m = ((await db('GET', 'hr_employees?select=id,code,name,status,site&id=eq.' + managerId)) || [])[0];
  if (!m || m.status === 'left') throw fail(400, 'Reporting person: choose an employee of the list (not one who has left).', 'reports_to');
  const c = await circle(empId, managerId);
  if (c.length) throw fail(400, 'Reporting person: ' + c[0] + ' already reports to this employee' + (c.length > 1 ? ' (through ' + c.slice(1).join(', ') + ')' : '') + ' – a circle is not allowed.', 'reports_to');
  return m;
}

/* (step 17) A REPORTING CHANGE IS TOLD to the person and to his new manager (never fails the change itself) */
async function tell(empId, managerId, role, from, by) {
  try {
    const rows = (await db('GET', 'hr_employees?select=id,name,code,site,mobile,email&id=in.(' + [empId, managerId].join(',') + ')')) || [], e = rows.filter(r => r.id === empId)[0], m = rows.filter(r => r.id === managerId)[0];
    if (!e || !m) return; const N = require('./notify'), rn = ROLE_NAME[role] || role, d = dmy(from);
    await N.add([
      { site: e.site, employee_id: e.id, kind: 'reporting_change', mobile: e.mobile, email: e.email, title: 'Your ' + (role === 'primary' ? 'reporting manager' : rn.toLowerCase() + ' manager') + ' from ' + d + ': ' + m.name, body: 'Dear ' + e.name + ', from ' + d + ' your ' + (role === 'primary' ? 'reporting manager' : rn.toLowerCase() + ' manager') + ' is ' + m.name + ' (' + m.code + ').', params: { name: e.name, manager: m.name, from: d }, dedupe: 'rep|' + e.id + '|' + m.id + '|' + role + '|' + from, by: by },
      { site: m.site, employee_id: m.id, kind: 'general', email: m.email, title: e.name + ' (' + e.code + ') reports to you from ' + d, body: 'Dear ' + m.name + ', from ' + d + ' ' + e.name + ' (' + e.code + ') reports to you (' + rn + ').', params: {}, dedupe: 'repm|' + e.id + '|' + m.id + '|' + role + '|' + from, by: by }]);
  } catch (er) { console.error('[hr notify] reporting: ' + String((er && er.message) || er).slice(0, 160)); }
}
/* the PRIMARY manager changed in the Employee Master (the form, a transfer, the sheet): the dated list follows – the open primary row
 * ends on that day and a new one starts. Nothing happens before step 15. */
async function syncPrimary(empId, managerId, from, by, note) {
  if (!(await S15.ready())) return;
  from = from || R.today();
  const open = ((await db('GET', 'hr_reporting?select=id,manager_id,valid_from&employee_id=eq.' + empId + '&primary_one=is.true&valid_to=is.null')) || []);
  if (open.length === 1 && open[0].manager_id === managerId) return;
  for (const o of open) await db('PATCH', 'hr_reporting?id=eq.' + o.id, { valid_to: o.valid_from > from ? o.valid_from : from, ended_by: by }, 'return=minimal');
  if (managerId) { await db('POST', 'hr_reporting', [{ employee_id: empId, manager_id: managerId, role: 'primary', primary_one: true, valid_from: from, note: R.str(note, 200), created_by: by }], 'return=minimal'); await tell(empId, managerId, 'primary', from, by); }
}

// an employee of this site (the office)
async function empOf(s, empId) {
  const e = ((await db('GET', 'hr_employees?select=id,code,name,site,status,reports_to,joined_on,department_id,designation_id&id=eq.' + id(empId) + '&site=eq.' + enc(s.site))) || [])[0];
  if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound'); return e;
}
// names of the masters, once
async function masters() {
  const [dep, des] = await Promise.all([db('GET', 'hr_departments?select=id,name'), db('GET', 'hr_designations?select=id,name')]);
  const m = { dep: {}, des: {} }; (dep || []).forEach(r => { m.dep[r.id] = r.name; }); (des || []).forEach(r => { m.des[r.id] = r.name; }); return m;
}
// a person's card: code, name, designation, department, site, category, status, photo (a link for 10 minutes)
async function cards(rows, m) {
  m = m || await masters(); const ids = rows.map(r => r.id), first = {};
  for (let i = 0; i < ids.length; i += 80) ((await db('GET', 'hr_employee_docs?select=employee_id,path,mime,created_at&kind=eq.photo&active=is.true&mime=like.image*&employee_id=in.(' + ids.slice(i, i + 80).join(',') + ')&order=created_at.desc')) || []).forEach(d => { if (!first[d.employee_id]) first[d.employee_id] = d.path; });
  const got = Object.keys(first).length ? await store.links(Object.keys(first).map(k => first[k]), 600).catch(() => ({})) : {};
  return rows.map(r => ({ id: r.id, code: r.code, name: r.name, category: r.category, site: r.site, status: r.status, designation: m.des[r.designation_id] || '', department: m.dep[r.department_id] || '', photo: first[r.id] ? got[first[r.id]] || '' : '' }));
}

const ACT = {
  /* THE PICKER: people of the sites of this sign-in (not relieved) by name, code, designation or department – with their card */
  async repPick(s, x) {
    office(s);
    const q = R.str(x.q, 40).replace(/[%_*,()\\"]/g, ' ').trim(), sites = sitesOf(s), m = await masters();
    let or = '';
    if (q) {
      const like = '*' + q + '*', des = Object.keys(m.des).filter(k => m.des[k].toLowerCase().indexOf(q.toLowerCase()) > -1).slice(0, 40), dep = Object.keys(m.dep).filter(k => m.dep[k].toLowerCase().indexOf(q.toLowerCase()) > -1).slice(0, 40);
      or = '&or=' + enc('(' + ['name.ilike.' + like, 'code.ilike.' + like, 'site.ilike.' + like].concat(des.length ? ['designation_id.in.(' + des.join(',') + ')'] : [], dep.length ? ['department_id.in.(' + dep.join(',') + ')'] : []).join(',') + ')');
    }
    const rows = (await db('GET', 'hr_employees?select=id,code,name,category,site,status,designation_id,department_id&status=neq.left&site=in.(' + sites.map(enc).join(',') + ')' + or + '&order=name&limit=25')) || [];
    const not = id(x.not);
    return { rows: await cards(rows.filter(r => r.id !== not), m) };
  },

  /* HIS MANAGERS: the primary one and the others now; the history (ended) */
  async repGet(s, x) {
    office(s);
    const e = await empOf(s, x.id), r15 = await S15.ready();
    const rows = r15 ? (await db('GET', 'hr_reporting?select=id,manager_id,role,primary_one,valid_from,valid_to,note,created_by,created_at,ended_by&employee_id=eq.' + e.id + '&order=valid_from.desc,id.desc&limit=200')) || [] : [];
    const ids = [...new Set(rows.map(r => r.manager_id).concat(e.reports_to ? [e.reports_to] : []))];
    const ppl = ids.length ? (await db('GET', 'hr_employees?select=id,code,name,category,site,status,designation_id,department_id&id=in.(' + ids.join(',') + ')')) || [] : [];
    const card = {}; (await cards(ppl)).forEach(c => { card[c.id] = c; });
    const team = (await db('GET', 'hr_employees?select=id,code,name&reports_to=eq.' + e.id + '&status=neq.left&order=name&limit=200')) || [];
    return { ready: r15, roles: ROLES.map(k => ({ key: k, name: ROLE_NAME[k] })), primary: e.reports_to ? card[e.reports_to] || null : null,
      now: rows.filter(r => !r.valid_to).map(r => Object.assign(r, { manager: card[r.manager_id] || null, role_name: ROLE_NAME[r.role] || r.role })),
      history: rows.filter(r => r.valid_to).map(r => Object.assign(r, { manager: card[r.manager_id] || null, role_name: ROLE_NAME[r.role] || r.role })),
      team: team };
  },

  /* A MANAGER FROM A DATE. role: primary | functional | …; the primary one also becomes "Reports to" of the Employee Master (from
   * today or an earlier day – a day ahead is set on that day). One manager in one role at a time. */
  async repSet(s, x) {
    office(s); await S15.need();
    const e = await empOf(s, x.id); if (e.status === 'left') throw fail(400, 'This employee has left.', 'left');
    await OWN.notOwn(s, e.id, 'change your own reporting manager');
    const role = ROLES.indexOf(x.role) > -1 ? x.role : 'primary', mid = id(x.manager);
    if (!mid) throw fail(400, 'Reporting person: choose an employee of the list.', 'manager');
    const m = await checkManager(e.id, mid);
    if (sitesOf(s).indexOf(m.site) < 0) throw fail(403, 'Reporting person: choose a person of a site where you have HR.', 'manager');
    const from = R.date(x.from) || R.today(); if (from === null) throw fail(400, 'From: a date as DD-MM-YYYY.', 'from');
    if (role === 'primary' && from > R.today()) throw fail(400, 'From: the primary manager is set from today or an earlier day – set a later change on its day.', 'from');
    if (e.joined_on && from < e.joined_on) throw fail(400, 'From: it is before his joining date (' + dmy(e.joined_on) + ').', 'from');
    const note = R.str(x.note, 200), by = s.email;
    if (role === 'primary') {
      const open = (await db('GET', 'hr_reporting?select=id,valid_from&employee_id=eq.' + e.id + '&primary_one=is.true&valid_to=is.null')) || [];
      if (open.some(o => o.valid_from > from)) throw fail(400, 'From: his present primary manager is from ' + dmy(open[0].valid_from) + ' – a change starts on that day or later.', 'from');
      if (e.reports_to === mid && open.length) throw fail(400, 'He already reports to this person.', 'same');
      await syncPrimary(e.id, mid, from, by, note);
      // the Employee Master and the history of his posting, as the form does
      await db('PATCH', 'hr_employees?id=eq.' + e.id, { reports_to: mid, updated_by: by, updated_at: new Date().toISOString() }, 'return=minimal');
      await db('PATCH', 'hr_employment?employee_id=eq.' + e.id + '&valid_to=is.null', { valid_to: from }, 'return=minimal');
      await db('POST', 'hr_employment', [{ employee_id: e.id, site: e.site, department_id: e.department_id, designation_id: e.designation_id, reports_to: mid, valid_from: from, note: note || 'Reporting changed', created_by: by }], 'return=minimal');
    } else {
      const same = (await db('GET', 'hr_reporting?select=id&employee_id=eq.' + e.id + '&manager_id=eq.' + mid + '&role=eq.' + role + '&valid_to=is.null')) || [];
      if (same.length) throw fail(400, 'He already has this person as his ' + ROLE_NAME[role].toLowerCase() + ' manager.', 'same');
      await db('POST', 'hr_reporting', [{ employee_id: e.id, manager_id: mid, role: role, primary_one: false, valid_from: from, note: note, created_by: by }], 'return=minimal');
    }
    await audit(s.site, by, 'Reporting manager set', e.code, { role: role, manager: m.code, from: from, note: note });
    // (step 17) the employee and the new manager are told – WhatsApp / e-mail and the app (his answer of 18-11-2026)
    await tell(e.id, mid, role, from, by);
    return { ok: true };
  },

  /* A MANAGER ENDS (with the day and the reason). Ending the primary one empties "Reports to". */
  async repEnd(s, x) {
    office(s); await S15.need();
    const r = ((await db('GET', 'hr_reporting?select=id,employee_id,manager_id,role,primary_one,valid_from,valid_to,note&id=eq.' + Number(x.row))) || [])[0];
    if (!r || r.valid_to) throw fail(404, 'This line was not found (or has ended).', 'notfound');
    const e = await empOf(s, r.employee_id); await OWN.notOwn(s, e.id, 'change your own reporting manager');
    const to = R.date(x.to) || R.today(); if (to === null) throw fail(400, 'Up to: a date as DD-MM-YYYY.', 'to');
    if (to < r.valid_from) throw fail(400, 'Up to: it is before the day it began (' + dmy(r.valid_from) + ').', 'to');
    const why = R.str(x.reason, 200); if (why.length < 5) throw fail(400, 'Reason: write why it ends (at least 5 letters).', 'reason');
    await db('PATCH', 'hr_reporting?id=eq.' + r.id + '&valid_to=is.null', { valid_to: to, ended_by: s.email, note: R.str((r.note ? r.note + ' · ' : '') + 'Ended: ' + why, 400) }, 'return=minimal');
    if (r.primary_one && e.reports_to === r.manager_id) {
      await db('PATCH', 'hr_employees?id=eq.' + e.id, { reports_to: null, updated_by: s.email, updated_at: new Date().toISOString() }, 'return=minimal');
      await db('PATCH', 'hr_employment?employee_id=eq.' + e.id + '&valid_to=is.null', { valid_to: to }, 'return=minimal');
      await db('POST', 'hr_employment', [{ employee_id: e.id, site: e.site, department_id: e.department_id, designation_id: e.designation_id, reports_to: null, valid_from: to, note: why, created_by: s.email }], 'return=minimal');
    }
    await audit(s.site, s.email, 'Reporting manager ended', e.code, { role: r.role, to: to, reason: why });
    return { ok: true };
  },
};
module.exports = { ACT, ROLES, circle, checkManager, syncPrimary, cards };
