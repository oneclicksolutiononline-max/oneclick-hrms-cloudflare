/* HR – ADD EMPLOYEE, steps 4 to 8 (18-11-2026, asked: "employee add krtana document upload sagle kahi te kutay" – his choice: one
 * form of 8 steps). Steps 1–3 (Who, Work, Contact) are the form of before (hr.js); "Save & continue" makes the employee and the SAME
 * form goes on here:  4 Bank & PF · 5 Reporting · 6 Work place · 7 Documents · 8 Insurance + Activate.
 * Every step is saved by the actions of his own page (the same checks, the same rights: a bank change waits for the HO HR's approval,
 * a paper waits to be verified …) – nothing new on the server. "Skip" leaves a step for later (his page has all of it).
 * Every text is put in as TEXT, never as HTML. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  var api = function (action, body) { return window.HRAPI('api/hr', Object.assign({ action: action }, body || {})); };
  var dmy = function (d) { return d ? String(d).slice(0, 10).split('-').reverse().join('-') : ''; };
  function toast(t, bad) { var e = $('toast'); e.textContent = t; e.className = bad ? 'bad' : ''; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, bad ? 9000 : 3500); }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
  var STEPS = [['Who', 'name, category, date of birth'], ['Work', 'site, department, designation'], ['Contact', 'mobile, e-mail, address'],
    ['Bank & PF', 'bank, IFSC, PF, UAN, ESIC'], ['Reporting', 'reporting manager'], ['Work place', 'where he marks attendance'], ['Documents', 'Aadhaar, PAN, photo, licence …'], ['Insurance', 'mediclaim, then Activate']];
  var W = null, XWAS = null;      // W: { e, me, init, done, at, ok: {step: true} }; XWAS: the Cancel button's own action of before

  function err(x) { var p = $('f_err'); p.textContent = x ? (x.message || String(x)) : ''; p.hidden = !x; }
  function side() {
    var box = $('f_steps'); box.textContent = ''; var n = 0;
    STEPS.forEach(function (x, i) { var k = i + 1, ok = k <= 3 || !!W.ok[k]; if (ok) n++;
      var b = el('button', 'fm-st' + (k === W.at ? ' on' : '') + (ok ? ' ok' : '')); b.type = 'button'; b.appendChild(el('i', '', ok && k !== W.at ? '✓' : k));
      var t = el('span'); t.appendChild(el('b', '', k + '. ' + x[0])); t.appendChild(el('small', '', k <= 3 ? 'saved' : x[1])); b.appendChild(t);
      if (k <= 3) b.disabled = true; else b.onclick = function () { open(k); }; if (k === W.at) b.setAttribute('aria-current', 'step'); box.appendChild(b); });
    $('f_pct').textContent = Math.round(n * 100 / STEPS.length) + '% done';
  }
  // the bottom of a step: Save & next (when the step has its own save), Skip / Next, Finish on the last
  function acts(body, save) {
    var a = el('div', 'acts'); a.style.justifyContent = 'flex-end'; a.style.marginTop = '16px';
    var next = function () { if (W.at < STEPS.length) open(W.at + 1); else finish(); };
    a.appendChild(btn('sec', W.at < STEPS.length ? (save ? 'Skip' : 'Next →') : 'Finish', next));      // (a step is ticked only when something of it was saved)
    if (save) { var s = btn('pri', W.at < STEPS.length ? 'Save & next →' : 'Save & finish', function () { err(null); s.disabled = true; save().then(function () { s.disabled = false; W.ok[W.at] = true; next(); }, function (x) { s.disabled = false; err(x); }); }); a.appendChild(s); }
    body.appendChild(a);
  }
  function open(k) {
    W.at = k; err(null); side(); var body = $('f_more'); body.textContent = '';
    $('f_stepno').textContent = 'Step ' + k + ' of ' + STEPS.length; $('f_stepname').textContent = k + '. ' + STEPS[k - 1][0];
    ({ 4: bank, 5: reporting, 6: place, 7: papers, 8: insurance })[k](body);
  }
  function finish() { var d = W.done, e = W.e; reset(); toast(e.code + ' · ' + e.name + ' – added.'); d(); }

  // 4 – the statutory & bank details: the boxes of his page (a bank change waits for the HO HR / Super Admin)
  function bank(body) {
    body.appendChild(el('p', 'muted', 'Reading…'));
    api('profGet', { id: W.e.id }).then(function (r) {
      body.textContent = ''; var g = r.defs.groups.filter(function (x) { return x.key === 'secret'; })[0];
      if (!g || !window.HRPROF || !window.HRPROF.form) { body.appendChild(el('p', 'muted', 'Fill these on his page (Statutory & bank).')); return acts(body, null); }
      var f = window.HRPROF.form(g.fields, r.secret || {}, r.lists); body.appendChild(f.grid);
      body.appendChild(el('p', 'muted', 'The bank details are not used at once: they wait for the HO HR or the Super Admin to approve them, and the employee is told by e-mail.'));
      acts(body, function () { return api('profSave', { id: W.e.id, group: 'secret', data: f.get() }).then(function (n) { if (n.bank && n.bank.waiting) toast('Bank details sent to the HO HR for approval.'); }); });
    }, function (x) { body.textContent = ''; body.appendChild(el('p', 'warn', x.message)); acts(body, null); });
  }
  // 5, 6, 8 – the cards of his page (reporting managers, work places, insurance, e-mail check and activation)
  function card(kind, body, note) {
    if (note) body.appendChild(el('p', 'muted', note));
    var c = el('div', 'ep-card'); c.appendChild(el('p', 'muted', 'Reading…')); body.appendChild(c);
    if (window.HR15 && window.HR15.card) window.HR15.card(kind, c, W.e, W.me, W.init); else { c.textContent = ''; c.appendChild(el('p', 'muted', 'Fill this on his page.')); }
    return c;
  }
  function reporting(body) { card('reporting', body, 'Set his reporting manager – "Set a manager…" (one or more, from a date). He may also be left without one.'); acts(body, null); }
  function place(body) { card('access', body, 'Where he may mark his attendance – a work place, from a date, for IN and / or OUT.'); acts(body, null); }
  function insurance(body) { card('insurance', body, null); card('active', body, null); acts(body, null); }

  // 7 – his papers: the kinds still needed first (red), then any other; each attached at once (it waits to be verified)
  function papers(body) {
    body.appendChild(el('p', 'muted', 'Reading…'));
    api('docList', { id: W.e.id }).then(function (r) {
      body.textContent = ''; var miss = r.docsMissing || [], have = (r.docs || []).filter(function (d) { return d.active; });
      body.appendChild(el('p', miss.length ? 'warn' : 'muted', miss.length ? 'Still to attach: ' + miss.join(', ') + '.' : 'Every paper his category needs is attached.'));
      if (have.length) { var ul = el('ul', 'hist'); have.forEach(function (d) { var k = r.kinds.filter(function (x) { return x.key === d.kind; })[0]; ul.appendChild(el('li', '', (k ? k.name : d.kind) + (d.number ? ' · ' + d.number : '') + (d.expires_on ? ' · valid up to ' + dmy(d.expires_on) : '') + ' · ' + ({ submitted: 'submitted', under_verification: 'under verification', verified: 'verified', rejected: 'rejected' }[d.status] || 'attached'))); }); body.appendChild(ul); }
      // one row to attach: the kind (the missing ones first), number, dates, the file
      var kinds = r.kinds.slice().sort(function (a, b) { return (miss.indexOf(a.name) > -1 ? 0 : 1) - (miss.indexOf(b.name) > -1 ? 0 : 1); });
      var g = el('div', 'grid g3'), wrap = function (label, i, cls) { var d = el('div', cls || ''); var l = el('label', '', label); i.id = 'ae_' + Math.random().toString(36).slice(2, 7); l.htmlFor = i.id; d.appendChild(l); d.appendChild(i); g.appendChild(d); return d; };
      var kind = el('select'); kinds.forEach(function (k) { var o = el('option', '', k.name + (miss.indexOf(k.name) > -1 ? ' – needed' : '')); o.value = k.key; kind.appendChild(o); });
      var num = el('input'); num.maxLength = 40; num.autocomplete = 'off'; var iss = el('input'); iss.type = 'date'; var exp = el('input'); exp.type = 'date';
      var file = el('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp,application/pdf';
      wrap('Paper', kind); wrap('Number (if any)', num); var issBox = wrap('Issued on', iss); var expBox = wrap('Valid up to', exp); wrap('File (photo or PDF, up to ' + (r.maxMb || 10) + ' MB)', file, 'two');
      var sync = function () { var k = r.kinds.filter(function (x) { return x.key === kind.value; })[0]; expBox.hidden = !(k && k.expires); issBox.hidden = !r.verify; }; kind.onchange = sync; sync();
      body.appendChild(g);
      var add = btn('pri', 'Attach this paper', function () {
        err(null); var f = file.files && file.files[0]; if (!f) return err('Choose the file first.'); add.disabled = true;
        api('docUploadUrl', { id: W.e.id, kind: kind.value, type: f.type, bytes: f.size }).then(function (u) {
          return fetch(u.url, { method: 'PUT', headers: { 'Content-Type': f.type, 'x-upsert': 'false' }, body: f }).then(function (x) { if (!x.ok) throw new Error('"' + f.name + '" was not kept (' + x.status + ') – try again.');
            return api('docAdd', { id: W.e.id, kind: kind.value, path: u.path, bytes: f.size, number: num.value, expires_on: expBox.hidden ? '' : exp.value, issued_on: issBox.hidden ? '' : iss.value }); });
        }).then(function () { add.disabled = false; toast('Attached – it waits to be verified.'); W.ok[7] = true; open(7); }, function (x) { add.disabled = false; err(x); });
      });
      var a = el('div', 'acts'); a.style.justifyContent = 'flex-start'; a.appendChild(add); body.appendChild(a);
      acts(body, null);
    }, function (x) { body.textContent = ''; body.appendChild(el('p', 'warn', x.message)); acts(body, null); });
  }

  // the form goes back to what it was (hr.js calls it before the form opens again)
  function reset() {
    W = null; var m = $('f_more'); if (!m) return; m.hidden = true; m.textContent = '';
    ['f_save', 'f_next'].forEach(function (k) { $(k).hidden = false; }); var x = document.querySelector('#f_form .fm-x'); if (x) { x.textContent = 'Cancel'; if (XWAS) { x.onclick = XWAS; XWAS = null; } }
  }
  window.HRADD = {
    reset: reset,
    // the employee was just made (steps 1–3); extra: the details of steps 1–3 that live on his page (profile, job)
    go: function (e, extra, me, init, done) {
      W = { e: e, me: me, init: init, done: done, at: 4, ok: {} }; $('f_id').value = e.id;
      Array.prototype.forEach.call(document.querySelectorAll('#f_form .fm-sec'), function (x) { x.hidden = true; });
      $('f_save').hidden = true; $('f_next').hidden = true; $('f_more').hidden = false; var x = document.querySelector('#f_form .fm-x');
      if (x) { x.textContent = 'Close (fill the rest later)'; XWAS = x.onclick; x.onclick = function () { var was = XWAS; finish(); if (was) was.call(x); }; }
      $('f_title').textContent = 'Add employee – ' + e.name + ' (' + e.code + ')';
      var keep = function (group, data) { var d = {}; Object.keys(data).forEach(function (k) { if (data[k]) d[k] = data[k]; }); return Object.keys(d).length ? api('profSave', { id: e.id, group: group, data: d }) : Promise.resolve(null); };
      keep('profile', extra.profile || {}).then(function () { return keep('job', extra.job || {}); }).then(function () { open(4); },
        function (x) { open(4); err('Saved – but these details were not kept: ' + (x.message || x) + ' Set them on his page (Profile / Job).'); });
      toast(e.code + ' saved – go on with the next steps.');
    }
  };
})();
