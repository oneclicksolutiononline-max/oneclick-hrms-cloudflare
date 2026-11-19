/* THE AI GATEWAY OF HR (18-11-2026, Phase 7 – the master prompt Part 17): one door for every AI call, whichever provider. It only
 * READS and SUGGESTS – it never approves or changes money, bank details, faces or attendance (nothing it answers is saved anywhere
 * but its own log line). Every call is logged in hr_ai_runs: who, what for, provider, model, tokens, cost, time, ok / why not – never
 * the question, the paper or the answer (they may hold personal data).
 * Everything is a Vercel setting of the HR project – never in a file, never asked in chat:
 *   HR_AI_ENABLED       true to call at all (default: off – the AI parts say "not switched on")
 *   HR_AI_PROVIDER      anthropic | openai
 *   HR_AI_MODEL         the provider's model name (no default – it is his choice)
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY   the provider's key (a SECRET)
 *   HR_AI_PRICE         {"in": USD per million input tokens, "out": USD per million output tokens} – to write each call's cost
 *   HR_AI_MONTHLY_USD   (optional) the month's limit for this HR database – calls stop when it is reached */
'use strict';
const { fail } = require('./http');
const { db } = require('./db');

const PROV = { anthropic: { key: 'ANTHROPIC_API_KEY', base: 'https://api.anthropic.com' }, openai: { key: 'OPENAI_API_KEY', base: 'https://api.openai.com' } };
const provider = () => String(process.env.HR_AI_PROVIDER || '').toLowerCase();
const on = () => String(process.env.HR_AI_ENABLED || '') === 'true' && !!PROV[provider()] && !!process.env[PROV[provider()].key] && !!String(process.env.HR_AI_MODEL || '').trim();
function price() { try { const p = JSON.parse(String(process.env.HR_AI_PRICE || '{}')); return { in: +p.in >= 0 ? +p.in : 0, out: +p.out >= 0 ? +p.out : 0, set: p.in !== undefined && p.out !== undefined }; } catch (e) { return { in: 0, out: 0, set: false }; } }
const status = () => ({ on: on(), provider: PROV[provider()] ? provider() : '', model: on() ? String(process.env.HR_AI_MODEL) : '', priced: price().set, limit: +process.env.HR_AI_MONTHLY_USD > 0 ? +process.env.HR_AI_MONTHLY_USD : null });
const NOT_ON = 'AI is not switched on for HR: the Super Admin sets HR_AI_ENABLED, HR_AI_PROVIDER, HR_AI_MODEL and the provider\'s key in Vercel (HR project → Settings → Environment Variables).';
const NOT_READY19 = 'The AI log is not set up yet: the Super Admin runs sql/hr_step19_ai.sql once in the rcl-hr Supabase → SQL Editor.';
const r6 = n => Math.round((+n || 0) * 1e6) / 1e6;

// this month's spend (USD) of this HR database
async function spent() {
  const from = new Date(Date.now() + 19800000).toISOString().slice(0, 7) + '-01T00:00:00+05:30';
  const rows = (await db('GET', 'hr_ai_runs?select=cost_usd&at=gte.' + encodeURIComponent(from) + '&limit=100000')) || [];
  return r6(rows.reduce((n, r) => n + (+r.cost_usd || 0), 0));
}
async function log(row) { try { await db('POST', 'hr_ai_runs', [row], 'return=minimal'); } catch (e) { console.error('[hr ai] log ' + (e && e.message)); } }

/* one call: { s, purpose (a word: ocr | ask | help | …), system, text, image: { mime, base64 } | null, max_tokens, cache, timeout }
 * → { text, tokens_in, tokens_out, cost_usd }
 * refused: AI off / step 19 not run / the month's limit reached. A provider fault is logged and said plainly.
 * (19-11-2026, "Ask") cache: the system words are the same in every call – Anthropic keeps them 5 minutes (prompt caching): read
 * again they cost a tenth (written: 1.25 times); OpenAI does it by itself. timeout: ms (default 45 s – "Ask" waits 25 s, its door 30). */
