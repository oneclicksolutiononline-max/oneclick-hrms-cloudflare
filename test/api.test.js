// HR – the actions on a REAL database (the LOCAL TEST RIG only – never a live one): PostgreSQL + PostgREST with the SQL steps of
// sql/ applied to a scratch database, behind the rig's door at HR_RIG_URL (default http://127.0.0.1:3140).
//   timeout 120 node --test test/api.test.js          Made-up people only: no real name, number or e-mail.
'use strict';
const test = require('node:test'), assert = require('node:assert');
const RIG = process.env.HR_RIG_URL || 'http://127.0.0.1:3140';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(RIG)) throw new Error('The API test runs only on this computer\'s rig.');
process.env.SUPABASE_URL = RIG; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; delete process.env.VERCEL_ENV;
const { db } = require('../lib/db'), { ACT } = require('../api/hr');
const tag = 'T' + Date.now().toString(36).toUpperCase().slice(-6), SITE = tag, SITE2 = tag + 'B';
const ses = (role, site) => ({ site: site || SITE, email: role + '@rig.test', name: 'Rig ' + role, role: role, info: { sites: [{ code: SITE, name: 'Rig one' }, { code: SITE2, name: 'Rig two' }] } });
const admin = ses('admin'), user = ses('user'), sup = ses('super');
let n = 0; const mob = () => '9' + String(Date.now()).slice(-6) + String(100 + (n++)).slice(-3), mail = k => (k + '.' + tag + '@rig.test').toLowerCase();
const no = async (p, re, status) => { await assert.rejects(p, e => { assert.match(e.message, re); if (status) assert.strictEqual(e.status, status); return true; }); };

test('masters: the HR Admin adds and renames; the same name twice is refused; an HR User cannot', async () => {
  await no(ACT.masterSave(user, { kind: 'department', name: 'Dept ' + tag }), /Only the HR Admin/, 403);
  let m = await ACT.masterSave(admin, { kind: 'department', name: 'Dept ' + tag });
  const d = m.departments.find(x => x.name === 'Dept ' + tag); assert.ok(d && d.active);
  await no(ACT.masterSave(admin, { kind: 'department', name: 'dept ' + tag.toLowerCase() }), /already in the list/, 409);
  m = await ACT.masterSave(admin, { kind: 'department', id: d.id, name: 'Dept ' + tag + ' 2', active: false });
  assert.deepStrictEqual(m.departments.find(x => x.id === d.id), { id: d.id, name: 'Dept ' + tag + ' 2', active: false });
  m = await ACT.masterSave(admin, { kind: 'designation', name: 'Desig ' + tag }); assert.ok(m.designations.some(x => x.name === 'Desig ' + tag));
  const i = await ACT.init(user); assert.deepStrictEqual(i.categories.map(c => c.name), ['Staff', 'Operator', 'Driver', 'Labour']);
});

test('an employee: added with his code; incomplete without DOB / e-mail; a mobile or e-mail of another is refused; changes are written down', async () => {
  const m = await ACT.init(admin), dep = m.departments[0].id, des = m.designations.find(x => x.name === 'Desig ' + tag).id;
  await no(ACT.empSave(user, { name: 'X', category: 'boss' }), /Name: at least 2 letters\. Category: Staff, Operator, Driver or Labour\./, 400);
  await no(ACT.empSave(user, { name: 'Young One', category: 'labour', dob: '2015-01-01' }), /under 18/);
  const m1 = mob(), a = await ACT.empSave(user, { name: 'Asha Rig', category: 'staff', mobile: '+91 ' + m1, email: mail('ASHA'), dob: '05-03-1990', joined_on: '2024-04-01', department_id: dep, designation_id: des });
  assert.match(a.code, /^RCL\d{3,}$/); assert.strictEqual(a.status, 'pending'); assert.deepStrictEqual(a.missing, []);
  const b = await ACT.empSave(user, { name: 'Babu Rig', category: 'Labour', mobile: mob() });
  assert.strictEqual(b.status, 'incomplete'); assert.deepStrictEqual(b.missing, ['Date of birth']); assert.notStrictEqual(b.code, a.code);
  await no(ACT.empSave(user, { name: 'Copy Rig', category: 'driver', mobile: m1 }), new RegExp('mobile number already belongs to employee ' + a.code), 409);
  await no(ACT.empSave(user, { name: 'Copy Rig', category: 'driver', email: mail('asha') }), new RegExp('e-mail already belongs to employee ' + a.code), 409);
  // completing him: pending; reporting to Asha; the history gets a new row; the audit has old and new
  const b2 = await ACT.empSave(user, { id: b.id, name: 'Babu Rig', category: 'labour', mobile: (await ACT.empGet(user, { id: b.id })).employee.mobile, email: mail('babu'), dob: '1985-12-31', reports_to: a.id });
  assert.strictEqual(b2.status, 'pending'); assert.strictEqual(b2.code, b.code);
  await no(ACT.empSave(user, { id: b.id, name: 'Babu Rig', category: 'labour', reports_to: b.id }), /cannot report to himself/);
  const g = await ACT.empGet(user, { id: b.id });
  assert.strictEqual(g.boss.code, a.code); assert.strictEqual(g.history.length, 2); assert.ok(g.history[1].valid_to && !g.history[0].valid_to);
  const au = await db('GET', 'hr_audit?select=action,target,detail&site=eq.' + SITE + '&target=eq.' + b.code + '&order=id');
  assert.deepStrictEqual(au.map(x => x.action), ['Employee added', 'Employee changed']); assert.deepStrictEqual(au[1].detail.dob, [null, '1985-12-31']); assert.deepStrictEqual(au[1].detail.status, ['incomplete', 'pending']);
  // the list: this site only; search by name, code, mobile; the counts
  let l = await ACT.empList(user, {}); assert.deepStrictEqual(l.rows.map(r => r.name), ['Asha Rig', 'Babu Rig']); assert.deepStrictEqual(l.counts, { incomplete: 0, pending: 2, active: 0, left: 0 });
  assert.deepStrictEqual((await ACT.empList(user, { q: m1.slice(2) })).rows.map(r => r.code), [a.code]);
  assert.deepStrictEqual((await ACT.empList(user, { q: 'babu', category: 'labour' })).rows.map(r => r.code), [b.code]);
  assert.strictEqual((await ACT.empList(ses('user', SITE2), {})).rows.length, 0, 'another site sees nothing of this one');
  await no(ACT.empGet(ses('user', SITE2), { id: a.id }), /not found on this site/, 404);
  assert.deepStrictEqual((await ACT.empPick(user, { q: 'ash' })).rows.map(r => r.code), [a.code]);
});

test('transfer and exit: only the HR Admin; only to a site of his sign-in; the history and the audit keep everything; nothing is deleted', async () => {
  const l = await ACT.empList(admin, {}), a = l.rows[0], b = l.rows[1];
  await no(ACT.empTransfer(user, { id: b.id, site: SITE2 }), /Only the HR Admin/, 403);
  await no(ACT.empTransfer(admin, { id: b.id, site: 'OTHER9' }), /only to a site where you have HR/, 403);
  await no(ACT.empTransfer(admin, { id: b.id, site: SITE2, from: '01-01-2020' }), /before his present posting began/);
  const day = require('../lib/rules').today();
  await ACT.empTransfer(admin, { id: b.id, site: SITE2, from: day, note: 'To site two' });
  assert.strictEqual((await ACT.empList(admin, {})).rows.length, 1); const there = (await ACT.empList(ses('admin', SITE2), {})).rows; assert.deepStrictEqual(there.map(r => r.code), [b.code]);
  const h = (await ACT.empGet(ses('admin', SITE2), { id: b.id })).history; assert.deepStrictEqual([h[0].site, h[0].valid_from, h[0].note, h[0].valid_to], [SITE2, day, 'To site two', null]);
  await no(ACT.empExit(user, { id: a.id, on: day, reason: 'Resigned' }), /Only the HR Admin/, 403);
  await no(ACT.empExit(admin, { id: a.id, on: '2020-01-01', reason: 'Resigned' }), /before the date he is active from/);
  await no(ACT.empExit(admin, { id: a.id, on: day, reason: '' }), /write the reason/);
  await ACT.empExit(admin, { id: a.id, on: day, reason: 'Resigned' });
  const g = await ACT.empGet(admin, { id: a.id }); assert.deepStrictEqual([g.employee.status, g.employee.left_on, g.employee.left_reason], ['left', day, 'Resigned']);
  assert.strictEqual((await ACT.empList(admin, {})).rows.length, 0, 'not in the usual list'); assert.deepStrictEqual((await ACT.empList(admin, { status: 'left' })).rows.map(r => r.code), [a.code]);
  await no(ACT.empSave(admin, { id: a.id, name: 'Asha Rig', category: 'staff' }), /has left/);
  assert.strictEqual((await db('GET', 'hr_employees?select=id&id=in.(' + a.id + ',' + b.id + ')')).length, 2, 'both rows are still there');
});

test('import: faults come back with their line and are not saved; missing DOB / e-mail = incomplete; doubles are refused; masters are made', async () => {
  const s = ses('user', tag + 'I'), m = [mob(), mob(), mob()];
  const rows = [
    { name: 'Imp One', category: 'Operator', mobile: m[0], email: mail('imp1'), dob: '01/02/1988', joined_on: 45000, department: 'ImpDept ' + tag, designation: 'ImpDes ' + tag },
    { name: 'Imp Two', category: 'driver', mobile: m[1] },
    { name: 'Imp Bad', category: 'pilot', mobile: '123' },
    { name: 'Imp Double', category: 'labour', mobile: m[0] },
    { name: 'Imp Three', category: 'Labor', mobile: m[2], email: mail('imp3'), dob: '1979-07-15', department: 'impdept ' + tag.toLowerCase() },
  ];
  const c = await ACT.empImport(s, { rows: rows, check: 1 });
  assert.deepStrictEqual([c.checked, c.saved, c.rows, c.faults, c.toSave, c.incomplete], [true, 0, 5, 2, 3, 1]);
  assert.deepStrictEqual(c.lines.map(x => x.line), [4, 5]); assert.match(c.lines[0].why, /Category: .* Mobile: a 10-digit/); assert.match(c.lines[1].why, /twice in the file \(line 2\)/);
  assert.strictEqual((await ACT.empList(s, {})).rows.length, 0, 'a check saves nothing');
  const r = await ACT.empImport(s, { rows: rows });
  assert.deepStrictEqual([r.saved, r.faults, r.incomplete], [3, 2, 1]); assert.deepStrictEqual(r.made, ['department: ImpDept ' + tag, 'designation: ImpDes ' + tag], 'a master is made once, whatever the letters\' case');
  const l = await ACT.empList(s, {}); assert.deepStrictEqual(l.rows.map(x => [x.name, x.category, x.status]), [['Imp One', 'operator', 'pending'], ['Imp Three', 'labour', 'pending'], ['Imp Two', 'driver', 'incomplete']]);
  assert.strictEqual(l.rows[0].joined_on, '2023-03-15'); assert.strictEqual(l.rows[0].department_id, l.rows[1].department_id);
  const codes = l.rows.map(x => +x.code.slice(1)).sort((a, b) => a - b); assert.deepStrictEqual(codes, [codes[0], codes[0] + 1, codes[0] + 2], 'codes in a row, none twice');
  const again = await ACT.empImport(s, { rows: rows }); assert.strictEqual(again.saved, 0, 'the same file again adds nobody'); assert.strictEqual(again.faults, 5);
  await no(ACT.empImport(s, { rows: [] }), /no rows/); await no(ACT.empImport(s, { rows: new Array(1001).fill({ name: 'x' }) }), /At most 1000/);
});

// a made-up Aadhaar-like number with a right check digit (not a real person's): tried until the rule accepts it
const R2 = require('../lib/rules'); const fakeAadhaar = seed => { for (let i = 0; i < 10; i++) { const a = String(seed) + i; if (R2.aadhaar(a)) return a; } throw new Error('no check digit'); };

test('his own details: Aadhaar checked and shown whole only to the Admin; one Aadhaar / PAN = one employee; the record never holds the number', async () => {
  const s = ses('user', tag + 'K'), sa = ses('admin', tag + 'K');
  const a = await ACT.empSave(s, { name: 'Kyc One', category: 'driver', mobile: mob() }), b = await ACT.empSave(s, { name: 'Kyc Two', category: 'staff', mobile: mob() });
  const aad = fakeAadhaar('9' + String(Date.now()).slice(-10)), panNo = 'ABCDE' + String(Date.now()).slice(-4) + 'F';
  await no(ACT.privSave(s, { id: a.id, aadhaar: aad.slice(0, 11) + ((+aad[11] + 1) % 10), pan: 'bad', mobile2: '12', family_mobile: '13' }), /Aadhaar: 12 digits.*PAN: 10 letters.*Second mobile.*Family member's mobile/, 400);
  await ACT.privSave(s, { id: a.id, aadhaar: aad.replace(/(\d{4})(\d{4})/, '$1 $2 '), pan: panNo.toLowerCase(), mobile2: mob(), family_name: 'Kyc Parent', family_relation: 'Father', family_mobile: mob(), address_current: 'Camp, Rig Road', address_permanent: 'Village Rig' });
  let g = await ACT.privGet(s, { id: a.id });
  assert.deepStrictEqual([g.personal.aadhaar, g.personal.aadhaar_mask, g.personal.pan, g.personal.pan_mask, g.personal.family_relation, g.personal.address_current], ['', 'XXXX XXXX ' + aad.slice(-4), '', 'XXXXXX' + panNo.slice(-4), 'father', 'Camp, Rig Road'], 'an HR User sees the Aadhaar and (Phase 1) the PAN only as a mask');
  assert.deepStrictEqual([(await ACT.privGet(sa, { id: a.id })).personal.aadhaar, (await ACT.privGet(sa, { id: a.id })).personal.pan], [aad, panNo], 'the HR Admin sees them whole');
  // (Phase 1) the User leaves the PAN box masked as he sees it: the PAN is kept
  await ACT.privSave(s, { id: a.id, aadhaar: 'XXXX XXXX ' + aad.slice(-4), pan: 'XXXXXX' + panNo.slice(-4), address_current: 'Camp, Rig Road' }); assert.strictEqual((await ACT.privGet(sa, { id: a.id })).personal.pan, panNo);
  assert.deepStrictEqual(g.docsMissing, ['Photo', 'Aadhaar card', 'PAN card', 'Driving licence', 'Bank passbook / cancelled cheque'], 'a driver: the licence is expected');
  // the User changes the address and leaves the Aadhaar box as it was: the number is kept
  await ACT.privSave(s, { id: a.id, aadhaar: 'XXXX XXXX ' + aad.slice(-4), pan: panNo, address_current: 'New camp' });
  assert.strictEqual((await ACT.privGet(sa, { id: a.id })).personal.aadhaar, aad);
  await no(ACT.privSave(s, { id: b.id, aadhaar: aad }), new RegExp('This Aadhaar already belongs to employee ' + a.code), 409);
  await no(ACT.privSave(s, { id: b.id, pan: panNo }), new RegExp('This PAN already belongs to employee ' + a.code), 409);
  const au = await db('GET', 'hr_audit?select=action,detail&site=eq.' + s.site + '&action=eq.Employee%20details%20changed&order=id');
  assert.strictEqual(au.length, 3, 'three saves that changed something (the form sends every box: the family boxes left out are emptied)'); assert.deepStrictEqual(au[0].detail.aadhaar, ['…', '…' + aad.slice(-4)]); assert.ok(!JSON.stringify(au).includes(aad) && !JSON.stringify(au).includes(panNo), 'never the whole number');
  assert.ok(!JSON.stringify((await ACT.empList(s, {})).rows).includes(aad), 'not in the list');
  await no(ACT.privGet(ses('admin', tag + 'Z'), { id: a.id }), /not found on this site/, 404);
});

test('his papers: sent to the private store, opened by a short link; pay papers only by the Admin; removed = kept with who and why', async () => {
  const s = ses('user', tag + 'K'), sa = ses('admin', tag + 'K'), a = (await ACT.empList(s, { q: 'Kyc One' })).rows[0];
  await no(ACT.docUploadUrl(s, { id: a.id, kind: 'licence', type: 'application/zip', bytes: 10 }), /Only a photo .* or a PDF/); await no(ACT.docUploadUrl(s, { id: a.id, kind: 'licence', type: 'application/pdf', bytes: 11 * 1048576 }), /at most 10 MB/);
  await no(ACT.docUploadUrl(s, { id: a.id, kind: 'passport', type: 'application/pdf', bytes: 10 }), /what kind of paper/);
  const put = async (kind, extra) => { const body = Buffer.from('%PDF-1.4 rig ' + kind), u = await ACT.docUploadUrl(s, { id: a.id, kind: kind, type: 'application/pdf', bytes: body.length });
    assert.match(u.path, new RegExp('^' + a.id + '/[0-9a-f]{24}\\.pdf$')); const r = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body }); assert.ok(r.ok, 'the file is taken: ' + r.status);
    return ACT.docAdd(s, Object.assign({ id: a.id, kind: kind, path: u.path, bytes: body.length }, extra || {})); };
  const lic = await put('licence', { number: 'mh12 2020 0001234', expires_on: '31-12-2030', title: 'Heavy vehicle' }), slip = await put('salary_slip');
  await no(ACT.docAdd(s, { id: a.id, kind: 'pan', path: a.id + '/' + 'a'.repeat(24) + '.pdf', bytes: 10 }), /did not arrive/); await no(ACT.docAdd(s, { id: a.id, kind: 'pan', path: 'other/' + 'a'.repeat(24) + '.pdf', bytes: 10 }), /does not belong to this employee/);
  let l = await ACT.docList(s, { id: a.id });
  assert.deepStrictEqual(l.docs.map(d => [d.kind, d.number, d.expires_on, d.canOpen]).sort(), [['licence', 'MH12 2020 0001234', '2030-12-31', true], ['salary_slip', '', null, false]]);
  assert.ok(l.docsMissing.indexOf('Driving licence') < 0 && l.docsMissing.indexOf('PAN card') > -1);
  const link = await ACT.docLink(s, { doc: lic.id }); assert.strictEqual(await (await fetch(link.url)).text(), '%PDF-1.4 rig licence', 'the link gives the file');
  await no(ACT.docLink(s, { doc: slip.id }), /Only the HR Admin or the Super Admin opens the pay papers/, 403); assert.ok((await ACT.docLink(sa, { doc: slip.id })).url);
  await no(ACT.docLink(ses('admin', tag + 'Z'), { doc: lic.id }), /not found on this site/, 404);
  await no(ACT.docRemove(s, { doc: lic.id, reason: 'Wrong file' }), /Only the HR Admin/, 403); await no(ACT.docRemove(sa, { doc: lic.id, reason: '' }), /write why/);
  await ACT.docRemove(sa, { doc: lic.id, reason: 'Wrong file' }); await no(ACT.docLink(sa, { doc: lic.id }), /not found/, 404);
  l = await ACT.docList(sa, { id: a.id }); const gone = l.docs.find(d => d.id === lic.id);
  assert.deepStrictEqual([gone.active, gone.removed_by, gone.removed_reason, gone.canOpen], [false, 'admin@rig.test', 'Wrong file', false], 'the row stays'); assert.ok(l.docsMissing.indexOf('Driving licence') > -1);
  assert.deepStrictEqual((await db('GET', 'hr_audit?select=action&site=eq.' + s.site + '&action=like.Paper*&order=id')).map(x => x.action), ['Paper attached', 'Paper attached', 'Paper opened', 'Paper opened', 'Paper removed']);
});

/* ───────────── step 4: attendance (made-up people and places) ───────────── */
const HQ = { lat: 18.5204, lng: 73.8567 };      // a point of a map – nobody's place
const self = (email, site) => ({ site: site || SITE, email: email, name: 'Rig self', role: 'self', info: { sites: [] } });
const cid = () => require('crypto').randomBytes(12).toString('hex');
const selfie = async (s, c) => { const u = await ACT.selfieUrl(s, { client_id: c }); if (u.there) throw new Error('the photo is there already'); const r = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) }); assert.ok(r.ok, 'the photo is taken: ' + r.status); return c; };
const P = (over) => Object.assign({ kind: 'in', lat: HQ.lat, lng: HQ.lng, accuracy_m: 12, device: { id: 'rig-phone-' + tag + '-1', model: 'Rig Phone', os: 'Android 15' } }, over);
let E1, E2, mail1, mail2, placeId;

test('work places: only the HR Admin; a circle, an area, along the road; for whom; many at once; a removed place stays for its punches', async () => {
  mail1 = mail('p1'); mail2 = mail('p2');
  E1 = await ACT.empSave(user, { name: 'Punch One', category: 'staff', mobile: mob(), email: mail1, dob: '1991-01-01' });
  E2 = await ACT.empSave(user, { name: 'Punch Two', category: 'labour', mobile: mob(), email: mail2, dob: '1992-02-02' });
  await no(ACT.placeSave(user, { name: 'X' }), /Only the HR Admin/, 403); await no(ACT.placeList(self(mail1)), /HR office only/, 403);
  await no(ACT.placeSave(admin, { name: 'O', radius_m: 5 }), /Name: at least 2 letters\. Place it on the map.*Radius: 20 to 5000 metres\./, 400);
  let l = await ACT.projSave(admin, { name: 'Project ' + tag }); const proj = l.projects[0]; await no(ACT.projSave(admin, { name: 'project ' + tag.toLowerCase() }), /already in the list/, 409);
  l = await ACT.placeSave(admin, { name: 'Office ' + tag, kind: 'office', lat: HQ.lat, lng: HQ.lng, radius_m: 150, project_id: proj.id, valid_from: '2026-01-01' }); placeId = l.id;
  assert.deepStrictEqual([l.places.length, l.places[0].scope, l.places[0].radius_m, l.places[0].project_id], [1, 'all', 150, proj.id]);
  await no(ACT.placeSave(admin, { name: 'office ' + tag.toLowerCase(), lat: 1, lng: 1, radius_m: 100 }), /already there/, 409);
  await no(ACT.placeSave(admin, { name: 'Camp ' + tag, lat: 18.6, lng: 73.9, radius_m: 100, scope: 'people', people: [] }), /choose at least one employee/);
  l = await ACT.placeSave(admin, { name: 'Camp ' + tag, kind: 'camp', lat: 18.6, lng: 73.9, radius_m: 100, scope: 'people', people: [E2.id], valid_from: '2026-01-01' }); const camp = l.id;
  assert.deepStrictEqual(l.places.find(p => p.id === camp).people, [E2.id]);
  l = await ACT.placeSave(admin, { name: 'Road ' + tag, shape: 'corridor', points: [[18.70, 73.80], [18.70, 73.90]], radius_m: 60, scope: 'category', scope_values: ['labour'], valid_from: '2026-01-01' }); const road = l.id;
  l = await ACT.placeSave(admin, { name: 'Yard ' + tag, shape: 'polygon', points: [[18.80, 73.80], [18.80, 73.81], [18.81, 73.81], [18.81, 73.80]], valid_from: '2026-01-01' }); const yard = l.id;
  // many at once
  await no(ACT.placeBulk(admin, { ids: [placeId, yard], radius_m: 300 }), /cannot be set for an area drawn/);
  await no(ACT.placeBulk(admin, { ids: [placeId, camp] }), /Nothing to change/);
  l = await ACT.placeBulk(admin, { ids: [camp, road], radius_m: 250, scope: 'all' }); assert.strictEqual(l.changed, 2);
  assert.deepStrictEqual(l.places.filter(p => p.id === camp || p.id === road).map(p => [p.radius_m, p.scope, p.people.length]), [[250, 'all', 0], [250, 'all', 0]]);
  l = await ACT.placeImport(admin, { rows: [{ name: 'Gate A ' + tag, lat: 18.9, lng: 73.9, radius_m: 80 }, { name: 'Gate A ' + tag, lat: 18.9, lng: 73.9, radius_m: 80 }, { name: 'Gate C ' + tag, lat: 99, lng: 73.9, radius_m: 80 }] });
  assert.deepStrictEqual([l.saved, l.lines.map(x => x.line)], [0, [2, 3]], 'all or none');
  l = await ACT.placeImport(admin, { rows: [{ name: 'Gate A ' + tag, lat: 18.9, lng: 73.9, radius_m: 80 }, { name: 'Gate B ' + tag, lat: 18.91, lng: 73.9, radius_m: 80 }] }); assert.strictEqual(l.saved, 2);
  // (13-11-2026, "konta user konte location war … konte location sathi konte user … ek employee aso ki bulk") who marks where;
  // single people to / from a place – a place for everybody only after the Admin said yes (it becomes "Chosen people")
  let w = await ACT.placeMap(user); const p1 = w.people.find(e => e.id === E1.id);
  assert.ok(p1.places.indexOf(placeId) > -1 && p1.last === null); assert.strictEqual(w.places.find(p => p.id === placeId).count, w.people.length);
  await no(ACT.placeMap(self(mail1)), /HR office only/, 403);
  await no(ACT.placePeople(user, { place_id: camp, add: [E1.id] }), /Only the HR Admin/, 403); await no(ACT.placePeople(admin, { place_id: camp }), /at least one employee/);
  await no(ACT.placePeople(admin, { place_id: camp, remove: [E1.id] }), /is for everybody of the site \(\d+ people now\) – it holds no single people/, 409);
  assert.strictEqual((await ACT.placeMap(user)).places.find(p => p.id === camp).scope, 'all', 'nothing changed by the refusal');
  w = await ACT.placePeople(admin, { place_id: camp, remove: [E1.id], convert: true });
  assert.ok(w.people.find(e => e.id === E1.id).places.indexOf(camp) < 0 && w.people.find(e => e.id === E2.id).places.indexOf(camp) > -1); assert.strictEqual(w.places.find(p => p.id === camp).scope, 'people');
  w = await ACT.placePeople(admin, { place_id: camp, add: [E1.id] }); assert.ok(w.people.find(e => e.id === E1.id).places.indexOf(camp) > -1); assert.strictEqual(w.people_now, w.places.find(p => p.id === camp).count);
  await no(ACT.placePeople(ses('admin', SITE2), { place_id: camp, add: [E1.id] }), /not found on this site/, 404);
  // (13-11-2026, "employee ch location change krta yeil … multiple location access") one person's places set to exactly the chosen
  await no(ACT.placePerson(user, { employee_id: E1.id, places: [camp] }), /Only the HR Admin/, 403);
  await no(ACT.placePerson(admin, { employee_id: E1.id, places: [camp] }), /is for everybody of the site \(\d+ people now\).* – such a place holds no single people/, 409);
  w = await ACT.placePerson(admin, { employee_id: E1.id, places: [camp, placeId], convert: true }); const mine = () => w.people.find(e => e.id === E1.id).places.slice().sort();
  assert.deepStrictEqual(mine(), [camp, placeId].sort(), 'two places for him; the other places for everybody were taken from him only');
  assert.ok(w.people.find(e => e.id === E2.id).places.indexOf(road) > -1, 'the others keep what they had'); assert.strictEqual(w.places.find(p => p.id === placeId).scope, 'all', 'a place that did not change for him is left alone');
  w = await ACT.placePerson(admin, { employee_id: E1.id, places: [placeId] }); assert.deepStrictEqual(mine(), [placeId]);
  w = await ACT.placePerson(admin, { employee_id: E1.id, places: [placeId, camp] }); assert.deepStrictEqual(mine(), [camp, placeId].sort()); assert.strictEqual(w.changed, 1);
  await no(ACT.placePerson(admin, { employee_id: E1.id, places: ['00000000-0000-4000-8000-000000000000'] }), /not found on this site/, 404);
  await no(ACT.placeRemove(admin, { id: yard, reason: '' }), /write why/); l = await ACT.placeRemove(admin, { id: yard, reason: 'Work over' });
  assert.ok(!l.places.some(p => p.id === yard)); assert.strictEqual((await db('GET', 'hr_places?select=removed_by,active&id=eq.' + yard))[0].removed_by, 'admin@rig.test', 'the row stays');
  await no(ACT.placeSave(ses('admin', SITE2), { id: placeId, name: 'Stolen', lat: 1, lng: 1, radius_m: 100 }), /not found on this site/, 404);
});

test('a punch: himself only, inside only, with a photo, IN then OUT, sent twice kept once; Developer Options / made-up location refused', async () => {
  const s1 = self(mail1);
  await no(ACT.myAttend(self(mail('nobody'))), /not in the Employee Master/, 403);
  let a = await ACT.myAttend(s1, { device_id: P().device.id });
  assert.deepStrictEqual([a.employee.code, a.may, a.phone, a.next, a.punches.length, a.day], [E1.code, true, 'none', 'in', 0, require('../lib/rules').today()]); assert.ok(a.places.some(p => p.id === placeId) && !a.places.some(p => /Yard/.test(p.name)));
  const c1 = cid();
  await no(ACT.punch(s1, P({ client_id: 'short' })), /Bad punch/);
  await no(ACT.punch(s1, P({ client_id: c1, dev_options: true })), /Developer Options are ON/, 403);
  await no(ACT.punch(s1, P({ client_id: c1, mock: true })), /made-up location/, 403);
  await no(ACT.punch(s1, P({ client_id: c1, accuracy_m: 400 })), /not exact enough yet \(400 m\)/);
  await no(ACT.punch(s1, P({ client_id: c1, lat: undefined })), /location was not received/);
  await no(ACT.punch(s1, P({ client_id: c1, lat: HQ.lat + 0.01 })), /outside your work place/, 403);
  await no(ACT.punch(s1, P({ client_id: c1 })), /photo of this punch did not arrive/);
  assert.strictEqual((await db('GET', 'hr_punches?select=id&employee_id=eq.' + E1.id)).length, 0, 'nothing was saved by a refused punch'); assert.strictEqual((await db('GET', 'hr_devices?select=id&employee_id=eq.' + E1.id)).length, 0, 'and no phone tied');
  await selfie(s1, c1); await no(selfie(s1, c1), /there already/);      // a photo is never replaced
  let r = await ACT.punch(s1, P({ client_id: c1, kind: 'out' })).catch(e => e); assert.match(r.message, /Mark IN first/);
  r = await ACT.punch(s1, P({ client_id: c1 })); assert.deepStrictEqual([r.again, r.punch.kind, r.punch.status, r.next, r.place], [false, 'in', 'ok', 'out', 'Office ' + tag]);
  const again = await ACT.punch(s1, P({ client_id: c1 })); assert.deepStrictEqual([again.again, again.punch.id, again.punches.length], [true, r.punch.id, 1], 'sent twice, kept once');
  await no(ACT.punch(self(mail2), P({ client_id: c1, device: { id: 'rig-phone-' + tag + '-2' } })), /Bad punch number/, 409);
  await no(ACT.punch(s1, P({ client_id: await selfie(s1, cid()) })), /already IN since \d\d:\d\d/, 409);
  r = await ACT.punch(s1, P({ client_id: await selfie(s1, cid()), kind: 'out' })); assert.deepStrictEqual([r.punch.kind, r.next, r.punches.length], ['out', 'in', 2]);
  a = await ACT.myAttend(s1, { device_id: P().device.id }); assert.deepStrictEqual([a.phone, a.punches.map(p => p.kind)], ['this', ['in', 'out']]);
  const mo = await ACT.myMonth(s1, {}); assert.deepStrictEqual([mo.days.length, mo.days[0].punches, /^\d\d:\d\d$/.test(mo.days[0].in), /^\d\d:\d\d$/.test(mo.days[0].out)], [1, 2, true, true]);
  // (13-11-2026) the day's work place – where its first IN was marked – and the site's rules in words (none set yet: no line)
  assert.strictEqual(mo.days[0].place, 'Office ' + tag); assert.ok(Array.isArray(mo.rules));
  // the database itself: a punch is never changed or deleted
  await no(db('PATCH', 'hr_punches?id=eq.' + r.punch.id, { kind: 'in' }), /database|refused/i); await no(db('DELETE', 'hr_punches?id=eq.' + r.punch.id), /database|refused/i);
});

