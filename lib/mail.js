/* AN E-MAIL TO AN EMPLOYEE (18-11-2026, Phase 1 – his answer: a bank change "मंजुरीला जाईल … Employee ला e-mail ने कळवलं जाईल").
 * Sent by Resend – the same service as the Portal's sign-in codes. Its key and the sender are Vercel settings of THIS project,
 * never in a file and never asked in chat:
 *   RESEND_API_KEY   – the Resend key (he puts it in Vercel → HR project → Environment Variables)
 *   MAIL_FROM        – the sender, e.g. "RCL HR <hr@his-domain>" (a domain verified in Resend)
 * Not set: nothing is sent and the answer SAYS so ({ sent: false, why }) – the caller writes that down; nothing pretends.
 * A message is sent only to the employee's own e-mail of the Employee Master. */
'use strict';
const API = () => String(process.env.RESEND_API_BASE || 'https://api.resend.com').replace(/\/+$/, '');      // (the tests only change it)
const ready = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

// one message or many (at most 100 a call – Resend's batch). [{ to, subject, text }] → [{ sent, id?, why? }] in the same order
async function send(list) {
  list = (Array.isArray(list) ? list : [list]).filter(Boolean);
  if (!list.length) return [];
  if (!ready()) return list.map(() => ({ sent: false, why: 'e-mail is not set up (RESEND_API_KEY, MAIL_FROM)' }));
  const out = new Array(list.length);
  const good = []; list.forEach((m, i) => { if (!EMAIL.test(String(m.to || ''))) out[i] = { sent: false, why: 'no e-mail in his record' }; else good.push(i); });
  for (let k = 0; k < good.length; k += 100) {
    const part = good.slice(k, k + 100), body = part.map(i => ({ from: process.env.MAIL_FROM, to: [String(list[i].to)], subject: String(list[i].subject).slice(0, 200), text: String(list[i].text) }));
    let r, t = '';
    try {
      r = await fetch(API() + (body.length === 1 ? '/emails' : '/emails/batch'), { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body.length === 1 ? body[0] : body), signal: AbortSignal.timeout(15000) });
      t = await r.text();
    } catch (e) { part.forEach(i => { out[i] = { sent: false, why: 'the e-mail service did not answer' }; }); continue; }
    // (18-11-2026) Resend's own reason goes with it (e.g. "The … domain is not verified") – it names no key; what to set right is then seen at once
    if (!r.ok) { console.error('[hr mail] ' + r.status + ' ' + t.slice(0, 200)); let why = ''; try { why = String((JSON.parse(t) || {}).message || '').replace(/\s+/g, ' ').slice(0, 200); } catch (e) { why = ''; }
      part.forEach(i => { out[i] = { sent: false, why: 'the e-mail service refused (' + r.status + ')' + (why ? ': ' + why : '') }; }); continue; }
    let j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
    const ids = body.length === 1 ? [j && j.id] : ((j && Array.isArray(j.data) ? j.data : [])).map(x => x && x.id);
    part.forEach((i, n) => { out[i] = { sent: true, id: ids[n] || '' }; });
  }
  return out;
}
module.exports = { send, ready };
