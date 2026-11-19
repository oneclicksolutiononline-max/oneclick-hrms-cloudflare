/* POST /api/face { action, … } – THE FACE FOR ATTENDANCE (step 9, 12-11-2026). Its own endpoint: the model is heavy, and the rest
 * of HR (api/hr.js) must stay light and must keep working whatever happens here.
 *   An employee, for himself (also "My HR"):
 *     faceState      – is the face needed on his site, how much must match, is his face registered
 *     faceEnrolUrls  – where the phone sends the five pictures of the registration (front, left, right, up, down)
 *     faceEnrol      – the five pictures are measured; all must show ONE person – his face is registered. Once: a second
 *                      registration only after the HR Admin / Super Admin reset the first.
 *     faceCheck      – the proof photo of ONE punch (already sent to its place) against his registered face. It matches at
 *                      least the site's percentage: noted as "ok" – api/hr.js then takes that punch. It does not: noted, refused,
 *                      NOTHING of the punch is saved ("yatle ek jari nahi zal attendence mark nahi honar").
 *   The HR office:
 *     faceInfo       – an employee's registration (its pictures: HR Admin / Super Admin) and his last checks
 *     faceReset      – HR Admin / Super Admin, with the reason: he registers again. Nothing is deleted.
 * Always the employee the sign-in is – never an id from the phone. The pictures stay in the private store; a face is kept as
 * numbers. Every check is written down (hr_face_tries), with how far it matched. */
'use strict';
const crypto = require('crypto');
const { handler, readBody, send, sameSite, fail } = require('../lib/http');
const { db, enc } = require('../lib/db');
const ses = require('../lib/session');
const { audit } = require('../lib/audit');
const R = require('../lib/rules');
const D = require('../lib/day');
const store = require('../lib/store');
const F = require('../lib/face');
const { me, needOffice } = require('../lib/act_attend');
const { setup } = require('../lib/act_muster');
const CONSENT = require('../lib/consent');      // (18-11-2026, Phase 1) his "I agree" before the face is registered

const NOT_READY9 = 'The face check is not set up yet: the Super Admin runs sql/hr_step9_faces.sql once in the rcl-hr Supabase → SQL Editor.';
// (18-11-2026) the names the app shows for the five pictures (its own steps: one side, the other side, up or down, the other way)
const POSES = ['front', 'left', 'right', 'up', 'down'], POSE_NAME = { front: 'Front', left: 'One side', right: 'The other side', up: 'Up / down', down: 'The other way' };
const CLIENT = /^[A-Za-z0-9_-]{16,64}$/, TOKEN = /^[0-9a-f]{24}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isAdmin = s => s.role === 'admin' || s.role === 'super';
const rulesOf = async site => { const v = D.validOn((await setup(site)).rules, R.today()); return v ? v.rules : {}; };
const faceOf = async empId => ((await db('GET', 'hr_faces?select=id,descriptors,photos,enrolled_at,device_id,model&employee_id=eq.' + empId + '&active=is.true')) || [])[0] || null;
// a file of the private store, as it is ('' path or not there: null)
async function bytes(path, bucket) {
  const u = await store.link(path, 60, bucket); if (!u) return null;
  let r; try { r = await fetch(u, { signal: AbortSignal.timeout(15000) }); } catch (e) { throw fail(503, 'Could not reach the place of the pictures – please try again in a moment.', 'net'); }
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}
const note = (emp, row) => db('POST', 'hr_face_tries', [Object.assign({ employee_id: emp.id, site: emp.site }, row)], 'return=minimal');
const NOT_READY14 = 'Consent records are not set up yet: the Super Admin runs sql/hr_step14_security.sql once in the rcl-hr Supabase → SQL Editor.';
// his newest consent (null: none, or step 14 not run yet)
const consentOf = async empId => { try { return ((await db('GET', 'hr_face_consents?select=version,given_at&employee_id=eq.' + empId + '&order=given_at.desc&limit=1')) || [])[0] || null; } catch (e) { if (e && e.code === 'notinstalled') return null; throw e; } };
const said = { noface: 'no face was found in the picture – look straight at the phone, in the light', manyfaces: 'more than one face is in the picture – only you' };
/* (18-11-2026, asked: "face madhe user la problem alach nahi pahije") a turned picture that fails was, nearly always, a head turned
 * too far – said so; the match itself stays exactly as strict */