test('(19-11-2026, asked: "all over asse kahi lok aahet ki kuthun pn login kru shaktat ass ek option banaw ani ha web warun access dila jail app updet chi garaj lagu naye") ANYWHERE: given by the HR Admin with the reason, up to a date or no end; the app of today gets one more place – the whole earth; a punch from any place is kept with no place and the mark; taken back – the geofence again; never for himself; nothing else of a punch changes', async () => {
  const S6 = tag + 'W', a6 = ses('admin', S6), u6 = ses('user', S6), m6 = mail('anyw'), today = require('../lib/rules').today();
  const E = await ACT.empSave(a6, { name: 'Any Where', category: 'staff', mobile: mob(), email: m6, dob: '1990-05-05' }), s6 = self(m6, S6);
  const FAR = { lat: 21.1458, lng: 79.0882 }, dev = { id: 'rig-phone-' + tag + '-anyw', model: 'Rig Phone', os: 'Android 15' }, PP = o => Object.assign({ kind: 'in', lat: FAR.lat, lng: FAR.lng, accuracy_m: 15, device: dev }, o);
  await no(ACT.punch(s6, PP({ client_id: await selfie(s6, cid()) })), /No work place is set for you yet/, 403);
  // given: only the HR Admin (power "Work places") / Super Admin, with the reason; a date not before today
  await no(ACT.placeAnywhere(u6, { employee_id: E.id, on: true, reason: 'Travels' }), /Only the HR Admin/, 403);
  await no(ACT.placeAnywhere(a6, { employee_id: E.id, on: true, reason: '' }), /Reason: write why/, 400);
  await no(ACT.placeAnywhere(a6, { employee_id: E.id, on: true, until: '2020-01-01', reason: 'Travels' }), /Up to: a day from today on/, 400);
  await no(ACT.placeAnywhere(ses('admin', SITE2), { employee_id: E.id, on: true, reason: 'Travels' }), /not employees of this site/, 400);
  let w = await ACT.placeAnywhere(a6, { employee_id: E.id, on: true, reason: 'HO staff – travels to the sites' });
  assert.deepStrictEqual([w.changed, w.people.find(e => e.id === E.id).anywhere], [1, { until: '', reason: 'HO staff – travels to the sites' }]);
  // the phone app of today: one more place – the whole earth (inside wherever he is); "My work locations" says it
  const at = await ACT.myAttend(s6, { device_id: dev.id }), any = at.places.find(p => p.id === 'anywhere');
  assert.deepStrictEqual([at.anywhere, any.name, any.shape, any.radius_m, any.can_in, any.can_out], [true, 'Anywhere', 'circle', 21000000, true, true]);
  assert.strictEqual((await ACT.myPlaces(s6)).places.find(p => p.id === 'anywhere').counts, true);
  assert.deepStrictEqual((await ACT.placeAccess(a6, { employee_id: E.id })).anywhere, { until: '', reason: 'HO staff – travels to the sites' });
  // a punch from far away: kept – no place, the mark "anywhere", his GPS as it was; the rest of a punch as always
  await no(ACT.punch(s6, PP({ client_id: cid(), dev_options: true })), /Developer Options are ON/, 403);
  await no(ACT.punch(s6, PP({ client_id: cid(), accuracy_m: 400 })), /not exact enough yet/);
  let r = await ACT.punch(s6, PP({ client_id: await selfie(s6, cid()) })); assert.strictEqual(r.punch.kind, 'in');
  const row = ((await db('GET', 'hr_punches?select=place_id,inside,lat,lng,flags,status&employee_id=eq.' + E.id + '&order=at.desc&limit=1')) || [])[0];
  assert.deepStrictEqual([row.place_id, row.inside, +row.lat, +row.lng, row.flags.anywhere, row.status], [null, false, FAR.lat, FAR.lng, true, 'ok']);
  assert.strictEqual((await ACT.punchDay(a6, { day: today })).punches.find(p => p.code === E.code).place, 'Anywhere', 'the Attendance page names it');
  // taken back: the geofence again; the audit holds both with the reason
  w = await ACT.placeAnywhere(a6, { employee_id: E.id, on: false, reason: 'Back at the site' }); assert.strictEqual(w.people.find(e => e.id === E.id).anywhere, null);
  assert.ok(!(await ACT.myAttend(s6, { device_id: dev.id })).places.some(p => p.id === 'anywhere'));
  await no(ACT.punch(s6, PP({ client_id: await selfie(s6, cid()), kind: 'out' })), /No work place is set for you yet/, 403);
  // up to a date: counts that day, not after it
  const AW = require('../lib/anywhere'); w = await ACT.placeAnywhere(a6, { employee_id: E.id, on: true, until: today, reason: 'One day at HO' });
  assert.ok(await AW.on(S6, E.id, today) && !(await AW.on(S6, E.id, require('../lib/day').addDays(today, 1))));
  const au = (await db('GET', 'hr_audit?select=action,detail&site=eq.' + S6 + '&action=like.Attendance from anywhere*&order=id')) || [];
  assert.deepStrictEqual(au.map(x => [x.action, x.detail.reason]), [['Attendance from anywhere: given', 'HO staff – travels to the sites'], ['Attendance from anywhere: taken back', 'Back at the site'], ['Attendance from anywhere: given', 'One day at HO']]);
  // never for himself (an HR Admin who is an employee of the site); the Super Admin may
  const A7 = await ACT.empSave(a6, { name: 'Admin Himself', category: 'staff', mobile: mob(), email: 'admin@rig.test', dob: '1985-01-01' }).catch(() => null);
  if (A7) await no(ACT.placeAnywhere(a6, { employee_id: A7.id, on: true, reason: 'Myself' }), /This is about you/, 403);
  assert.strictEqual((await ACT.placeAnywhere(ses('super', S6), { employee_id: E.id, on: false, reason: 'Done' })).changed, 1);
});
test('one phone a person: another phone and another person\'s phone are refused and noted; the HR Admin releases it', async () => {
  const s1 = self(mail1), s2 = self(mail2), other = { id: 'rig-phone-' + tag + '-9', model: 'Other Phone' };
  await no(ACT.punch(s1, P({ client_id: await selfie(s1, cid()), device: other })), /tied to another phone/, 403);
  await no(ACT.punch(s2, P({ client_id: await selfie(s2, cid()) })), /already tied to another employee/, 403);      // E2 on E1's phone
  let d = await ACT.devList(user); const mine = d.devices.find(x => x.code === E1.code);
  assert.deepStrictEqual([mine.active, mine.model, mine.device_id, mine.mark.length], [true, 'Rig Phone', undefined, 6]); assert.deepStrictEqual(d.tries.map(t => t.why).sort(), ['another phone', 'phone of another person']);
  await no(ACT.devRelease(user, { id: mine.id, reason: 'New phone' }), /Only the HR Admin/, 403); await no(ACT.devRelease(admin, { id: mine.id, reason: '' }), /write why/);
  await no(ACT.devRelease(ses('admin', SITE2), { id: mine.id, reason: 'New phone' }), /not found on this site/, 404);
  d = await ACT.devRelease(admin, { id: mine.id, reason: 'New phone' }); assert.deepStrictEqual([d.devices.find(x => x.id === mine.id).active, d.devices.find(x => x.id === mine.id).released_by], [false, 'admin@rig.test']);
  await no(ACT.devRelease(admin, { id: mine.id, reason: 'Again' }), /already released/);
  const r = await ACT.punch(s1, P({ client_id: await selfie(s1, cid()), device: other })); assert.strictEqual(r.punch.kind, 'in');
  assert.strictEqual((await ACT.myAttend(s1, { device_id: other.id })).phone, 'this');
});

test('no network: the punch counts for its own moment when the phone\'s clock is in order; anything doubtful waits for the HR Admin', async () => {
  const s2 = self(mail2), dev = { id: 'rig-phone-' + tag + '-2', model: 'Second Phone' }, now = Date.now(), back = 20 * 60000;
  const off = (over) => P(Object.assign({ device: dev, offline: true, anchor_server: now - 3600000, anchor_elapsed: 5000000, elapsed: 5000000 + 3600000 - back, at_device: new Date(now - back + 3000).toISOString() }, over));
  let r = await ACT.punch(s2, off({ client_id: await selfie(s2, cid()) })); assert.deepStrictEqual([r.punch.status, r.punch.offline], ['ok', true]); assert.ok(Math.abs(Date.parse(r.punch.at) - (now - back)) < 2000, 'its own moment, not the moment it arrived');
  await no(ACT.punch(s2, off({ client_id: await selfie(s2, cid()), kind: 'out', lat: HQ.lat + 0.02 })), /outside your work place/, 403);      // outside: never, offline too
  r = await ACT.punch(s2, off({ client_id: await selfie(s2, cid()), kind: 'out', elapsed: 1000, at_device: new Date(now - 60000).toISOString() }));      // the phone was restarted in between
  assert.strictEqual(r.punch.status, 'review');
  await no(ACT.punchDay(self(mail2), {}), /HR office only/, 403);
  let d = await ACT.punchDay(user, { review: 1 }); const w = d.punches.find(p => p.id === r.punch.id); assert.ok(w && w.code === E2.code && /restarted/.test(w.why.join()));
  const day = await ACT.punchDay(user, {}); assert.ok(day.punches.length >= 5 && day.punches.every(p => p.place === 'Office ' + tag));
  assert.match((await ACT.punchSelfie(user, { id: w.id })).url, /\/storage\/v1\/object\/sign\/hr-selfies\//); await no(ACT.punchSelfie(ses('user', SITE2), { id: w.id }), /not found on this site/, 404);
  await no(ACT.punchReview(user, { id: w.id, decision: 'accepted' }), /Only the HR Admin/, 403); await no(ACT.punchReview(admin, { id: w.id, decision: 'refused' }), /write why it is refused/);
  await no(ACT.punchReview(admin, { id: day.punches.find(p => p.status === 'ok').id, decision: 'accepted' }), /needs no decision/);
  d = await ACT.punchReview(admin, { id: w.id, decision: 'accepted', note: 'Phone was restarted, seen at site' }); assert.ok(!d.punches.some(p => p.id === w.id));
  await no(ACT.punchReview(admin, { id: w.id, decision: 'refused', note: 'again' }), /already decided/, 409);
  assert.deepStrictEqual((await db('GET', 'hr_punches?select=status&id=eq.' + w.id))[0], { status: 'review' }, 'the punch itself stays as it came');
});

/* ───────────── step 5: shifts, holidays, rules, the muster, a day set by hand, requests ───────────── */
const D = require('../lib/day'), RU = require('../lib/rules');
const TODAY = RU.today(), ago = n => D.addDays(TODAY, -n), OFF = (D.weekday(TODAY) + 1) % 7;      // the weekly off: tomorrow's weekday – none of the last five days

test('shifts, holidays and the rules with their date: only who has the power; a new version, the old days keep theirs', async () => {
  let a = await ACT.attSetup(user); assert.deepStrictEqual([a.shifts.length, a.rules, Object.keys(a.powers).filter(k => a.powers[k] !== true), a.power_list.length], [0, {}, ['signin'], 10]);      // (13-11-2026) "a sign-in for everybody at once" is off until the Super Admin gives it
  await no(ACT.attSetup(self(mail1)), /HR office only/, 403); await no(ACT.shiftSave(user, { name: 'G' }), /Only the HR Admin/, 403);
  await no(ACT.shiftSave(admin, { name: 'G', start_time: '9', end_time: '9:00' }), /Name: at least 2 letters\. Starts at: a time as HH:MM\./);
  a = await ACT.shiftSave(admin, { name: 'General ' + tag, start_time: '9:00', end_time: '18:00', valid_from: '2026-01-01' }); const sh = a.shifts[0];
  assert.deepStrictEqual([sh.start_time, sh.end_time, sh.break_min, sh.scope], ['09:00', '18:00', 0, 'all']);
  await no(ACT.shiftSave(admin, { name: 'general ' + tag.toLowerCase(), start_time: '10:00', end_time: '19:00' }), /already there/, 409);
  a = await ACT.shiftSave(admin, { name: 'Night ' + tag, start_time: '20:00', end_time: '06:00', scope: 'people', people: [E2.id], valid_from: ago(-5) }); const night = a.shifts.find(x => /^Night/.test(x.name)); assert.deepStrictEqual(night.people, [E2.id]);
  await no(ACT.shiftRemove(admin, { id: night.id, reason: '' }), /write why/); a = await ACT.shiftRemove(admin, { id: night.id, reason: 'Not used' }); assert.strictEqual(a.shifts.length, 1);
  await no(ACT.holidaySave(admin, { day: '32-01-2026', name: 'X' }), /Day: a date.*Name: at least 2 letters/);
  a = await ACT.holidaySave(admin, { day: ago(40), name: 'Festival ' + tag }); assert.strictEqual(a.holidays.length, 1);
  a = await ACT.holidaySave(admin, { rows: [{ day: ago(41), name: 'One' }, { day: ago(40), name: 'Twice' }] }); assert.deepStrictEqual([a.saved, a.lines.map(l => l.line)], [0, [2]], 'all or none');
  a = await ACT.holidaySave(admin, { rows: [{ day: ago(41), name: 'One' }, { day: ago(42), name: 'Two' }] }); assert.deepStrictEqual([a.saved, a.holidays.length], [2, 3]);
  a = await ACT.holidayRemove(admin, { id: a.holidays.find(h => h.name === 'Two').id }); assert.strictEqual(a.holidays.length, 2);
  await no(ACT.rulesSave(admin, { full_hours: 4, half_hours: 6 }), /less than/);
  await no(ACT.rulesSave(admin, { valid_from: '2026-01-01', full_hours: 8 }), /only by the Super Admin/, 403);
  a = await ACT.rulesSave(sup, { valid_from: '2026-01-01', full_hours: 8, half_hours: 4, grace_min: 10, week_off: [OFF] });
  assert.deepStrictEqual([a.rules, a.rules_from, a.versions.length], [{ full_hours: 8, half_hours: 4, grace_min: 10, week_off: [OFF] }, '2026-01-01', 1]);
  assert.strictEqual((await db('GET', 'hr_audit?select=detail&site=eq.' + SITE + '&action=eq.Attendance rules set&order=id.desc&limit=1'))[0].detail.new.full_hours, 8);
});

test('(18-11-2026, his answer: "sagle Rule Book madhe") the Rule Book\'s "Face & requests": only the face, how much must match and who decides a request change – every other rule stays as it is on that date; the Rule Book shows the rules of before', async () => {
  const S = tag + 'FR', SU = ses('super', S), A = ses('admin', S);
  await ACT.rulesSave(SU, { valid_from: '2026-01-01', full_hours: 9, half_hours: 4.5, grace_min: 10, late_free: 3, once: 'yes', week_off: [0], reg_levels: 2 });
  let a = await ACT.rulesSave(A, { part: 'face', face: 'yes', face_min: 85 });
  assert.deepStrictEqual(a.rules, { full_hours: 9, half_hours: 4.5, grace_min: 10, late_free: 3, once: true, week_off: [0], reg_levels: 2, face: true, face_min: 85 }, 'the face is added; the rest as it was; who decides: not sent, kept');
  a = await ACT.rulesSave(A, { part: 'face', face: '', face_min: '', reg_levels: '1' });
  assert.deepStrictEqual(a.rules, { full_hours: 9, half_hours: 4.5, grace_min: 10, late_free: 3, once: true, week_off: [0], reg_levels: 1 }, 'the face taken off; the rest as it was');
  await no(ACT.rulesSave(ses('user', S), { part: 'face', face: 'yes' }), /./, 403);
  const rb = await ACT.rbList(A); assert.deepStrictEqual([rb.old.full_hours, rb.old.grace_min, rb.old.week_off], [9, 10, [0]], 'the Rule Book shows the rules of before');
});

test('the muster: today\'s punches; a day entered by hand, corrected, set aside – each a new row with the old and the new; the Admin\'s powers', async () => {
  const month = TODAY.slice(0, 7), y = ago(1), back = y.slice(0, 7) === month;
  let m = await ACT.muster(user, { month }); const r1 = m.rows.find(r => r.id === E1.id), r2 = m.rows.find(r => r.id === E2.id), i = m.days.indexOf(TODAY);
  assert.ok(r1 && r2 && i > -1); assert.strictEqual(r1.codes[i], 'IN', 'IN – OUT – IN again: at work'); assert.strictEqual(r2.codes[i], 'IN', 'his accepted OUT was before his IN: at work');
  assert.ok(m.rows.length >= 2 && m.rows.every(r => r.codes.length === m.days.length)); assert.deepStrictEqual(m.week_off, [OFF]);
  await no(ACT.muster(self(mail1), { month }), /HR office only/, 403);
  // by hand: a day with no punch
  await no(ACT.daySet(user, { id: E2.id, day: y, in_time: '09:00', out_time: '18:00', reason: 'No phone' }), /Only the HR Admin/, 403);
  await no(ACT.daySet(admin, { id: E2.id, day: ago(-1), in_time: '09:00', reason: 'xxx' }), /still to come/); await no(ACT.daySet(admin, { id: E2.id, day: y, in_time: '18:00', out_time: '09:00', reason: 'xxx' }), /OUT must be after IN/);
  await no(ACT.daySet(admin, { id: E2.id, day: y, in_time: '09:00', out_time: '18:00', reason: '' }), /Reason: write why/); await no(ACT.daySet(admin, { id: E2.id, day: y, none: true, reason: 'xxx' }), /no attendance to set aside/);
  await no(ACT.daySet(admin, { id: E2.id, day: ago(90), in_time: '09:00', out_time: '18:00', reason: 'Old one' }), /only by the Super Admin/, 403);
  await no(ACT.daySet(ses('admin', SITE2), { id: E2.id, day: y, in_time: '09:00', out_time: '18:00', reason: 'xxx' }), /not found on this site/, 404);
  let d = await ACT.daySet(admin, { id: E2.id, day: y, in_time: '9:00', out_time: '18:00', reason: 'No phone – seen at site' });
  assert.deepStrictEqual([d.day.code, d.day.in, d.day.out, d.day.hours, d.day.src, d.entries.length, d.entries[0].source, d.entries[0].old_in], ['P', '09:00', '18:00', 9, 'manual', 1, 'manual', '']);
  // corrected: the old times stay in the new row
  d = await ACT.daySet(admin, { id: E2.id, day: y, in_time: '09:00', out_time: '13:00', reason: 'He left at one' });
  assert.deepStrictEqual([d.day.code, d.day.hours, d.day.src, d.entries.length, d.entries[0].source, d.entries[0].old_out, d.entries[0].by], ['HD', 4, 'correction', 2, 'correction', '18:00', 'admin@rig.test']);
  d = await ACT.daySet(admin, { id: E2.id, day: y, none: true, reason: 'Entered for the wrong man' }); assert.deepStrictEqual([d.day.code, d.day.in, d.entries.length], ['A', '', 3]);
  if (back) { m = await ACT.muster(user, { month }); const w = m.rows.find(r => r.id === E2.id); assert.deepStrictEqual([w.codes[m.days.indexOf(y)], w.fix[m.days.indexOf(y)]], ['A', 1]); }
  // a night: OUT the next morning
  d = await ACT.daySet(admin, { id: E2.id, day: ago(2), in_time: '20:00', out_time: '05:30', out_next_day: true, reason: 'Night work' }); assert.deepStrictEqual([d.day.hours, d.day.next_day, d.day.late_min > 0], [9.5, true, true]);
  // the database: an entry is never changed
  await no(db('PATCH', 'hr_day_entries?employee_id=eq.' + E2.id, { reason: 'changed' }), /database|refused/i);
  // the Super Admin takes a power from the HR Admin, and gives it back
  await no(ACT.powerSet(admin, { power: 'manual', allowed: false }), /Only the Super Admin/, 403); await no(ACT.powerSet(sup, { power: 'fly', allowed: true }), /Unknown power/);
  let p = await ACT.powerSet(sup, { power: 'manual', allowed: false }); assert.strictEqual(p.powers.manual, false);
  await no(ACT.daySet(admin, { id: E1.id, day: ago(3), in_time: '09:00', out_time: '18:00', reason: 'By hand' }), /has not given the HR Admin this power.*Manual entry/, 403);
  d = await ACT.daySet(admin, { id: E2.id, day: ago(2), in_time: '20:00', out_time: '06:00', out_next_day: true, reason: 'Still his to correct' }); assert.strictEqual(d.day.hours, 10, 'a correction is another power');
  d = await ACT.daySet(sup, { id: E1.id, day: ago(3), in_time: '09:00', out_time: '18:00', reason: 'By hand' }); assert.strictEqual(d.day.src, 'manual');
  p = await ACT.powerSet(sup, { power: 'manual', allowed: true }); assert.strictEqual(p.powers.manual, true);
  p = await ACT.powerSet(sup, { power: 'places', allowed: false }); await no(ACT.projSave(admin, { name: 'No power ' + tag }), /has not given the HR Admin this power/, 403); await ACT.powerSet(sup, { power: 'places', allowed: true });
});

test('a request to set an old day right: himself, a day gone, one waiting a day; the HR office decides – or first the reporting person', async () => {
  const s1 = self(mail1), s2 = self(mail2), day = ago(2);
  await no(ACT.regAsk(s1, { day: TODAY, in_time: '09:00', reason: 'Forgot it' }), /a day already gone/); await no(ACT.regAsk(s1, { day: ago(61), in_time: '09:00', out_time: '18:00', reason: 'Forgot it' }), /only 60 days back/);
  await no(ACT.regAsk(s1, { day, in_time: '09:20', out_time: '18:05', reason: 'x' }), /what happened/); await no(ACT.regAsk(s1, { day, out_time: '18:05', reason: 'Forgot OUT' }), /no IN: give the IN time too/);
  let r = await ACT.regAsk(s1, { day, in_time: '09:20', out_time: '18:05', reason: 'Phone was dead' }); assert.deepStrictEqual([r.rows[0].status, r.rows[0].level, r.rows[0].in_time, r.rows[0].out_time], ['pending', 2, '09:20', '18:05']);
  await no(ACT.regAsk(s1, { day, in_time: '09:00', out_time: '18:00', reason: 'Once more' }), /already waiting/, 409);
  let l = await ACT.regList(user, {}); const q = l.rows.find(x => x.code === E1.code); assert.ok(q && l.can === false);
  await no(ACT.regDecide(user, { id: q.id, decision: 'approved' }), /Only the HR Admin/, 403); await no(ACT.regDecide(admin, { id: q.id, decision: 'refused' }), /write why it is refused/);
  await no(ACT.regDecide(ses('admin', SITE2), { id: q.id, decision: 'approved' }), /not found on this site/, 404);
  l = await ACT.regDecide(admin, { id: q.id, decision: 'approved', note: 'Seen by the supervisor' }); assert.ok(!l.rows.some(x => x.id === q.id)); await no(ACT.regDecide(admin, { id: q.id, decision: 'approved' }), /already decided/, 409);
  const d = await ACT.dayGet(user, { id: E1.id, day }); assert.deepStrictEqual([d.day.code, d.day.in, d.day.out, d.day.late_min, d.day.src, d.entries[0].source, d.requests[0].status, d.requests[0].steps[0].by], ['P', '09:20', '18:05', 20, 'regularized', 'regularized', 'approved', 'admin@rig.test']);
  const mo = await ACT.myMonth(s1, { month: day.slice(0, 7) }), md = mo.all.find(x => x.day === day); assert.deepStrictEqual([md.code, md.late_min, mo.total.late >= 1, mo.all.length >= 28], ['P', 20, true, true]);
  // two levels: the reporting person first
  await ACT.rulesSave(sup, { valid_from: TODAY, full_hours: 8, half_hours: 4, grace_min: 10, week_off: [OFF], reg_levels: 2 });
  const e2 = (await ACT.empGet(user, { id: E2.id })).employee; await ACT.empSave(user, { id: E2.id, name: e2.name, category: e2.category, mobile: e2.mobile, email: e2.email, dob: e2.dob, reports_to: E1.id });
  r = await ACT.regAsk(s2, { day: ago(4), in_time: '08:55', out_time: '17:10', reason: 'No network all day' }); assert.strictEqual(r.rows[0].level, 1);
  const w = r.rows[0]; await no(ACT.regDecide(admin, { id: w.id, decision: 'approved' }), /still waits for the reporting person/, 403);
  let t = await ACT.teamRegs(s1); assert.deepStrictEqual([t.team, t.rows.map(x => x.id)], [1, [w.id]]); assert.deepStrictEqual((await ACT.teamRegs(s2)).rows, []);
  await no(ACT.teamRegDecide(s2, { id: w.id, decision: 'approved' }), /does not report to you/, 403);
  t = await ACT.teamRegDecide(s1, { id: w.id, decision: 'approved', note: 'He was on site' }); assert.deepStrictEqual(t.rows, []); await no(ACT.teamRegDecide(s1, { id: w.id, decision: 'approved' }), /does not wait for you any more/, 409);
  assert.deepStrictEqual([(await ACT.dayGet(user, { id: E2.id, day: ago(4) })).day.in, (await ACT.dayGet(user, { id: E2.id, day: ago(4) })).day.src], ['', ''], 'not counted until the HR office approved too');
  assert.strictEqual((await ACT.dayGet(user, { id: E2.id, day: ago(20) })).day.code, '', 'before the site\'s first recorded day nobody is absent');
  l = await ACT.regDecide(admin, { id: w.id, decision: 'approved' }); const dd = await ACT.dayGet(user, { id: E2.id, day: ago(4) });
  assert.deepStrictEqual([dd.day.code, dd.day.hours, dd.requests[0].steps.map(x => x.level + ':' + x.decision)], ['P', 8.25, ['1:approved', '2:approved']]);
  // refused by the reporting person: it ends there
  r = await ACT.regAsk(s2, { day: ago(5), in_time: '09:00', out_time: '18:00', reason: 'Forgot the phone' }); await no(ACT.teamRegDecide(s1, { id: r.rows[0].id, decision: 'refused' }), /write why/);
  await ACT.teamRegDecide(s1, { id: r.rows[0].id, decision: 'refused', note: 'He was not there' }); assert.strictEqual((await ACT.myRegs(s2)).rows[0].status, 'refused'); assert.strictEqual((await ACT.dayGet(user, { id: E2.id, day: ago(5) })).day.src, '');
});

/* ───────────── the employee's site in his form; everything of attendance on his page ───────────── */
test('an employee\'s site: a new one is put on a site of the sign-in; another site for an employee of today = a transfer from today (HR Admin)', async () => {
  await no(ACT.empSave(user, { name: 'Site Pick', category: 'staff', mobile: mob(), email: mail('sp'), dob: '1990-03-03', site: 'NOWHERE' }), /choose a site where you have HR/, 403);
  const n = await ACT.empSave(user, { name: 'Site Pick', category: 'staff', mobile: mob(), email: mail('sp'), dob: '1990-03-03', site: SITE2.toLowerCase() }); assert.strictEqual(n.site, SITE2);
  await no(ACT.empGet(user, { id: n.id }), /not found on this site/, 404); const there = await ACT.empGet(ses('user', SITE2), { id: n.id });
  assert.deepStrictEqual([there.employee.site, there.history.length, there.history[0].site, there.history[0].note], [SITE2, 1, SITE2, 'Joined']);
  // an employee of today: the HR User cannot move him; the HR Admin does – from today, the history keeps the old site
  const e = there.employee, same = { id: e.id, name: e.name, category: e.category, mobile: e.mobile, email: e.email, dob: e.dob };
  await no(ACT.empSave(ses('user', SITE2), Object.assign({ site: SITE }, same)), /Only the HR Admin/, 403);
  const kept = await ACT.empSave(ses('user', SITE2), same); assert.strictEqual(kept.site, SITE2, 'no site sent: he stays');
  const mv = await ACT.empSave(ses('admin', SITE2), Object.assign({ site: SITE }, same)); assert.strictEqual(mv.site, SITE);
  const here = await ACT.empGet(user, { id: e.id }); assert.deepStrictEqual([here.employee.site, here.history.map(h => h.site + ':' + h.note + ':' + (h.valid_to ? 'closed' : 'open'))], [SITE, [SITE + ':Transfer:open', SITE2 + ':Joined:closed']]);
});

test('the employee\'s page: his work places, shift, phone, today, this month, what waits', async () => {
  const a = await ACT.empAround(user, { id: E1.id });
  assert.ok(a.places.some(p => p.name === 'Office ' + tag) && !a.places.some(p => /^Yard/.test(p.name))); assert.strictEqual(a.shift, 'General ' + tag);
  assert.deepStrictEqual([a.phone.model, a.today.code, a.month, a.total.P >= 1, a.total.late >= 1, a.requests_waiting], ['Other Phone', 'IN', TODAY.slice(0, 7), true, true, 0]);
  await no(ACT.empAround(self(mail1), { id: E1.id }), /HR office only/, 403); await no(ACT.empAround(ses('user', SITE2), { id: E1.id }), /not found on this site/, 404);
});

// (asked 12-11-2026: "RCL001 RCL002" and "EMPLOYEE CODE CHANGE EDIT KRTA YAWET … FIX NASAWET")
test('the employee code: made by itself as RCL…, or typed; changed by the HR office; never the code of another; a typed code is passed over by the counter', async () => {
  const typed = 'RC-' + tag;
  const a = await ACT.empSave(user, { name: 'Code One', category: 'staff', code: ' ' + typed.toLowerCase() + ' ' }); assert.strictEqual(a.code, typed, 'typed at once – kept in capitals');
  const b = await ACT.empSave(user, { name: 'Code Two', category: 'staff' }); assert.match(b.code, /^RCL\d{3,}$/, 'not typed: made by itself');
  await no(ACT.empSave(user, { name: 'Code Three', category: 'staff', code: typed }), /already belongs to another employee/, 409);
  await no(ACT.empSave(user, { name: 'Code Three', category: 'staff', code: 'a b?c' }), /Employee code: 2 to 20/, 400);
  // changed: the same employee, his new code; his punches / papers hang on him, not on the code
  const neu = 'RN-' + tag, c = await ACT.empSave(user, { id: b.id, name: 'Code Two', category: 'staff', code: neu }); assert.deepStrictEqual([c.id, c.code], [b.id, neu]);
  const g = await ACT.empGet(admin, { id: b.id }); assert.strictEqual((g.employee || g.emp || g).code, neu);
  const au = await db('GET', 'hr_audit?select=action,detail&site=eq.' + SITE + '&action=eq.Employee%20changed&order=id.desc&limit=1'); assert.deepStrictEqual(au[0].detail.code, [b.code, neu], 'written down: the old and the new');
  await no(ACT.empSave(user, { id: b.id, name: 'Code Two', category: 'staff', code: typed }), /already belongs to another employee/, 409);
  const same = await ACT.empSave(user, { id: b.id, name: 'Code Two B', category: 'staff', code: neu }); assert.strictEqual(same.code, neu, 'the same code again: nothing to refuse');
  const kept = await ACT.empSave(user, { id: b.id, name: 'Code Two C', category: 'staff' }); assert.strictEqual(kept.code, neu, 'no code sent (an older page): his code stays');
  // a code typed by hand that the counter would reach next: the counter passes over it
  const next = Number(await db('POST', 'rpc/hr_next_no', { p_kind: 'emp', p_count: 1 })) + 1, hand = 'RCL' + String(next).padStart(3, '0');
  const h = await ACT.empSave(user, { name: 'Code Hand', category: 'staff', code: hand }); assert.strictEqual(h.code, hand);
  const auto = await ACT.empSave(user, { name: 'Code Auto', category: 'staff' }); assert.match(auto.code, /^RCL\d{3,}$/); assert.notStrictEqual(auto.code, hand);
});

test('the attendance dashboard: the HR office only; today counted like the muster; only its own site; the day\'s punches carry their place', async () => {
  await no(ACT.attDash(self(mail1)), /HR office only/, 403);
  const d = await ACT.attDash(user), c = d.count, m = await ACT.muster(user, { month: TODAY.slice(0, 7) }), i = m.days.indexOf(TODAY);
  assert.strictEqual(d.today, TODAY); assert.match(d.now, /^\d\d:\d\d$/); assert.strictEqual(c.total, d.who.length); assert.strictEqual(c.on + c.out + c.off + c.none, c.total);
  // (13-11-2026) on leave / absent today: inside "not marked", never beside it; each person says which
  assert.ok(Number.isInteger(c.leave) && Number.isInteger(c.absent) && c.leave + c.absent <= c.none); assert.strictEqual(d.who.filter(w => w.mark === 'leave').length, c.leave); assert.strictEqual(d.who.filter(w => w.mark === 'absent').length, c.absent); assert.ok(d.who.every(w => w.state === 'none' || w.mark === ''));
  for (const e of [E1, E2]) { const w = d.who.find(x => x.id === e.id), code = m.rows.find(r => r.id === e.id).codes[i]; assert.ok(w, e.code); assert.strictEqual(w.state, code === 'IN' ? 'on' : 'out', e.code + ' as in the muster'); assert.match(w.in, /^\d\d:\d\d$/); assert.match(w.punch, /^[0-9a-f-]{36}$/); }
  assert.strictEqual(d.who.find(x => x.id === E1.id).place, 'Office ' + tag); assert.ok(d.places.some(p => p.name === 'Office ' + tag && p.on >= 1));
  assert.strictEqual(c.on, d.who.filter(w => w.state === 'on').length); assert.strictEqual(d.arc.slots.length, 32); assert.strictEqual(d.arc.slots.reduce((a, b) => a + b, 0), c.present); assert.match(c.first_in, /^\d\d:\d\d$/);
  assert.deepStrictEqual(d.week.map(w => w.day), [6, 5, 4, 3, 2, 1, 0].map(ago)); assert.ok(d.week[6].P >= c.on);
  for (const k of ['requests', 'review', 'phones', 'no_phone']) assert.ok(Number.isInteger(d.needs[k]) && d.needs[k] >= 0, k);
  assert.strictEqual(d.needs.requests, (await ACT.regList(user, { status: 'pending' })).rows.length);
  const other = await ACT.attDash(ses('user', SITE2)); assert.ok(!other.who.some(w => w.id === E1.id || w.id === E2.id), 'another site sees nothing of this one');
  const day = await ACT.dayGet(user, { id: E1.id, day: TODAY }); assert.ok(day.punches.length && day.punches.every(p => typeof p.place === 'string')); assert.ok(day.punches.some(p => p.place === 'Office ' + tag)); assert.strictEqual(day.employee.category, 'staff');
});

test('delete: only an employee added by mistake (HR Admin, with the reason); one with attendance is refused – he is relieved; the list as a file', async () => {
  const x = await ACT.empSave(user, { name: 'Wrong Entry', category: 'driver', mobile: mob(), joined_on: '2026-02-01' });
  await no(ACT.empDelete(user, { id: x.id, reason: 'added twice' }), /Only the HR Admin/, 403); await no(ACT.empDelete(admin, { id: x.id, reason: '' }), /Reason: write why he is deleted/);
  await no(ACT.empDelete(ses('admin', SITE2), { id: x.id, reason: 'added twice' }), /not found on this site/, 404);
  await no(ACT.empDelete(admin, { id: E1.id, reason: 'try' }), /has attendance.*cannot be deleted\. Relieve him/, 409);      // E1 has punches and a phone
  const boss = await ACT.empSave(user, { name: 'Wrong Boss', category: 'staff', mobile: mob() }); await ACT.empSave(user, { id: x.id, name: 'Wrong Entry', category: 'driver', mobile: (await ACT.empGet(user, { id: x.id })).employee.mobile, joined_on: '2026-02-01', reports_to: boss.id });
  await no(ACT.empDelete(admin, { id: boss.id, reason: 'try' }), /people reporting to him/, 409);
  const ex = await ACT.empExport(user, { q: 'Wrong Entry' }); assert.deepStrictEqual(ex.rows.map(r => [r.code, r.name, r.category, r.joined_on, r.left_on, r.status]), [[x.code, 'Wrong Entry', 'driver', '2026-02-01', '', 'incomplete']]);
  const d = await ACT.empDelete(admin, { id: x.id, reason: 'added twice' }); assert.deepStrictEqual(d, { ok: true, code: x.code });
  await no(ACT.empGet(user, { id: x.id }), /not found on this site/, 404); assert.strictEqual(((await db('GET', 'hr_employment?select=id&employee_id=eq.' + x.id)) || []).length, 0);
  const a = (await db('GET', 'hr_audit?select=action,target,detail&site=eq.' + SITE + '&action=eq.Employee%20deleted&order=id.desc&limit=1'))[0]; assert.ok(a && a.detail.reason === 'added twice' && a.detail.old.code === x.code && a.detail.old.name === 'Wrong Entry');
  await ACT.empDelete(admin, { id: boss.id, reason: 'made for a test' });      // nobody reports to him any more
  assert.ok((await ACT.empGet(user, { id: E1.id })).employee.id === E1.id, 'the others are untouched');
  const next = await ACT.empSave(user, { name: 'After Delete', category: 'staff', mobile: mob() }); assert.notStrictEqual(next.code, x.code, 'a deleted code is not given again by the counter');
  await no(ACT.empExit(admin, { id: next.id, on: '', reason: 'x' }), /Relieving date: a date/);
});

test('the full profile: lists are the office\'s (add, rename, switch off); details saved by group; numbers masked for an HR User; rows added, changed, removed; what is compulsory', async () => {
  await no(ACT.listSave(user, { kind: 'branch', name: 'B ' + tag }), /Only the HR Admin/, 403); await no(ACT.listSave(admin, { kind: 'nope', name: 'x' }), /Unknown list/);
  let l = await ACT.listSave(admin, { kind: 'branch', name: 'Branch ' + tag }); const br = l.lists.branch.find(x => x.name === 'Branch ' + tag); assert.ok(br && br.active);
  await no(ACT.listSave(admin, { kind: 'branch', name: 'branch ' + tag.toLowerCase() }), /already in the list/, 409);
  l = await ACT.listSave(admin, { kind: 'branch', id: br.id, name: 'Branch ' + tag + ' 2', active: true }); assert.ok(l.lists.branch.some(x => x.id === br.id && x.name === 'Branch ' + tag + ' 2'));
  l = await ACT.listSave(admin, { kind: 'qualification', name: 'Diploma ' + tag }); const ql = l.lists.qualification.find(x => x.name === 'Diploma ' + tag);
  const e = await ACT.empSave(user, { name: 'Profile Rig', category: 'staff', mobile: mob(), email: mail('prof'), dob: '1990-05-05' });
  let p = await ACT.profGet(user, { id: e.id }); assert.deepStrictEqual([p.data, p.secret, p.masked, p.complete.missing], [{}, {}, true, []]); assert.ok(p.defs.groups.length === 3 && p.defs.rows.length === 4 && p.lists.blood.length >= 8);
  await no(ACT.profGet(self(mail1), { id: e.id }), /HR office only/, 403); await no(ACT.profGet(ses('user', SITE2), { id: e.id }), /not found on this site/, 404);
  await no(ACT.profSave(user, { id: e.id, group: 'job', data: { branch: E1.id } }), /Branch: choose a value of the list/);
  p = await ACT.profSave(user, { id: e.id, group: 'job', data: { branch: br.id, notice_days: '30', overtime: 'no', confirmation_date: '01-06-2026' } }); assert.deepStrictEqual(p.data, { branch: br.id, notice_days: 30, overtime: false, confirmation_date: '2026-06-01' });
  p = await ACT.profSave(user, { id: e.id, group: 'profile', data: { father_name: 'Senior Rig', cug: '9876500000' } }); assert.deepStrictEqual(p.data, { branch: br.id, notice_days: 30, overtime: false, confirmation_date: '2026-06-01', father_name: 'Senior Rig', cug: '9876500000' }, 'a group leaves the other groups alone');
  p = await ACT.profSave(sup, { id: e.id, group: 'secret', data: { uan: '123456789012', bank_account: '000123456789', bank_ifsc: 'SBIN0001234', bank_name: 'Rig Bank' } }); assert.strictEqual(p.secret.bank_account, '000123456789', 'the Super Admin\'s bank change counts at once (step 14)');
  p = await ACT.profGet(user, { id: e.id }); assert.deepStrictEqual([p.secret.uan, p.secret.bank_account, p.secret.bank_ifsc], ['XXXX9012', 'XXXX6789', 'SBIN0001234'], 'an HR User sees the numbers masked');
  p = await ACT.profSave(user, { id: e.id, group: 'secret', data: Object.assign({}, p.secret, { bank_holder: 'Profile Rig' }) }); assert.strictEqual((await ACT.profGet(admin, { id: e.id })).secret.bank_account, '000123456789', 'a masked box left as it is keeps its number');
  const au = (await db('GET', 'hr_audit?select=detail&site=eq.' + SITE + '&action=like.' + encodeURIComponent('*Statutory & bank*') + '&order=id.desc&limit=5')) || [], aub = (await db('GET', 'hr_audit?select=detail&site=eq.' + SITE + '&action=like.' + encodeURIComponent('Bank details*') + '&order=id.desc&limit=5')) || [];
  assert.ok(au.length >= 1 && aub.length >= 2 && !JSON.stringify(au.concat(aub)).includes('123456789'), 'the audit holds no number');
  // switched off: not offered, but it stays where it is
  await ACT.listSave(admin, { kind: 'branch', id: br.id, name: 'Branch ' + tag + ' 2', active: false });
  p = await ACT.profSave(user, { id: e.id, group: 'job', data: { branch: br.id, notice_days: 45 } }); assert.deepStrictEqual([p.data.branch, p.data.notice_days, p.data.overtime], [br.id, 45, undefined]);
  const e2 = await ACT.empSave(user, { name: 'Profile Two', category: 'labour', mobile: mob() }); await no(ACT.profSave(user, { id: e2.id, group: 'job', data: { branch: br.id } }), /choose a value of the list/);
  // rows
  await no(ACT.profRowSave(user, { id: e.id, kind: 'family', data: { relation: '' } }), /Name: needed/);
  p = await ACT.profRowSave(user, { id: e.id, kind: 'family', data: { name: 'Mother Rig', nominee: 'yes', mobile: '9876511111' } }); const fr = p.rows.family[0]; assert.deepStrictEqual(fr.data, { name: 'Mother Rig', mobile: '9876511111', nominee: true });
  p = await ACT.profRowSave(user, { id: e.id, kind: 'family', row: fr.id, data: { name: 'Mother Rig', nominee: 'no' } }); assert.deepStrictEqual(p.rows.family, [{ id: fr.id, data: { name: 'Mother Rig', nominee: false } }]);
  p = await ACT.profRowSave(user, { id: e.id, kind: 'education', data: { qualification: ql.id, year: '2010' } }); assert.strictEqual(p.rows.education.length, 1);
  await no(ACT.profRowSave(user, { id: e.id, kind: 'experience', data: { company: 'Old Co', from: '2020-01-01', to: '2019-01-01' } }), /To: it is before From/);
  await no(ACT.profRowRemove(user, { row: fr.id, reason: '' }), /Reason: write why/); p = await ACT.profRowRemove(user, { row: fr.id, reason: 'entered twice' }); assert.strictEqual(p.rows.family.length, 0);
  assert.strictEqual(((await db('GET', 'hr_employee_rows?select=removed_reason&id=eq.' + fr.id)) || [])[0].removed_reason, 'entered twice', 'removed = kept with who and why');
  // what is compulsory – the site's own setting
  await no(ACT.profRequiredSave(user, { keys: ['emp.dob'] }), /Only the HR Admin/, 403);
  const st = await ACT.profRequiredSave(admin, { keys: ['secret.pf_no', 'rows.family', 'profile.blood', 'made.up'] }); assert.deepStrictEqual(st.required, ['secret.pf_no', 'rows.family', 'profile.blood']);
  p = await ACT.profGet(user, { id: e.id }); assert.deepStrictEqual(p.complete.missing, ['Blood group', 'PF number', 'Family (at least one)']); assert.ok(p.complete.pct > 20 && p.complete.pct < 100);
  assert.deepStrictEqual((await ACT.listAll(ses('user', SITE2))).required, [], 'another site has its own');
  await ACT.profRequiredSave(admin, { keys: [] });
  await no(ACT.empDelete(admin, { id: e.id, reason: 'try' }), /personal details \(KYC \/ profile\)/, 409);
});

test('leave: the policy with its date; the balance counted; asked – refused beyond the balance; the reporting person then the HR office; the muster reads L', async () => {
  const site = tag + 'L', A = ses('admin', site), U = ses('user', site), S = ses('super', site), month = TODAY.slice(0, 7), first = month + '-01';
  const sf = m => ({ site: site, email: m, name: 'Self', role: 'self', info: {} });
  // (19-11-2026) every leave is asked with its paper: a small PDF sent first, as the app does
  const paper = async m => { const body = Buffer.from('%PDF-1.4 rig ' + m + Date.now()), u = await ACT.myLeavePaperUrl(sf(m), { type: 'application/pdf', bytes: body.length }); const r = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: body, signal: AbortSignal.timeout(15000) }); assert.ok(r.ok, 'the paper is kept'); return [{ path: u.path, name: 'paper.pdf', bytes: body.length }]; };
  const mb = mail('lvboss'), mw = mail('lvwork'), boss = await ACT.empSave(U, { name: 'Leave Boss', category: 'staff', mobile: mob(), email: mb, dob: '1980-01-01', joined_on: '2026-01-01' });
  const w = await ACT.empSave(U, { name: 'Leave Worker', category: 'labour', mobile: mob(), email: mw, dob: '1990-01-01', joined_on: '2026-01-01', reports_to: boss.id });
  await no(ACT.leaveAsk(sf(mw), { from: TODAY, reason: 'Family function' }), /No leave policy is set/);
  await no(ACT.leavePolicySave(U, { per_month: 4 }), /Only the HR Admin/, 403); await no(ACT.leavePolicySave(A, { per_month: 40 }), /0 to 31/);
  await no(ACT.leavePolicySave(A, { per_month: 4, valid_from: ago(40) }), /only by the Super Admin/, 403);
  let p = await ACT.leavePolicySave(S, { per_month: 4, valid_from: first }); assert.deepStrictEqual(p.policy, { valid_from: first, per_month: 4, carry: true, auto_absent: true, levels: 2 });
  let me1 = await ACT.myLeave(sf(mw)); assert.deepStrictEqual([me1.balance, me1.available, me1.month.credit, me1.requests.length], [4, 4, 4, 0], 'no attendance at this site yet: nobody is absent');
  await no(ACT.myLeave(U), /not in the Employee Master/, 403);
  // the HR office adds to one balance – a new row with the reason
  await no(ACT.leaveAdjust(U, { id: w.id, days: 2, reason: 'opening balance' }), /Only the HR Admin/, 403); await no(ACT.leaveAdjust(A, { id: w.id, days: 0, reason: 'x y z' }), /not 0/); await no(ACT.leaveAdjust(A, { id: w.id, days: 1, reason: '' }), /Reason/);
  let bal = await ACT.leaveAdjust(A, { id: w.id, days: 1.5, reason: 'opening balance' }); assert.strictEqual(bal.rows.find(r => r.id === w.id).balance, 5.5); assert.strictEqual(bal.rows.find(r => r.id === boss.id).balance, 4);
  // asking
  await no(ACT.leaveAsk(sf(mw), { from: ago(1), reason: 'Family function' }), /today or a day to come/); await no(ACT.leaveAsk(sf(mw), { from: ago(-3), to: ago(-5), part: 'first', reason: 'abc' }), /half day is for one day/);
  await no(ACT.leaveAsk(sf(mw), { from: ago(-3), to: ago(-9), reason: 'long' }), /Not enough leave: you ask 7, the balance is 5\.5/);
  me1 = await ACT.leaveAsk(sf(mw), { from: ago(-3), to: ago(-4), reason: 'Family function', files: await paper(mw) }); const rq = me1.requests[0];
  assert.deepStrictEqual([rq.from, rq.to, rq.days, rq.status, rq.level, me1.pending, me1.available], [ago(-3), ago(-4), 2, 'pending', 1, 2, 3.5]);
  await no(ACT.leaveAsk(sf(mw), { from: ago(-4), reason: 'again' }), /already there/, 409); await no(ACT.leaveAsk(sf(mw), { from: ago(-30), reason: 'no paper', files: [] }), /Attach a paper/, 400);
  // level 1: the reporting person; then the HR office
  await no(ACT.leaveDecide(A, { id: rq.id, decision: 'approved' }), /still waits for the reporting person/, 403);
  let t = await ACT.teamLeaves(sf(mb)); assert.deepStrictEqual([t.team, t.rows.map(r => r.id)], [1, [rq.id]]); await no(ACT.teamLeaveDecide(sf(mw), { id: rq.id, decision: 'approved' }), /does not report to you/, 403);
  t = await ACT.teamLeaveDecide(sf(mb), { id: rq.id, decision: 'approved' }); assert.strictEqual(t.rows.length, 0);
  await no(ACT.leaveDecide(U, { id: rq.id, decision: 'approved' }), /Only the HR Admin/, 403); await no(ACT.leaveDecide(ses('admin'), { id: rq.id, decision: 'approved' }), /not found on this site/, 404);
  let l = await ACT.leaveList(U, { status: 'pending' }); assert.deepStrictEqual(l.rows.map(r => [r.id, r.level, r.name]), [[rq.id, 2, 'Leave Worker']]);
  await ACT.leaveDecide(A, { id: rq.id, decision: 'approved', note: 'ok' }); await no(ACT.leaveDecide(A, { id: rq.id, decision: 'refused', note: 'late' }), /already decided/, 409);
  me1 = await ACT.myLeave(sf(mw)); assert.deepStrictEqual([me1.balance, me1.booked, me1.pending, me1.available, me1.requests[0].status], [5.5, 2, 0, 3.5, 'approved']);
  // a half day; refused with the reason; taken back by himself
  me1 = await ACT.leaveAsk(sf(mw), { from: ago(-10), part: 'second', reason: 'Bank work', files: await paper(mw) }); const h = me1.requests[0]; assert.deepStrictEqual([h.days, h.part], [0.5, 'second']);
  await ACT.teamLeaveDecide(sf(mb), { id: h.id, decision: 'approved' }); await no(ACT.leaveDecide(A, { id: h.id, decision: 'refused', note: '' }), /write why it is refused/);
  await ACT.leaveDecide(A, { id: h.id, decision: 'refused', note: 'work at the plant' }); me1 = await ACT.myLeave(sf(mw)); assert.deepStrictEqual([me1.requests[0].status, me1.requests[0].note, me1.available], ['refused', 'work at the plant', 3.5]);
  me1 = await ACT.leaveAsk(sf(mw), { from: ago(-20), reason: 'Village fair', files: await paper(mw) }); const c = me1.requests[0]; await no(ACT.leaveCancel(sf(mb), { id: c.id }), /still waits/, 409);
  me1 = await ACT.leaveCancel(sf(mw), { id: c.id }); assert.deepStrictEqual([me1.requests[0].status, me1.pending], ['cancelled', 0]);
  // the boss has nobody above him: his own request goes straight to the HR office
  const b1 = await ACT.leaveAsk(sf(mb), { from: ago(-2), reason: 'Personal work', files: await paper(mb) }); assert.strictEqual(b1.requests[0].level, 2);
  // the muster and his month read L on an approved leave day that is in this month
  if (ago(-3).slice(0, 7) === month) {
    const m = await ACT.muster(U, { month }), row = m.rows.find(r => r.id === w.id), i = m.days.indexOf(ago(-3)); assert.strictEqual(row.codes[i], 'L'); assert.ok(row.total.L >= 1);
    const mm = await ACT.myMonth(sf(mw), { month }); assert.strictEqual(mm.all.find(d => d.day === ago(-3)).code, 'L');
  }
  assert.deepStrictEqual((await ACT.leavePolicy(ses('user', SITE2))).versions, [], 'another site has its own policy'); await no(ACT.empDelete(A, { id: w.id, reason: 'try' }), /leave/, 409);
});