async function call(o) {
  if (!on()) throw fail(400, NOT_ON, 'aioff');
  try { await db('GET', 'hr_ai_runs?select=id&limit=1'); } catch (e) { if (e && e.code === 'notinstalled') throw fail(500, NOT_READY19, 'notready19'); throw e; }
  const st = status(); if (st.limit !== null && (await spent()) >= st.limit) throw fail(429, 'The AI limit of this month (USD ' + st.limit + ') is reached – it starts again next month, or the Super Admin raises HR_AI_MONTHLY_USD.', 'ailimit');
  const p = provider(), key = process.env[PROV[p].key], model = String(process.env.HR_AI_MODEL).trim(), base = String(process.env.HR_AI_API_BASE || PROV[p].base).replace(/\/+$/, ''), t0 = Date.now();
  const row = { site: o.s.site, by: o.s.email, purpose: String(o.purpose || 'other').slice(0, 30), provider: p, model: model.slice(0, 80), tokens_in: 0, tokens_out: 0, cost_usd: 0, ms: 0, ok: false, error: '' };
  let res, j = {};
  try {
    if (p === 'anthropic') {
      const content = (o.image ? [{ type: 'image', source: { type: 'base64', media_type: o.image.mime, data: o.image.base64 } }] : []).concat([{ type: 'text', text: String(o.text || '') }]);
      const system = o.cache ? [{ type: 'text', text: String(o.system || ''), cache_control: { type: 'ephemeral' } }] : String(o.system || '');
      res = await fetch(base + '/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: model, max_tokens: o.max_tokens || 800, system: system, messages: [{ role: 'user', content: content }] }), signal: AbortSignal.timeout(o.timeout || 45000) });
    } else {
      const content = (o.image ? [{ type: 'image_url', image_url: { url: 'data:' + o.image.mime + ';base64,' + o.image.base64 } }] : []).concat([{ type: 'text', text: String(o.text || '') }]);
      res = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model: model, max_tokens: o.max_tokens || 800, messages: [{ role: 'system', content: String(o.system || '') }, { role: 'user', content: content }] }), signal: AbortSignal.timeout(o.timeout || 45000) });
    }
    j = await res.json().catch(() => ({}));
  } catch (e) { row.ms = Date.now() - t0; row.error = 'no answer'; await log(row); throw fail(502, 'The AI service did not answer – try again in a minute.', 'aidown'); }
  row.ms = Date.now() - t0;
  if (!res.ok) { row.error = 'refused ' + res.status; await log(row); console.error('[hr ai] ' + res.status + ' ' + String(((j || {}).error || {}).message || '').slice(0, 160)); throw fail(502, 'The AI service refused (' + res.status + ') – the Super Admin checks the key and the model in Vercel.', 'airefused'); }
  // (19-11-2026) the words kept by the provider count too: Anthropic gives them apart (read 0.1×, written 1.25× the input price);
  // OpenAI counts them inside prompt_tokens (read at half its price)
  const u = j.usage || {}, pr = price(), tout = +(u.output_tokens || u.completion_tokens || 0);
  const cRead = +(u.cache_read_input_tokens || ((u.prompt_tokens_details || {}).cached_tokens) || 0), cMade = +(u.cache_creation_input_tokens || 0);
  const plain = p === 'anthropic' ? +(u.input_tokens || 0) : Math.max(0, +(u.prompt_tokens || 0) - cRead);
  const tin = plain + cRead + cMade, cost = (plain * pr.in + cRead * pr.in * (p === 'anthropic' ? 0.1 : 0.5) + cMade * pr.in * 1.25 + tout * pr.out) / 1e6;
  const text = p === 'anthropic' ? ((j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n')) : (((j.choices || [])[0] || {}).message || {}).content || '';
  Object.assign(row, { tokens_in: tin, tokens_out: tout, cost_usd: r6(cost), ok: true }); await log(row);
  return { text: String(text || ''), tokens_in: tin, tokens_out: tout, cost_usd: row.cost_usd };
}
// the first {...} of an answer as an object (a model may wrap it in words or ```json)
function json(text) { const m = /\{[\s\S]*\}/.exec(String(text || '')); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } }
module.exports = { on, status, call, json, spent, NOT_ON, NOT_READY19, PROV };
