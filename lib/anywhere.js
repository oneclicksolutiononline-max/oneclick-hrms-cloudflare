/* ATTENDANCE FROM ANYWHERE (19-11-2026, asked: "ata prynt location apan fix banwalel aahe ata all over asse kahi lok aahet ki kuthun pn
 * login kru shaktat ass ek option banaw ani ha web warun access dila jail app updet chi garaj lagu naye").
 *   A person given "Anywhere" by the HR office (Work places → By person → Change; the HR Admin with the power "Work places and
 *   projects", or the Super Admin – never for himself, the Super Admin excepted) marks his attendance from ANY place: the geofence is
 *   not asked of him (also when he has no work place at all). Up to a date, or until it is taken back; always with the reason.
 *   EVERYTHING ELSE OF A PUNCH STAYS: his GPS (written with the punch – where he was), its accuracy, the selfie, the face where the site
 *   asks it, one phone, today only, Developer Options / a made-up location refused.
 *   Kept with the site's settings (hr_settings: the site, key "att_anywhere", value { by: { <employee id>: { until, reason, by, at } } })
 *   – no new table, no SQL step. Every change is in the audit.
 *   THE PHONE APP OF TODAY NEEDS NO UPDATE: myAttend gives such a person one more place, PLACE – "Anywhere", a circle round the whole
 *   earth – after his real ones, so the app's own check says "inside" wherever he is (at a real place the app still names it). The
 *   server decides (punch): a punch outside his places is kept with no place and the mark "anywhere". */
'use strict';
const { db, enc } = require('./db');

const KEY = 'att_anywhere';
const soft = p => p.catch(e => { if (e && e.code === 'notinstalled') return null; throw e; });
// who of a site has it: { <employee id>: { until, reason, by, at } }
async function all(site) {
  const r = ((await soft(db('GET', 'hr_settings?select=value&site=eq.' + enc(site) + '&key=eq.' + KEY))) || [])[0];
  return (r && r.value && r.value.by && typeof r.value.by === 'object') ? r.value.by : {};
}
// counts on that day: no end, or an end that is not before it
const valid = (e, day) => !!e && (!e.until || String(e.until) >= String(day));
async function on(site, empId, day) { const m = await all(site); return valid(m[empId], day) ? m[empId] : null; }
// given (entry) or taken (null) for one person
async function set(site, empId, entry, who) {
  const by = Object.assign({}, await all(site)); if (entry) by[empId] = entry; else delete by[empId];
  await db('POST', 'hr_settings?on_conflict=site,key', [{ site: site, key: KEY, value: { by: by }, updated_by: who, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');
  return by;
}
// the place the phone app is given for him: a circle of 21,000 km round the point 0 / 0 – every place on earth is inside
const PLACE = Object.freeze({ id: 'anywhere', name: 'Anywhere', kind: 'other', shape: 'circle', lat: 0, lng: 0, radius_m: 21000000, points: [], can_in: true, can_out: true });
module.exports = { KEY, all, on, set, valid, PLACE };
