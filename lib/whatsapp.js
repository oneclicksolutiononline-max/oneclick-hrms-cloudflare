/* A WHATSAPP MESSAGE FROM HR (18-11-2026, Phase 4 – step 17; his answer: WhatsApp for the shift reminders, the onboarding link,
 * papers, policies and a reporting change). Meta's WhatsApp Cloud API, a TEMPLATE message (a business may start a talk only with a
 * template Meta approved). Everything is a Vercel setting of the HR project – never in a file, never asked in chat:
 *   HR_WHATSAPP_ENABLED   true to send at all (default: nothing goes by WhatsApp)
 *   WHATSAPP_TOKEN        the Cloud API's access token (a SECRET)
 *   WHATSAPP_PHONE_ID     the sending number's id
 *   WHATSAPP_API_VERSION  e.g. v21.0 (default)
 *   HR_WA_TEMPLATES       which approved template each kind uses, e.g.
 *                         {"shift_reminder":{"name":"hr_shift_reminder","lang":"en"},"onboarding_link":{"name":"hr_join_link","lang":"en"}}
 *                         – the body's {{1}}, {{2}} … are filled in the order lib/notify.js gives (KINDS[kind].params)
 *   WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN – for the delivery webhook (api/wa-hook.js)
 * The same Meta account as the Portal's sign-in codes may be used; HR keeps its own settings. A number is sent as 91 + 10 digits. */
'use strict';
const API = () => String(process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com').replace(/\/+$/, '');      // (the tests only change it)
const on = () => String(process.env.HR_WHATSAPP_ENABLED || '') === 'true' && !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_ID;
function templates() { try { const t = JSON.parse(String(process.env.HR_WA_TEMPLATES || '{}')); return t && typeof t === 'object' ? t : {}; } catch (e) { return {}; } }
const templateOf = kind => { const t = templates()[kind]; return t && t.name ? { name: String(t.name), lang: String(t.lang || 'en') } : null; };
const ready = kind => on() && !!templateOf(kind);
const toNumber = m => { const d = String(m || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d.length === 12 && d.startsWith('91') ? d : ''; };

/* one template message → { sent, id } or { sent: false, why, again } (again: worth trying later – the service was busy / down) */
async function send(kind, mobile, params) {
  const t = templateOf(kind); if (!on() || !t) return { sent: false, why: 'WhatsApp is not set up for this message', again: false };
  const to = toNumber(mobile); if (!to) return { sent: false, why: 'no mobile number', again: false };
  const body = { messaging_product: 'whatsapp', to: to, type: 'template', template: { name: t.name, language: { code: t.lang },
    components: (params || []).length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p === undefined || p === null ? '' : p).slice(0, 900) || '-' })) }] : [] } };
  let r, j = {};
  try {
    r = await fetch(API() + '/' + (process.env.WHATSAPP_API_VERSION || 'v21.0') + '/' + process.env.WHATSAPP_PHONE_ID + '/messages', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    j = await r.json().catch(() => ({}));
  } catch (e) { return { sent: false, why: 'WhatsApp did not answer', again: true }; }
  if (!r.ok) { const er = (j && j.error) || {}; console.error('[hr wa] ' + r.status + ' ' + (er.code || '') + ' ' + String(er.message || '').slice(0, 160)); return { sent: false, why: 'WhatsApp refused (' + r.status + (er.code ? ' / ' + er.code : '') + ')', again: r.status === 429 || r.status >= 500 }; }
  return { sent: true, id: ((j.messages || [])[0] || {}).id || '' };
}
module.exports = { on, ready, send, templateOf, toNumber };