test('(the app\'s "Me") my record and my papers: his own only – the id the phone sends is not used; numbers masked; he attaches and opens his own paper, never another person\'s', async () => {
  const s1 = self(mail1), s2 = self(mail2), A = ses('admin');
  await no(ACT.myHr(self(mail('nobody'))), /not in the Employee Master/, 403);
  let h = await ACT.myHr(s1); assert.strictEqual(h.employee.code, E1.code); assert.strictEqual(h.details[0].name, 'Employee'); assert.ok(h.details[0].rows.some(r => r.label === 'Date of birth' && r.value === '01-01-1991'));
  assert.ok(h.complete === null || (h.complete.pct >= 0 && h.complete.pct <= 100)); assert.ok(h.docs.missing.indexOf('PAN card') > -1); assert.strictEqual(typeof h.phone.bound, 'boolean');
  { await ACT.profSave(ses('super'), { id: E1.id, group: 'secret', data: { bank_account: '123456789012', bank_ifsc: 'SBIN0001234' } }); h = await ACT.myHr(s1); const bank = h.details.find(g => g.name === 'Statutory & bank');
    assert.deepStrictEqual(bank.rows.map(r => r.value).sort(), ['SBIN0001234', 'XXXX9012'], 'his account number is masked for him too'); }
  const body = Buffer.from('%PDF-1.4 rig mine'), u = await ACT.myDocUploadUrl(s1, { id: E2.id, kind: 'pan', type: 'application/pdf', bytes: body.length });
  assert.match(u.path, new RegExp('^' + E1.id + '/[0-9a-f]{24}\\.pdf$'), 'his own folder – not the id the phone sent');
  const r = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body }); assert.ok(r.ok);
  await no(ACT.myDocAdd(s2, { kind: 'pan', path: u.path, bytes: body.length }), /does not belong to this employee/);
  const made = await ACT.myDocAdd(s1, { id: E2.id, kind: 'pan', path: u.path, bytes: body.length, number: 'abcde1234f' }); assert.ok(made.id);
  const l = await ACT.myDocs(s1); assert.ok(l.docs.some(d => d.id === made.id && d.kind === 'pan' && d.number === 'ABCDE1234F')); assert.ok(l.docsMissing.indexOf('PAN card') < 0);
  assert.ok(!(await ACT.myDocs(s2)).docs.some(d => d.id === made.id), 'another person does not see it');
  const k = await ACT.myDocLink(s1, { doc: made.id }); assert.match((await (await fetch(k.url)).text()), /rig mine/);
  await no(ACT.myDocLink(s2, { doc: made.id }), /not found/, 404); await no(ACT.myDocLink(s1, { doc: 'x' }), /not found/, 404);
  assert.ok((await ACT.docList(A, { id: E1.id })).docs.some(d => d.id === made.id), 'the HR office sees the paper he attached');
});

test('the profile picture: the newest paper "Photo" that is a picture – he sets it himself; the office sees the faces of its own site only; a PDF is not a face', async () => {
  const s1 = self(mail1), A = ses('admin'), png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  assert.strictEqual((await ACT.myHr(s1)).photo, '', 'none yet'); assert.deepStrictEqual((await ACT.empPhotos(A, { ids: [E1.id] })).photos, {});
  const u = await ACT.myDocUploadUrl(s1, { kind: 'photo', type: 'image/png', bytes: png.length }); assert.ok((await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: png })).ok);
  await ACT.myDocAdd(s1, { kind: 'photo', path: u.path, bytes: png.length });
  const h = await ACT.myHr(s1); assert.match(h.photo, /^http/); assert.strictEqual(Buffer.from(await (await fetch(h.photo)).arrayBuffer()).length, png.length);
  const f = await ACT.empPhotos(A, { ids: [E1.id, E2.id, 'x'] }); assert.deepStrictEqual(Object.keys(f.photos), [E1.id]); assert.ok((await fetch(f.photos[E1.id])).ok);
  assert.deepStrictEqual((await ACT.empPhotos(ses('admin', SITE2), { ids: [E1.id] })).photos, {}, 'another site does not get his face');
  await no(ACT.empPhotos(s1, { ids: [E1.id] }), /HR office only/, 403);
});

test('(12-11-2026) the late rule of a month, very late, a forgotten OUT closed at the shift\'s time; once a day – on the days as the muster reads them and for the phone', async () => {
  const S2 = ses('super', SITE2), now = new Date(Date.now() + 19800000), lm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7), d = n => lm + '-' + String(n).padStart(2, '0');
  const w = await ACT.empSave(S2, { name: 'Late Rule', category: 'staff', mobile: mob(), email: mail('late'), dob: '1990-01-01', joined_on: lm + '-01' });
  let a = await ACT.shiftSave(S2, { name: 'Day ' + tag, start_time: '08:30', end_time: '18:00', auto_out: '23:50', valid_from: lm + '-01' }); assert.strictEqual(a.shifts.find(x => x.name === 'Day ' + tag).auto_out, '23:50');
  await no(ACT.shiftSave(S2, { name: 'Bad ' + tag, start_time: '08:30', end_time: '18:00', auto_out: '08:30' }), /not the time the shift starts/);
  a = await ACT.rulesSave(S2, { valid_from: lm + '-01', grace_min: 0, late_free: 3, half_after_min: 120, once: 'yes' }); assert.deepStrictEqual([a.rules.late_free, a.rules.half_after_min, a.rules.once], [3, 120, true]);
  // days 10–13: a little late each; 14: on time; 15: late again (the 5th); 16: three hours late; 17: IN only – he forgot OUT
  for (const [n, i, o] of [[10, '08:40', '18:00'], [11, '08:41', '18:00'], [12, '08:42', '18:00'], [13, '08:43', '18:00'], [14, '08:30', '18:00'], [15, '08:45', '18:00'], [16, '11:30', '19:00'], [17, '08:20', '']]) await ACT.daySet(S2, { id: w.id, day: d(n), in_time: i, out_time: o, reason: 'Rig – the late rule' });
  const m = await ACT.muster(S2, { month: lm }), row = m.rows.find(r => r.id === w.id), at = n => row.codes[m.days.indexOf(d(n))];
  assert.deepStrictEqual([10, 11, 12, 13, 14, 15, 16, 17].map(at), ['P', 'P', 'P', 'HD', 'P', 'HD', 'HD', 'A'], 'three late days only marked; the 4th and 5th a half day; very late a half day; no OUT = closed by itself, absent');
  const one = await ACT.dayGet(S2, { id: w.id, day: d(17) }), four = await ACT.dayGet(S2, { id: w.id, day: d(13) });
  assert.strictEqual(one.day.auto, true); assert.strictEqual(four.day.late_half, true);
  // a week in the middle of the month is read with the month's own count (the late days before it are counted)
  const mm = await ACT.myMonth(self(mail('late'), SITE2), { month: lm }); assert.strictEqual(mm.all.find(x => x.day === d(13)).code, 'HD'); assert.strictEqual(mm.all.find(x => x.day === d(17)).auto, true);
  // the phone: what the server says of today – and "once a day" at the first site, where he was IN and OUT today already
  const me1 = await ACT.myAttend(self(mail('late'), SITE2), {}); assert.deepStrictEqual([me1.next, me1.once, me1.shift.name, me1.shift.auto_out], ['in', true, 'Day ' + tag, '23:50']);
  await ACT.rulesSave(ses('super'), Object.assign({}, (await ACT.attSetup(ses('admin'))).rules, { once: 'yes' }));
  const s1 = self(mail1), st = await ACT.myAttend(s1, { device_id: 'rig-phone-' + tag + '-1' });
  if (st.punches.some(p => p.kind === 'in') && st.next !== 'out') { assert.strictEqual(st.next, 'done'); await no(ACT.punch(s1, P({ client_id: cid() })), /attendance is done – one IN and one OUT a day/, 409); }
  else assert.ok(['in', 'out'].indexOf(st.next) > -1);
});

test('(step 9) the face: registered once from five pictures of ONE person; a punch\'s photo must be his – another person\'s is refused and nothing is saved; reset by the HR Admin', { timeout: 150000 }, async () => {
  const FA = require('../api/face').ACT, F = require('../lib/face'), jpeg = require('jpeg-js'), fsx = require('fs'), px = require('path');
  // pictures of single faces, cut out of the sample pictures that come with the face library (nobody of ours)
  const m = await F.load(), raw = jpeg.decode(fsx.readFileSync(px.join(px.dirname(require.resolve('@vladmandic/face-api/package.json')), 'demo', 'sample1.jpg')), { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 512 });
  const img = m.tf.tensor3d(raw.data, [raw.height, raw.width, 3], 'int32'), found = (await m.api.detectAllFaces(img, new m.api.SsdMobilenetv1Options({ minConfidence: 0.6 }))).sort((a, b) => a.box.x - b.box.x); img.dispose(); assert.ok(found.length >= 2);
  const cut = (f, light, q) => { const b = f.box, pad = Math.round(b.width * 0.5), x0 = Math.max(0, Math.round(b.x) - pad), y0 = Math.max(0, Math.round(b.y) - pad), w = Math.min(raw.width - x0, Math.round(b.width) + 2 * pad), h = Math.min(raw.height - y0, Math.round(b.height) + 2 * pad), o = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((y0 + y) * raw.width + x0 + x) * 3, d = (y * w + x) * 4; for (let k = 0; k < 3; k++) o[d + k] = Math.min(255, raw.data[s + k] * light); o[d + 3] = 255; }
    return jpeg.encode({ data: o, width: w, height: h }, q).data; };
  const A = found[0], B = found[1], s1 = self(mail1), admin = ses('admin'), sup = ses('super');
  const put = async (url, body) => assert.ok((await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body })).ok);
  // before: not asked, not registered
  let st = await FA.faceState(s1); assert.deepStrictEqual([st.required, st.enrolled, st.min], [false, false, 90]);
  await no(FA.faceCheck(s1, { client_id: cid() }), /not registered yet/, 409); await no(FA.faceInfo(s1, { id: E1.id }), /HR office only/, 403);
  // five pictures: one of them of another person – refused, nothing registered
  let u = await FA.faceEnrolUrls(s1); assert.deepStrictEqual(u.pictures.map(p => p.pose), ['front', 'left', 'right', 'up', 'down']);
  for (const p of u.pictures) await put(p.url, cut(p.pose === 'up' ? B : A, 1, 90));
  await no(FA.faceEnrol(s1, { token: u.token }), /Up \/ down: it does not match the picture from the front – turn your head only a little/); assert.strictEqual((await FA.faceState(s1)).enrolled, false);
  await no(FA.faceEnrol(s1, { token: 'a'.repeat(24) }), /Front: the picture did not arrive/);
  // five pictures of himself (lighter, darker, another quality): registered – once
  u = await FA.faceEnrolUrls(s1); const looks = { front: [1, 92], left: [0.85, 80], right: [1.1, 85], up: [0.75, 70], down: [0.95, 60] };
  for (const p of u.pictures) await put(p.url, cut(A, looks[p.pose][0], looks[p.pose][1]));
  assert.deepStrictEqual(await FA.faceEnrol(s1, { token: u.token, device: { id: 'rig-phone-' + tag + '-1', model: 'Rig Phone' } }), { enrolled: true });
  await no(FA.faceEnrolUrls(s1), /registered already/, 409); assert.strictEqual((await FA.faceState(s1)).enrolled, true);
  // a punch's photo: his own matches (at least 90 %), another person's does not – noted, refused
  const shot = async (who, light) => { const c = cid(), su = await ACT.selfieUrl(s1, { client_id: c }); await put(su.url, cut(who, light, 75)); return c; };
  const mine = await shot(A, 0.9), ok = await FA.faceCheck(s1, { client_id: mine }); assert.strictEqual(ok.match, true); assert.ok(ok.pct >= 90, 'his own face: ' + ok.pct + ' %');
  const other = await shot(B, 1); await no(FA.faceCheck(s1, { client_id: other }), /the face does not match the registered face of .* at least 90 % is needed\)\. Nothing is saved\./, 403);
  await no(FA.faceCheck(s1, { client_id: cid() }), /did not arrive/);
  // the rule on: a punch whose photo was not found his is not taken; one that was passes this check
  const was = (await ACT.attSetup(admin)).rules; await ACT.rulesSave(sup, Object.assign({}, was, { face: 'yes', face_min: 90 })); assert.strictEqual((await ACT.myAttend(s1, {})).face, true);
  // (the punch itself: the server's check of "this punch's photo was found his" is read in the unit test – here his phone was released in an earlier test)
  // the HR office: what is registered, the checks with how far they matched; reset with the reason – then he registers again
  const info = await FA.faceInfo(admin, { id: E1.id }); assert.strictEqual(info.enrolled, true); assert.strictEqual(info.pictures.length, 5); assert.ok(info.tries.some(t => t.result === 'nomatch' && t.kind === 'punch' && t.match_pct < 90) && info.tries.some(t => t.result === 'ok' && t.kind === 'punch'));
  assert.strictEqual((await FA.faceInfo(ses('user'), { id: E1.id })).pictures.length, 0, 'the pictures: HR Admin / Super Admin only');
  await no(FA.faceReset(ses('user'), { id: E1.id, reason: 'try' }), /Only the HR Admin/, 403); await no(FA.faceReset(admin, { id: E1.id, reason: '' }), /Reason/); await no(FA.faceInfo(ses('admin', SITE2), { id: E1.id }), /not found on this site/, 404);
  assert.deepStrictEqual(await FA.faceReset(admin, { id: E1.id, reason: 'Registered in bad light' }), { reset: true }); st = await FA.faceState(s1); assert.strictEqual(st.enrolled, false);
  assert.strictEqual((await FA.faceInfo(admin, { id: E1.id })).resets.length, 1); await ACT.rulesSave(sup, was);
});

