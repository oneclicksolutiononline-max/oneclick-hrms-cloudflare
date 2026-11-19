/* THE PHONE'S OWN PROOF – Google Play Integrity (18-11-2026, Phase 3 – the master prompt Part 9: "Play Integrity / App Attest";
 * the audit's E2: "the device id comes from the app"). With every punch the app (3.136.0 and later, Android) asks Google for a
 * token bound to THIS punch ("rcl-punch|<punch number>"); the HR server asks Google what the token says: this very app (its
 * signing key), on a real, unmodified Android phone, made just now for this punch.
 *   HR_INTEGRITY            off (default) | record (the answer is written with the punch only) | review (a punch without a good
 *                           answer waits for the HR Admin's review – never refused, so Google being slow never stops attendance)
 *   PLAY_CLOUD_PROJECT      the Google Cloud project NUMBER linked to the app in the Play Console (the phone needs it)
 *   PLAY_INTEGRITY_SA       the service account's JSON key (Google Cloud → IAM → Service accounts) – a SECRET, only in Vercel
 *   PLAY_PACKAGE            the app's package (default in.rachana.rcl.rcl_mobile)
 *   PLAY_CERT_SHA256        the SHA-256 of the app's signing certificate (base64url, as Google gives it) – the app is not from the
 *                           Play Store, so this is how a copy signed by somebody else is told apart
 * Apple's App Attest (iPhone) needs the Apple Developer account – not built yet (the iPhone app is not given out yet). */
'use strict';
const crypto = require('crypto');

const mode = () => { const m = String(process.env.HR_INTEGRITY || 'off').toLowerCase(); return m === 'record' || m === 'review' ? m : 'off'; };
const project = () => { const n = Number(process.env.PLAY_CLOUD_PROJECT || 0); return Number.isInteger(n) && n > 0 ? n : 0; };
const pkg = () => String(process.env.PLAY_PACKAGE || 'in.rachana.rcl.rcl_mobile');
const OAUTH = () => String(process.env.GOOGLE_OAUTH_BASE || 'https://oauth2.googleapis.com');      // (the tests only change them)
const API = () => String(process.env.PLAY_INTEGRITY_BASE || 'https://playintegrity.googleapis.com');
// what the phone is told (myAttend): ask for a token for every punch – only when it is on and the project is known
const forPhone = () => (mode() !== 'off' && project() ? { project: project() } : null);
const hashFor = cid => 'rcl-punch|' + String(cid || '');

let tok = null;      // { value, until }
const b64u = b => Buffer.from(b).toString('base64url');
async function accessToken() {
  if (tok && tok.until > Date.now() + 60000) return tok.value;
  let sa; try { sa = JSON.parse(String(process.env.PLAY_INTEGRITY_SA || '')); } catch (e) { sa = null; }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error('PLAY_INTEGRITY_SA is not set');
  const now = Math.floor(Date.now() / 1000), head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), body = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/playintegrity', aud: OAUTH() + '/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key).toString('base64url');
  const r = await fetch(OAUTH() + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + body + '.' + sig, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.access_token) throw new Error('Google sign-in refused (' + r.status + ')');
  tok = { value: j.access_token, until: Date.now() + (Number(j.expires_in) || 3000) * 1000 }; return tok.value;
}
/* what Google says of one token, for one punch: { ok, why: [...], verdict } – never throws (a fault is a "why") */
async function check(token, cid, now) {
  now = now || Date.now(); const why = [];
  if (!token) return { ok: false, why: ['no phone proof (an old app, or not an Android phone)'], verdict: null };
  let p;
  try {
    const r = await fetch(API() + '/v1/' + encodeURIComponent(pkg()) + ':decodeIntegrityToken', { method: 'POST', headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ integrity_token: String(token) }), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Google refused the token (' + r.status + ')'); p = j.tokenPayloadExternal || {};
  } catch (e) { return { ok: false, why: ['the phone proof could not be checked: ' + String(e.message || e)], verdict: null }; }
  const rd = p.requestDetails || {}, ai = p.appIntegrity || {}, di = p.deviceIntegrity || {};
  if (rd.requestPackageName !== pkg()) why.push('another app asked for it');
  if (rd.requestHash !== hashFor(cid)) why.push('it was made for another punch');
  if (!(Math.abs(now - Number(rd.timestampMillis || 0)) < 10 * 60000)) why.push('it is not of now');
  const dv = Array.isArray(di.deviceRecognitionVerdict) ? di.deviceRecognitionVerdict : [];
  if (dv.indexOf('MEETS_DEVICE_INTEGRITY') < 0 && dv.indexOf('MEETS_STRONG_INTEGRITY') < 0) why.push('not a genuine, unmodified Android phone (' + (dv.join(', ') || 'no verdict') + ')');
  const cert = String(process.env.PLAY_CERT_SHA256 || '').trim(), digests = Array.isArray(ai.certificateSha256Digest) ? ai.certificateSha256Digest : [];
  if (cert && digests.indexOf(cert) < 0) why.push('the app is not signed with RCL\'s key');
  return { ok: !why.length, why: why, verdict: { app: ai.appRecognitionVerdict || '', device: dv, version: ai.versionCode || '' } };
}
const reset = () => { tok = null; };
module.exports = { mode, project, forPhone, hashFor, check, reset };
