/* THE COMPANY'S POLICIES TO READ AND ACCEPT (18-11-2026, Phase 2 – step 15; the master prompt Part 8: "create policy, version it,
 * publish, applicable to … , mandatory acceptance, who accepted which version when, pending list"; his answer: policy acceptance
 * also goes on WhatsApp – Phase 4).
 *   – Apart from the Rule Book (whose policies are the attendance / leave rules that the muster counts with): these are documents.
 *   – Made, versioned and published only by the Super Admin or the HO HR. A published version is never changed: a change is a new
 *     version (a draft until published). The version in force = the newest published one whose "from" day has come.
 *   – For whom: everybody, or some sites / categories / departments (every list given must hold the person's).
 *   – A person accepts the version in force himself (his app or the web: "I have read and accept"); a new version is asked again.
 *     An acceptance is only added – never changed, never removed (the database refuses it). */
'use strict';
const crypto = require('crypto');
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const store = require('./store');
const S15 = require('./step15');

const isHo = s => require('./act_month').isHo(s);
const me = s => require('./act_attend').me(s);      // the employee this sign-in IS (his own policies)
async function needHo(s) { if (!(await isHo(s))) throw fail(403, 'Only the HO HR or the Super Admin makes the company\'s policies.', 'role'); }
const office = s => { if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role'); };
const PDF = { 'application/pdf': 'pdf' }, MAX_BODY = 60000;

// the scope as kept: { all: true } or { sites: [...], categories: [...], departments: [...] } (an empty list = not limited by it)
function scopeOf(x) {
  x = x || {}; const o = {};
  if (Array.isArray(x.sites) && x.sites.length) o.sites = [...new Set(x.sites.map(v => R.str(v, 12).toUpperCase()).filter(Boolean))].slice(0, 50);
  if (Array.isArray(x.categories) && x.categories.length) o.categories = [...new Set(x.categories.map(R.category).filter(Boolean))];
  if (Array.isArray(x.departments) && x.departments.length) o.departments = [...new Set(x.departments.map(v => String(v || '').toLowerCase()).filter(v => /^[0-9a-f-]{36}$/.test(v)))].slice(0, 100);
  return Object.keys(o).length ? o : { all: true };
}
const applies = (scope, emp) => { scope = scope || { all: true }; if (scope.all) return true; return (!scope.sites || scope.sites.indexOf(emp.site) > -1) && (!scope.categories || scope.categories.indexOf(emp.category) > -1) && (!scope.departments || scope.departments.indexOf(emp.department_id) > -1); };
/* EVERY POLICY IS OF ITS OWN SITE (18-11-2026, his correction: "HO chi policy HO sathi, VTR chi VTR sathi, CTR chi CTR sathi …
 * ekdchi policy tikde diste – as nko"). A new one is kept for the site open at the top (scope.sites = [that site]; categories /
 * departments as chosen); the office's list and every change see only the policies of the site open at the top; a person is
 * asked only for the policies of his own site. One made before without a site ("everybody") is of the site it was made on – its
 * audit row "Company policy made", written by its maker in the same second; found nowhere = every site, as before. Nothing in the database is
 * changed for it: its site is written only when it is saved again. */
const siteList = sc => (sc && Array.isArray(sc.sites) && sc.sites.length ? sc.sites : null);
async function withHome(pols) {
  const old = (pols || []).filter(p => !siteList(p.scope)); if (!old.length) return pols || [];
  const made = ((await db('GET', 'hr_audit?select=site,email,target,at&action=eq.' + enc('Company policy made') + '&order=at&limit=20000').catch(() => [])) || []).filter(r => r.site);
  old.forEach(p => {
    const t = Date.parse(p.created_at), near = r => Math.abs(Date.parse(r.at) - t);
    const m = made.filter(r => r.email === p.created_by && near(r) < 5000).sort((a, b) => ((a.target === p.title ? 0 : 1) - (b.target === p.title ? 0 : 1)) || (near(a) - near(b)))[0];
    if (m) { const sc = Object.assign({}, p.scope || {}); delete sc.all; sc.sites = [m.site]; p.scope = sc; }
  });
  return pols;
}
// the company's policies (a PostgREST filter after "select=*&"), each with the site it is of
async function load(q) { return withHome((await db('GET', 'hr_cpolicies?select=*' + (q ? '&' + q : ''))) || []); }
const ofSite = (p, site) => { const l = siteList(p.scope); return !l || l.indexOf(site) > -1; };
async function onePolicy(s, id) {
  const p = (await load('id=eq.' + (Number(id) || 0)))[0]; if (!p) throw fail(404, 'This policy was not found.', 'notfound');
  if (!ofSite(p, s.site)) throw fail(403, 'This policy is of another site – open that site at the top.', 'site'); return p;
}
// the version in force of each policy (newest published whose day has come)
async function inForce(ids) {
  const day = R.today(), q = 'hr_cpolicy_versions?select=id,policy_id,version,body,file_path,effective_from,published_at&status=eq.published&effective_from=lte.' + day + (ids ? '&policy_id=in.(' + ids.join(',') + ')' : '') + '&order=policy_id,version.desc';
  const out = {}; ((await db('GET', q)) || []).forEach(v => { if (!out[v.policy_id]) out[v.policy_id] = v; }); return out;
}
// the policies that apply to one person, with the version in force and whether he accepted it
async function forPerson(emp) {
  const pol = (await load('active=is.true&order=title')).filter(p => applies(p.scope, emp));
  if (!pol.length) return [];
  const v = await inForce(pol.map(p => p.id)), vids = Object.keys(v).map(k => v[k].id);
  const acc = {}; if (vids.length) ((await db('GET', 'hr_cpolicy_accepts?select=version_id,accepted_at,via&employee_id=eq.' + emp.id + '&version_id=in.(' + vids.join(',') + ')')) || []).forEach(a => { acc[a.version_id] = a; });
  return pol.filter(p => v[p.id]).map(p => ({ policy: p.id, title: p.title, category: p.category, mandatory: p.mandatory, version: v[p.id].version, version_id: v[p.id].id, effective_from: v[p.id].effective_from,
    body: v[p.id].body, has_file: !!v[p.id].file_path, accepted_at: acc[v[p.id].id] ? acc[v[p.id].id].accepted_at : null, via: acc[v[p.id].id] ? acc[v[p.id].id].via : '' }));
}
async function accept(emp, versionId, via, device, inviteId) {
  const mine = (await forPerson(emp)).filter(p => p.version_id === versionId)[0];
  if (!mine) throw fail(400, 'This policy is not the one in force for you – open the list again.', 'version');
  if (mine.accepted_at) return { ok: true, already: true };
  try { await db('POST', 'hr_cpolicy_accepts', [{ version_id: versionId, employee_id: emp.id, invite_id: inviteId || null, via: via, device: R.str(device, 120) }], 'return=minimal'); }
  catch (e) { if (e && e.code === 'duplicate') return { ok: true, already: true }; throw e; }
  return { ok: true, policy: mine.title, version: mine.version };
}

const ACT = {
  /* THE LIST (the office): each policy, its versions, and for THIS site how many people it applies to and how many accepted */
  async cpList(s) {
    office(s); await S15.need();
    const [all, ver, ho] = await Promise.all([load('order=active.desc,title'), db('GET', 'hr_cpolicy_versions?select=id,policy_id,version,effective_from,status,file_path,created_by,created_at,published_by,published_at&order=policy_id,version.desc'), isHo(s)]);
    const pol = all.filter(p => ofSite(p, s.site)), emps = (await db('GET', 'hr_employees?select=id,site,category,department_id&site=eq.' + enc(s.site) + '&status=neq.left')) || [], force = await inForce();
    const vids = Object.keys(force).map(k => force[k].id), acc = {};
    for (let i = 0; i < vids.length; i++) ((await db('GET', 'hr_cpolicy_accepts?select=employee_id&version_id=eq.' + vids[i])) || []).forEach(a => { (acc[vids[i]] = acc[vids[i]] || {})[a.employee_id] = 1; });
    return { can: ho, site: s.site, rows: (pol || []).map(p => { const f = force[p.id], who = emps.filter(e => applies(p.scope, e)); return Object.assign(p, { versions: (ver || []).filter(v => v.policy_id === p.id), in_force: f ? { id: f.id, version: f.version, effective_from: f.effective_from } : null,
      people: who.length, accepted: f ? who.filter(e => (acc[f.id] || {})[e.id]).length : 0 }); }) };
  },
  async cpSave(s, x) {
    await needHo(s); await S15.need();
    const title = R.str(x.title, 120); if (title.length < 3) throw fail(400, 'Title: at least 3 letters.', 'title');
    // the site: a new one – the site open at the top; one made before keeps its own (one of "everybody": the site it was made on)
    const pid = Number(x.id) || 0, was = pid ? await onePolicy(s, pid) : null, sc = Object.assign({}, x.scope || {}, { sites: (was && siteList(was.scope)) || [s.site] });
    const row = { title: title, category: R.str(x.category, 60), mandatory: x.mandatory !== false, scope: scopeOf(sc), active: x.active !== false };
    if (pid) { row.updated_by = s.email; row.updated_at = new Date().toISOString(); await db('PATCH', 'hr_cpolicies?id=eq.' + pid, row, 'return=minimal'); await audit(s.site, s.email, 'Company policy changed', title, row); return { id: pid }; }
    const made = (await db('POST', 'hr_cpolicies', [Object.assign(row, { created_by: s.email })], 'return=representation'))[0];
    await audit(s.site, s.email, 'Company policy made', title, row); return { id: made.id };
  },
  // a file (PDF) for a version: where to send it
  async cpFileUrl(s, x) {
    await needHo(s); await S15.need();
    const pid = Number(x.policy) || 0; if (!pid) throw fail(400, 'Choose the policy.', 'policy'); await onePolicy(s, pid);
    if (!PDF[String(x.type || '')]) throw fail(400, 'Only a PDF can be attached to a policy.', 'type');
    const bytes = Number(x.bytes); if (!(bytes > 0) || bytes > R.DOC_MAX) throw fail(400, 'The file is empty or bigger than 10 MB.', 'bytes');
    const path = 'policies/' + pid + '/' + crypto.randomBytes(12).toString('hex') + '.pdf';
    return { path: path, url: await store.uploadUrl(path) };
  },
  /* A DRAFT VERSION – written / changed until it is published. { policy, body, effective_from, file_path? } */
  async cpVersionSave(s, x) {
    await needHo(s); await S15.need();
    const pid = Number(x.policy) || 0; await onePolicy(s, pid);
    const body = String(x.body || '').replace(/\r\n/g, '\n').trim(); if (body.length > MAX_BODY) throw fail(400, 'The text is too long (at most ' + MAX_BODY + ' letters) – attach it as a PDF.', 'body');
    const file = String(x.file_path || ''); if (file && !new RegExp('^policies/' + pid + '/[0-9a-f]{24}\\.pdf$').test(file)) throw fail(400, 'This file does not belong to this policy.', 'file');
    if (file && !(await store.link(file, 60))) throw fail(400, 'The file did not arrive – attach it again.', 'file');
    if (!body && !file) throw fail(400, 'Write the policy, or attach its PDF.', 'body');
    const from = R.date(x.effective_from) || R.today(); if (from === null) throw fail(400, 'In force from: a date as DD-MM-YYYY.', 'effective_from');
    const draft = ((await db('GET', 'hr_cpolicy_versions?select=id,version&policy_id=eq.' + pid + '&status=eq.draft')) || [])[0];
    if (draft) { await db('PATCH', 'hr_cpolicy_versions?id=eq.' + draft.id + '&status=eq.draft', { body: body, file_path: file, effective_from: from }, 'return=minimal'); return { id: draft.id, version: draft.version }; }
    const last = ((await db('GET', 'hr_cpolicy_versions?select=version&policy_id=eq.' + pid + '&order=version.desc&limit=1')) || [])[0];
    const made = (await db('POST', 'hr_cpolicy_versions', [{ policy_id: pid, version: last ? last.version + 1 : 1, body: body, file_path: file, effective_from: from, status: 'draft', created_by: s.email }], 'return=representation'))[0];
    return { id: made.id, version: made.version };
  },
  async cpPublish(s, x) {
    await needHo(s); await S15.need();
    const v = ((await db('GET', 'hr_cpolicy_versions?select=id,policy_id,version,status,effective_from&id=eq.' + Number(x.version))) || [])[0];
    if (!v || v.status !== 'draft') throw fail(400, 'Only a draft is published (a published version is never changed – make a new one).', 'status');
    const p = await onePolicy(s, v.policy_id);
    const last = ((await db('GET', 'hr_cpolicy_versions?select=effective_from&policy_id=eq.' + v.policy_id + '&status=eq.published&order=version.desc&limit=1')) || [])[0];
    if (last && v.effective_from < last.effective_from) throw fail(400, 'In force from: it is before the version now published (' + last.effective_from.split('-').reverse().join('-') + ').', 'effective_from');
    await db('PATCH', 'hr_cpolicy_versions?id=eq.' + v.id + '&status=eq.draft', { status: 'published', published_by: s.email, published_at: new Date().toISOString() }, 'return=minimal');
    await audit(s.site, s.email, 'Company policy published', 'policy ' + v.policy_id + ' v' + v.version, { from: v.effective_from });
    // (step 17) the people it applies to are asked to accept it – the app, and WhatsApp / e-mail (his answer of 18-11-2026)
    const N = require('./notify');
    let asked = 0;
    if (p.active) {
      const who = ((await db('GET', 'hr_employees?select=id,name,site,category,department_id,mobile,email&status=neq.left&limit=10000')) || []).filter(e => applies(p.scope, e));
      asked = (await N.add(who.map(e => ({ site: e.site, employee_id: e.id, kind: 'policy_accept', mobile: e.mobile, email: e.email, title: (p.mandatory ? 'Please read and accept: ' : 'Please read: ') + p.title, body: 'Dear ' + e.name + ', please read' + (p.mandatory ? ' and accept' : '') + ' the company policy "' + p.title + '" (version ' + v.version + ') in the RCL app (Me → Company policies).', params: { name: e.name, policy: p.title }, dedupe: 'polpub|' + v.id + '|' + e.id, by: s.email }))).catch(() => ({ queued: 0 }))).queued;
    }
    return { ok: true, asked: asked };
  },
  async cpDraftDelete(s, x) {
    await needHo(s); await S15.need();
    const v = ((await db('GET', 'hr_cpolicy_versions?select=id,policy_id,status&id=eq.' + Number(x.version))) || [])[0];
    if (!v || v.status !== 'draft') throw fail(400, 'Only a draft can be thrown away.', 'status');
    await onePolicy(s, v.policy_id);
    await db('DELETE', 'hr_cpolicy_versions?id=eq.' + v.id + '&status=eq.draft', undefined, 'return=minimal'); return { ok: true };
  },
  // a policy's PDF (the office; a person only of a policy that applies to him – myPolicyFile)
  async cpFileLink(s, x) {
    office(s); await S15.need();
    const v = ((await db('GET', 'hr_cpolicy_versions?select=policy_id,file_path&id=eq.' + Number(x.version))) || [])[0];
    if (!v || !v.file_path) throw fail(404, 'This version has no file.', 'notfound');
    await onePolicy(s, v.policy_id); return { url: await store.link(v.file_path, 300) };
  },
  /* WHO ACCEPTED (this site): the people it applies to – accepted when, how – and who has not yet */
  async cpAccepts(s, x) {
    office(s); await S15.need();
    const p = await onePolicy(s, x.policy);
    const f = (await inForce([p.id]))[p.id];
    const emps = ((await db('GET', 'hr_employees?select=id,code,name,site,category,department_id&site=eq.' + enc(s.site) + '&status=neq.left&order=name')) || []).filter(e => applies(p.scope, e));
    const acc = {}; if (f) ((await db('GET', 'hr_cpolicy_accepts?select=employee_id,accepted_at,via&version_id=eq.' + f.id)) || []).forEach(a => { acc[a.employee_id] = a; });
    return { policy: { id: p.id, title: p.title }, version: f ? f.version : null, rows: emps.map(e => ({ code: e.code, name: e.name, accepted_at: acc[e.id] ? acc[e.id].accepted_at : null, via: acc[e.id] ? acc[e.id].via : '' })) };
  },

  /* ───── his own (My HR, the app) ───── */
  async myPolicies(s) {
    if (!(await S15.ready())) return { ready: false, rows: [] };
    const emp = await me(s); return { ready: true, rows: await forPerson(emp) };
  },
  async myPolicyAccept(s, x) {
    await S15.need(); const emp = await me(s);
    if (x.read !== true) throw fail(400, 'Tick "I have read and accept" first.', 'read');
    const r = await accept(emp, Number(x.version), x.via === 'web' ? 'web' : 'app', (x.device && (x.device.model || x.device.id)) || '', null);
    if (!r.already) await audit(emp.site, s.email, 'Company policy accepted', emp.code + ' ' + emp.name, { policy: r.policy, version: r.version, via: x.via === 'web' ? 'web' : 'app' });
    return r;
  },
  async myPolicyFile(s, x) {
    await S15.need(); const emp = await me(s);
    const mine = (await forPerson(emp)).filter(p => p.version_id === Number(x.version) && p.has_file)[0]; if (!mine) throw fail(404, 'This policy has no file for you.', 'notfound');
    const v = ((await db('GET', 'hr_cpolicy_versions?select=file_path&id=eq.' + mine.version_id)) || [])[0];
    return { url: await store.link(v.file_path, 300) };
  },
};
const SELF = ['myPolicies', 'myPolicyAccept', 'myPolicyFile'];
module.exports = { ACT, SELF, applies, scopeOf, forPerson, accept, inForce, load, ofSite };