test('(step 10) the month: the site\'s HR verifies people after the month ended – not one with something waiting; the HO HR sends back or approves; an approved month is closed; the Super Admin opens it again', async () => {
  const SM = tag + 'M', aM = ses('admin', SM), uM = ses('user', SM), sM = ses('super', SM), D = require('../lib/day'), MO = require('../lib/month');
  const today = require('../lib/rules').today(), month = D.addDays(today.slice(0, 8) + '01', -1).slice(0, 7), d5 = month + '-05', d6 = month + '-06', nDays = +MO.lastDay(month).slice(8);
  const A = await ACT.empSave(aM, { name: 'Month One', category: 'staff', mobile: mob(), email: mail('m1'), dob: '1990-02-02', joined_on: '2024-01-01' });
  const B = await ACT.empSave(aM, { name: 'Month Two', category: 'labour', mobile: mob(), email: mail('m2'), dob: '1990-03-03', joined_on: '2024-01-01' });
  await ACT.daySet(sM, { id: A.id, day: d5, in_time: '09:00', out_time: '18:00', reason: 'rig month' });
  await db('POST', 'hr_regularize', [{ employee_id: B.id, site: SM, day: d6, in_time: '09:00', out_time: '18:00', reason: 'rig waiting', level: 2, asked_by: 'x@rig.test' }], 'return=minimal');
  // the month as it stands: nobody verified; the counts; who waits is said
  let m = await ACT.monthList(uM, { month });
  const a = () => m.rows.find(r => r.id === A.id), b = () => m.rows.find(r => r.id === B.id);
  assert.deepStrictEqual([m.ended, m.approved, m.sum, m.can], [true, null, { people: 2, verified: 0, changed: 0, returned: 0, open: 2 }, { verify: false, ho: false, reopen: false }]);
  assert.deepStrictEqual([a().counts.present, a().counts.absent, a().counts.paid, a().state, a().blocked], [1, nDays - 5, 1, 'open', '']);
  assert.deepStrictEqual([b().counts.present, b().counts.absent, b().waiting], [0, nDays - 4, 1]); assert.match(b().blocked, /1 request\(s\) \/ doubtful punch\(es\) still wait/);
  // who may verify: the HR Admin with the power – not an HR User, not a running month
  await no(ACT.monthVerify(uM, { month, ids: [A.id] }), /Only the HR Admin or the Super Admin/, 403);
  await no(ACT.monthVerify(aM, { month: today.slice(0, 7), ids: [A.id] }), /verified after its last day/, 400);
  await no(ACT.monthVerify(aM, { month, ids: [] }), /Choose at least one person/, 400);
  await ACT.powerSet(sM, { power: 'month', allowed: false }); await no(ACT.monthVerify(aM, { month, ids: [A.id] }), /has not given the HR Admin this power/, 403); await ACT.powerSet(sM, { power: 'month', allowed: true });
  m = await ACT.monthVerify(aM, { month, ids: [A.id, B.id] });
  assert.deepStrictEqual([m.saved, m.skipped.length, m.skipped[0].code, a().state, b().state, a().verified.by, a().verified.counts.present, m.can.verify], [1, 1, B.code, 'verified', 'open', 'admin@rig.test', 1, true]);
  await db('PATCH', 'hr_regularize?employee_id=eq.' + B.id + '&status=eq.pending', { status: 'refused' }, 'return=minimal');
  m = await ACT.monthVerify(aM, { month, ids: [B.id] }); assert.deepStrictEqual([m.saved, m.sum.verified], [1, 2]);
  // the HO HR: only whom the Super Admin gave it
  await no(ACT.monthApprove(aM, { month }), /Only the HO HR or the Super Admin/, 403); await no(ACT.monthSites(uM, { month }), /Only the HO HR/, 403);
  await no(ACT.hoSet(aM, { email: 'user@rig.test', on: true }), /Only the Super Admin/, 403); await no(ACT.hoSet(sM, { email: 'nobody', on: true }), /E-mail/, 400);
  const h = await ACT.hoSet(sM, { email: 'User@Rig.Test', on: true }); assert.ok(h.rows.some(r => r.email === 'user@rig.test' && r.active));
  m = await ACT.monthList(uM, { month }); assert.strictEqual(m.can.ho, true);
  const st = (await ACT.monthSites(uM, { month })).sites.find(x => x.code === SM); assert.deepStrictEqual([st.people, st.verified, st.returned, st.approved], [2, 2, 0, null]);
  // a day changed after the verification: said, and the month is not approved with it
  await ACT.daySet(sM, { id: A.id, day: d6, in_time: '09:00', out_time: '18:00', reason: 'rig month 2' });
  m = await ACT.monthList(uM, { month }); assert.deepStrictEqual([a().state, a().counts.present, a().verified.counts.present], ['changed', 2, 1]);
  await no(ACT.monthApprove(uM, { month }), new RegExp('1 of 2 people are not verified.*' + A.code), 400);
  await no(ACT.monthReturn(uM, { month, ids: [B.id], reason: '' }), /Reason/, 400);
  m = await ACT.monthReturn(uM, { month, ids: [B.id], reason: 'check the absent days' }); assert.deepStrictEqual([b().state, b().returned.reason, b().returned.by], ['returned', 'check the absent days', 'user@rig.test']);
  m = await ACT.monthVerify(aM, { month, ids: [A.id, B.id] }); assert.deepStrictEqual([m.saved, a().state, b().state, b().returned], [2, 'verified', 'verified', null]);
  m = await ACT.monthApprove(uM, { month, note: 'ok' }); assert.deepStrictEqual([m.approved.by, m.approved.people, m.approved.note, m.can.verify], ['user@rig.test', 2, 'ok', false]);
  // approved: closed for everybody
  await no(ACT.daySet(sM, { id: A.id, day: d5, none: true, reason: 'after approval' }), /approved by the HO HR – no day of that month is changed/, 409);
  await no(ACT.monthVerify(aM, { month, ids: [A.id] }), /approved by the HO HR/, 409); await no(ACT.monthReturn(uM, { month, ids: [A.id], reason: 'late' }), /approved by the HO HR/, 409);
  assert.strictEqual((await ACT.monthSites(uM, { month })).sites.find(x => x.code === SM).approved.by, 'user@rig.test');
  await no(ACT.monthReopen(aM, { month, reason: 'x y z' }), /Only the Super Admin/, 403); await no(ACT.monthReopen(sM, { month, reason: '' }), /Reason/, 400);
  m = await ACT.monthReopen(sM, { month, reason: 'one day was wrong' }); assert.deepStrictEqual([m.approved, m.reopened.reason, m.can.verify, a().state], [null, 'one day was wrong', true, 'verified']);
  await ACT.hoSet(sM, { email: 'user@rig.test', on: false }); assert.strictEqual((await ACT.monthList(uM, { month })).can.ho, false);
  const log = (await db('GET', 'hr_audit?select=action&site=eq.' + SM + '&order=id')).map(r => r.action);
  for (const k of ['Month verified', 'Month sent back to the site\'s HR', 'Month approved (HO HR)', 'Approved month opened again', 'HO HR given', 'HO HR taken']) assert.ok(log.indexOf(k) > -1, k);
});

test('(step 11) a salary: proposed by the HR Admin (not an HR User), one waiting a person; approved by the HO HR – never by who proposed it; sent back with the reason; the newest approved one counts; the amount is not in the audit', async () => {
  const SP = tag + 'P', aP = ses('admin', SP), uP = ses('user', SP), sP = ses('super', SP), today = require('../lib/rules').today();
  aP.info = uP.info = sP.info = { sites: [{ code: SP, name: 'Rig pay' }] };
  const E = await ACT.empSave(aP, { name: 'Pay One', category: 'operator', mobile: mob(), email: mail('pay1'), dob: '1992-04-04', joined_on: '2026-01-10' });
  await no(ACT.salaryGet(uP, { id: E.id }), /seen only by the HR Admin of the site, the HO HR and the Super Admin/, 403);
  await no(ACT.salaryAsk(uP, { id: E.id, pay_type: 'monthly', amount: '18000' }), /Only the HR Admin or the Super Admin/, 403);
  let g = await ACT.salaryGet(aP, { id: E.id }); assert.deepStrictEqual([g.current, g.waiting, g.history, g.can], [null, null, [], { ask: true, decide: false }]);
  await no(ACT.salaryAsk(aP, { id: E.id, pay_type: 'weekly', amount: '18000' }), /Salary type/, 400);
  for (const bad of ['', '0', '-5', '12.345', 'abc', '100000000']) await no(ACT.salaryAsk(aP, { id: E.id, pay_type: 'monthly', amount: bad }), /Amount: a number above 0/, 400);
  await ACT.powerSet(sP, { power: 'salary', allowed: false }); await no(ACT.salaryAsk(aP, { id: E.id, pay_type: 'monthly', amount: '18000' }), /has not given the HR Admin this power/, 403); await ACT.powerSet(sP, { power: 'salary', allowed: true });
  g = await ACT.salaryAsk(aP, { id: E.id, pay_type: 'monthly', amount: '18,000.50', note: 'joining' });
  assert.deepStrictEqual([g.current, g.waiting.amount, g.waiting.pay_type, g.waiting.valid_from, g.waiting.asked_by, g.can.ask], [null, 18000.5, 'monthly', '2026-01-10', 'admin@rig.test', false]);
  await no(ACT.salaryAsk(aP, { id: E.id, pay_type: 'daily', amount: '700' }), /already waits for the HO HR/, 409);
  // the HO HR only; never his own proposal
  await no(ACT.salaryWaiting(aP), /Only the HO HR/, 403); await no(ACT.salaryDecide(aP, { id: g.waiting.id, decision: 'approved' }), /Only the HO HR/, 403);
  await ACT.hoSet(sP, { email: 'user@rig.test', on: true }); await ACT.hoSet(sP, { email: 'admin@rig.test', on: true });
  await no(ACT.salaryDecide(aP, { id: g.waiting.id, decision: 'approved' }), /another person than the one who proposed it/, 403);
  let w = await ACT.salaryWaiting(uP); const row = w.rows.find(r => r.id === g.waiting.id);
  assert.deepStrictEqual([row.code, row.name, row.is_new, row.now, row.amount, row.site, row.mine], [E.code, 'Pay One', true, null, 18000.5, SP, false]);
  assert.strictEqual((await ACT.salaryWaiting(aP)).rows.find(r => r.id === g.waiting.id).mine, true);
  await no(ACT.salaryDecide(ses('user', SITE), { id: g.waiting.id, decision: 'approved' }), /not found on your sites/, 404);
  await no(ACT.salaryDecide(uP, { id: g.waiting.id, decision: 'returned', note: '' }), /Reason/, 400);
  await ACT.salaryDecide(uP, { id: g.waiting.id, decision: 'returned', note: 'too high' });
  g = await ACT.salaryGet(aP, { id: E.id }); assert.deepStrictEqual([g.current, g.waiting, g.history[0].status, g.history[0].decide_note, g.can.ask], [null, null, 'returned', 'too high', true]);
  g = await ACT.salaryAsk(aP, { id: E.id, pay_type: 'monthly', amount: '17000' }); await ACT.salaryDecide(uP, { id: g.waiting.id, decision: 'approved' });
  await no(ACT.salaryDecide(uP, { id: g.waiting.id, decision: 'approved' }), /already decided/, 409);
  g = await ACT.salaryGet(aP, { id: E.id }); assert.deepStrictEqual([g.current.amount, g.current.decided_by, g.waiting, g.history.length], [17000, 'user@rig.test', null, 2]);
  // a later salary: it counts from its date – until then the old one
  const next = require('../lib/day').addDays(today, 30); g = await ACT.salaryAsk(aP, { id: E.id, pay_type: 'daily', amount: '800', valid_from: next });
  w = await ACT.salaryWaiting(uP); assert.deepStrictEqual([w.rows.find(r => r.id === g.waiting.id).is_new, w.rows.find(r => r.id === g.waiting.id).now], [false, { pay_type: 'monthly', amount: 17000 }]);
  await ACT.salaryDecide(sP, { id: g.waiting.id, decision: 'approved' }); g = await ACT.salaryGet(sP, { id: E.id }); assert.deepStrictEqual([g.current.amount, g.history.length, g.history[0].status], [17000, 3, 'approved']);
  await ACT.hoSet(sP, { email: 'user@rig.test', on: false }); await ACT.hoSet(sP, { email: 'admin@rig.test', on: false });
  const log = await db('GET', 'hr_audit?select=action,detail&site=eq.' + SP + '&action=like.Salary*'); assert.ok(log.length >= 5); assert.ok(!/17000|18000|800/.test(JSON.stringify(log)), 'no amount in the audit');
  await no(db('DELETE', 'hr_salaries?employee_id=eq.' + E.id), /database|refused|permission/i);
});

test('(step 12) payroll: only the HO HR; only after the month is approved; counted from the verified days and the approved salary; PF / ESIC / PT as set and ticked; the advance; locked in one piece – never changed again; his own payslip', async () => {
  const SQ = tag + 'Q', aQ = ses('admin', SQ), uQ = ses('user', SQ), sQ = ses('super', SQ), D = require('../lib/day'), MO = require('../lib/month');
  aQ.info = uQ.info = sQ.info = { sites: [{ code: SQ, name: 'Rig roll' }] };
  const today = require('../lib/rules').today(), month = D.addDays(today.slice(0, 8) + '01', -1).slice(0, 7), nDays = +MO.lastDay(month).slice(8), d5 = month + '-05', d6 = month + '-06';
  const mk = async (name, cat, k) => ACT.empSave(aQ, { name, category: cat, mobile: mob(), email: mail(k), dob: '1990-05-05', joined_on: '2024-01-01' });
  const A = await mk('Roll One', 'staff', 'roll1'), B = await mk('Roll Two', 'labour', 'roll2'), C = await mk('Roll Three', 'driver', 'roll3');
  for (const [e, d] of [[A, d5], [A, d6], [B, d5], [C, d5]]) await ACT.daySet(sQ, { id: e.id, day: d, in_time: '09:00', out_time: '18:00', reason: 'rig roll' });
  await ACT.hoSet(sQ, { email: 'user@rig.test', on: true });
  for (const [e, t, amt] of [[A, 'monthly', nDays * 1000], [B, 'daily', 500]]) { const g = await ACT.salaryAsk(aQ, { id: e.id, pay_type: t, amount: String(amt) }); await ACT.salaryDecide(uQ, { id: g.waiting.id, decision: 'approved' }); }
  // only the HO HR; only after the month's attendance is approved
  await no(ACT.payList(aQ, { month }), /only for the HO HR and the Super Admin/, 403); for (const k of ['paySettings', 'advList']) await no(ACT[k](aQ, {}), /only for the HO HR/, 403);
  let p = await ACT.payList(uQ, { month }); assert.strictEqual(p.ready, false); assert.match(p.reason, /not approved by the HO HR yet/); await no(ACT.payLock(uQ, { month }), /not approved by the HO HR yet/, 400);
  await ACT.monthVerify(aQ, { month, ids: [A.id, B.id, C.id] }); await ACT.monthApprove(uQ, { month });
  // the settings (made-up numbers of the test), the ticks, an advance, an addition
  await no(ACT.paySettingsSave(uQ, { pf_pct: 'twelve' }), /PF %: a number/, 400);
  const st = await ACT.paySettingsSave(uQ, { valid_from: month + '-01', pf_pct: '12', pf_cap: '15000', esic_pct: '0.75', esic_limit: '21000', pt_slabs: [{ from: '1000', amount: '200' }] }); assert.ok(st.versions.length >= 1);
  await ACT.payFlags(uQ, { id: A.id, pf: true, esic: true, pt: true }); await ACT.payFlags(uQ, { id: B.id, esic: true, pt: true });
  await no(ACT.advGive(uQ, { id: A.id, amount: '1000', monthly: '5000' }), /not more than the advance/, 400);
  let ad = await ACT.advGive(uQ, { id: A.id, amount: '1000', monthly: '400', given_on: d5 }); assert.deepStrictEqual([ad.rows[0].left, ad.rows[0].status, ad.rows[0].code], [1000, 'active', A.code]);
  await no(ACT.advGive(uQ, { id: A.id, amount: '500', monthly: '100' }), /one advance at a time/, 409);
  await no(ACT.payAdjust(uQ, { month, id: A.id, other_earn: '100' }), /Another earning: write what it is for/, 400);
  p = await ACT.payAdjust(uQ, { month, id: A.id, other_earn: '100', earn_note: 'arrear of last month' });
  const row = e => p.rows.find(r => r.id === e.id);
  assert.deepStrictEqual([p.ready, p.locked, p.rows.length, p.problems], [true, null, 3, 1]);
  assert.deepStrictEqual([row(A).day, row(A).pay_days, row(A).earned, row(A).gross, row(A).pf, row(A).esic, row(A).pt, row(A).advance, row(A).net], [1000, 2, 2000, 2100, 240, 0, 200, 400, 1260]);
  assert.deepStrictEqual([row(B).pay_type, row(B).pay_days, row(B).earned, row(B).pf, row(B).esic, row(B).pt, row(B).net], ['daily', 1, 500, 0, 4, 0, 496]);
  assert.match(row(C).problem, /No approved salary/); assert.deepStrictEqual([p.totals.gross, p.totals.net], [2600, 1756]);
  // the lock: said who cannot be paid; then without him – everything in one piece
  await no(ACT.payLock(uQ, { month }), new RegExp('1 people cannot be paid.*' + C.code), 400); await no(ACT.payLock(aQ, { month, without: true }), /only for the HO HR/, 403);
  p = await ACT.payLock(uQ, { month, without: true }); assert.deepStrictEqual([p.locked.by, p.locked.people, p.rows.length, p.totals.net, row(A).net, row(A).advance_left_before], ['user@rig.test', 2, 2, 1756, 1260, 1000]);
  await no(ACT.payLock(uQ, { month, without: true }), /already locked/, 409); await no(ACT.payAdjust(uQ, { month, id: A.id, other_ded: '50', ded_note: 'late fine' }), /is locked – nothing of it is changed/, 409);
  ad = await ACT.advList(uQ); assert.deepStrictEqual([ad.rows[0].recovered, ad.rows[0].left, ad.rows[0].status], [400, 600, 'active']);
  await no(ACT.advClose(uQ, { id: ad.rows[0].id, reason: '' }), /Reason/, 400); ad = await ACT.advClose(uQ, { id: ad.rows[0].id, reason: 'paid back in cash' }); assert.deepStrictEqual([ad.rows[0].status, ad.rows[0].recovered], ['closed', 400]);
  // a changed setting does not touch the locked month; the database refuses a change of a payslip
  await ACT.paySettingsSave(uQ, { valid_from: month + '-01', pf_pct: '50' }); assert.strictEqual((await ACT.payList(uQ, { month })).rows.find(r => r.id === A.id).pf, 240);
  await no(db('PATCH', 'hr_payslips?employee_id=eq.' + A.id, { net: 1 }), /database|refused|permission/i); await no(db('DELETE', 'hr_pay_runs?site=eq.' + SQ), /database|refused|permission/i);
  // (12-11-2026) the locked month: one person's payslip to print, and the bank list – the HO HR only; an unlocked month has neither
  await no(ACT.payBank(aQ, { month }), /only for the HO HR/, 403); await no(ACT.paySlipOf(aQ, { month, id: A.id }), /only for the HO HR/, 403);
  await no(ACT.payBank(uQ, { month: today.slice(0, 7) }), /not locked yet/, 400);
  await db('POST', 'hr_employee_profile?on_conflict=employee_id', [{ employee_id: A.id, data: {}, secret: { bank_name: 'Rig Bank', bank_ifsc: 'RIGB0000001', bank_account: '000111222333', bank_holder: 'Roll One' }, updated_by: 'rig' }], 'resolution=merge-duplicates,return=minimal');
  const bk = await ACT.payBank(uQ, { month }), bA = bk.rows.find(r => r.code === A.code), bB = bk.rows.find(r => r.code === B.code);
  assert.deepStrictEqual([bk.rows.length, bk.total, bk.missing, bA.bank, bA.ifsc, bA.account, bA.net, bA.missing, bB.account, bB.missing, bB.net], [2, 1756, 1, 'Rig Bank', 'RIGB0000001', '000111222333', 1260, false, '', true, 496]);
  const ps = await ACT.paySlipOf(uQ, { month, id: A.id }); assert.deepStrictEqual([ps.employee.code, ps.employee.name, ps.slip.net, ps.slip.gross, ps.slip.deductions.map(l => l.label), ps.locked.by], [A.code, 'Roll One', 1260, 2100, ['PF', 'Profession Tax', 'Advance'], 'user@rig.test']);
  await no(ACT.paySlipOf(uQ, { month, id: C.id }), /no payslip in that month/, 404);
  const bLog = JSON.stringify(await db('GET', 'hr_audit?select=action,detail&site=eq.' + SQ + '&action=eq.Bank%20list%20taken')); assert.ok(/Bank list taken/.test(bLog) && !/000111222333|RIGB0000001/.test(bLog), 'that the list was taken is written – never a number');
  // his own payslip – only his
  const mine = await ACT.mySlips({ site: SQ, email: mail('roll1'), name: 'x', role: 'self', info: {} });
  assert.deepStrictEqual([mine.slips.length, mine.slips[0].month, mine.slips[0].net, mine.slips[0].gross, mine.slips[0].earnings.map(l => l.label), mine.slips[0].deductions.map(l => l.label + ' ' + l.amount)], [1, month, 1260, 2100, ['Earned pay', 'arrear of last month'], ['PF 240', 'Profession Tax 200', 'Advance 400']]);
  assert.strictEqual((await ACT.mySlips({ site: SQ, email: mail('roll3'), name: 'x', role: 'self', info: {} })).slips.length, 0);
  await ACT.paySettingsSave(uQ, { valid_from: month + '-01' }); await ACT.hoSet(sQ, { email: 'user@rig.test', on: false });
  const log = JSON.stringify(await db('GET', 'hr_audit?select=action,detail&site=eq.' + SQ + '&action=like.*dvance*')); assert.ok(!/"1000"|:1000\b|400\b/.test(log), 'no amount of an advance in the audit');
});

test('(the phone\'s reminders) my attendance says the free days of the coming week: the weekly offs of the rules and the holidays – nothing else of the office', async () => {
  const SR = tag + 'R', aR = ses('admin', SR), D = require('../lib/day'), today = require('../lib/rules').today();
  const E = await ACT.empSave(aR, { name: 'Remind One', category: 'staff', mobile: mob(), email: mail('rem1'), dob: '1990-06-06', joined_on: '2024-01-01' });
  const me = { site: SR, email: mail('rem1'), name: 'x', role: 'self', info: {} };
  let a = await ACT.myAttend(me, { device_id: 'rig-rem-1' }); assert.deepStrictEqual([a.week_off, a.days_off, a.shift], [[], [], null]);
  await ACT.rulesSave(aR, { week_off: [0, 6] }); await ACT.holidaySave(aR, { day: D.addDays(today, 3), name: 'Rig day' }); await ACT.holidaySave(aR, { day: D.addDays(today, 20), name: 'Far day' });
  await ACT.shiftSave(aR, { name: 'General ' + SR, start_time: '08:30', end_time: '17:30', auto_out: '23:50', valid_from: '2026-01-01' });
  a = await ACT.myAttend(me, { device_id: 'rig-rem-1' });
  assert.deepStrictEqual([a.week_off, a.days_off, a.shift.start, a.shift.end, a.shift.auto_out], [[0, 6], [D.addDays(today, 3)], '08:30', '17:30', '23:50']);
});

test('(what comes up) the office\'s list: papers running out within 30 days or run out, birthdays and years at work of the coming week; a person sees his own', async () => {
  const SC = tag + 'C', aC = ses('admin', SC), D = require('../lib/day'), today = require('../lib/rules').today(), y = +today.slice(0, 4);
  const born = (y - 30) + D.addDays(today, 3).slice(4), joined = (y - 5) + today.slice(4);
  const E = await ACT.empSave(aC, { name: 'Coming One', category: 'driver', mobile: mob(), email: mail('com1'), dob: born, joined_on: joined });
  const F = await ACT.empSave(aC, { name: 'Coming Two', category: 'staff', mobile: mob(), email: mail('com2'), dob: (y - 40) + D.addDays(today, 60).slice(4), joined_on: '2024-01-01' });
  await db('POST', 'hr_employee_docs', [{ employee_id: E.id, kind: 'licence', title: '', number: 'RIG1', expires_on: D.addDays(today, 10), path: 'rig/' + tag + 'a.pdf', mime: 'application/pdf', bytes: 10, created_by: 'rig' },
    { employee_id: E.id, kind: 'other', title: 'Medical', number: '', expires_on: D.addDays(today, -2), path: 'rig/' + tag + 'b.pdf', mime: 'application/pdf', bytes: 10, created_by: 'rig' },
    { employee_id: F.id, kind: 'other', title: 'Far paper', number: '', expires_on: D.addDays(today, 90), path: 'rig/' + tag + 'c.pdf', mime: 'application/pdf', bytes: 10, created_by: 'rig' }], 'return=minimal');
  const c = await ACT.hrComing(aC);
  assert.deepStrictEqual(c.papers.map(p => [p.code, p.left]), [[E.code, -2], [E.code, 10]]); assert.match(c.papers[1].paper, /licen/i);
  assert.deepStrictEqual(c.days.map(d => [d.code, d.what, d.in, d.years || 0]), [[E.code, 'work', 0, 5], [E.code, 'birthday', 3, 0]]);
  await no(ACT.hrComing({ site: SC, email: mail('com1'), name: 'x', role: 'self', info: {} }), /HR office only/, 403);
  const me = await ACT.myHr({ site: SC, email: mail('com1'), name: 'x', role: 'self', info: {} });
  assert.deepStrictEqual([me.coming.papers.map(p => p.left), me.coming.birthday, me.coming.work_years], [[-2, 10], false, 5]);
});

