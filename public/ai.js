/* HR – THE AI ASSISTANT (18-11-2026, Phase 7 – step 19): AI reads and suggests, a person decides. lib/act_ai.js does the work.
 *   Ask the company's policies · Checks to look at · Read a paper waiting to be verified (HR Admin) · The AI calls and their cost (HR Admin)
 * Every text of a person (and every answer of the AI) is put in as TEXT, never as HTML. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  var api = function (action, body) { return window.HRAPI('api/hr', Object.assign({ action: action }, body || {})); };
  var dmy = function (d) { return d ? String(d).slice(0, 10).split('-').reverse().join('-') : ''; };
  var when = function (t) { return t ? new Date(Date.parse(t) + 19800000).toISOString().slice(0, 16).replace('T', ' ') : ''; };
  var usd = function (n) { return 'USD ' + Number(n || 0).toFixed(4); };
  var ME = {};
  function toast(t, bad) { var e = $('toast'); e.textContent = t; e.className = bad ? 'bad' : ''; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, bad ? 9000 : 3500); }
  function fail(e) { toast(e && e.message ? e.message : 'HR did not answer – try again.', true); }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
  function card(title, sub) { var c = el('div', 'dz-card'); c.style.marginBottom = '14px'; c.appendChild(el('h3', '', title)); if (sub) c.appendChild(el('p', 'muted', sub)); return c; }
  function note(text, kind) { var p = el('p', '', text); p.style.cssText = 'margin:0 0 12px;padding:11px 14px;border-radius:14px;font-size:15px;white-space:pre-wrap;' + (kind === 'warn' ? 'background:#FFF1CC;color:#6B4700' : kind === 'ok' ? 'background:#DDF5E6;color:#0B6B3A' : 'background:#E9F2FF;color:#0B3A6B'); return p; }
  function table(heads) { var box = el('div', 'box'), t = el('table'), h = el('thead'), r = el('tr'); heads.forEach(function (x) { r.appendChild(el('th', '', x)); }); h.appendChild(r); t.appendChild(h); var b = el('tbody'); t.appendChild(b); box.appendChild(t); return { box: box, body: b }; }
  var admin = function () { return ME.user && (ME.user.role === 'admin' || ME.user.role === 'super'); };

  function draw() {
    var root = $('p_ai'); root.textContent = '';
    api('aiStatus').then(function (st) {
      root.appendChild(note((st.on ? 'AI is ON – ' + st.provider + ' · ' + st.model : 'AI is OFF – the Super Admin switches it on in Vercel (HR_AI_ENABLED, HR_AI_PROVIDER, HR_AI_MODEL and the provider\'s key).') + (st.ready ? ' · This month: ' + usd(st.spent_usd) + (st.limit ? ' of USD ' + st.limit : '') : ' · The AI log is not set up yet (SQL step 19).') + '\n' + st.never, st.on ? 'ok' : 'warn'));
      ask(root, st); checks(root); if (admin()) { papers(root, st); runs(root, st); }
    }, function (e) { root.appendChild(el('p', 'none', e.message)); });
  }
  function ask(root, st) {
    var c = card('Ask about the company\'s policies', 'Answered only from the published company policies – the HR office decides.'), q = el('textarea'); q.rows = 3; q.maxLength = 600; q.placeholder = 'e.g. How many days of paid leave does a person get in a year?'; q.style.cssText = 'width:100%;border:1px solid #D7E0EF;border-radius:12px;padding:10px 12px;font:inherit';
    var out = el('div'), go = btn('pri', 'Ask', function () { go.disabled = true; out.textContent = ''; out.appendChild(el('p', 'muted', 'Asking…'));
      api('aiAsk', { question: q.value }).then(function (r) { go.disabled = false; out.textContent = ''; out.appendChild(note(r.answer)); out.appendChild(el('p', 'muted', 'From: ' + r.policies.join(', ') + ' · ' + usd(r.cost_usd) + ' · ' + r.warning)); }, function (e) { go.disabled = false; out.textContent = ''; fail(e); }); });
    go.disabled = !st.on; c.appendChild(q); var a = el('div', 'acts'); a.style.justifyContent = 'flex-start'; a.appendChild(go); c.appendChild(a); c.appendChild(out); root.appendChild(c);
  }
  function checks(root) {
    var c = card('Checks to look at', 'Plain rules over this site\'s records (last 30 days) – they decide nothing and change nothing.'); root.appendChild(c);
    api('aiChecks', {}).then(function (r) { var t = table(['Check', 'Who', 'How many', 'Where to look']);
      r.rows.forEach(function (x) { var tr = el('tr'); tr.style.cursor = 'default'; [x.check, x.who, x.count, x.look].forEach(function (v) { tr.appendChild(el('td', '', v)); }); t.body.appendChild(tr); });
      if (!r.rows.length) t.box.appendChild(el('p', 'none', 'Nothing to look at from ' + dmy(r.from) + ' to ' + dmy(r.to) + '.')); c.appendChild(t.box); }, function (e) { c.appendChild(el('p', 'none', e.message)); });
  }
  function papers(root, st) {
    var c = card('Read a paper with AI', 'A photo of a paper waiting to be verified: what AI reads beside what is on record. A suggestion only – check the paper yourself.'); root.appendChild(c);
    api('docQueue', { which: 'waiting' }).then(function (r) {
      var list = (r.rows || []).filter(function (d) { return /^image\//.test(d.mime || ''); }), t = table(['Code', 'Name', 'Paper', 'Since', '']);
      list.slice(0, 50).forEach(function (d) { var tr = el('tr'); tr.style.cursor = 'default'; [d.employee.code, d.employee.name, d.kind_name, dmy(d.created_at)].forEach(function (v) { tr.appendChild(el('td', '', v)); });
        var a = el('td'), b = btn('sm', 'Read with AI', function () { b.disabled = true; api('aiReadDoc', { id: d.id }).then(function (x) { b.disabled = false; shown(x); }, function (e) { b.disabled = false; fail(e); }); }); b.disabled = !st.on; a.appendChild(b); tr.appendChild(a); t.body.appendChild(tr); });
      if (!list.length) t.box.appendChild(el('p', 'none', 'No photo of a paper waits to be verified.')); c.appendChild(t.box);
    }, function (e) { c.appendChild(el('p', 'none', e.message)); });
  }
  var LABEL = { name: 'Name', number: 'Number', date_of_birth: 'Date of birth', issued_on: 'Issued on', expires_on: 'Valid till' };
  function shown(x) {
    var d = el('div', 'dlg'), s = el('div', 'sheet'); s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.appendChild(el('h2', '', x.kind + ' – ' + x.employee.name + ' (' + x.employee.code + ')'));
    s.appendChild(note(x.warning + (x.readable ? '' : ' AI could not read this photo well.') + (x.note ? ' ' + x.note : ''), 'warn'));
    var t = table(['', 'On record', 'AI read', 'Same?']); x.fields.forEach(function (f) { var tr = el('tr'); tr.style.cursor = 'default'; [LABEL[f.key], /_on$|date_of/.test(f.key) ? dmy(f.record) : f.record, /_on$|date_of/.test(f.key) ? dmy(f.read) : f.read].forEach(function (v) { tr.appendChild(el('td', '', v || '–')); });
      var c = el('td', '', f.same === null ? '–' : f.same ? 'Same' : 'Differs'); c.style.fontWeight = '700'; c.style.color = f.same === false ? '#B42318' : f.same ? '#0B6B3A' : ''; tr.appendChild(c); t.body.appendChild(tr); });
    s.appendChild(t.box); s.appendChild(el('p', 'muted', usd(x.cost_usd))); var a = el('div', 'acts'), close = function () { if (d.parentNode) d.parentNode.removeChild(d); }; a.appendChild(btn('sec', 'Close', close)); s.appendChild(a); d.appendChild(s); document.body.appendChild(d);
  }
  function runs(root, st) {
    if (!st.runs || !st.runs.length) return; var c = card('The AI calls', 'Who asked, what for, tokens and cost – never the question, the paper or the answer.'), t = table(['When', 'Who', 'For', 'Tokens in / out', 'Cost', 'Done']);
    st.runs.forEach(function (r) { var tr = el('tr'); tr.style.cursor = 'default'; [when(r.at), r.by, r.purpose === 'ocr' ? 'Read a paper' : r.purpose === 'ask' ? 'Question' : r.purpose, r.tokens_in + ' / ' + r.tokens_out, usd(r.cost_usd), r.ok ? 'Yes' : 'No – ' + r.error].forEach(function (v) { tr.appendChild(el('td', '', v)); }); t.body.appendChild(tr); });
    c.appendChild(t.box); root.appendChild(c);
  }
  window.HRAI = { pages: [['ai', 'AI assistant']], has: function (page) { return page === 'ai'; }, open: function (page, me) { ME = me || {}; draw(); } };
})();