const saidTurned = { noface: 'no face was found in the picture – turn your head only a little, your whole face in the light, and take all five again' };

const ACT = {
  /* ───────────── an employee, for himself ───────────── */
  async faceState(s) {
    const emp = await me(s), [rules, f, c] = await Promise.all([rulesOf(emp.site), faceOf(emp.id), consentOf(emp.id)]);
    return { required: !!rules.face, min: F.minOf(rules), enrolled: !!f, enrolled_at: f ? f.enrolled_at : '', poses: POSES,
      consent: { version: CONSENT.VERSION, required: CONSENT.required(), given: !!c && c.version === CONSENT.VERSION, given_at: c ? c.given_at : '' } };
  },
  // (Phase 1) the words he agrees to before his face is registered – in English, मराठी, हिंदी – and their version
  async faceConsentText() { return { version: CONSENT.VERSION, text: CONSENT.TEXT }; },
  async faceEnrolUrls(s) {
    const emp = await me(s); if (await faceOf(emp.id)) throw fail(409, 'Your face is registered already. Only the HR Admin can reset it – then you register again.', 'enrolled');
    const token = crypto.randomBytes(12).toString('hex'), out = [];
    for (const p of POSES) out.push({ pose: p, url: await store.uploadUrl('faces/' + emp.id + '/' + token + '-' + p + '.jpg') });
    return { token: token, pictures: out, type: 'image/jpeg' };
  },
  async faceEnrol(s, x) {
    const emp = await me(s), token = String(x.token || ''); if (!TOKEN.test(token)) throw fail(400, 'Bad registration number.', 'token');
    if (await faceOf(emp.id)) throw fail(409, 'Your face is registered already. Only the HR Admin can reset it – then you register again.', 'enrolled');
    /* (18-11-2026, Phase 1) HIS CONSENT: the app shows the words of faceConsentText and sends { consent: { version, lang } } with the
     * registration; it is written down (hr_face_consents) before the face is kept. Asked for when FACE_CONSENT_REQUIRED=true
     * (he switches it on once the app that shows the words is out) – an old app is then told to update. */
    const cs = x.consent || null, dev0 = x.device || {};
    if (cs && cs.version !== CONSENT.VERSION) throw fail(409, 'The consent words changed – read them again and agree.', 'consent');
    if (cs) {
      try { await db('POST', 'hr_face_consents', [{ employee_id: emp.id, site: emp.site, version: CONSENT.VERSION, lang: CONSENT.LANGS.indexOf(cs.lang) > -1 ? cs.lang : 'en', device_id: R.str(dev0.id, 100), app: R.str(x.app, 30), given_by: s.email }], 'return=minimal'); }
      catch (e) { if (e && e.code === 'notinstalled') { if (CONSENT.required()) throw fail(500, NOT_READY14, 'notready14'); } else throw e; }
    } else if (CONSENT.required()) { const had = await consentOf(emp.id); if (!had || had.version !== CONSENT.VERSION) throw fail(400, 'Update the app: your consent is asked before your face is registered.', 'consent'); }
    const got = [];
    /* (19-11-2026, "The server did not answer in time" – the phone waits 40 s) the five pictures fetched at once and the model read
     * meanwhile – then measured one by one, as before */
    const all = await Promise.all(POSES.map(p => bytes('faces/' + emp.id + '/' + token + '-' + p + '.jpg')).concat([F.load().then(() => null, () => null)]));
    for (const p of POSES) {
      const path = 'faces/' + emp.id + '/' + token + '-' + p + '.jpg', b = all[POSES.indexOf(p)]; if (!b) throw fail(400, POSE_NAME[p] + ': the picture did not arrive – take it again.', 'picture', { pose: p });
      let d; try { d = await F.describe(b); } catch (e) { if (e && e.status) throw e; throw fail(400, POSE_NAME[p] + ': the picture could not be read – take it again.', 'picture', { pose: p }); }
      if (d.result !== 'ok') { await note(emp, { kind: 'enrol', result: d.result, selfie_path: path }); throw fail(400, POSE_NAME[p] + ': ' + ((p !== 'front' && saidTurned[d.result]) || said[d.result]) + '.', d.result, { pose: p }); }
      got.push({ pose: p, path: path, descriptor: d.descriptor });
    }
    // the five pictures must be of ONE person (each against the one from the front, by the model's own line)
    const front = got[0].descriptor, far = got.slice(1).filter(g => F.dist(front, g.descriptor) > F.HALF)[0];
    if (far) { await note(emp, { kind: 'enrol', result: 'nomatch', distance: Math.round(F.dist(front, far.descriptor) * 1e4) / 1e4, match_pct: F.pct(F.dist(front, far.descriptor)), selfie_path: far.path }); throw fail(400, POSE_NAME[far.pose] + ': it does not match the picture from the front – turn your head only a little (your whole face must be seen) and take all five again, only you.', 'nomatch', { pose: far.pose }); }
    const dev = x.device || {};
    try { await db('POST', 'hr_faces', [{ employee_id: emp.id, site: emp.site, descriptors: got.map(g => g.descriptor), photos: got.map(g => ({ pose: g.pose, path: g.path })), device_id: R.str(dev.id, 100), model: R.str(dev.model, 80), enrolled_by: s.email }], 'return=minimal'); }
    catch (e) { if (e && e.code === 'duplicate') throw fail(409, 'Your face is registered already.', 'enrolled'); throw e; }
    await note(emp, { kind: 'enrol', result: 'ok', selfie_path: got[0].path });
    await audit(emp.site, s.email, 'Face registered', emp.code + ' ' + emp.name, { pictures: POSES.length });
    return { enrolled: true };
  },
  async faceCheck(s, x) {
    const emp = await me(s), cid = String(x.client_id || ''); if (!CLIENT.test(cid)) throw fail(400, 'Bad punch number.', 'client_id');
    const path = emp.id + '/' + cid + '.jpg';      // (19-11-2026) the photo fetched and the model read at the same time as the rules
    const [rules, f, b] = await Promise.all([rulesOf(emp.site), faceOf(emp.id), bytes(path, store.SELFIES), F.load().then(() => null, () => null)]), min = F.minOf(rules);
    if (!f) throw fail(409, 'Your face is not registered yet – register it first (once).', 'notenrolled');
    if (!b) throw fail(400, 'The photo of this punch did not arrive – take it again.', 'selfie');
    let d; try { d = await F.describe(b); } catch (e) { if (e && e.status) throw e; throw fail(400, 'The photo could not be read – take it again.', 'selfie'); }
    if (d.result !== 'ok') { await note(emp, { kind: 'punch', result: d.result, min_pct: min, client_id: cid, selfie_path: path }); throw fail(403, 'Not marked: ' + said[d.result] + '. Nothing is saved.', d.result); }
    const n = F.nearest(f.descriptors, d.descriptor), ok = n.pct >= min;
    await note(emp, { kind: 'punch', result: ok ? 'ok' : 'nomatch', match_pct: n.pct, distance: Math.round(n.distance * 1e4) / 1e4, min_pct: min, client_id: cid, selfie_path: path });
    if (!ok) throw fail(403, 'Not marked: the face does not match the registered face of ' + emp.name + ' (' + n.pct + ' % – at least ' + min + ' % is needed). Nothing is saved.', 'face', { pct: n.pct, min: min });
    return { match: true, pct: n.pct, min: min };
  },

  /* ───────────── the HR office ───────────── */
  async faceInfo(s, x) {
    needOffice(s); const id = String(x.id || '').toLowerCase(); if (!UUID.test(id)) throw fail(404, 'This employee was not found.', 'notfound');
    const emp = ((await db('GET', 'hr_employees?select=id,code,name&id=eq.' + id + '&site=eq.' + enc(s.site))) || [])[0]; if (!emp) throw fail(404, 'This employee was not found on this site.', 'notfound');
    const [faces, tries, rules, consents] = await Promise.all([db('GET', 'hr_faces?select=id,photos,active,enrolled_at,model,reset_by,reset_at,reset_reason&employee_id=eq.' + emp.id + '&order=enrolled_at.desc&limit=10'),
      db('GET', 'hr_face_tries?select=kind,result,match_pct,min_pct,at&employee_id=eq.' + emp.id + '&order=at.desc&limit=20'), rulesOf(s.site),
      db('GET', 'hr_face_consents?select=version,lang,given_at&employee_id=eq.' + emp.id + '&order=given_at.desc&limit=10').catch(e => { if (e && e.code === 'notinstalled') return null; throw e; })]);
    const now = (faces || []).filter(f => f.active)[0] || null; let pictures = [];
    if (now && isAdmin(s)) { const got = await store.links((now.photos || []).map(p => p.path), 300); pictures = (now.photos || []).map(p => ({ pose: p.pose, url: got[p.path] || '' })).filter(p => p.url); }
    return { required: !!rules.face, min: F.minOf(rules), enrolled: !!now, enrolled_at: now ? now.enrolled_at : '', model: now ? now.model : '', pictures: pictures, can_reset: isAdmin(s),
      resets: (faces || []).filter(f => !f.active).map(f => ({ enrolled_at: f.enrolled_at, reset_at: f.reset_at, reset_by: f.reset_by, reason: f.reset_reason })), tries: tries || [],
      consents: (consents || []).map(c => ({ version: c.version, lang: c.lang, given_at: c.given_at, current: c.version === CONSENT.VERSION })), consent_version: CONSENT.VERSION };
  },
  async faceReset(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin resets a registered face.', 'role');
    const id = String(x.id || '').toLowerCase(), why = R.str(x.reason, 200); if (!UUID.test(id)) throw fail(404, 'This employee was not found.', 'notfound'); if (why.length < 3) throw fail(400, 'Reason: write why the face is reset.', 'reason');
    const emp = ((await db('GET', 'hr_employees?select=id,code,name&id=eq.' + id + '&site=eq.' + enc(s.site))) || [])[0]; if (!emp) throw fail(404, 'This employee was not found on this site.', 'notfound');
    const done = (await db('PATCH', 'hr_faces?employee_id=eq.' + emp.id + '&active=is.true', { active: false, reset_by: s.email, reset_at: new Date().toISOString(), reset_reason: why }, 'return=representation')) || [];
    if (!done.length) throw fail(400, 'No face is registered for him.', 'none');
    await audit(s.site, s.email, 'Face reset', emp.code + ' ' + emp.name, { reason: why });
    return { reset: true };
  },
};
const SELF = ['faceState', 'faceConsentText', 'faceEnrolUrls', 'faceEnrol', 'faceCheck'];

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });
  sameSite(req);
  const x = await readBody(req), fn = Object.prototype.hasOwnProperty.call(ACT, String(x.action)) ? ACT[x.action] : null;
  if (!fn) return send(res, 400, { error: 'Unknown action.' });
  const s = await ses.need(req);
  if (s.role === 'self' && SELF.indexOf(String(x.action)) < 0) throw fail(403, 'This is for the HR office only.', 'role');
  require('../lib/pages').guard(s, x.action, SELF);      // (19-11-2026) an HR User's pages: a person's face – Employees
  try { send(res, 200, Object.assign({ ok: true }, await fn(s, x))); }
  catch (e) { if (e && e.code === 'notinstalled') throw fail(500, NOT_READY9, 'notinstalled'); throw e; }
});
module.exports.ACT = ACT; module.exports.SELF = SELF; module.exports.NOT_READY9 = NOT_READY9;