test('(13-11-2026) the employee sheet: the company\'s sheet adds people with ITS codes; a new one needs a mobile or an e-mail; the same code again CHANGES only the filled cells; pay only from the Admin, a salary only from the HO HR; the same columns come out', async () => {
  const SH = require('../lib/act_sheet'), c1 = 'RCL' + (((await db('GET', 'hr_numbers?select=next_no&kind=eq.emp')) || [{ next_no: 1 }])[0].next_no + 500 + Math.floor(Math.random() * 400)), c2 = 'M' + tag.slice(-4), c3 = '7' + String(Date.now()).slice(-5), m1 = mob(), m2 = mob(), m3 = mob(), des = 'Sheet Driver ' + tag;
  const pn = String(1000 + (Date.now() % 9000)), pan = k => 'ABCP' + k + pn + 'Z', uan = '1' + String(Date.now()).slice(-11), uan2 = '2' + String(Date.now()).slice(-11);
  // a designation says its category (the sheet has no Category column) – the HR Admin sets it; an HR User cannot
  let m = await ACT.masterSave(admin, { kind: 'designation', name: des, category: 'Driver' }); const d = m.designations.find(x => x.name === des); assert.strictEqual(d.category, 'driver');
  assert.strictEqual(m.designations.find(x => x.name === 'Desig ' + tag).category, 'staff', 'none set = Staff');
  await no(ACT.masterSave(admin, { kind: 'designation', id: d.id, name: des, category: 'boss' }), /Category: Staff, Operator, Driver or Labour/);
  const rows = [
    { _line: 2, company: 'Test Company Limited', branch: 'Branch ' + tag, project: 'Site A', uan: uan, name: 'Sheet One', code: c1.toLowerCase(), ctc: '25000', joined_on: '2024-04-01 00:00:00', employment_type: 'Permanent ' + tag, retained: '', sign_in: '00:00:00', sign_out: '00:00:00',
      pan: pan('A'), pf: 'Yes', probation_days: '0', esic_contribution_rate: '0', esic: 'No', esic_type: '', esic_deduction_rate: '0', pt: 'Yes', tds_type: 'NTDS', attach: '0', basic: '12000', pay_period: 'Monthly', annual_bonus: '0', deduct_income_tax: 'No', annual_medical: '0', annual_lta: '0', totals: '1',
      mobile: m1, email: '', designation: des, bank_name: 'Rig Bank', bank_ifsc: 'RIGB0001234', bank_account: '123456789012', bank_holder: 'Sheet One' },
    { _line: 3, company: 'Test Company Limited', branch: 'Branch ' + tag, project: 'Site A', name: 'Sheet Two', code: c2, ctc: '0', joined_on: '2025-01-15 00:00:00', pan: pan('B'), pf: 'No', esic: 'No', pt: 'No', email: mail('sheet2'), totals: '1' },
    { _line: 4, name: 'Sheet Nobody', code: c3, ctc: '18000', joined_on: '2026-02-01', pan: pan('C') },      // neither a mobile nor an e-mail
    { _line: 5, name: 'Sheet Bad', code: 'x', mobile: m1, pan: 'WRONG', pf: 'maybe', bank_ifsc: 'ABC', sign_in: '99:00' },
    { _line: 6, name: 'Sheet Twice', code: c2, mobile: m3 },
  ];
  // only looked at: nothing is saved
  let r = await ACT.sheetImport(sup, { rows: rows, check: 1 });
  assert.deepStrictEqual([r.checked, r.saved, r.rows, r.toAdd, r.toChange, r.faults], [true, 0, 5, 2, 0, 3]);
  const why = l => r.lines.find(x => x.line === l).why;
  assert.match(why(4), /Mobile or E-mail: a new employee needs one of them/);
  assert.match(why(5), /Employee Code: 2 to 20.*PAN: 10 letters.*Sign In: a time as HH:MM.*Bank IFSC Code: 11 letters.*Deduct PF: Yes or No.*Mobile is twice in the file \(line 2\)/);
  assert.match(why(6), /Employee Code is twice in the file \(line 3\)/);
  assert.ok(r.willMake.some(x => x === 'branch: Branch ' + tag) && r.willMake.some(x => x === 'employment_type: Permanent ' + tag)); assert.match(r.notes.join(' '), /monthly CTC of 1 employees becomes their approved salary/);
  assert.strictEqual(((await db('GET', 'hr_employees?select=id&code=in.("' + c1 + '","' + c2 + '")')) || []).length, 0);
  // saved by the Super Admin (he is the HO HR too): the codes of the sheet, the category of the designation, everything in its place
  r = await ACT.sheetImport(sup, { rows: rows });
  assert.deepStrictEqual([r.checked, r.added, r.changed, r.faults, r.salaries], [false, 2, 0, 3, 1]);
  const got = async code => ((await db('GET', 'hr_employees?select=*&code=eq.' + code)) || [])[0], e1 = await got(c1), e2 = await got(c2);
  // (18-11-2026) the new employees come back – the page asks the Portal for their sign-ins by itself
  assert.deepStrictEqual(r.people.map(x => x.code).sort(), [c1, c2].sort()); assert.deepStrictEqual(Object.keys(r.people[0]).sort(), ['code', 'email', 'id', 'mobile', 'name', 'site']); assert.ok(r.people.every(x => x.site === SITE && x.id));
  assert.deepStrictEqual([e1.site, e1.name, e1.category, e1.mobile, e1.joined_on, e1.designation_id, e1.status], [SITE, 'Sheet One', 'driver', m1, '2024-04-01', d.id, 'incomplete']);
  assert.deepStrictEqual([e2.category, e2.email, e2.mobile, e2.joined_on], ['staff', mail('sheet2'), '', '2025-01-15']);
  const pr = ((await db('GET', 'hr_employee_profile?select=data,secret&employee_id=eq.' + e1.id)) || [])[0], lists = (await ACT.listAll(admin)).lists;
  assert.deepStrictEqual([pr.data.company, pr.data.project, pr.data.sign_in, pr.data.probation_days, lists.branch.find(v => v.id === pr.data.branch).name, lists.employment_type.find(v => v.id === pr.data.employment_type).name], ['Test Company Limited', 'Site A', '00:00', 0, 'Branch ' + tag, 'Permanent ' + tag]);
  assert.deepStrictEqual([pr.secret.uan, pr.secret.bank_ifsc, pr.secret.bank_account, pr.secret.ctc_monthly, pr.secret.basic, pr.secret.tds_type, pr.secret.deduct_income_tax, pr.secret.pay_period], [uan, 'RIGB0001234', '123456789012', 25000, 12000, 'NTDS', false, 'Monthly']);
  assert.strictEqual(((await db('GET', 'hr_employee_private?select=pan&employee_id=eq.' + e1.id)) || [])[0].pan, pan('A'));
  assert.deepStrictEqual(((await db('GET', 'hr_pay_emp?select=pf,esic,pt&employee_id=eq.' + e1.id)) || [])[0], { pf: true, esic: false, pt: true });
  const sal = (await db('GET', 'hr_salaries?select=pay_type,amount,valid_from,status,decided_by&employee_id=eq.' + e1.id)) || [];
  assert.deepStrictEqual(sal.map(v => [v.pay_type, +v.amount, v.valid_from, v.status, v.decided_by]), [['monthly', 25000, '2024-04-01', 'approved', sup.email]], 'the month\'s CTC is his approved salary');
  assert.strictEqual(((await db('GET', 'hr_salaries?select=id&employee_id=eq.' + e2.id)) || []).length, 0, 'a CTC of 0 is no salary');
  // the counter of the codes made by themselves went past the sheet's RCL… code
  const next = await ACT.empSave(admin, { name: 'After Sheet', category: 'staff', mobile: mob() }); assert.ok(+/^RCL(\d+)$/.exec(next.code)[1] > +/^RCL(\d+)$/.exec(c1)[1], next.code);
  // the same code again CHANGES him: only the filled cells; an empty cell changes nothing; nothing is added a second time
  r = await ACT.sheetImport(sup, { rows: [{ _line: 2, code: c1, name: '', email: mail('sheet1'), dob: '05-03-1990', bank_holder: 'S One', ctc: '25000', pf: '' }, { _line: 3, code: c2, name: 'Sheet Two B', mobile: m2, uan: uan2 }] });
  assert.deepStrictEqual([r.added, r.changed, r.faults, r.salaries], [0, 2, 0, 0], 'the same salary is not set twice');
  const e1b = await got(c1), e2b = await got(c2), prb = ((await db('GET', 'hr_employee_profile?select=data,secret&employee_id=eq.' + e1.id)) || [])[0];
  assert.deepStrictEqual([e1b.id, e1b.name, e1b.mobile, e1b.email, e1b.dob, e1b.status, e1b.category, e1b.designation_id], [e1.id, 'Sheet One', m1, mail('sheet1'), '1990-03-05', 'pending', 'driver', d.id]);
  assert.deepStrictEqual([e2b.name, e2b.mobile, e2b.email], ['Sheet Two B', m2, mail('sheet2')]);
  assert.deepStrictEqual([prb.secret.bank_holder, prb.secret.bank_account, prb.secret.uan, prb.data.company], ['S One', '123456789012', uan, 'Test Company Limited']);
  assert.deepStrictEqual(((await db('GET', 'hr_pay_emp?select=pf,esic,pt&employee_id=eq.' + e1.id)) || [])[0], { pf: true, esic: false, pt: true }, 'an empty Deduct PF keeps the tick');
  // a mobile / PAN of another employee, an employee of another site, a person who left: refused with the line
  r = await ACT.sheetImport(sup, { rows: [{ _line: 2, code: c2, mobile: m1 }, { _line: 3, name: 'Sheet New', code: '', mobile: mob(), pan: pan('A') }], check: 1 });
  assert.match(r.lines.find(x => x.line === 2).why, new RegExp('Mobile already belongs to employee ' + c1)); assert.match(r.lines.find(x => x.line === 3).why, /PAN already belongs to another employee/);
  r = await ACT.sheetImport(ses('super', SITE2), { rows: [{ _line: 2, code: c1, name: 'Elsewhere' }], check: 1 }); assert.match(r.lines[0].why, new RegExp('is an employee of the site ' + SITE));
  // an HR User: the people yes, the pay columns no – and he is told; the HR Admin (not the HO HR): pay details kept, no salary
  const c4 = 'U' + tag.slice(-4), c5 = 'A' + tag.slice(-4);
  r = await ACT.sheetImport(user, { rows: [{ _line: 2, name: 'Sheet User', code: c4, mobile: mob(), ctc: '30000', pf: 'Yes', basic: '15000', uan: '3' + String(Date.now()).slice(-11) }] });
  assert.strictEqual(r.added, 1); assert.match(r.notes.join(' '), /pay columns .* were not read: only the HR Admin or the Super Admin/);
  const e4 = await got(c4), p4 = ((await db('GET', 'hr_employee_profile?select=secret&employee_id=eq.' + e4.id)) || [])[0];
  assert.ok(p4.secret.uan && p4.secret.ctc_monthly === undefined && p4.secret.basic === undefined); assert.strictEqual(((await db('GET', 'hr_pay_emp?select=pf&employee_id=eq.' + e4.id)) || []).length, 0);
  r = await ACT.sheetImport(admin, { rows: [{ _line: 2, name: 'Sheet Admin', code: c5, mobile: mob(), ctc: '30000', pf: 'Yes' }] });
  assert.deepStrictEqual([r.added, r.salaries], [1, 0]); assert.match(r.notes.join(' '), /kept as a detail only/);
  const e5 = await got(c5); assert.strictEqual(((await db('GET', 'hr_employee_profile?select=secret&employee_id=eq.' + e5.id)) || [])[0].secret.ctc_monthly, 30000); assert.strictEqual(((await db('GET', 'hr_salaries?select=id&employee_id=eq.' + e5.id)) || []).length, 0);
  // the pay details on his page: the Admin sees and saves them, an HR User is not told that they exist
  const pa = await ACT.profGet(admin, { id: e1.id }), pu = await ACT.profGet(user, { id: e1.id });
  assert.ok(pa.defs.groups.some(g => g.key === 'pay') && pa.secret.ctc_monthly === 25000); assert.ok(!pu.defs.groups.some(g => g.key === 'pay') && pu.secret.ctc_monthly === undefined && /^XXXX/.test(pu.secret.uan));
  await no(ACT.profSave(user, { id: e1.id, group: 'pay', data: { basic: 1 } }), /Only the HR Admin/, 403);
  assert.strictEqual((await ACT.profSave(admin, { id: e1.id, group: 'pay', data: Object.assign({}, pa.secret, { basic: '13000', deduct_income_tax: 'yes' }) })).secret.basic, 13000);
  assert.strictEqual(((await db('GET', 'hr_employee_profile?select=secret&employee_id=eq.' + e1.id)) || [])[0].secret.bank_account, '123456789012', 'the bank details stay beside the pay details');
  // OUT: the same columns; Yes / No as words; the salary that counts; for an HR User no pay and no secret number
  const out = await ACT.sheetExport(sup, { q: 'Sheet One' }), H = out.heads, cell = (row, h) => row[H.indexOf(h)], o1 = out.rows.find(x => cell(x, 'Employee Code') === c1);
  assert.deepStrictEqual(H, SH.COLS.map(c => c.head));
  assert.deepStrictEqual(['Name of Company', 'Branch Name', 'Current Project Name', 'UAN No.', 'Employee Name', 'Auto Monthly CTC', 'Date of Joining', 'Employee Status', 'Sign In', 'PAN', 'Deduct PF', 'Deduct ESIC', 'Deduct PT', 'TDS Type', 'Basic', 'Deduct Income Tax', 'Totals', 'Mobile', 'E-mail', 'Date of Birth', 'Designation', 'Bank IFSC Code', 'Bank Account Number'].map(h => cell(o1, h)),
    ['Test Company Limited', 'Branch ' + tag, 'Site A', uan, 'Sheet One', 25000, '01-04-2024', 'Permanent ' + tag, '00:00', pan('A'), 'Yes', 'No', 'Yes', 'NTDS', 13000, 'Yes', 1, m1, mail('sheet1'), '05-03-1990', des, 'RIGB0001234', '123456789012']);
  const ou = await ACT.sheetExport(user, { q: 'Sheet One' }), u1 = ou.rows[0];
  assert.deepStrictEqual(['Employee Name', 'Auto Monthly CTC', 'Basic', 'Deduct PF', 'UAN No.', 'Bank Account Number', 'Bank IFSC Code', 'PAN'].map(h => cell(u1, h)), ['Sheet One', '', '', '', '', '', 'RIGB0001234', '']); assert.strictEqual(ou.full, false);      // (Phase 1) no PAN for an HR User either
  // what came out goes in again without a fault and changes nothing
  const keys = SH.COLS.map(c => c.key), back = out.rows.map((row, i) => { const o = { _line: i + 2 }; keys.forEach((k, j) => { o[k] = row[j]; }); return o; });
  r = await ACT.sheetImport(sup, { rows: back, check: 1 }); assert.deepStrictEqual([r.faults, r.toAdd, r.toChange, r.same, r.changes], [0, 0, 0, back.length, []], JSON.stringify(r.lines));
  r = await ACT.sheetImport(sup, { rows: back }); assert.deepStrictEqual([r.added, r.changed, r.same, r.salaries], [0, 0, back.length, 0]); assert.deepStrictEqual((await got(c1)).updated_at, e1b.updated_at, 'nothing changed: he is not written again');
  /* (19-11-2026, asked: "ekda employee add zal tyach name rcl employe code te sagle changes krta yawet … export karel … changes krel mg
   * employee code aso ki baki gosti prt tich import krel tr je changes zalet tech updet hoil") the export's HR ID is the employee himself:
   * his CODE and NAME change from the file; only what differs is saved (and listed first); a changed date needs one reason */
  assert.strictEqual(H[H.length - 1], 'HR ID (do not change)'); assert.strictEqual(cell(o1, 'HR ID (do not change)'), e1.id);
  const nc = 'N' + tag.slice(-5), b1 = back.find(x => x.code === c1), m4 = mob();
  const edited = back.map(x => x === b1 ? Object.assign({}, x, { code: nc, name: 'Sheet One Renamed', mobile: m4, dob: '06-03-1990' }) : x);
  r = await ACT.sheetImport(sup, { rows: edited, check: 1 });
  assert.deepStrictEqual([r.faults, r.toAdd, r.toChange, r.same, r.needReason], [0, 0, 1, back.length - 1, true], JSON.stringify(r.lines));
  assert.deepStrictEqual(r.changes[0].what, ['Employee Code ' + c1 + ' → ' + nc, 'Employee Name: Sheet One → Sheet One Renamed', 'Mobile: ' + m1 + ' → ' + m4, 'Date of Birth: 05-03-1990 → 06-03-1990']);
  await no(ACT.sheetImport(sup, { rows: edited }), /Reason: the date of birth \/ joining date of 1 employees change/, 400);
  assert.strictEqual((await got(c1)).id, e1.id, 'nothing saved without the reason');
  r = await ACT.sheetImport(sup, { rows: edited, reason: 'Corrected from his Aadhaar card' }); assert.deepStrictEqual([r.added, r.changed, r.same], [0, 1, back.length - 1]);
  const e1c = await got(nc); assert.deepStrictEqual([e1c.id, e1c.name, e1c.mobile, e1c.dob, e1c.email, e1c.designation_id], [e1.id, 'Sheet One Renamed', m4, '1990-03-06', mail('sheet1'), d.id], 'the same employee – his new code, name, mobile, date');
  assert.strictEqual(await got(c1), undefined, 'the old code is nobody\'s now');
  const au2 = ((await db('GET', 'hr_audit?select=detail&site=eq.' + SITE + '&action=eq.Employee sheet imported&order=id.desc&limit=1')) || [])[0].detail;
  assert.deepStrictEqual([au2.codes, au2.reason, au2.same], [[[c1, nc]], 'Corrected from his Aadhaar card', back.length - 1]);
  // another employee's code, an HR ID that is nobody, the same HR ID twice: refused with the line
  const all = await ACT.sheetExport(sup, {}), rowOf = code => { const row = all.rows.find(x => x[H.indexOf('Employee Code')] === code), o = {}; keys.forEach((k, j) => { o[k] = row[j]; }); return o; }, b2 = rowOf(c2);
  assert.strictEqual(b2.hr_id, e2.id);
  const whole = all.rows.map((x, i) => { const o = { _line: i + 2 }; keys.forEach((k, j) => { o[k] = x[j]; }); return o; });
  r = await ACT.sheetImport(sup, { rows: whole.map(x => x.code === c2 ? Object.assign({}, x, { name: 'Sheet Two C' }) : x) });
  assert.deepStrictEqual([r.faults, r.added, r.changed, r.same], [0, 0, 1, whole.length - 1], JSON.stringify(r.lines)); assert.strictEqual((await got(c2)).name, 'Sheet Two C');
  assert.strictEqual((await got(nc)).updated_at, e1c.updated_at, 'the whole site\'s file: only the one changed is written');
  r = await ACT.sheetImport(sup, { rows: [Object.assign({}, b2, { _line: 2, code: nc }), Object.assign({}, b2, { _line: 3, hr_id: '00000000-0000-4000-8000-000000000000' }), Object.assign({}, b1, { _line: 4, code: nc }), Object.assign({}, b1, { _line: 5, code: nc })], check: 1 });
  assert.match(r.lines.find(x => x.line === 2).why, new RegExp('Employee Code ' + nc + ' already belongs to another employee')); assert.match(r.lines.find(x => x.line === 3).why, /HR ID: not an employee of HR/); assert.match(r.lines.find(x => x.line === 5).why, /HR ID is twice in the file \(line 4\)/);
  // a row without the HR ID (an old file): found by its code, as before
  r = await ACT.sheetImport(sup, { rows: [{ _line: 2, code: nc, name: 'Sheet One Again' }], check: 1 }); assert.deepStrictEqual([r.toAdd, r.toChange, r.changes[0].what], [0, 1, ['Employee Name: Sheet One Renamed → Sheet One Again']]);
  // the format: the headings, no row; the audit holds no number
  const f = await ACT.sheetExport(user, { template: 1 }); assert.deepStrictEqual([f.heads.length, f.rows.length], [SH.COLS.length, 0]);
  const au = JSON.stringify((await db('GET', 'hr_audit?select=action,detail&site=eq.' + SITE + '&action=like.Employee sheet*')) || []);
  assert.ok(au.includes('Employee sheet imported') && au.includes('Employee sheet exported')); for (const n of [uan, pan('A'), '123456789012', '25000', m1]) assert.ok(!au.includes(n), 'not in the audit: ' + n);
  await no(ACT.sheetImport(ses('self'), { rows: back }), /HR office only/, 403);
});

test('(13-11-2026) a sign-in for everybody at once: the Super Admin, or an HR Admin he gave the power (off until then); the people with an e-mail or a mobile number; the user ID of a mobile-only employee is kept and "My HR" finds him by it', async () => {
  const S3 = tag + 'S', s = r => ses(r, S3), m1 = mob(), m2 = mob();
  const a = await ACT.empSave(s('admin'), { name: 'Signin Mobile', category: 'driver', mobile: m1 }), b = await ACT.empSave(s('admin'), { name: 'Signin Mail', category: 'staff', email: mail('signin.b'), dob: '01-01-1990' }), c = await ACT.empSave(s('admin'), { name: 'Signin Nothing', category: 'labour' });
  assert.deepStrictEqual([a.status, a.missing, b.status, c.missing], ['incomplete', ['Date of birth'], 'pending', ['Date of birth', 'Mobile or e-mail']], 'an e-mail OR a mobile number is enough');
  // who may: the power is OFF for an HR Admin until the Super Admin gives it; an HR User never
  assert.strictEqual((await ACT.init(s('admin'))).signin, false); assert.strictEqual((await ACT.init(s('super'))).signin, true);
  await no(ACT.signinPeople(s('admin')), /has not given the HR Admin this power on this site \(Give a sign-in to every employee at once\)/, 403); await no(ACT.signinPeople(s('user')), /Only the HR Admin or the Super Admin/, 403);
  await ACT.powerSet(s('super'), { power: 'signin', allowed: true }); assert.strictEqual((await ACT.init(s('admin'))).signin, true);
  const p = await ACT.signinPeople(s('admin'));
  assert.deepStrictEqual([p.people.map(x => [x.code, x.email, x.mobile, x.known]), p.without], [[[a.code, '', m1, ''], [b.code, mail('signin.b'), '', '']].sort((x, y) => (x[0] < y[0] ? -1 : 1)), 1]);
  // what the Portal answered: only a user ID made of a mobile number is kept, for an employee of this site, one employee a user
  let r = await ACT.signinLinked(s('admin'), { rows: [{ id: a.id, portal: m1 + '@mobile.id' }, { id: b.id, portal: mail('signin.b') }, { id: c.id, portal: 'someone@else.example' }, { id: b.id, portal: m1 + '@mobile.id' }] });
  assert.strictEqual(r.linked, 1); assert.strictEqual((await ACT.empGet(s('admin'), { id: a.id })).employee.portal_email, m1 + '@mobile.id'); assert.strictEqual((await ACT.empGet(s('admin'), { id: b.id })).employee.portal_email, '');
  await no(ACT.signinLinked(s('user'), { rows: [{ id: a.id, portal: m1 + '@mobile.id' }] }), /Only the HR Admin/, 403);
  assert.strictEqual((await ACT.signinPeople(s('super'))).people.find(x => x.code === a.code).known, m1 + '@mobile.id');
  // "My HR": the sign-in whose user ID is his number IS this employee – also after HR changed his number
  const self = { site: S3, email: m1 + '@mobile.id', name: 'Signin Mobile', role: 'self', info: { sites: [] } };
  assert.strictEqual((await ACT.myHr(self, {})).employee.code, a.code);
  await ACT.empSave(s('admin'), { id: a.id, name: 'Signin Mobile', category: 'driver', mobile: m2 }); assert.strictEqual((await ACT.myHr(self, {})).employee.code, a.code);
  await no(ACT.myHr({ site: S3, email: m2 + '@mobile.id', name: 'X', role: 'self', info: { sites: [] } }, {}), /is not in the Employee Master/, 403);
});

test('(13-11-2026) masters: one not in use is deleted (written down), one in use is refused; the usual list only adds what is missing; an employee\'s page in one reading; "Not available"; the sheet-only times survive a save', async () => {
  // delete: an HR User cannot; in use → 409; not in use → gone
  let m = await ACT.masterSave(admin, { kind: 'department', name: 'Del ' + tag }); const d = m.departments.find(x => x.name === 'Del ' + tag);
  m = await ACT.masterSave(admin, { kind: 'designation', name: 'DelG ' + tag, category: 'driver' }); const g = m.designations.find(x => x.name === 'DelG ' + tag); assert.strictEqual(g.category, 'driver');
  await no(ACT.masterDelete(user, { kind: 'department', id: d.id }), /Only the HR Admin/, 403);
  const e = await ACT.empSave(admin, { name: 'Master User', category: 'staff', mobile: mob(), department_id: d.id });
  await no(ACT.masterDelete(admin, { kind: 'department', id: d.id }), /is in use \(1 employee.*Switch it off/, 409);
  await ACT.empSave(admin, { id: e.id, name: 'Master User', category: 'staff', mobile: e.mobile || (await ACT.empGet(admin, { id: e.id })).employee.mobile, department_id: '' });
  const still = await ACT.masterDelete(admin, { kind: 'department', id: d.id }).then(() => 'gone', x => x.message);      // his history may still name it – then it stays, switched off by hand
  assert.ok(still === 'gone' || /in the history/.test(still), still);
  m = await ACT.masterDelete(admin, { kind: 'designation', id: g.id }); assert.strictEqual(m.deleted, 'DelG ' + tag); assert.ok(!m.designations.some(x => x.id === g.id));
  assert.ok(((await db('GET', 'hr_audit?select=action&action=eq.Master%20deleted&target=eq.' + encodeURIComponent('designation DelG ' + tag))) || []).length === 1, 'written down');
  await no(ACT.masterDelete(admin, { kind: 'designation', id: g.id }), /Not found/, 404); await no(ACT.masterDelete(admin, { kind: 'nothing', id: g.id }), /Unknown list/);
  // the usual list: adds; a second time adds nothing; nothing of before is changed
  await no(ACT.masterSeed(user, {}), /Only the HR Admin/, 403);
  const before = await ACT.init(admin), s1 = await ACT.masterSeed(admin, {}), s2 = await ACT.masterSeed(admin, {});
  assert.deepStrictEqual(s2.added, { departments: 0, designations: 0 }); assert.strictEqual(s1.departments.length, before.departments.length + s1.added.departments); assert.strictEqual(s1.designations.length, before.designations.length + s1.added.designations);
  for (const x of before.designations) assert.deepStrictEqual(s2.designations.find(y => y.id === x.id), x, 'as it was');
  const tip = s2.designations.find(x => x.name === 'Tipper Driver'), exc = s2.designations.find(x => x.name === 'Grader Operator'); assert.ok(tip && tip.category === 'driver' && exc && exc.category === 'operator');
  // an employee's page: the four readings in one; an HR User gets what he may see; another site's person is refused as before
  const pg = await ACT.empPage(user, { id: E1.id }); assert.strictEqual(pg.emp.employee.id, E1.id); assert.ok(Array.isArray(pg.emp.history) && pg.around && Array.isArray(pg.around.places) && pg.prof && pg.prof.complete && pg.prof.defs.groups.length >= 3);
  assert.deepStrictEqual(pg.emp, await ACT.empGet(user, { id: E1.id })); assert.deepStrictEqual(pg.prof.complete, (await ACT.profGet(user, { id: E1.id })).complete);
  await assert.rejects(ACT.empPage(ses('user', SITE2), { id: E1.id }));
  // "Not available": kept as NA, counts as filled; an amount or a list refuses it; the page is told which boxes may have the tick
  const job = pg.prof.defs.groups.find(x => x.key === 'job'), prf = pg.prof.defs.groups.find(x => x.key === 'profile');
  assert.ok(!job.fields.some(f => /^sign_(in|out)$/.test(f.key)), 'the times are not on the page'); assert.ok(prf.fields.find(f => f.key === 'cug').na && !job.fields.find(f => f.key === 'notice_days').na);
  const was = pg.prof.complete.filled; let p = await ACT.profSave(admin, { id: E1.id, group: 'profile', data: Object.assign({}, pg.prof.data, { cug: 'Not available', official_email: 'NA' }) });
  assert.strictEqual(p.data.cug, 'NA'); assert.strictEqual(p.data.official_email, 'NA'); assert.ok(p.complete.filled >= was + (pg.prof.data.cug ? 0 : 1));
  await no(ACT.profSave(admin, { id: E1.id, group: 'job', data: { notice_days: 'NA' } }), /Notice period/);
  // the times of the Excel sheet are kept when the Job tab is saved from the page (which does not send them)
  await db('PATCH', 'hr_employee_profile?employee_id=eq.' + E1.id, { data: Object.assign({}, p.data, { sign_in: '09:05', sign_out: '18:00' }) }, 'return=minimal');
  p = await ACT.profSave(admin, { id: E1.id, group: 'job', data: { notice_days: '15' } }); assert.deepStrictEqual([p.data.sign_in, p.data.sign_out, p.data.notice_days], ['09:05', '18:00', 15]);
  const out = await ACT.sheetExport(admin, {}).catch(x => ({ err: x.message })); assert.ok(!out.err, out.err);      // the export still works with "NA" and the times in a profile
});

/* ───────────── step 14 (18-11-2026, Phase 1 of the enterprise HRMS): security ───────────── */
const http14 = require('http'), store = require('../lib/store');
// a stand-in of the e-mail service on this computer: what HR sends is kept here (nothing leaves the computer)
async function mailStandIn() {
  const got = []; const srv = http14.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { const j = JSON.parse(b || '{}'); got.push({ path: req.url, auth: req.headers.authorization, body: j });
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(Array.isArray(j) ? { data: j.map((_, i) => ({ id: 'm' + i })) } : { id: 'm1' })); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); return { got: got, base: 'http://127.0.0.1:' + srv.address().port, close: () => new Promise(r => srv.close(r)) };
}
test('(step 14) a bank change waits for a second person: the old account stays; the HO HR or the Super Admin approves – never who asked, never the employee himself; the employee is told; the sheet too; no number in the audit or the e-mail', async () => {
  const S = tag + 'Q', site = [{ code: S, name: 'Rig bank' }], A = ses('admin', S), U = ses('user', S), SU = ses('super', S);
  const ho = { site: S, email: ('ho.' + tag + '@rig.test').toLowerCase(), name: 'Rig HO', role: 'user', info: { sites: site } };
  await ACT.hoSet(SU, { email: ho.email, on: true });
  const e = await ACT.empSave(U, { name: 'Bank Rig', category: 'staff', mobile: mob(), email: mail('bank'), dob: '1990-01-01' });
  // the Super Admin's change counts at once (written down all the same)
  let p = await ACT.profSave(SU, { id: e.id, group: 'secret', data: { bank_account: '111122223333', bank_ifsc: 'SBIN0001234', bank_name: 'Rig Bank' } });
  assert.deepStrictEqual([p.secret.bank_account, p.bank.applied, p.bank.waiting, p.bank_wait], ['111122223333', 1, 0, null]);
  // an HR User types a new account (and a UAN): the UAN is saved, the account WAITS – the old one stays in use
  p = await ACT.profSave(U, { id: e.id, group: 'secret', data: { bank_account: '444455556666', bank_ifsc: 'SBIN0001234', bank_name: 'Rig Bank', uan: '123412341234' } });
  assert.deepStrictEqual([p.bank.waiting, p.secret.bank_account, p.secret.uan, p.bank_wait.account, p.bank_wait.can], [1, 'XXXX3333', 'XXXX1234', 'XXXX6666', false], 'the old account stays; the HR User sees the new one masked and cannot approve');
  let g = await ACT.profGet(A, { id: e.id }); assert.deepStrictEqual([g.secret.bank_account, g.bank_wait.account, g.bank_wait.can], ['111122223333', '444455556666', false], 'the HR Admin sees it whole – approving is the HO HR\'s');
  let w = (await ACT.bankList(A, {})).rows.find(r => r.employee_id === e.id);
  assert.deepStrictEqual([w.status, w.old_last4, w.new_last4, w.source, w.can, w.told.length, w.told[0].sent, w.told[0].what], ['waiting', '3333', '6666', 'form', false, 1, false, 'asked']);
  assert.match(w.told[0].why, /not set up/, 'no e-mail service: written down, nothing pretends');
  await no(ACT.bankDecide(U, { ids: [w.id], ok: true }), /Only the HO HR or the Super Admin/, 403); await no(ACT.bankDecide(A, { ids: [w.id], ok: true }), /Only the HO HR or the Super Admin/, 403);
  await no(ACT.bankDecide(ho, { ids: [w.id], ok: false }), /write why it is refused/); await no(ACT.bankList(self(mail('bank'), S), {}), /HR office only/, 403);
  let d = await ACT.bankDecide(ho, { ids: [w.id], ok: true }); assert.deepStrictEqual([d.done, d.skipped], [1, []]);
  g = await ACT.profGet(A, { id: e.id }); assert.deepStrictEqual([g.secret.bank_account, g.secret.uan, g.bank_wait], ['444455556666', '123412341234', null], 'approved: the new account counts; nothing else changed');
  d = await ACT.bankDecide(ho, { ids: [w.id], ok: true }); assert.deepStrictEqual(d.skipped.map(x => x.why), ['It does not wait any more.']);
  // with the e-mail service: the employee is told – the last four digits only
  const M = await mailStandIn(), env0 = { k: process.env.RESEND_API_KEY, f: process.env.MAIL_FROM, b: process.env.RESEND_API_BASE };
  Object.assign(process.env, { RESEND_API_KEY: 're_rig_not_a_real_key', MAIL_FROM: 'RCL HR <hr@rig.test>', RESEND_API_BASE: M.base });
  try {
    p = await ACT.profSave(A, { id: e.id, group: 'secret', data: Object.assign({}, g.secret, { bank_account: '777788889999' }) });
    assert.deepStrictEqual([p.bank.waiting, p.bank.mailed], [1, 1]);
    const m1 = M.got[M.got.length - 1]; assert.strictEqual(m1.path, '/emails'); assert.deepStrictEqual(m1.body.to, [mail('bank')]); assert.strictEqual(m1.auth, 'Bearer re_rig_not_a_real_key');
    assert.match(m1.body.text, /XXXX9999/); assert.match(m1.body.text, /HO HR/); assert.match(m1.body.text, /मंजूर/); assert.ok(!/777788889999|444455556666/.test(JSON.stringify(m1.body)), 'never the whole number');
    // a newer request replaces the one that waits; refused with the reason – the account stays
    const first = p.bank_wait.id; p = await ACT.profSave(A, { id: e.id, group: 'secret', data: Object.assign({}, g.secret, { bank_account: '000011112222' }) });
    assert.notStrictEqual(p.bank_wait.id, first); assert.ok((await ACT.bankList(A, { status: 'replaced' })).rows.some(r => r.id === first), 'the older request is kept as replaced');
    d = await ACT.bankDecide(ho, { ids: [p.bank_wait.id], ok: false, note: 'Passbook not seen' }); assert.strictEqual(d.done, 1);
    assert.strictEqual((await ACT.profGet(A, { id: e.id })).secret.bank_account, '444455556666', 'refused: the account stays'); assert.match(M.got[M.got.length - 1].body.text, /refused/);
    // the employee sheet: the bank columns of an HR Admin wait too – nothing of them is saved
    const r = await ACT.sheetImport(A, { rows: [{ _line: 2, code: e.code, bank_account: '555566667777', bank_holder: 'Bank Rig' }] });
    assert.deepStrictEqual([r.changed, r.bank.waiting], [1, 1]); assert.match(r.notes.join(' '), /waits for the HO HR \/ Super Admin/);
    assert.strictEqual((await ACT.profGet(A, { id: e.id })).secret.bank_account, '444455556666');
    assert.strictEqual((await ACT.bankList(A, {})).rows.find(x => x.employee_id === e.id).source, 'sheet');
    // many at once: one call to the e-mail service (Resend's batch) – the Super Admin approves
    const e2 = await ACT.empSave(U, { name: 'Bank Two', category: 'staff', mobile: mob(), email: mail('bank2'), dob: '1990-01-01' });
    await ACT.profSave(U, { id: e2.id, group: 'secret', data: { bank_account: '121212121212', bank_ifsc: 'SBIN0001234' } });
    const ids = (await ACT.bankList(A, {})).rows.map(x => x.id), before = M.got.length;
    d = await ACT.bankDecide(SU, { ids: ids, ok: true }); assert.deepStrictEqual([d.done, d.mailed], [2, 2]); assert.strictEqual(M.got.length, before + 1); assert.strictEqual(M.got[M.got.length - 1].path, '/emails/batch');
  } finally { ['RESEND_API_KEY', 'MAIL_FROM', 'RESEND_API_BASE'].forEach((k, i) => { const v = [env0.k, env0.f, env0.b][i]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }); await M.close(); }
  // the HO HR's own request, and his own account: another person approves
  const hoEmp = await ACT.empSave(U, { name: 'Ho Rig', category: 'staff', mobile: mob(), email: ho.email, dob: '1985-01-01' });
  await ACT.profSave(ho, { id: e.id, group: 'secret', data: { bank_account: '989898989898', bank_ifsc: 'SBIN0001234' } });
  await ACT.profSave(U, { id: hoEmp.id, group: 'secret', data: { bank_account: '565656565656', bank_ifsc: 'SBIN0001234' } });
  const two = (await ACT.bankList(ho, {})).rows; assert.ok(two.length === 2 && two.every(x => x.can === false), 'nothing of these two is his to approve');
  d = await ACT.bankDecide(ho, { ids: two.map(x => x.id), ok: true }); assert.deepStrictEqual([d.done, d.skipped.map(x => x.why).sort()], [0, ['It is your own bank account – another person approves it.', 'You asked it – another person approves it.']]);
  // the audit: who asked and approved – never a number
  const au = JSON.stringify((await db('GET', 'hr_audit?select=action,detail&site=eq.' + S + '&action=like.Bank*')) || []);
  assert.ok(au.includes('Bank details change asked') && au.includes('Bank details change approved') && au.includes('Bank details change refused'));
  for (const n of ['111122223333', '444455556666', '777788889999', '000011112222', '555566667777']) assert.ok(!au.includes(n), 'no number in the audit: ' + n);
});

test('(step 14) nobody decides his own: his own day, his own request, his own phone – another person of the HR office; the Super Admin may', async () => {
  const S = tag + 'O', me = { site: S, email: ('own.' + tag + '@rig.test').toLowerCase(), name: 'Rig own', role: 'admin', info: { sites: [{ code: S, name: 'Rig own' }] } }, other = ses('admin', S), SU = ses('super', S);
  const E = await ACT.empSave(other, { name: 'Own Rig', category: 'staff', mobile: mob(), email: me.email, dob: '1990-01-01' });
  const day = D.addDays(RU.today(), -2), day3 = D.addDays(RU.today(), -3);
  await no(ACT.daySet(me, { id: E.id, day: day, in_time: '09:00', out_time: '18:00', reason: 'Forgot the phone' }), /This is about you: you cannot set a day of attendance for yourself/, 403);
  await ACT.daySet(other, { id: E.id, day: day, in_time: '09:00', out_time: '18:00', reason: 'Forgot the phone' });
  await ACT.regAsk(Object.assign({}, me, { role: 'self' }), { day: day3, in_time: '09:00', out_time: '18:00', reason: 'Phone was off' });
  const q = (await ACT.regList(other, {})).rows.find(r => r.day === day3);
  await no(ACT.regDecide(me, { id: q.id, decision: 'approved' }), /cannot decide this request for yourself/, 403);
  await ACT.regDecide(other, { id: q.id, decision: 'approved' });
  const dev = (await db('POST', 'hr_devices', [{ employee_id: E.id, device_id: 'own-phone-' + tag, model: 'Own Phone' }], 'return=representation'))[0];
  await no(ACT.devRelease(me, { id: dev.id, reason: 'New phone' }), /cannot release the attendance phone of yourself/, 403);
  await ACT.devRelease(SU, { id: dev.id, reason: 'New phone' });      // the Super Admin may
});

test('(step 14) the face: the consent words come from the server with their version; with FACE_CONSENT_REQUIRED no registration without it; the consent is written down; when he leaves his face is erased and its pictures removed', async () => {
  const S = tag + 'F', A = ses('admin', S), em = mail('face14'), me = { site: S, email: em, name: 'Rig face', role: 'self', info: { sites: [] } };
  const FA = require('../api/face'), C = require('../lib/consent');
  const E = await ACT.empSave(A, { name: 'Face Rig', category: 'staff', mobile: mob(), email: em, dob: '1990-01-01' });
  const t = await FA.ACT.faceConsentText(me); assert.strictEqual(t.version, C.VERSION); assert.ok(t.text.en.points.length === t.text.mr.points.length && t.text.mr.points.length === t.text.hi.points.length);
  let st = await FA.ACT.faceState(me); assert.deepStrictEqual([st.consent.version, st.consent.given, st.consent.required], [C.VERSION, false, false]);
  const tok = (await FA.ACT.faceEnrolUrls(me)).token;
  await no(FA.ACT.faceEnrol(me, { token: tok, consent: { version: 'old', lang: 'mr' } }), /consent words changed/, 409);
  process.env.FACE_CONSENT_REQUIRED = 'true';
  try { await no(FA.ACT.faceEnrol(me, { token: tok }), /your consent is asked before your face is registered/, 400); } finally { delete process.env.FACE_CONSENT_REQUIRED; }
  await no(FA.ACT.faceEnrol(me, { token: tok, consent: { version: C.VERSION, lang: 'mr' }, device: { id: 'rig-face-phone' }, app: '3.134.0' }), /picture did not arrive/);      // the pictures were not sent – but he agreed
  const cs = (await db('GET', 'hr_face_consents?select=version,lang,device_id,app,given_by&employee_id=eq.' + E.id)) || [];
  assert.deepStrictEqual(cs, [{ version: C.VERSION, lang: 'mr', device_id: 'rig-face-phone', app: '3.134.0', given_by: em }]);
  st = await FA.ACT.faceState(me); assert.strictEqual(st.consent.given, true);
  assert.strictEqual((await FA.ACT.faceInfo(A, { id: E.id })).consents[0].current, true);
  // a registered face (as step 9 keeps it) – and its pictures in the private store
  const paths = ['faces/' + E.id + '/' + tok + '-front.jpg', 'faces/' + E.id + '/' + tok + '-left.jpg'];
  for (const pth of paths) { const u = await store.uploadUrl(pth); assert.ok((await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.from([0xff, 0xd8, 0xff, 9]) })).ok); }
  await db('POST', 'hr_faces', [{ employee_id: E.id, site: S, descriptors: [[0.1, 0.2], [0.3, 0.4]], photos: paths.map((pth, i) => ({ pose: ['front', 'left'][i], path: pth })), enrolled_by: em }], 'return=minimal');
  assert.ok(await store.link(paths[0], 60), 'the picture is there');
  const out = await ACT.empExit(A, { id: E.id, on: RU.today(), reason: 'Resigned' }); assert.deepStrictEqual(out.face, { rows: 1, pictures: 2 });
  const f = (await db('GET', 'hr_faces?select=descriptors,photos,active,reset_reason&employee_id=eq.' + E.id))[0];
  assert.deepStrictEqual([f.descriptors, f.photos, f.active, f.reset_reason], [[], [], false, 'Left – face template erased']);
  for (const pth of paths) assert.strictEqual(await store.link(pth, 60), '', 'the picture is removed: ' + pth);
  assert.ok(((await db('GET', 'hr_audit?select=action&site=eq.' + S + '&action=eq.' + encodeURIComponent('Face template erased'))) || []).length === 1);
});

test('(step 14) the phone\'s own key and the sealed server time: a copied phone id without the key is refused; an offline punch with a forged seal waits for review; a sealed one counts', async () => {
  const S = tag + 'K', A = ses('admin', S), em = mail('key14'), me = { site: S, email: em, name: 'Rig key', role: 'self', info: { sites: [] } };
  const E = await ACT.empSave(A, { name: 'Key Rig', category: 'staff', mobile: mob(), email: em, dob: '1990-01-01' });
  await ACT.placeSave(A, { name: 'Key Office ' + tag, kind: 'office', lat: HQ.lat, lng: HQ.lng, radius_m: 150, valid_from: '2026-01-01' });
  const key = require('crypto').randomBytes(32).toString('base64url'), dev = { id: 'rig-key-phone-' + tag, model: 'Key Phone', os: 'Android 15', key: key };
  const a = await ACT.myAttend(me, { device_id: dev.id }); assert.match(a.anchor_sig, /^[A-Za-z0-9_-]{32}$/, 'the server time comes sealed');
  // the first punch ties the phone AND its key
  let r = await ACT.punch(me, P({ client_id: await selfie(me, cid()), device: dev })); assert.strictEqual(r.punch.kind, 'in');
  const row = (await db('GET', 'hr_devices?select=key_hash&employee_id=eq.' + E.id + '&active=is.true'))[0]; assert.ok(/^[0-9a-f]{64}$/.test(row.key_hash) && row.key_hash !== key, 'only the fingerprint is kept');
  // checked once he switches it on (HR_DEVICE_KEY_REQUIRED=true): another phone that copied the id – without the key, or with another key – refused and noted
  process.env.HR_DEVICE_KEY_REQUIRED = 'true';
  try {
    await no(ACT.punch(me, P({ client_id: await selfie(me, cid()), kind: 'out', device: Object.assign({}, dev, { key: undefined }) })), /Update the app/, 403);
    await no(ACT.punch(me, P({ client_id: await selfie(me, cid()), kind: 'out', device: Object.assign({}, dev, { key: require('crypto').randomBytes(32).toString('base64url') }) })), /its key does not match/, 403);
  } finally { delete process.env.HR_DEVICE_KEY_REQUIRED; }
  const tries = (await db('GET', 'hr_device_tries?select=why&employee_id=eq.' + E.id)) || []; assert.deepStrictEqual(tries.map(x => x.why).sort(), ['no phone key', 'phone key does not match']);
  // not switched on: what works today keeps working – the same phone without a key (an old app) still punches
  r = await ACT.punch(me, P({ client_id: await selfie(me, cid()), kind: 'out', device: Object.assign({}, dev, { key: undefined }) })); assert.strictEqual(r.punch.kind, 'out');
  // offline: a forged seal waits for review; the server's own seal counts
  const now = Date.now(), back = 10 * 60000, base = a.now;
  const off = (over) => P(Object.assign({ device: dev, offline: true, kind: 'out', anchor_server: base, anchor_elapsed: 5000000, elapsed: 5000000 + (now - base) - back, at_device: new Date(now - back + 2000).toISOString() }, over));
  r = await ACT.punch(me, off({ client_id: await selfie(me, cid()), kind: 'in', anchor_sig: 'x'.repeat(32) })); assert.deepStrictEqual([r.punch.status], ['review']);
  const w = (await ACT.punchDay(A, { review: 1 })).punches.find(p => p.id === r.punch.id); assert.match(w.why.join(), /server time it names is not the server's/);
  r = await ACT.punch(me, off({ client_id: await selfie(me, cid()), kind: 'out', anchor_sig: a.anchor_sig, elapsed: 5000000 + (now - base) - back + 60000, at_device: new Date(now - back + 62000).toISOString() }));
  const fl = (await db('GET', 'hr_punches?select=flags&id=eq.' + r.punch.id))[0].flags; assert.ok(!JSON.stringify(fl).includes('server time'), 'the sealed time is accepted: ' + JSON.stringify(fl));
  assert.ok(Math.abs(Date.parse(r.punch.at) - (now - back + 60000)) < 3000, 'it counts for its own moment');
});

test('(step 14) the 90-day rule for punch photos: off until switched on; old photos removed, a held day and a punch waiting for review kept; written down; holds put and released with the reason', async () => {
  const S = tag + 'H', A = ses('admin', S), U = ses('user', S), RET = require('../lib/retention');
  const E = await ACT.empSave(A, { name: 'Hold Rig', category: 'staff', mobile: mob(), email: mail('hold14'), dob: '1990-01-01' });
  await no(ACT.holdSave(U, { id: E.id, from: '2026-01-01', to: '2026-01-31', reason: 'dispute' }), /Only the HR Admin or the Super Admin/, 403);
  await no(ACT.holdSave(A, { id: E.id, from: '2026-01-01', to: '2026-01-31', reason: 'x' }), /write why/);
  let h = await ACT.holdSave(A, { id: E.id, from: '2026-01-01', to: '2026-01-31', reason: 'Dispute about January' }); const hold = h.rows.find(x => x.employee_id === E.id);
  assert.deepStrictEqual([hold.on, hold.code], [true, E.code]);
  // three old photos: one in the held days, two not; a fresh one
  const put = async (name, at) => { const pth = E.id + '/' + name + '.jpg', u = await store.uploadUrl(pth, store.SELFIES); assert.ok((await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.from([0xff, 0xd8, 0xff, 1]) })).ok);
    await new Promise((res, rej) => require('child_process').exec('timeout 10 su postgres -c "psql -d rig_hr -tA -q -c \\"update storage.objects set created_at = \'' + at + '\' where bucket_id = \'hr-selfies\' and name = \'' + pth + '\'\\""', er => er ? rej(er) : res())); return pth; };
  const held = await put('held' + tag, '2026-01-15T06:00:00Z'), old1 = await put('old1' + tag, '2026-02-10T06:00:00Z'), old2 = await put('old2' + tag, '2026-03-01T06:00:00Z'), fresh = await put('fresh' + tag, new Date().toISOString());
  const rev = await put('rev' + tag, '2026-02-12T06:00:00Z');      // the photo of a punch that still waits for the HR Admin's review
  await db('POST', 'hr_punches', [{ employee_id: E.id, site: S, kind: 'in', day: '2026-02-12', at: '2026-02-12T06:00:00Z', lat: HQ.lat, lng: HQ.lng, inside: true, selfie_path: rev, client_id: 'rev' + tag + 'abcdefghij', offline: true, status: 'review' }], 'return=minimal');
  const env0 = process.env.SELFIE_RETENTION_ENABLED; delete process.env.SELFIE_RETENTION_ENABLED;
  try {
    let r = await RET.run(); assert.deepStrictEqual(r, { job: 'selfie_retention', off: true }); assert.ok(await store.link(old1, 60, store.SELFIES), 'off: nothing removed');
    process.env.SELFIE_RETENTION_ENABLED = 'true';
    r = await RET.run(); assert.strictEqual(r.days, 90); assert.ok(r.removed >= 2 && r.faults === 0, JSON.stringify(r));
    assert.deepStrictEqual(await Promise.all([held, old1, old2, fresh, rev].map(async pth => !!(await store.link(pth, 60, store.SELFIES)))), [true, false, false, true, true], 'held, fresh and under review kept; old removed');
    const run = (await db('GET', 'hr_job_runs?select=job,result&job=eq.selfie_retention&order=id.desc&limit=1'))[0]; assert.ok(run.result.removed >= 2 && !JSON.stringify(run).includes(E.id), 'counts only');
    // released: the next run removes it too
    h = await ACT.holdRelease(A, { hold: hold.id, reason: 'Dispute closed' }); assert.strictEqual(h.rows.find(x => x.id === hold.id).on, false);
    await no(ACT.holdRelease(A, { hold: hold.id, reason: 'again' }), /already released/, 409);
    r = await RET.run(); assert.ok(r.removed >= 1); assert.strictEqual(await store.link(held, 60, store.SELFIES), '');
    // the job's door: only with Vercel's secret
    const J = require('../api/jobs'), call = async (auth) => { let st = 0; await J({ method: 'GET', url: '/api/jobs?job=retention', headers: { authorization: auth } }, { setHeader() {}, end() {}, set statusCode(v) { st = v; } }); return st; };
    const c0 = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
    try { assert.strictEqual(await call('Bearer anything'), 401, 'no secret set: nothing runs'); process.env.CRON_SECRET = 'c'.repeat(24); assert.strictEqual(await call('Bearer wrong'), 401); assert.strictEqual(await call('Bearer ' + 'c'.repeat(24)), 200); }
    finally { if (c0 === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = c0; }
  } finally { if (env0 === undefined) delete process.env.SELFIE_RETENTION_ENABLED; else process.env.SELFIE_RETENTION_ENABLED = env0; }
});

/* ───────────── (18-11-2026) Phase 2 – step 15: the Employee Master, papers, reporting, places, insurance, policies, onboarding ───────────── */
const S15 = require('../lib/step15');
test('(step 15) 18 on the joining date; a changed birth / joining date of an employee of today needs the reason; an unchanged record of before stays as it is', async () => {
  const S = tag + 'G', A = ses('admin', S), today = require('../lib/rules').today(), y = +today.slice(0, 4);
  const young = (y - 18) + '-' + today.slice(5);      // 18 exactly today
  await no(ACT.empSave(A, { name: 'Young Rig', category: 'staff', mobile: mob(), dob: young, joined_on: (y - 1) + '-01-01' }), /under 18 on the joining date/);
  const e = await ACT.empSave(A, { name: 'Young Rig', category: 'staff', mobile: mob(), dob: young, joined_on: today });
  // an employee of today saved by the form of before (joined before he was 18): his record stays as it is while the dates are not changed
  await db('PATCH', 'hr_employees?id=eq.' + e.id, { joined_on: (y - 1) + '-01-01' }, 'return=minimal');
  const g = (await ACT.empGet(A, { id: e.id })).employee;
  await ACT.empSave(A, { id: e.id, name: 'Young Rig Two', category: 'staff', mobile: g.mobile, dob: g.dob, joined_on: g.joined_on });
  await no(ACT.empSave(A, { id: e.id, name: 'Young Rig Two', category: 'staff', mobile: g.mobile, dob: g.dob, joined_on: today }), /Reason: the joining date of this employee is changed/);
  await ACT.empSave(A, { id: e.id, name: 'Young Rig Two', category: 'staff', mobile: g.mobile, dob: g.dob, joined_on: today, change_reason: 'Joined later – the paper says so' });
  const au = (await db('GET', 'hr_audit?select=detail&site=eq.' + S + '&action=eq.Employee changed&order=id.desc&limit=1'))[0];
  assert.deepStrictEqual([au.detail.joined_on[1], au.detail.reason], [today, 'Joined later – the paper says so']);
});

test('(step 15) reporting managers with dates: the primary one is "Reports to"; no circle, not himself, not one who left, not his own; other roles; the history', async () => {
  const S = tag + 'R', A = ses('admin', S), U = ses('user', S);
  const boss = await ACT.empSave(A, { name: 'Boss Rig', category: 'staff', mobile: mob(), email: mail('boss15'), dob: '1980-01-01', joined_on: '2020-01-01' });
  const mid = await ACT.empSave(A, { name: 'Mid Rig', category: 'staff', mobile: mob(), dob: '1985-01-01', joined_on: '2020-01-01', reports_to: boss.id });
  const low = await ACT.empSave(A, { name: 'Low Rig', category: 'labour', mobile: mob(), dob: '1990-01-01', joined_on: '2021-01-01', reports_to: mid.id });
  // the form's "Reports to" is in the dated list too
  let g = await ACT.repGet(U, { id: low.id }); assert.deepStrictEqual([g.primary.code, g.now.length, g.now[0].role, g.now[0].primary_one], [mid.code, 1, 'primary', true]);
  // a circle: the boss cannot report to the one who reports to him (through Mid)
  await no(ACT.repSet(U, { id: boss.id, manager: low.id, role: 'primary' }), /Low Rig \(.*\) already reports to this employee \(through Mid Rig/);
  await no(ACT.empSave(A, { id: boss.id, name: 'Boss Rig', category: 'staff', mobile: (await ACT.empGet(A, { id: boss.id })).employee.mobile, email: mail('boss15'), dob: '1980-01-01', joined_on: '2020-01-01', reports_to: low.id }), /a circle is not allowed/);
  await no(ACT.repSet(U, { id: low.id, manager: low.id }), /cannot report to himself/);
  // the boss himself (signed in as boss15) cannot change his own reporting; another office person can
  const bossSes = ses('user', S); bossSes.email = mail('boss15');
  await no(ACT.repSet(bossSes, { id: boss.id, manager: mid.id, role: 'functional' }), /This is about you/, 403);
  await ACT.repSet(U, { id: low.id, manager: boss.id, role: 'functional', note: 'Quality checks' });
  await no(ACT.repSet(U, { id: low.id, manager: boss.id, role: 'functional' }), /already has this person/);
  // a new primary from today: the old one ends today, "Reports to" changes, the posting history gets a row
  await ACT.repSet(U, { id: low.id, manager: boss.id, role: 'primary' });
  g = await ACT.repGet(U, { id: low.id });
  assert.deepStrictEqual([g.primary.code, g.now.map(r => r.role).sort().join(), g.history.length, g.history[0].manager.code], [boss.code, 'functional,primary', 1, mid.code]);
  assert.strictEqual((await ACT.empGet(U, { id: low.id })).employee.reports_to, boss.id);
  // a person who left is not a manager
  const gone = await ACT.empSave(A, { name: 'Gone Rig', category: 'staff', mobile: mob(), dob: '1980-01-01', joined_on: '2020-01-01' });
  await ACT.empExit(A, { id: gone.id, on: require('../lib/rules').today(), reason: 'Resigned' });
  await no(ACT.repSet(U, { id: low.id, manager: gone.id, role: 'project' }), /not one who has left/);
  // ending the functional one – with the reason
  const fn = g.now.find(r => r.role === 'functional');
  await no(ACT.repEnd(U, { row: fn.id, reason: 'x' }), /Reason/);
  await ACT.repEnd(U, { row: fn.id, reason: 'Quality team closed' });
  g = await ACT.repGet(U, { id: low.id }); assert.deepStrictEqual(g.now.map(r => r.role), ['primary']); assert.match(g.history.find(r => r.role === 'functional').note, /Ended: Quality team closed/);
  // the picker: by designation / code; with the card
  const pk = await ACT.repPick(U, { q: 'Boss Rig', not: low.id }); assert.deepStrictEqual(pk.rows.map(r => [r.code, r.site]), [[boss.code, S]]);
  assert.deepStrictEqual(Object.keys(pk.rows[0]).sort(), ['category', 'code', 'department', 'designation', 'id', 'name', 'photo', 'site', 'status']);
});

test('(step 15) a work place given by name: from / up to and IN / OUT – only there he may mark that; saving the list of people again keeps them', async () => {
  const S = tag + 'W', A = ses('admin', S), em = mail('place15'), me = { site: S, email: em, name: 'Rig place', role: 'self', info: { sites: [] } };
  const E = await ACT.empSave(A, { name: 'Place Rig', category: 'staff', mobile: mob(), email: em, dob: '1990-01-01' });
  const other = await ACT.empSave(A, { name: 'Other Rig', category: 'staff', mobile: mob(), dob: '1990-01-01' });
  await ACT.placeSave(A, { name: 'Out Gate ' + tag, kind: 'office', lat: HQ.lat, lng: HQ.lng, radius_m: 150, valid_from: '2026-01-01', scope: 'people', people: [E.id] });
  const pl = (await ACT.placeList(A)).places.find(p => p.name === 'Out Gate ' + tag);
  let acc = await ACT.placeAccess(A, { employee_id: E.id }); assert.deepStrictEqual(acc.places.map(p => [p.name, p.can_in, p.can_out, p.counts, p.own]), [['Out Gate ' + tag, true, true, true, true]]);
  await no(ACT.placeAccessSet(A, { employee_id: E.id, place: pl.id, can_in: false, can_out: false, reason: 'test' }), /Choose IN, OUT or both/);
  await ACT.placeAccessSet(A, { employee_id: E.id, place: pl.id, can_in: false, can_out: true, reason: 'Only the exit gate' });
  const dev = { id: 'rig-place-phone-' + tag, model: 'Place Phone', os: 'Android 15' };
  await no(ACT.punch(me, P({ client_id: await selfie(me, cid()), device: dev })), /You may not mark IN at any of your work places/, 403);
  // the phone is told too (an older app ignores it – the server checks anyway)
  const att = await ACT.myAttend(me, { device_id: dev.id }); assert.deepStrictEqual([att.places[0].can_in, att.places[0].can_out], [false, true]);
  // the list of the place's people saved again (another person added): his row – and its IN / OUT – stays
  await ACT.placePerson(A, { employee_id: other.id, places: [pl.id] });
  acc = await ACT.placeAccess(A, { employee_id: E.id }); assert.deepStrictEqual([acc.places[0].can_in, acc.places[0].can_out], [false, true], 'kept');
  // dates: from tomorrow – today the place does not count for him (shown with why)
  const tm = new Date(Date.now() + 86400000 + 19800000).toISOString().slice(0, 10);
  await ACT.placeAccessSet(A, { employee_id: E.id, place: pl.id, can_in: true, can_out: true, from: tm, reason: 'Starts tomorrow' });
  acc = await ACT.placeAccess(A, { employee_id: E.id }); assert.deepStrictEqual([acc.places[0].counts, acc.places[0].from], [false, tm]);
  await no(ACT.punch(me, P({ client_id: await selfie(me, cid()), device: dev })), /No work place is set for you yet/, 403);
  await ACT.placeAccessSet(A, { employee_id: E.id, place: pl.id, can_in: true, can_out: true, reason: 'Back to every day' });
  const r = await ACT.punch(me, P({ client_id: await selfie(me, cid()), device: dev })); assert.strictEqual(r.punch.kind, 'in');
});

test('(step 15) papers: issued on, a newer one in place of the old (kept), the verification list – never his own; rejected = asked again; not applicable; a driver of any category needs his licence', async () => {
  const S = tag + 'D', A = ses('admin', S), U = ses('user', S), A2 = ses('admin', S); A2.email = 'admin2@rig.test';
  const E = await ACT.empSave(U, { name: 'Paper Rig', category: 'labour', mobile: mob(), email: mail('paper15'), dob: '1990-01-01' });
  const put = async (kind, extra) => { const body = Buffer.from('%PDF-1.4 rig ' + kind + Math.random()), u = await ACT.docUploadUrl(U, { id: E.id, kind: kind, type: 'application/pdf', bytes: body.length });
    assert.ok((await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body })).ok); return ACT.docAdd(U, Object.assign({ id: E.id, kind: kind, path: u.path, bytes: body.length }, extra || {})); };
  await no(put('aadhaar', { issued_on: '2999-01-01' }), /Issued on: it is in the future/);
  const a1 = await put('aadhaar', { issued_on: '2015-05-01', number: '1234' });
  let l = await ACT.docList(U, { id: E.id }); const d1 = l.docs.find(d => d.id === a1.id);
  assert.deepStrictEqual([d1.status, d1.issued_on, l.verify], ['submitted', '2015-05-01', true]);
  assert.deepStrictEqual(l.docsMissing, ['Photo', 'PAN card', 'Bank passbook / cancelled cheque']);
  // he drives for work: his driving licence too (whatever his category)
  await ACT.profSave(U, { id: E.id, group: 'job', data: { drives: true } });
  assert.ok((await ACT.docList(U, { id: E.id })).docsMissing.includes('Driving licence'));
  // not applicable (no PAN) – with the reason; only the HR Admin; then not asked
  await no(ACT.docNa(U, { id: E.id, kind: 'pan', reason: 'He has no PAN card' }), /Only the HR Admin or the Super Admin verifies papers/, 403);
  await no(ACT.docNa(A, { id: E.id, kind: 'aadhaar', reason: 'none at all' }), /He has this paper attached/);
  await ACT.docNa(A, { id: E.id, kind: 'pan', reason: 'He has no PAN card' });
  l = await ACT.docList(U, { id: E.id }); assert.ok(!l.docsMissing.includes('PAN card')); assert.deepStrictEqual(l.na.map(n => n.kind), ['pan']);
  // the list that waits; taken; verified – not by the person whose paper it is
  let q = await ACT.docQueue(A, { which: 'waiting' }); assert.deepStrictEqual(q.rows.map(r => [r.employee.code, r.kind, r.can]), [[E.code, 'aadhaar', true]]);
  assert.deepStrictEqual(await ACT.docTake(A, { ids: [a1.id] }), { taken: 1 });
  const selfAdmin = ses('admin', S); selfAdmin.email = mail('paper15');
  const own = await ACT.docVerify(selfAdmin, { ids: [a1.id], ok: true }); assert.deepStrictEqual([own.done, own.skipped.length], [0, 1]); assert.match(own.skipped[0], /your own/);
  await no(ACT.docVerify(A, { ids: [a1.id], ok: false, note: 'no' }), /Reason/);
  await ACT.docVerify(A, { ids: [a1.id], ok: false, again: true, note: 'The photo of the card is not readable' });
  l = await ACT.docList(U, { id: E.id }); assert.deepStrictEqual(l.docs.find(d => d.id === a1.id).status, 'rejected'); assert.ok(l.docsMissing.includes('Aadhaar card'), 'a rejected paper is not counted');
  // a newer one in its place: the old one stays, marked replaced; the new one is verified by another Admin
  await no(put('pan', { replaces: a1.id }), /only a paper of the same kind/);
  const a2 = await put('aadhaar', { replaces: a1.id, issued_on: '2015-05-01' });
  l = await ACT.docList(U, { id: E.id }); const old = l.docs.find(d => d.id === a1.id), nw = l.docs.find(d => d.id === a2.id);
  assert.deepStrictEqual([old.active, old.removed_reason, nw.replaces, nw.status], [false, 'Replaced by a newer paper', a1.id, 'submitted']);
  await ACT.docVerify(A2, { ids: [a2.id], ok: true });
  q = await ACT.docQueue(A, { which: 'verified' }); assert.deepStrictEqual(q.rows.map(r => [r.id, r.verified_by]), [[a2.id, 'admin2@rig.test']]);
  const ev = await ACT.docEvents(U, { id: E.id }); assert.deepStrictEqual(ev.rows.map(r => r.event).reverse(), ['uploaded', 'not_applicable', 'reupload_asked', 'uploaded', 'replaced', 'verified']);
  // the employee's own pages read the same list (My HR)
  const me = { site: S, email: mail('paper15'), name: 'Rig paper', role: 'self', info: { sites: [] } };
  assert.deepStrictEqual((await ACT.myHr(me)).docs.missing, (await ACT.docList(U, { id: E.id })).docsMissing);
  // his own list in the app: each paper's state; the caste certificate is the office's only
  const md = await ACT.myDocs(me); assert.ok(!md.kinds.some(k => k.key === 'caste')); assert.deepStrictEqual(md.docs.filter(d => d.kind === 'aadhaar').map(d => d.status), ['verified']);
  await no(ACT.myDocUploadUrl(me, { kind: 'caste', type: 'application/pdf', bytes: 10 }), /what kind of paper/, 400);
});

test('(step 15) the medical insurance: written by the office, verified by the HR Admin – not his own; a change sends it back; past its date it reads "expired"', async () => {
  const S = tag + 'N', A = ses('admin', S), U = ses('user', S);
  const E = await ACT.empSave(U, { name: 'Ins Rig', category: 'staff', mobile: mob(), email: mail('ins15'), dob: '1990-01-01' });
  assert.deepStrictEqual((await ACT.insGet(U, { id: E.id })).insurance.status, 'draft');
  await no(ACT.insSave(U, { id: E.id, applicable: true, provider: 'R' }), /Insurance company: needed\. Policy number: needed\. Expiry date/);
  await ACT.insSave(U, { id: E.id, applicable: true, provider: 'Rig Insurance', policy_no: 'pol-123', start_on: '2026-01-01', expires_on: '2027-01-01', sum_insured: '3,00,000' });
  let g = (await ACT.insGet(U, { id: E.id })).insurance; assert.deepStrictEqual([g.status, g.policy_no, +g.sum_insured], ['submitted', 'POL-123', 300000]);
  await no(ACT.insVerify(U, { id: E.id, ok: true }), /Only the HR Admin/, 403);
  const own = ses('admin', S); own.email = mail('ins15'); await no(ACT.insVerify(own, { id: E.id, ok: true }), /This is about you/, 403);
  await ACT.insVerify(A, { id: E.id, ok: true }); assert.strictEqual((await ACT.insGet(U, { id: E.id })).insurance.status, 'verified');
  await ACT.insSave(U, { id: E.id, applicable: true, provider: 'Rig Insurance', policy_no: 'POL-124', start_on: '2026-01-01', expires_on: '2027-01-01', sum_insured: '300000' });
  assert.strictEqual((await ACT.insGet(U, { id: E.id })).insurance.status, 'submitted', 'a change goes back for verification');
  await db('PATCH', 'hr_insurance?employee_id=eq.' + E.id, { expires_on: '2020-01-01', status: 'verified' }, 'return=minimal');
  assert.strictEqual((await ACT.insGet(U, { id: E.id })).insurance.status, 'expired');
});

test('(step 15) the company\'s policies: made and published only by the HO HR / Super Admin; a published version never changes; for whom; he accepts the version in force himself; a new version is asked again', async () => {
  const S = tag + 'CP', A = ses('admin', S), SU = ses('super', S), em = mail('pol15'), me = { site: S, email: em, name: 'Rig pol', role: 'self', info: { sites: [] } };
  const E = await ACT.empSave(A, { name: 'Pol Rig', category: 'driver', mobile: mob(), email: em, dob: '1990-01-01' });
  await no(ACT.cpSave(A, { title: 'Code of conduct ' + tag }), /Only the HO HR or the Super Admin/, 403);
  const p = await ACT.cpSave(SU, { title: 'Code of conduct ' + tag, category: 'Conduct', mandatory: true, scope: { sites: [S] } });
  const p2 = await ACT.cpSave(SU, { title: 'Office only ' + tag, scope: { sites: [S], categories: ['staff'] } });
  const v1 = await ACT.cpVersionSave(SU, { policy: p.id, body: 'Be on time. Wear the helmet.', effective_from: '2026-01-01' });
  await ACT.cpVersionSave(SU, { policy: p2.id, body: 'Staff only.', effective_from: '2026-01-01' });
  assert.deepStrictEqual((await ACT.myPolicies(me)).rows, [], 'a draft is not shown');
  await ACT.cpPublish(SU, { version: v1.id }); await no(ACT.cpPublish(SU, { version: v1.id }), /Only a draft is published/);
  const p2v = (await db('GET', 'hr_cpolicy_versions?select=id&policy_id=eq.' + p2.id))[0]; await ACT.cpPublish(SU, { version: p2v.id });
  let mine = (await ACT.myPolicies(me)).rows; assert.deepStrictEqual(mine.map(r => [r.title, r.version, !!r.accepted_at]), [['Code of conduct ' + tag, 1, false]], 'the staff-only one is not his (a driver)');
  assert.deepStrictEqual((await ACT.myHr(me)).policies, { pending: 1 }, 'his app shows what is still to accept');
  await no(ACT.myPolicyAccept(me, { version: mine[0].version_id }), /Tick "I have read and accept"/);
  await ACT.myPolicyAccept(me, { version: mine[0].version_id, read: true, device: { model: 'Rig Phone' } }); assert.deepStrictEqual((await ACT.myHr(me)).policies, { pending: 0 });
  assert.deepStrictEqual((await ACT.myPolicyAccept(me, { version: mine[0].version_id, read: true })).already, true);
  // the office sees who accepted; the list counts
  let ac = await ACT.cpAccepts(A, { policy: p.id }); assert.deepStrictEqual(ac.rows.map(r => [r.code, !!r.accepted_at, r.via]), [[E.code, true, 'app']]);
  const li = (await ACT.cpList(A)).rows.find(r => r.id === p.id); assert.deepStrictEqual([li.people, li.accepted, li.in_force.version], [1, 1, 1]);
  // version 2: asked again; the old acceptance stays
  const v2 = await ACT.cpVersionSave(SU, { policy: p.id, body: 'Be on time. Wear the helmet and the shoes.', effective_from: require('../lib/rules').today() });
  assert.strictEqual(v2.version, 2); await ACT.cpPublish(SU, { version: v2.id });
  mine = (await ACT.myPolicies(me)).rows; assert.deepStrictEqual([mine[0].version, !!mine[0].accepted_at], [2, false]);
  assert.strictEqual((await db('GET', 'hr_cpolicy_accepts?select=id&employee_id=eq.' + E.id)).length, 1, 'the acceptance of version 1 is kept');
  await assert.rejects(db('PATCH', 'hr_cpolicy_accepts?employee_id=eq.' + E.id, { via: 'web' }), /refused|could not/, 'an acceptance is never changed (the database refuses it)');
});

test('(18-11-2026, his correction) a company policy is of its own site: made for the site open at the top; listed, changed and asked only there – the Super Admin too; one made before for everybody is of the site it was made on; found nowhere – everybody, as before', async () => {
  const S = tag + 'CW', S2 = tag + 'CX', SU = ses('super', S), SU2 = ses('super', S2), A2 = ses('admin', S2), em = mail('polw'), me = { site: S2, email: em, name: 'Rig polw', role: 'self', info: { sites: [] } };
  await ACT.empSave(A2, { name: 'Polw Rig', category: 'driver', mobile: mob(), email: em, dob: '1990-01-01' });
  const p = await ACT.cpSave(SU, { title: 'Only here ' + tag, scope: { sites: [S2] } });
  assert.deepStrictEqual((await db('GET', 'hr_cpolicies?select=scope&id=eq.' + p.id))[0].scope, { sites: [S] }, 'the sites the page sends are not taken');
  const v = await ACT.cpVersionSave(SU, { policy: p.id, body: 'Site rules.', effective_from: '2026-01-01' }); await ACT.cpPublish(SU, { version: v.id });
  assert.ok((await ACT.cpList(SU)).rows.some(r => r.id === p.id), 'listed on its site'); assert.ok(!(await ACT.cpList(SU2)).rows.some(r => r.id === p.id), 'not on another site – the Super Admin too');
  await no(ACT.cpSave(SU2, { id: p.id, title: 'Only here ' + tag }), /of another site/, 403); await no(ACT.cpAccepts(A2, { policy: p.id }), /of another site/, 403);
  await no(ACT.cpVersionSave(SU2, { policy: p.id, body: 'x', effective_from: '2026-01-01' }), /of another site/, 403);
  assert.ok(!(await ACT.myPolicies(me)).rows.some(r => r.policy === p.id), 'a person of another site is not asked');
  // made before for everybody ({ all: true })
  const [old] = await db('POST', 'hr_cpolicies', [{ title: 'Old for all ' + tag, scope: { all: true }, created_by: 'old.' + tag.toLowerCase() + '@rig.test', created_at: '2026-11-10T10:00:00+05:30' }], 'return=representation');
  await db('POST', 'hr_cpolicy_versions', [{ policy_id: old.id, version: 1, body: 'Old.', effective_from: '2026-01-01', status: 'published', created_by: 'rig', published_by: 'rig', published_at: new Date().toISOString() }], 'return=minimal');
  try {
    assert.ok((await ACT.myPolicies(me)).rows.some(r => r.policy === old.id) && (await ACT.cpList(SU2)).rows.some(r => r.id === old.id), 'found nowhere: everybody, as before');
  } finally { await db('POST', 'hr_audit', [{ site: S, email: old.created_by, action: 'Company policy made', target: 'Old for all ' + tag, at: old.created_at }], 'return=minimal'); }
  assert.ok(!(await ACT.myPolicies(me)).rows.some(r => r.policy === old.id) && !(await ACT.cpList(SU2)).rows.some(r => r.id === old.id), 'made on the other site: not asked, not listed here');
  assert.deepStrictEqual((await ACT.cpList(SU)).rows.find(r => r.id === old.id).scope, { sites: [S] }, 'it is of the site it was made on');
  await ACT.cpSave(SU, { id: old.id, title: 'Old for all ' + tag, scope: {} });
  assert.deepStrictEqual((await db('GET', 'hr_cpolicies?select=scope&id=eq.' + old.id))[0].scope, { sites: [S] }, 'saved again: its site is written');
});

test('(18-11-2026, his problem: "user la email dile hote te original nhawate") an ERP user whose user ID is not his real e-mail: found by the e-mail he verified at the Portal, or by his mobile number – the link is kept; his real e-mail stays; never a guess', async () => {
  const S = tag + 'LK', A = ses('admin', S), m1 = mob(), m2 = mob();
  const E1 = await ACT.empSave(A, { name: 'Link Real', category: 'staff', mobile: m1, email: mail('real1'), dob: '1990-01-01' });
  const E2 = await ACT.empSave(A, { name: 'Link Mobile', category: 'staff', mobile: m2, email: mail('real2'), dob: '1990-01-01' });
  const fake1 = mail('erp1') .replace('@rig.test', '@rcl.erp'), fake2 = mail('erp2').replace('@rig.test', '@rcl.erp');
  const as = (email, info) => ({ site: S, email: email, name: 'Rig link', role: 'self', info: Object.assign({ sites: [] }, info || {}) });
  await no(ACT.myHr(as(fake1)), /is not in the Employee Master: ask the HR office to put your e-mail or your mobile number/, 403);
  assert.strictEqual((await ACT.myHr(as(fake1, { login: mail('real1') }))).employee.code, E1.code, 'found by the e-mail he verified at the Portal');
  const row1 = (await db('GET', 'hr_employees?select=email,portal_email&id=eq.' + E1.id))[0]; assert.deepStrictEqual([row1.email, row1.portal_email], [mail('real1'), fake1], 'the link is kept; his real e-mail stays');
  assert.strictEqual((await ACT.myHr(as(fake1))).employee.code, E1.code, 'the next time: at once, by the link');
  assert.strictEqual((await ACT.myHr(as(fake2, { mobile: m2 }))).employee.code, E2.code, 'found by his mobile number');
  assert.strictEqual((await db('GET', 'hr_employees?select=portal_email&id=eq.' + E2.id))[0].portal_email, fake2);
  assert.ok((await db('GET', 'hr_audit?select=id&action=eq.' + encodeURIComponent('Sign-in linked to the employee') + '&target=eq.' + encodeURIComponent(E2.code + ' Link Mobile'))).length === 1, 'written down');
  // his own e-mail as user ID: found as before, and the link is kept too (a later change of his e-mail does not lose him)
  const E4 = await ACT.empSave(A, { name: 'Link Same', category: 'staff', mobile: mob(), email: mail('same4'), dob: '1990-01-01' });
  assert.strictEqual((await ACT.myHr(as(mail('same4')))).employee.code, E4.code); assert.strictEqual((await db('GET', 'hr_employees?select=portal_email&id=eq.' + E4.id))[0].portal_email, mail('same4'));
});

test('(step 15) onboarding by a link: only its fingerprint is kept; he fills, attaches, verifies his e-mail by a code, accepts the policies, submits; sent back, corrected; approved – the employee is made with his papers, details, bank (approval) and acceptances; a resent link kills the old one', async () => {
  const S = tag + 'O', A = ses('admin', S), U = ses('user', S), SU = ses('super', S), base = 'http://rig.test/hr/';
  const ONB = require('../api/hr').ONB, PUB = ONB.PUB;
  const M = await mailStandIn(), env0 = { k: process.env.RESEND_API_KEY, f: process.env.MAIL_FROM, b: process.env.RESEND_API_BASE };
  Object.assign(process.env, { RESEND_API_KEY: 're_rig_not_a_real_key', MAIL_FROM: 'RCL HR <hr@rig.test>', RESEND_API_BASE: M.base });
  try {
    const pol = await ACT.cpSave(SU, { title: 'Joining policy ' + tag, mandatory: true, scope: { sites: [S] } }), pv = await ACT.cpVersionSave(SU, { policy: pol.id, body: 'Rules of the site.', effective_from: '2026-01-01' }); await ACT.cpPublish(SU, { version: pv.id });
    const em = mail('join15'), mo = mob(), Us = Object.assign({}, U, { origin: 'http://rig.test' });
    await no(ACT.invMake(Object.assign({}, U, { origin: 'http://evil.test' }), { base: base, prefill: { name: 'Join Rig', category: 'labour', mobile: mo, email: em } }), /not this server/);
    const inv = await ACT.invMake(Us, { base: base, days: 7, prefill: { name: 'Join Rig', category: 'labour', mobile: mo, email: em, joined_on: require('../lib/rules').today() } });
    assert.match(inv.link, /^http:\/\/rig\.test\/hr\/onboard\.html#t=[A-Za-z0-9_-]{43}$/); assert.strictEqual(inv.mail.sent, true);
    const token = inv.link.split('#t=')[1], row = (await db('GET', 'hr_invites?select=token_hash,status&id=eq.' + inv.id))[0];
    assert.ok(row.token_hash !== token && /^[0-9a-f]{64}$/.test(row.token_hash), 'only the fingerprint is kept'); assert.ok(M.got.some(g => JSON.stringify(g.body).includes(token)), 'the link went to his e-mail');
    await no(ACT.invMake(Us, { base: base, prefill: { name: 'Join Rig', category: 'labour', mobile: mo } }), /already open/, 409);
    await no(PUB.open({ t: 'x'.repeat(43) }), /not valid/, 404);
    // he opens and fills it
    let v = await PUB.open({ t: token }); assert.deepStrictEqual([v.name, v.status, v.docs_needed.join(), v.policies.length], ['Join Rig', 'in_progress', 'photo,aadhaar,pan,bank_passbook', 1]);
    await no(PUB.save({ t: token, data: { pin: '12' } }), /PIN code: 6 digits/);
    const data = { name: 'Join Rig', dob: '1995-06-15', mobile: mo, email: em, address_current: 'Camp, Rig town', emergency_name: 'Rig Parent', emergency_relation: 'father', emergency_mobile: mob(), aadhaar: '', pan: 'ABCDE' + String(Date.now()).slice(-4) + 'Z', bank_name: 'Rig Bank', bank_ifsc: 'SBIN0001234', bank_account: '99887766', bank_holder: 'Join Rig', city: 'Pune', pin: '411001' };
    await PUB.save({ t: token, data: data });
    await no(PUB.submit({ t: token, declare: true }), /Aadhaar number: needed\..*E-mail: verify it.*Paper: Photo.*Policy: read and accept/);
    // his papers – one he does not have, with why
    const up = async kind => { const body = Buffer.from('%PDF-1.4 join ' + kind), u = await PUB.uploadUrl({ t: token, kind: kind, type: 'application/pdf', bytes: body.length }); assert.ok((await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body })).ok); await PUB.docAdd({ t: token, kind: kind, path: u.path, bytes: body.length }); };
    await no(PUB.uploadUrl({ t: token, kind: 'caste', type: 'application/pdf', bytes: 10 }), /what kind of paper/, 400);
    for (const k of ['photo', 'aadhaar', 'bank_passbook']) await up(k);
    await PUB.docNa({ t: token, kind: 'pan', reason: 'Applied, not received yet' });
    // his e-mail: a code (only to the e-mail the code is for), five wrong ones stop it
    await PUB.emailCode({ t: token, email: em });
    const code = (JSON.stringify(M.got[M.got.length - 1].body).match(/code: (\d{6})/) || [])[1]; assert.ok(code, 'the code went to his e-mail');
    await no(PUB.emailVerify({ t: token, email: em, code: code === '000000' ? '111111' : '000000' }), /not right/);
    await PUB.emailVerify({ t: token, email: em, code: code });
    v = await PUB.open({ t: token }); assert.deepStrictEqual([v.email_verified, v.verified_email], [true, em]);
    await no(PUB.accept({ t: token, version: v.policies[0].version_id }), /Tick/); await PUB.accept({ t: token, version: v.policies[0].version_id, read: true, device: 'Rig browser' });
    await no(PUB.submit({ t: token, declare: true }), /Aadhaar number: needed/);
    const AAD = fakeAadhaar('8' + String(Date.now()).slice(-10)); await PUB.save({ t: token, data: Object.assign({}, data, { aadhaar: AAD }) });
    await no(PUB.submit({ t: token }), /What I have written is true/);
    await PUB.submit({ t: token, declare: true }, { headers: { 'x-forwarded-for': '10.0.0.9', 'user-agent': 'Rig browser' } });
    await no(PUB.save({ t: token, data: data }), /submitted – the HR office is checking it/, 409);
    // the office: the HR User sees the Aadhaar / PAN / account masked; only the HR Admin decides; sent back – he corrects – submits again
    let g = await ACT.invGet(U, { id: inv.id }); assert.deepStrictEqual([g.invite.status, g.data.aadhaar, g.data.bank_account, g.docs.length, g.na.pan, g.invite.from_ip], ['submitted', 'XXXX XXXX ' + AAD.slice(-4), 'XXXX7766', 3, 'Applied, not received yet', '10.0.0.9']);
    assert.ok(g.docs.find(d => d.kind === 'photo').url && !g.docs.find(d => d.kind === 'bank_passbook').url, 'a pay paper: not for an HR User');
    await no(ACT.invDecide(U, { id: inv.id, ok: true }), /Only the HR Admin or the Super Admin approves/, 403);
    await ACT.invDecide(A, { id: inv.id, ok: false, back: true, reason: 'Write your permanent address too' });
    v = await PUB.open({ t: token }); assert.deepStrictEqual([v.status, v.back_reason], ['in_progress', 'Write your permanent address too']);
    await PUB.save({ t: token, data: Object.assign({}, data, { aadhaar: AAD, address_permanent: 'Village, Rig district' }) });
    await PUB.submit({ t: token, declare: true }, {});
    const made = await ACT.invDecide(A, { id: inv.id, ok: true });
    const e = (await ACT.empGet(A, { id: made.employee.id })).employee;
    assert.deepStrictEqual([made.employee.name, made.employee.email, made.employee.site], ['Join Rig', em, S], '(18-11-2026) his name and e-mail come back – the page asks the Portal for his sign-in');
    assert.deepStrictEqual([e.name, e.category, e.email, e.status, !!e.email_verified_at, e.dob], ['Join Rig', 'labour', em, 'pending', true, '1995-06-15']);
    const pv2 = (await ACT.privGet(A, { id: e.id })).personal; assert.deepStrictEqual([pv2.aadhaar, pv2.address_permanent], [AAD, 'Village, Rig district']);
    const dl = await ACT.docList(A, { id: e.id }); assert.deepStrictEqual([dl.docs.map(d => d.kind + ':' + d.status).sort().join(), dl.na.map(n => n.kind).join()], ['aadhaar:submitted,bank_passbook:submitted,photo:submitted', 'pan']);
    assert.deepStrictEqual([made.bank.waiting, (await ACT.profGet(A, { id: e.id })).bank_wait.new_last4], [1, '7766'], 'the bank waits for its approval');
    assert.strictEqual((await db('GET', 'hr_cpolicy_accepts?select=via&employee_id=eq.' + e.id))[0].via, 'onboarding');
    await no(PUB.open({ t: token }).then(x => { if (x.status === 'approved') throw Object.assign(new Error('approved'), { status: 200 }); }), /approved/);
    // a resent link: the old code is dead
    const inv2 = await ACT.invMake(Us, { base: base, prefill: { name: 'Second Rig', category: 'staff', mobile: mob() } }), t1 = inv2.link.split('#t=')[1];
    const rs = await ACT.invResend(Us, { id: inv2.id, base: base }), t2 = rs.link.split('#t=')[1];
    await no(PUB.open({ t: t1 }), /not valid/, 404); assert.strictEqual((await PUB.open({ t: t2 })).name, 'Second Rig');
    await db('PATCH', 'hr_invites?id=eq.' + inv2.id, { expires_at: new Date(Date.now() - 1000).toISOString() }, 'return=minimal');
    await no(PUB.open({ t: t2 }), /expired/, 410); assert.strictEqual((await ACT.invList(U, {})).rows.find(r => r.id === inv2.id).status, 'expired');
    await ACT.invCancel(U, { id: inv2.id, reason: 'Did not join' }); await no(PUB.open({ t: t2 }), /not valid/, 404);
    // an existing employee's e-mail check; ACTIVE only when everything is there – never his own
    const ex = await ACT.empSave(A, { name: 'Check Rig', category: 'labour', mobile: mob(), email: mail('check15'), dob: '1990-01-01', joined_on: '2020-01-01' });
    await no(ACT.empActivate(U, { id: ex.id }), /Only the HR Admin/, 403);
    await no(ACT.empActivate(A, { id: ex.id }), /still needed: his e-mail verified .*; the papers: Photo, Aadhaar card, PAN card, Bank passbook/);
    const ck = await ACT.emailCheckSend(Us, { id: ex.id, base: base }); assert.strictEqual(ck.mail.sent, true);
    const et = (JSON.stringify(M.got[M.got.length - 1].body).match(/#e=([A-Za-z0-9_-]{43})/) || [])[1]; assert.ok(et);
    assert.deepStrictEqual(await PUB.verify({ e: et }), { ok: true }); assert.deepStrictEqual(await PUB.verify({ e: et }), { ok: true, already: true });
    assert.ok((await ACT.empGet(A, { id: ex.id })).employee.email_verified_at);
    for (const k of ['photo', 'aadhaar', 'pan', 'bank_passbook']) await ACT.docNa(A, { id: ex.id, kind: k, reason: 'Rig test – not asked' });
    await ACT.empActivate(A, { id: ex.id }); assert.strictEqual((await ACT.empGet(A, { id: ex.id })).employee.status, 'active');
  } finally { ['RESEND_API_KEY', 'MAIL_FROM', 'RESEND_API_BASE'].forEach((k, i) => { const v = [env0.k, env0.f, env0.b][i]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }); await M.close(); }
});

/* ───────────── (18-11-2026) Phase 3 – step 16: the seven-day rule, my work locations, a request taken back, the phone's proof ───────────── */
test('(step 16) the seven-day rule: off until the Super Admin turns it on; then a Staff person late with his papers uses only his papers and policies; let in with a reason (never his own); Operator untouched', async () => {
  const S = tag + 'V', A = ses('admin', S), SU = ses('super', S), U = ses('user', S), today = require('../lib/rules').today(), old = new Date(Date.now() - 20 * 86400000 + 19800000).toISOString().slice(0, 10);
  const em = mail('seven16'), me = { site: S, email: em, name: 'Rig seven', role: 'self', info: { sites: [] } };
  const E = await ACT.empSave(A, { name: 'Seven Rig', category: 'staff', mobile: mob(), email: em, dob: '1990-01-01', joined_on: old });
  const O = await ACT.empSave(A, { name: 'Operator Rig', category: 'operator', mobile: mob(), email: mail('op16'), dob: '1990-01-01', joined_on: old });
  // the door of api/hr.js – the guard sits there
  const door = async (s, x) => { const h = require('../api/hr'), DR = require('../lib/docrule'); await DR.guard(s, x.action, require('../lib/act_attend').me); return h.ACT[x.action](s, x); };
  assert.ok((await door(me, { action: 'myLeave' })), 'off: everything as today');
  await no(ACT.docRuleSave(A, { rule: { on: true } }), /Only the Super Admin/, 403);
  await ACT.docRuleSave(SU, { rule: { on: true, days: 7, categories: ['staff'], docs: ['photo', 'aadhaar', 'pan', 'bank_passbook'] } });
  require('../lib/docrule').forget(E.id);
  await no(door(me, { action: 'myLeave' }), /Your papers were due by .*: Photo, Aadhaar card, PAN card, Bank passbook/, 403);
  const h = await door(me, { action: 'myHr' }); assert.deepStrictEqual([h.doc_rule.blocked, h.doc_rule.missing.length], [true, 4], 'his own record still opens – and says why');
  assert.ok(await door(me, { action: 'myDocs' }), 'his papers open');
  const meO = { site: S, email: mail('op16'), name: 'Rig op', role: 'self', info: { sites: [] } }; assert.ok(await door(meO, { action: 'myLeave' }), 'Operator: as today');
  let l = await ACT.docRuleList(U); assert.deepStrictEqual(l.rows.map(r => [r.code, r.blocked]), [[E.code, true]]);
  // let in up to tomorrow (the reason); his own – refused
  const own = ses('admin', S); own.email = em; await no(ACT.docOverride(own, { id: E.id, until: today, reason: 'Myself please' }), /This is about you/, 403);
  await no(ACT.docOverride(A, { id: E.id, until: today, reason: 'x' }), /Reason/);
  await ACT.docOverride(A, { id: E.id, until: today, reason: 'His PAN comes on Monday' });
  assert.ok(await door(me, { action: 'myLeave' }), 'let in'); l = await ACT.docRuleList(U); assert.deepStrictEqual([l.rows[0].blocked, l.rows[0].override.until], [false, today]);
  await ACT.docOverrideEnd(A, { id: E.id, reason: 'Not needed now' }); await no(door(me, { action: 'myLeave' }), /Your papers were due/, 403);
  // the papers there (or not applicable): free again
  for (const k of ['photo', 'aadhaar', 'pan', 'bank_passbook']) await ACT.docNa(A, { id: E.id, kind: k, reason: 'Rig test – none asked' });
  assert.ok(await door(me, { action: 'myLeave' }), 'nothing missing any more');
  await ACT.docRuleSave(SU, { rule: { on: false } });
});

test('(step 16) my work locations: where I may mark today, IN / OUT, and a place given to me that does not count today – with why', async () => {
  const S = tag + 'L', A = ses('admin', S), em = mail('loc16'), me = { site: S, email: em, name: 'Rig loc', role: 'self', info: { sites: [] } };
  const E = await ACT.empSave(A, { name: 'Loc Rig', category: 'staff', mobile: mob(), email: em, dob: '1990-01-01' });
  await ACT.placeSave(A, { name: 'Gate ' + tag, kind: 'office', lat: HQ.lat, lng: HQ.lng, radius_m: 150, valid_from: '2026-01-01', scope: 'people', people: [E.id] });
  await ACT.placeSave(A, { name: 'Yard ' + tag, kind: 'office', lat: HQ.lat + 0.01, lng: HQ.lng, radius_m: 150, valid_from: '2026-01-01', scope: 'people', people: [E.id] });
  const pl = (await ACT.placeList(A)).places, yard = pl.find(p => p.name === 'Yard ' + tag), gate = pl.find(p => p.name === 'Gate ' + tag);
  const tm = new Date(Date.now() + 86400000 + 19800000).toISOString().slice(0, 10);
  await ACT.placeAccessSet(A, { employee_id: E.id, place: yard.id, from: tm, reason: 'From tomorrow' });
  await ACT.placeAccessSet(A, { employee_id: E.id, place: gate.id, can_in: false, can_out: true, reason: 'Exit only' });
  const r = await ACT.myPlaces(me);
  assert.deepStrictEqual(r.places.map(p => [p.name, p.counts, p.can_in, p.can_out, p.why.replace(/\d{2}-\d{2}-\d{4}/, 'D')]).sort(), [['Gate ' + tag, true, false, true, ''], ['Yard ' + tag, false, true, true, 'given to you from D']]);
});

test('(step 16) a request that still waits is taken back – by who sent it or the HR Admin; nothing of it was applied; a decided one cannot be', async () => {
  const S = tag + 'X', A = ses('admin', S), U = ses('user', S), U2 = ses('user', S); U2.email = 'user2@rig.test';
  const mk = async by => (await db('POST', 'hr_asks', [{ site: S, employee_id: null, kind: 'att_import', day: '2026-11-30', body: { month: '2026-11', changes: [] }, auth: { approve: ['super'] }, stage: 'approve', asked_by: by }], 'return=representation'))[0];
  const a1 = await mk(U.email);
  await no(ACT.askCancel(U2, { id: a1.id, reason: 'not mine' }), /Only the one who sent it/, 403);
  await no(ACT.askCancel(U, { id: a1.id, reason: '' }), /Reason/);
  assert.deepStrictEqual(await ACT.askCancel(U, { id: a1.id, reason: 'Wrong month in the file' }), { status: 'cancelled' });
  await no(ACT.askCancel(A, { id: a1.id, reason: 'again' }), /Only a request that still waits/);
  const row = (await db('GET', 'hr_asks?select=status,steps&id=eq.' + a1.id))[0]; assert.deepStrictEqual([row.status, row.steps.slice(-1)[0].note], ['cancelled', 'Wrong month in the file']);
  const a2 = await mk('someone@rig.test'); assert.strictEqual((await ACT.askCancel(A, { id: a2.id, reason: 'The HR Admin takes it back' })).status, 'cancelled');
});

test('(step 16) the phone\'s proof (Play Integrity): off by default; "record" writes Google\'s answer with the punch; "review" sends a punch without a good proof to review – never refused', async () => {
  const S = tag + 'P', A = ses('admin', S), em = mail('proof16'), me = { site: S, email: em, name: 'Rig proof', role: 'self', info: { sites: [] } }, INT = require('../lib/integrity');
  await ACT.empSave(A, { name: 'Proof Rig', category: 'staff', mobile: mob(), email: em, dob: '1990-01-01' });
  await ACT.placeSave(A, { name: 'Proof Office ' + tag, kind: 'office', lat: HQ.lat, lng: HQ.lng, radius_m: 150, valid_from: '2026-01-01' });
  const dev = { id: 'rig-proof-phone-' + tag, model: 'Proof Phone', os: 'Android 15' };
  assert.strictEqual((await ACT.myAttend(me, { device_id: dev.id })).integrity, null, 'off: the phone is not asked');
  // Google, a stand-in on this computer: its sign-in and its answer for a token
  const { privateKey } = require('crypto').generateKeyPairSync('rsa', { modulusLength: 2048 }), pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const answers = {}, gs = http14.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { res.setHeader('Content-Type', 'application/json');
    if (req.url === '/token') return res.end(JSON.stringify(/assertion=[\w-]+\.[\w-]+\.[\w-]+/.test(b) ? { access_token: 'g-token', expires_in: 3600 } : {}));
    const t = (JSON.parse(b || '{}').integrity_token) || '', a = answers[t]; if (req.headers.authorization !== 'Bearer g-token' || !a) { res.statusCode = 400; return res.end('{}'); } res.end(JSON.stringify({ tokenPayloadExternal: a })); }); });
  await new Promise(r => gs.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + gs.address().port;
  const env0 = {}; ['HR_INTEGRITY', 'PLAY_CLOUD_PROJECT', 'PLAY_INTEGRITY_SA', 'GOOGLE_OAUTH_BASE', 'PLAY_INTEGRITY_BASE', 'PLAY_CERT_SHA256'].forEach(k => { env0[k] = process.env[k]; });
  Object.assign(process.env, { HR_INTEGRITY: 'record', PLAY_CLOUD_PROJECT: '123456789', PLAY_INTEGRITY_SA: JSON.stringify({ client_email: 'rig@rig.iam.gserviceaccount.com', private_key: pem }), GOOGLE_OAUTH_BASE: base, PLAY_INTEGRITY_BASE: base, PLAY_CERT_SHA256: 'rig-cert' }); INT.reset();
  try {
    assert.deepStrictEqual((await ACT.myAttend(me, { device_id: dev.id })).integrity, { project: 123456789 });
    const good = c => ({ requestDetails: { requestPackageName: 'in.rachana.rcl.rcl_mobile', requestHash: 'rcl-punch|' + c, timestampMillis: String(Date.now()) }, appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION', certificateSha256Digest: ['rig-cert'], versionCode: '136' }, deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] } });
    let c = cid(); answers.t1 = good(c);
    let r = await ACT.punch(me, P({ client_id: await selfie(me, c), device: dev, integrity_token: 't1' })); let row = (await db('GET', 'hr_punches?select=status,flags&id=eq.' + r.punch.id))[0];
    assert.deepStrictEqual([row.status, row.flags.proof.ok, row.flags.proof.verdict.device], ['ok', true, ['MEETS_DEVICE_INTEGRITY']]);
    // review: a token made for another punch, on a rooted phone – the punch waits for review, written why
    process.env.HR_INTEGRITY = 'review'; c = cid(); answers.t2 = Object.assign(good('another'), { deviceIntegrity: { deviceRecognitionVerdict: [] } });
    r = await ACT.punch(me, P({ client_id: await selfie(me, c), kind: 'out', device: dev, integrity_token: 't2' })); row = (await db('GET', 'hr_punches?select=status,flags&id=eq.' + r.punch.id))[0];
    assert.strictEqual(row.status, 'review'); assert.match(row.flags.why.join(), /phone proof: it was made for another punch; not a genuine, unmodified Android phone/);
  } finally { Object.keys(env0).forEach(k => { if (env0[k] === undefined) delete process.env[k]; else process.env[k] = env0[k]; }); INT.reset(); await new Promise(r => gs.close(r)); }
});

/* ───────────── (18-11-2026) Phase 4 – step 17: the messages ───────────── */
test('(step 17) the messages: off until switched on; WhatsApp only for his kinds with an approved template, else e-mail; the app\'s own list; never twice; tried again, then failed; sent again; the shift reminders stop after IN; WhatsApp\'s word moves a message on (signed only)', async () => {
  const S = tag + 'M', A = ses('admin', S), U = ses('user', S), N = require('../lib/notify'), WA = require('../lib/whatsapp');
  const em = mail('note17'), me = { site: S, email: em, name: 'Rig note', role: 'self', info: { sites: [] } };
  const E = await ACT.empSave(A, { name: 'Note Rig', category: 'staff', mobile: mob(), email: em, dob: '1990-01-01' });
  const B2 = await ACT.empSave(A, { name: 'Note Boss', category: 'staff', mobile: mob(), email: mail('noteboss17'), dob: '1980-01-01' });
  // stand-ins for Resend and Meta on this computer
  const M = await mailStandIn(), wa = [], ws = http14.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { const j = JSON.parse(b || '{}'); wa.push({ url: req.url, auth: req.headers.authorization, body: j }); res.setHeader('Content-Type', 'application/json');
    if (wa.fail) { res.statusCode = 503; return res.end('{"error":{"code":1,"message":"busy"}}'); } res.end(JSON.stringify({ messages: [{ id: 'wamid.' + tag + '.' + wa.length }] })); }); });
  await new Promise(r => ws.listen(0, '127.0.0.1', r));
  const keys = ['RESEND_API_KEY', 'MAIL_FROM', 'RESEND_API_BASE', 'HR_NOTIFY_ENABLED', 'HR_WHATSAPP_ENABLED', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'HR_WA_TEMPLATES', 'WHATSAPP_API_BASE', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'], env0 = {}; keys.forEach(k => { env0[k] = process.env[k]; });
  Object.assign(process.env, { RESEND_API_KEY: 're_rig_not_a_real_key', MAIL_FROM: 'RCL HR <hr@rig.test>', RESEND_API_BASE: M.base, WHATSAPP_TOKEN: 'wa-rig-token', WHATSAPP_PHONE_ID: '1234567', WHATSAPP_API_BASE: 'http://127.0.0.1:' + ws.address().port,
    HR_WA_TEMPLATES: JSON.stringify({ shift_reminder: { name: 'hr_shift_reminder', lang: 'en' }, reporting_change: { name: 'hr_reporting', lang: 'mr' } }), WHATSAPP_APP_SECRET: 'rig-app-secret-17', WHATSAPP_VERIFY_TOKEN: 'rig-verify-17' });
  try {
    assert.deepStrictEqual(await N.run(), { ran: false, why: 'HR_NOTIFY_ENABLED is not true' }, 'off: nothing runs');
    process.env.HR_NOTIFY_ENABLED = 'true';
    // WhatsApp off: a reporting change goes by e-mail and into his app's list
    await ACT.repSet(U, { id: E.id, manager: B2.id, role: 'primary' });
    let q = (await db('GET', 'hr_notify_queue?select=*&employee_id=eq.' + E.id + '&order=id')) || [];
    assert.deepStrictEqual(q.map(r => [r.kind, r.channel]).sort(), [['reporting_change', 'app'], ['reporting_change', 'email']]);
    await ACT.repSet(U, { id: E.id, manager: B2.id, role: 'project' }); await ACT.repEnd(U, { row: (await ACT.repGet(U, { id: E.id })).now.find(r => r.role === 'project').id, reason: 'Rig check' });
    // WhatsApp on: his kind with a template goes by WhatsApp (91 + his number), the words' parts in the template's order
    process.env.HR_WHATSAPP_ENABLED = 'true';
    await N.add([{ site: S, employee_id: E.id, kind: 'reporting_change', mobile: (await ACT.empGet(A, { id: E.id })).employee.mobile, email: em, title: 't', body: 'b', params: { name: 'Note Rig', manager: 'Note Boss', from: '18-11-2026' }, dedupe: 'rig17' + tag + '|x' }]);
    await N.add([{ site: S, employee_id: E.id, kind: 'reporting_change', mobile: '9000000000', email: em, title: 't', body: 'b', params: {}, dedupe: 'rig17' + tag + '|x' }]);
    assert.strictEqual(((await db('GET', 'hr_notify_queue?select=id&dedupe=like.rig17' + tag + '*')) || []).length, 2, 'never twice (WhatsApp + app)');
    let r = await N.sendDue(100); assert.ok(r.sent >= 4, JSON.stringify(r));
    const w = wa.find(x => x.body.template && x.body.template.name === 'hr_reporting'); assert.ok(w); assert.strictEqual(w.auth, 'Bearer wa-rig-token');
    assert.deepStrictEqual([w.body.to.length, w.body.template.language.code, w.body.template.components[0].parameters.map(p => p.text)], [12, 'mr', ['Note Rig', 'Note Boss', '18-11-2026']]);
    assert.ok(M.got.some(g => JSON.stringify(g.body).includes('reports to you')), 'the new manager is told by e-mail');
    // a kind without a template (papers pending) goes by e-mail even with WhatsApp on
    await N.add([{ site: S, employee_id: E.id, kind: 'doc_pending', mobile: '9000000001', email: em, title: 'Papers', body: 'b', dedupe: 'rig17' + tag + '|y' }]);
    assert.deepStrictEqual(((await db('GET', 'hr_notify_queue?select=channel&dedupe=like.rig17' + tag + '|y*')) || []).map(x => x.channel).sort(), ['app', 'email']);
    // WhatsApp busy: tried again after 5, 30, 120 minutes – then failed; "Send again"
    wa.fail = true; await N.add([{ site: S, employee_id: E.id, kind: 'shift_reminder', mobile: '9000000002', title: 'Shift', body: 'b', params: { name: 'n', shift: 's', start: '09:00' }, dedupe: 'rig17' + tag + '|z', app: false }]);
    let t0 = Date.now(); for (const m of [0, 6, 40, 165]) await N.sendDue(100, t0 + m * 60000);
    let z = (await db('GET', 'hr_notify_queue?select=id,status,attempts,error&dedupe=eq.rig17' + tag + '|z|wa'))[0]; assert.deepStrictEqual([z.status, z.attempts], ['failed', 4]); assert.match(z.error, /WhatsApp refused \(503/);
    wa.fail = false; await no(ACT.noticeRetry(U, { id: z.id }), /Only the HR Admin/, 403); await ACT.noticeRetry(A, { id: z.id }); await N.sendDue(100);
    z = (await db('GET', 'hr_notify_queue?select=status,provider_id&dedupe=eq.rig17' + tag + '|z|wa'))[0]; assert.strictEqual(z.status, 'sent');
    // WhatsApp's word: signed only; delivered / read move it on
    const hook = require('../api/wa-hook'), callHook = async (body, sig) => { const { Readable } = require('stream'), req = Readable.from([Buffer.from(body)]); req.method = 'POST'; req.url = '/api/wa-hook'; req.headers = { 'x-hub-signature-256': sig }; let out = { status: 0, body: '' }; const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { out = { status: this.statusCode, body: String(b || '') }; } }; await hook(req, res); return out; };
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: z.provider_id, status: 'read' }] } }] }] }), good = 'sha256=' + require('crypto').createHmac('sha256', 'rig-app-secret-17').update(payload).digest('hex');
    assert.strictEqual((await callHook(payload, 'sha256=00')).status, 401);
    assert.strictEqual((await callHook(payload, good)).status, 200);
    assert.strictEqual((await db('GET', 'hr_notify_queue?select=status&dedupe=eq.rig17' + tag + '|z|wa'))[0].status, 'read');
    // the Notifications page: masked addresses, the counts, the switches
    const L = await ACT.noticeList(U, {}); assert.ok(L.rows.length >= 4); assert.ok(L.rows.every(x => !/\d{10}/.test(x.to_addr) && !/note17/.test(x.to_addr)), 'addresses masked'); assert.deepStrictEqual(L.switches, { notify: true, whatsapp: true, email: true });
    // his own list in the app
    let mine = await ACT.myNotices(me); assert.ok(mine.unread >= 2); assert.strictEqual((await ACT.myHr(me)).notices.unread, mine.unread);
    await ACT.myNoticeSeen(me, {}); assert.strictEqual((await ACT.myNotices(me)).unread, 0);
    // THE SHIFT REMINDERS: a shift that starts now; on – four reminders; none once he is IN; the timer twice = no second copy
    const now = Date.now(), ist = new Date(now + 19800000), hhmm = d => String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    const startT = new Date(ist.getTime() - 60000), endT = new Date(ist.getTime() + 8 * 3600000);
    await ACT.shiftSave(A, { name: 'Rig ' + tag, start_time: hhmm(startT), end_time: hhmm(endT), scope: 'all', valid_from: '2026-01-01' });
    await ACT.rulesSave(A, { valid_from: '2026-01-01', rules: { week_off: [] } }).catch(() => null);
    const remOf = async () => ((await db('GET', 'hr_notify_queue?select=dedupe,channel&kind=eq.shift_reminder&dedupe=like.shift*&site=eq.' + S)) || []);
    await N.shifts(now); assert.strictEqual((await remOf()).length, 0, 'the site\'s reminders are off');
    await no(ACT.noticeSettingSave(U, { shift_on: true }), /Only the HR Admin/, 403);
    await no(ACT.noticeSettingSave(A, { shift_on: true, offsets: [-15, 0, 15, 30, 45, 60, 75] }), /At most 6/);
    await ACT.noticeSettingSave(A, { shift_on: true, offsets: '-15, 0, 15, 30' });
    await N.shifts(now); const rem = await remOf(); assert.ok(rem.length >= 2, JSON.stringify(rem));
    assert.ok(rem.some(x => x.dedupe.indexOf('shift|' + E.id) === 0 && x.channel === 'whatsapp'), 'his kind with a template: WhatsApp');
    const before = rem.length; await N.shifts(now); assert.strictEqual((await remOf()).length, before, 'never twice');
    // he marks IN: the next reminder (15 minutes later) is not made for him
    await ACT.placeSave(A, { name: 'Note Office ' + tag, kind: 'office', lat: HQ.lat, lng: HQ.lng, radius_m: 150, valid_from: '2026-01-01' });
    await ACT.punch(me, P({ client_id: await selfie(me, cid()), device: { id: 'rig-note-phone-' + tag, model: 'Note Phone', os: 'Android 15' } }));
    await N.shifts(now + 15 * 60000);
    assert.ok(!((await db('GET', 'hr_notify_queue?select=dedupe&kind=eq.shift_reminder&site=eq.' + S)) || []).some(x => x.dedupe === 'shift|' + E.id + '|' + require('../lib/rules').today(now) + '|15|wa'), 'none after IN');
  } finally { keys.forEach(k => { if (env0[k] === undefined) delete process.env[k]; else process.env[k] = env0[k]; }); await M.close(); await new Promise(r => ws.close(r)); }
});

test('(step 17) the daily messages: a paper running out in 7 days; a rejected paper is told; a published policy asks everybody it is for', async () => {
  const S = tag + 'Y', A = ses('admin', S), SU = ses('super', S), N = require('../lib/notify'), env0 = process.env.HR_NOTIFY_ENABLED;
  const E = await ACT.empSave(A, { name: 'Daily Rig', category: 'driver', mobile: mob(), email: mail('daily17'), dob: '1990-01-01' });
  const in7 = new Date(Date.now() + 7 * 86400000 + 19800000).toISOString().slice(0, 10);
  const put = async (kind, extra) => { const body = Buffer.from('%PDF-1.4 ' + kind + Math.random()), u = await ACT.docUploadUrl(A, { id: E.id, kind: kind, type: 'application/pdf', bytes: body.length }); await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body }); return ACT.docAdd(A, Object.assign({ id: E.id, kind: kind, path: u.path, bytes: body.length }, extra || {})); };
  const lic = await put('licence', { expires_on: in7 });
  try {
    const d = await N.daily(); assert.ok(d.expiry >= 1);
    assert.ok(((await db('GET', 'hr_notify_queue?select=title&employee_id=eq.' + E.id + '&kind=eq.doc_expiry')) || []).some(x => /Driving licence runs out on/.test(x.title)));
    const A2 = ses('admin', S); A2.email = 'admin2@rig.test'; await ACT.docVerify(A2, { ids: [lic.id], ok: false, again: true, note: 'The photo is blurred' });
    assert.ok(((await db('GET', 'hr_notify_queue?select=body&employee_id=eq.' + E.id + '&kind=eq.doc_pending')) || []).some(x => /not accepted: The photo is blurred/.test(x.body)));
    const p = await ACT.cpSave(SU, { title: 'Daily policy ' + tag, scope: { sites: [S] } }), v = await ACT.cpVersionSave(SU, { policy: p.id, body: 'Read me.', effective_from: '2026-01-01' });
    const pub = await ACT.cpPublish(SU, { version: v.id }); assert.ok(pub.asked >= 1);
    assert.ok(((await db('GET', 'hr_notify_queue?select=title&employee_id=eq.' + E.id + '&kind=eq.policy_accept')) || []).some(x => /Daily policy/.test(x.title)));
  } finally { if (env0 === undefined) delete process.env.HR_NOTIFY_ENABLED; else process.env.HR_NOTIFY_ENABLED = env0; }
});

test('(step 18) payroll phase 5: a structure approved by another; its parts on the payslip; PF on the Basic; the employer\'s shares; LWF in its month; TDS; release → ready → paid with the payment; the registers; the present method beside; the CA\'s check; full & final by three people', async () => {
  const S = tag + 'P5', aX = ses('admin', S), uX = ses('user', S), sX = ses('super', S), D = require('../lib/day'), MO = require('../lib/month'), P = require('../lib/pay');
  aX.info = uX.info = sX.info = { sites: [{ code: S, name: 'Rig pay 5' }] };
  const other = { site: S, email: 'nobody@rig.test', name: 'x', role: 'admin', info: aX.info };
  const today = require('../lib/rules').today(), month = D.addDays(today.slice(0, 8) + '01', -1).slice(0, 7), nDays = +MO.lastDay(month).slice(8), mon = +month.slice(5);
  const mk = async (name, cat, k) => ACT.empSave(aX, { name, category: cat, mobile: mob(), email: mail(k), dob: '1990-05-05', joined_on: '2024-01-01' });
  const A = await mk('Five One', 'staff', 'five1'), B = await mk('Five Two', 'labour', 'five2');
  for (const [e, d] of [[A, '-05'], [A, '-06'], [B, '-05']]) await ACT.daySet(sX, { id: e.id, day: month + d, in_time: '09:00', out_time: '18:00', reason: 'rig pay 5' });
  await ACT.hoSet(sX, { email: 'user@rig.test', on: true }); await ACT.hoSet(sX, { email: 'admin@rig.test', on: true });
  try {
    for (const [e, t, amt] of [[A, 'monthly', nDays * 500], [B, 'daily', 500]]) { const g = await ACT.salaryAsk(aX, { id: e.id, pay_type: t, amount: String(amt) }); await ACT.salaryDecide(uX, { id: g.waiting.id, decision: 'approved' }); }
    // a structure: only the HO HR; its parts add up to at most 100 %; approved by ANOTHER person
    await no(ACT.structList(other), /only for the HO HR/, 403);
    let sl = await ACT.structSave(uX, { name: 'Staff ' + tag }); const st = sl.rows.find(r => r.name === 'Staff ' + tag); assert.deepStrictEqual([st.active, st.people, st.versions], [true, 0, []]);
    await no(ACT.structSave(uX, { name: 'Staff ' + tag }), /is there already/, 409);
    await no(ACT.structVersionSave(uX, { structure: st.id, parts: [{ name: 'Basic', pct: 70 }, { name: 'HRA', pct: 40 }] }), /more than 100 %/, 400);
    await no(ACT.structVersionSave(uX, { structure: st.id, parts: [{ name: 'Basic' }, { name: 'HRA', pct: 20 }] }), /only the last part may take the rest/, 400);
    sl = await ACT.structVersionSave(uX, { structure: st.id, parts: [{ name: 'Basic', pct: 50 }, { name: 'HRA', pct: 20 }, { name: 'Special' }], valid_from: month + '-01' });
    let v = sl.rows.find(r => r.id === st.id).versions; assert.deepStrictEqual([v.length, v[0].version, v[0].status, v[0].parts.map(p => p.key + ':' + (p.pct || 'rest'))], [1, 1, 'draft', ['basic:50', 'hra:20', 'special:rest']]);
    await no(ACT.structApprove(uX, { version: v[0].id }), /Another person of the HO HR approves it/, 403);
    sl = await ACT.structApprove(aX, { version: v[0].id }); assert.strictEqual(sl.rows.find(r => r.id === st.id).versions[0].status, 'approved');
    await no(ACT.structApprove(aX, { version: v[0].id }), /Only a draft is approved/, 400);
    await no(ACT.payEmpSet(uX, { id: A.id, structure: 999999 }), /choose one of the list/, 400);
    await ACT.payEmpSet(uX, { id: A.id, structure: st.id, lwf: true, tds_monthly: '100' });
    await ACT.payFlags(uX, { id: A.id, pf: true, esic: true, pt: true }); await ACT.payFlags(uX, { id: B.id, esic: true });
    assert.deepStrictEqual((await db('GET', 'hr_pay_emp?select=pf,structure_id,lwf,tds_monthly&employee_id=eq.' + A.id))[0], { pf: true, structure_id: st.id, lwf: true, tds_monthly: 100 }, 'the ticks keep the structure');
    // the numbers of the test (made-up) with their source; the month's pay
    await ACT.monthVerify(aX, { month, ids: [A.id, B.id] }); await ACT.monthApprove(uX, { month });
    await no(ACT.paySettingsSave(uX, { pf_base: 'gross' }), /PF on: the earned pay or the Basic/, 400); await no(ACT.paySettingsSave(uX, { lwf_months: '13' }), /LWF months/, 400);
    await ACT.paySettingsSave(uX, { valid_from: month + '-01', pf_pct: '12', pf_cap: '15000', pf_base: 'basic', pf_er_pct: '12', eps_pct: '8.33', eps_cap: '15000', edli_pct: '0.5', pf_admin_pct: '0.5', esic_pct: '0.75', esic_er_pct: '3.25', esic_limit: '21000',
      pt_slabs: [{ from: '1000', amount: '200' }], lwf_ee: '6', lwf_er: '18', lwf_months: String(mon), grat_days: '15', grat_divisor: '26', grat_years: '2', source: 'Rig – made-up numbers' });
    let p = await ACT.payList(uX, { month }); const row = e => p.rows.find(r => r.id === e.id);
    assert.deepStrictEqual(row(A).components, [{ key: 'basic', name: 'Basic', amount: 500 }, { key: 'hra', name: 'HRA', amount: 200 }, { key: 'special', name: 'Special', amount: 300 }]);
    assert.deepStrictEqual([row(A).earned, row(A).gross, row(A).pf, row(A).esic, row(A).pt, row(A).lwf, row(A).tds, row(A).deductions, row(A).net], [1000, 1000, 60, 8, 200, 6, 100, 374, 626], 'PF on the Basic only');
    assert.deepStrictEqual(row(A).employer, { eps: 42, epf: 18, edli: 3, pf_admin: 3, pf_wage: 500, esic: 33, lwf: 18 }, 'EPS is taken out of the employer\'s 12 %'); assert.strictEqual(row(A).ctc, 1117);
    assert.deepStrictEqual([row(B).components, row(B).esic, row(B).employer, row(B).net], [undefined, 4, { esic: 17 }, 496], 'no structure: as before');
    assert.deepStrictEqual([p.totals.lwf, p.totals.tds, p.totals.ctc, p.totals.employer.esic], [6, 100, 1634, 50]);
    p = await ACT.payLock(uX, { month });
    const ps = await ACT.paySlipOf(uX, { month, id: A.id }); assert.deepStrictEqual([ps.slip.components.map(c => c.label + ' ' + c.amount), ps.slip.deductions.map(l => l.label), ps.slip.employer.map(l => l.label), ps.slip.ctc], [['Basic 500', 'HRA 200', 'Special 300'], ['PF', 'ESIC', 'Profession Tax', 'Labour Welfare Fund', 'TDS'], ['PF (EPF)', 'Pension (EPS)', 'EDLI', 'PF admin charges', 'ESIC', 'Labour Welfare Fund'], 1117]);
    const mine = await ACT.mySlips({ site: S, email: mail('five1'), name: 'x', role: 'self', info: {} }); assert.deepStrictEqual(mine.slips[0].components.map(c => c.label), ['Basic', 'HRA', 'Special']);
    // release: approved → (held → approved) → ready → paid; the payment is kept; a paid one does not move
    let r = await ACT.payRelease(uX, { month }); const idA = r.rows.find(x => x.code === A.code).id, idB = r.rows.find(x => x.code === B.code).id; assert.deepStrictEqual(r.rows.map(x => x.status), ['approved', 'approved']);
    await no(ACT.payReleaseSet(uX, { ids: [idA], status: 'hold' }), /Reason: write why/, 400);
    assert.deepStrictEqual(await ACT.payReleaseSet(uX, { ids: [idA], status: 'hold', note: 'check his bank' }), { done: 1, skipped: 0 });
    assert.deepStrictEqual(await ACT.payPaid(uX, { ids: [idA, idB], mode: 'bank', ref: 'UTR-RIG-1' }), { done: 0, skipped: 2 }, 'only a ready one is paid');
    assert.deepStrictEqual(await ACT.payReleaseSet(uX, { ids: [idA, idB], status: 'ready' }), { done: 1, skipped: 1 }, 'a held one goes back to approved first');
    await ACT.payReleaseSet(uX, { ids: [idA], status: 'approved' }); await ACT.payReleaseSet(uX, { ids: [idA], status: 'ready' });
    await no(ACT.payPaid(uX, { ids: [idA], mode: 'bank', ref: '' }), /Reference/, 400); await no(ACT.payPaid(uX, { ids: [idA], mode: 'gold', ref: 'x' }), /bank, cash, cheque or UPI/, 400);
    assert.deepStrictEqual(await ACT.payPaid(uX, { ids: [idA, idB], mode: 'bank', ref: 'UTR-RIG-1' }), { done: 2, skipped: 0 });
    r = await ACT.payRelease(uX, { month }); assert.deepStrictEqual(r.rows.map(x => [x.status, x.payments.length, +x.payments[0].amount]), [['paid', 1, 626], ['paid', 1, 496]]);
    assert.deepStrictEqual(await ACT.payReleaseSet(uX, { ids: [idA], status: 'hold', note: 'too late' }), { done: 0, skipped: 1 }, 'a paid one does not move');
    await no(db('PATCH', 'hr_pay_payments?payslip_id=eq.' + idA, { amount: 1 }), /database|refused|permission/i); await no(db('DELETE', 'hr_pay_release?payslip_id=eq.' + idA), /database|refused|permission/i);
    // the registers
    await db('POST', 'hr_employee_profile?on_conflict=employee_id', [{ employee_id: A.id, data: {}, secret: { uan: '100200300400', esic_no: '1234567890' }, updated_by: 'rig' }], 'resolution=merge-duplicates,return=minimal');
    let g = await ACT.payRegister(uX, { month, kind: 'salary' }); assert.deepStrictEqual([g.rows.length, g.rows.find(x => x.code === A.code).Basic, g.rows.find(x => x.code === A.code).net], [2, 500, 626]);
    g = await ACT.payRegister(uX, { month, kind: 'pf' }); assert.deepStrictEqual(g.rows, [{ code: A.code, name: 'Five One', uan: 'XXXXXXXX0400', gross: 1000, pf_wage: 500, ee_pf: 60, er_epf: 18, er_eps: 42, edli: 3, admin: 3 }], 'an HR User sees the UAN masked');
    assert.strictEqual((await ACT.payRegister(sX, { month, kind: 'pf' })).rows[0].uan, '100200300400');
    g = await ACT.payRegister(uX, { month, kind: 'esic' }); assert.deepStrictEqual(g.rows.map(x => [x.code, x.ee_esic, x.er_esic]), [[A.code, 8, 33], [B.code, 4, 17]]);
    assert.deepStrictEqual((await ACT.payRegister(uX, { month, kind: 'lwf' })).rows.map(x => [x.ee_lwf, x.er_lwf]), [[6, 18]]); assert.deepStrictEqual((await ACT.payRegister(uX, { month, kind: 'tds' })).rows.map(x => x.tds), [100]);
    assert.deepStrictEqual((await ACT.payRegister(uX, { month, kind: 'payments' })).rows.map(x => [x.status, x.mode, x.ref]), [['paid', 'bank', 'UTR-RIG-1'], ['paid', 'bank', 'UTR-RIG-1']]);
    await no(ACT.payRegister(uX, { month, kind: 'gold' }), /Register: salary/, 400); await no(ACT.payRegister(uX, { month: today.slice(0, 7), kind: 'pf' }), /not locked/, 400);
    // the present method beside the ERP, line by line
    const c = await ACT.payCompare(uX, { month, rows: [{ code: A.code.toLowerCase(), gross: '1,000', net: '626' }, { code: B.code, gross: 500, net: 490 }, { code: 'NOPE1', net: 1 }] });
    assert.deepStrictEqual([c.equal, c.differ, c.missing, c.rows.filter(x => x.field === 'net').map(x => [x.code, x.ours, x.theirs, x.diff]), c.not_in_file], [1, 1, 1, [[B.code, 496, 490, 6]], []]);
    // the CA's check of the version in force
    const sc = await ACT.statChecks(uX), ver = sc.rows.find(x => x.settings.source === 'Rig – made-up numbers'); assert.deepStrictEqual(ver.checks, []);
    await no(ACT.statCheck(uX, { settings: ver.id, note: 'ok' }), /Write what was checked/, 400);
    assert.strictEqual((await ACT.statCheck(uX, { settings: ver.id, note: 'CA – rig numbers checked' })).rows.find(x => x.id === ver.id).checks.length, 1);
    // full & final: only a relieved person, after his last month is locked; made → checked (another) → approved (a third / the Super Admin) → paid
    await no(ACT.fnfMake(uX, { id: A.id }), /not relieved yet/, 400);
    await ACT.advGive(uX, { id: A.id, amount: '1000', monthly: '400', given_on: today });
    await ACT.empExit(aX, { id: A.id, on: month + '-20', reason: 'Resigned (rig)' }); await ACT.empExit(aX, { id: B.id, on: today, reason: 'Resigned (rig)' });
    await no(ACT.fnfMake(uX, { id: B.id }), new RegExp('First lock the pay of ' + today.slice(0, 7)), 400);
    const f = await ACT.fnfMake(uX, { id: A.id }), grat = P.r2(nDays * 500 * 0.5 * 15 / 26 * 3);
    assert.deepStrictEqual(f.lines.map(l => [l.key, l.kind, l.amount]), [['gratuity', 'earn', grat], ['advance', 'ded', 1000], ['notice', 'ded', 0]], 'paid in the locked month: no pay line; 2 years 9 months = 3 years');
    assert.strictEqual(f.net, P.r2(grat - 1000)); await no(ACT.fnfMake(uX, { id: A.id }), /made already/, 409);
    const lines = f.lines.map(l => (l.key === 'notice' ? Object.assign({}, l, { amount: '500', note: '5 days' }) : l));
    assert.strictEqual((await ACT.fnfSave(uX, { id: f.id, lines })).net, P.r2(grat - 1500));
    await no(ACT.fnfStep(uX, { id: f.id, step: 'check' }), /Another person checks it/, 403); await ACT.fnfStep(aX, { id: f.id, step: 'check' });
    await no(ACT.fnfSave(uX, { id: f.id, lines }), /is checked – it is not changed any more/, 400);
    await no(ACT.fnfStep(aX, { id: f.id, step: 'approve' }), /A third person/, 403); await no(ACT.fnfStep(uX, { id: f.id, step: 'approve' }), /A third person/, 403);
    await no(ACT.fnfStep(sX, { id: f.id, step: 'paid', mode: 'bank', ref: 'x' }), /Only an approved one is paid/, 400);
    await ACT.fnfStep(sX, { id: f.id, step: 'approve' }); await no(ACT.fnfStep(uX, { id: f.id, step: 'paid', mode: 'bank', ref: '' }), /Reference/, 400);
    await ACT.fnfStep(uX, { id: f.id, step: 'paid', mode: 'bank', ref: 'UTR-FNF-1' }); await no(ACT.fnfStep(sX, { id: f.id, step: 'cancel', note: 'oops' }), /never cancelled/, 400);
    const fl = await ACT.fnfList(uX); assert.deepStrictEqual(fl.rows.map(x => [x.code, x.status, x.made_by, x.checked_by, x.approved_by, x.paid_ref]), [[A.code, 'paid', 'user@rig.test', 'admin@rig.test', 'super@rig.test', 'UTR-FNF-1']]);
    assert.deepStrictEqual((await ACT.payRegister(uX, { kind: 'fnf' })).rows.map(x => [x.code, x.status, x.net]), [[A.code, 'paid', P.r2(grat - 1500)]]);
    const log = JSON.stringify(await db('GET', 'hr_audit?select=action,detail&site=eq.' + S + '&order=id'));
    assert.ok(/Salary structure approved/.test(log) && /Full & final approved/.test(log) && /Payslips paid/.test(log)); assert.ok(!/626|1117|UTR-RIG-1|100200300400/.test(log), 'no amount, no reference, no number in the audit');
  } finally { await ACT.paySettingsSave(uX, { valid_from: month + '-01' }); await ACT.hoSet(sX, { email: 'user@rig.test', on: false }); await ACT.hoSet(sX, { email: 'admin@rig.test', on: false }); }
});

test('(Phase 6) reports: every one of the 25 runs on the real database; each role sees only its own; filters checked; a manager sees only his team; one audit line a report, no row in it', async () => {
  const S = tag + 'R6', aX = ses('admin', S), uX = ses('user', S), sX = ses('super', S), me = k => ({ site: S, email: mail(k), name: 'x', role: 'self', info: {} });
  aX.info = uX.info = sX.info = { sites: [{ code: S, name: 'Rig reports' }] };
  const today = require('../lib/rules').today(), D = require('../lib/day');
  const B = await ACT.empSave(aX, { name: 'Boss Six', category: 'staff', mobile: mob(), email: mail('boss6'), dob: '1985-03-03', joined_on: '2023-01-01' });
  const E = await ACT.empSave(aX, { name: 'Team Six', category: 'labour', mobile: mob(), email: mail('team6'), dob: '1990-' + today.slice(5, 7) + '-02', joined_on: '2024-01-01', reports_to: B.id });
  await ACT.daySet(sX, { id: E.id, day: D.addDays(today, -1), in_time: '09:00', out_time: '18:00', reason: 'rig six' });
  // the catalog: the HR User has no Admin / pay reports; the HR Admin has the Admin ones; the HO HR / Super Admin has all 25
  const cat = async s => (await ACT.repCatalog(s)).reports.map(r => r.key);
  const cu = await cat(uX), ca = await cat(aX), cs = await cat(sX);
  assert.strictEqual(cs.length, 25, 'twenty-five reports'); assert.ok(!cu.includes('att_manual') && !cu.includes('devices') && !cu.some(k => /^pay_/.test(k)), 'an HR User: no Admin, no pay report');
  assert.ok(ca.includes('att_manual') && ca.includes('devices') && !ca.some(k => /^pay_/.test(k)), 'an HR Admin who is not HO HR: no pay report');
  await no(ACT.repRun(uX, { key: 'devices' }), /only for the HR Admin/, 403); await no(ACT.repRun(aX, { key: 'pay_months' }), /only for the HO HR/, 403);
  await no(ACT.repCatalog(me('team6')), /HR office only|office/i); await no(ACT.repRun(uX, { key: 'nothing' }), /Choose a report/, 400);
  await no(ACT.repRun(uX, { key: 'att_late', from: '31-12-2026', to: '01-01-2026' }), /To must not be before From/, 400); await no(ACT.repRun(uX, { key: 'att_day', day: 'yesterday' }), /Day: a date/, 400);
  // every report runs for the Super Admin
  for (const k of cs) { const r = await ACT.repRun(sX, { key: k, month: today.slice(0, 7) }); assert.ok(Array.isArray(r.rows) && Array.isArray(r.cols), k); }
  let r = await ACT.repRun(uX, { key: 'emp_list' }); assert.deepStrictEqual(r.rows.map(x => x.code), [B.code, E.code]); assert.match(r.rows[0].mobile, /^XXXXXX\d{4}$/, 'an HR User sees the mobile masked');
  assert.match((await ACT.repRun(aX, { key: 'emp_list' })).rows[0].mobile, /^\d{10}$/);
  r = await ACT.repRun(uX, { key: 'att_day', day: D.addDays(today, -1) }); assert.deepStrictEqual(r.rows.find(x => x.code === E.code).in, '09:00');
  r = await ACT.repRun(uX, { key: 'reporting' }); assert.strictEqual(r.rows.find(x => x.code === E.code).manager_code, B.code);
  r = await ACT.repRun(uX, { key: 'headcount' }); assert.deepStrictEqual(r.rows[r.rows.length - 1], { department: 'Total', total: 2, staff: 1, operator: 0, driver: 0, labour: 1 });
  r = await ACT.repRun(uX, { key: 'emp_dates', month: today.slice(0, 7) }); assert.ok(r.rows.some(x => x.code === E.code && x.what === 'Birthday'));
  r = await ACT.repRun(uX, { key: 'att_manual' }).catch(e => e); assert.strictEqual(r.status, 403);
  r = await ACT.repRun(aX, { key: 'att_manual', from: D.addDays(today, -3), to: today }); assert.deepStrictEqual(r.rows.map(x => [x.code, x.source, x.after]), [[E.code, 'Entered by hand', '09:00 – 18:00']]);
  // the manager's dashboard: only his team; nobody's team = empty
  const t = await ACT.myTeam(me('boss6')); assert.deepStrictEqual([t.team, t.people.map(p => p.code), typeof t.people[0].month.present, t.waiting], [1, [E.code], 'number', { attendance: 0, leave: 0 }]);
  assert.strictEqual((await ACT.myTeam(me('team6'))).team, 0);
  assert.deepStrictEqual([(await ACT.myHr(me('boss6'))).team, (await ACT.myHr(me('team6'))).team], [1, 0], 'Me says whether he has a team');
  const log = (await db('GET', 'hr_audit?select=action,target,detail&site=eq.' + S + '&action=eq.Report%20made')) || []; assert.ok(log.length >= 25); assert.ok(!JSON.stringify(log).includes('Team Six'), 'no row of a report in the audit');
});

test('(step 19) AI on the real database: off by default; checks find one phone used by two people; a paper read and a policy question answered through a stand-in provider – logged with cost, nothing else written', async () => {
  const S = tag + 'AI', aX = ses('admin', S), uX = ses('user', S), sX = ses('super', S), http = require('http'), keys = ['HR_AI_ENABLED', 'HR_AI_PROVIDER', 'HR_AI_MODEL', 'ANTHROPIC_API_KEY', 'HR_AI_PRICE', 'HR_AI_API_BASE'], env = {};
  aX.info = uX.info = sX.info = { sites: [{ code: S, name: 'Rig AI' }] }; keys.forEach(k => { env[k] = process.env[k]; delete process.env[k]; });
  const A = await ACT.empSave(aX, { name: 'Asha Kale', category: 'staff', mobile: mob(), email: mail('ai1'), dob: '1990-02-02' }), B = await ACT.empSave(aX, { name: 'Bina Rao', category: 'staff', mobile: mob(), email: mail('ai2'), dob: '1991-03-03' });
  let st = await ACT.aiStatus(aX); assert.deepStrictEqual([st.on, st.ready], [false, true]); await no(ACT.aiAsk(uX, { question: 'How many leaves?' }), /No company policy|not switched on/);
  await no(ACT.aiStatus({ site: S, email: mail('ai1'), role: 'self', info: {} }), /HR office only/, 403);
  // the checks: one phone for two people (made-up rows of the rig)
  await db('POST', 'hr_devices', [{ employee_id: A.id, device_id: 'rig-same-' + tag, model: 'Rig', active: false, released_at: new Date().toISOString(), released_by: 'rig', release_reason: 'rig' }], 'return=minimal');
  await db('POST', 'hr_devices', [{ employee_id: B.id, device_id: 'rig-same-' + tag, model: 'Rig' }], 'return=minimal');
  const ch = await ACT.aiChecks(uX, {}); assert.ok(ch.rows.some(r => r.check === 'One phone used by several people' && r.count === 2 && /Asha Kale/.test(r.who) && /Bina Rao/.test(r.who)));
  // a stand-in provider on this computer
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', c => { b += c; }); q.on('end', () => { const j = JSON.parse(b), img = (j.messages[0].content || []).some(c => c.type === 'image');
    r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ content: [{ type: 'text', text: img ? '{"name":"ASHA KALE","number":"ABCDE1234F","date_of_birth":"02-02-1990","readable":true}' : 'The Leave policy says 12 days a year.' }], usage: { input_tokens: 500, output_tokens: 50 } })); }); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  try {
    Object.assign(process.env, { HR_AI_ENABLED: 'true', HR_AI_PROVIDER: 'anthropic', HR_AI_MODEL: 'rig-model', ANTHROPIC_API_KEY: 'rig-key', HR_AI_PRICE: '{"in":3,"out":15}', HR_AI_API_BASE: 'http://127.0.0.1:' + srv.address().port });
    const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), u = await ACT.docUploadUrl(aX, { id: A.id, kind: 'pan', type: 'image/jpeg', bytes: body.length });
    await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body }); const d = await ACT.docAdd(aX, { id: A.id, kind: 'pan', path: u.path, bytes: body.length, number: 'ABCDE1234F' });
    await no(ACT.aiReadDoc(uX, { id: d.id }), /Only the HR Admin/, 403);
    const rd = await ACT.aiReadDoc(aX, { id: d.id }), f = k => rd.fields.find(x => x.key === k);
    assert.deepStrictEqual([f('name').same, f('number').same, f('date_of_birth').same, rd.cost_usd], [true, true, true, 0.00225]);
    assert.strictEqual(((await db('GET', 'hr_employee_docs?select=status,number&id=eq.' + d.id))[0] || {}).status, 'submitted', 'the paper is not verified by AI');
    const p = await ACT.cpSave(sX, { title: 'Leave policy ' + tag, scope: { sites: [S] } }), v = await ACT.cpVersionSave(sX, { policy: p.id, body: 'Every person gets 12 days of paid leave a year.', effective_from: '2026-01-01' }); await ACT.cpPublish(sX, { version: v.id });
    const an = await ACT.aiAsk(uX, { question: 'How many paid leaves a year?' }); assert.match(an.answer, /12 days/); assert.ok(an.policies.length >= 1);
    st = await ACT.aiStatus(aX); assert.ok(st.on && st.runs.length >= 2 && st.spent_usd > 0); assert.ok(st.runs.every(r => !('text' in r) && !('question' in r)));
    const log = JSON.stringify(await db('GET', 'hr_audit?select=action,detail&site=eq.' + S + '&action=like.AI*')); assert.ok(/AI read a paper/.test(log) && /AI question asked/.test(log) && !/ABCDE1234F|paid leaves/.test(log), 'no number, no question in the audit');
  } finally { srv.close(); keys.forEach(k => { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }); }
});

test('(18-11-2026) the import in steps: a step file (KYC, bank, job, pay) only fills in employees already added; its name column never changes the name', async () => {
  const S = tag + 'IP', aX = ses('admin', S); aX.info = { sites: [{ code: S, name: 'Rig import parts' }] };
  const E = await ACT.empSave(aX, { name: 'Part Person', category: 'staff', mobile: mob(), dob: '1990-01-01' });
  let r = await ACT.sheetImport(aX, { part: 'kyc', check: 1, rows: [{ code: E.code, name: 'Changed Name', city: 'Pune' }, { code: 'NOPE77', name: 'X', city: 'Mumbai' }, { name: 'No Code', city: 'Thane' }] });
  assert.deepStrictEqual([r.toAdd, r.toChange, r.faults], [0, 1, 2]);
  assert.match(r.lines.map(l => l.why).join(' '), /NOPE77 is not an employee of this site – add him first with Step 1 \(Basic\)\..*Employee Code: needed/);
  r = await ACT.sheetImport(aX, { part: 'kyc', rows: [{ code: E.code, name: 'Changed Name', city: 'Pune' }] }); assert.strictEqual(r.changed, 1);
  const g = await ACT.empGet(aX, { id: E.id }), p = ((await db('GET', 'hr_employee_profile?select=data&employee_id=eq.' + E.id)) || [])[0];
  assert.deepStrictEqual([g.employee.name, p.data.city], ['Part Person', 'Pune']);
  r = await ACT.sheetImport(aX, { part: 'basic', check: 1, rows: [{ name: 'New Basic', mobile: mob() }] }); assert.strictEqual(r.toAdd, 1, 'Step 1 adds as before');
});
