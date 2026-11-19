/* THE NEW JOINER'S PAGE (18-11-2026, Phase 2 – step 15): opened from the link the HR office sent (onboard.html#t=<code>), or from
 * an e-mail check link (onboard.html#e=<code>). No sign-in: the code after # is the key – a browser never sends that part of an
 * address to any server; this page sends it only in the body of its own requests (api/onboard). Steps: about you, contact (the
 * e-mail code), address, Aadhaar / PAN / bank, papers, policies, submit. Every step is saved as it is left; the compulsory
 * things are checked at "Submit". Every text of a person is put in as TEXT, never as HTML. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  var dmy = function (d) { return d ? String(d).slice(0, 10).split('-').reverse().join('-') : ''; };
  var H = String(location.hash || ''), T = (/[#&]t=([A-Za-z0-9_-]{40,60})/.exec(H) || [])[1] || '', EC = (/[#&]e=([A-Za-z0-9_-]{40,60})/.exec(H) || [])[1] || '';
  var V = { v: null, step: 0, data: {} };
  function call(action, body) {
    return fetch('api/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RCL': '1' }, cache: 'no-store', body: JSON.stringify(Object.assign({ action: action }, body || {})) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) { var e = new Error(j.error || 'The server did not answer (' + r.status + ') – try again.'); e.status = r.status; throw e; } return j; }); },
        function () { throw new Error('No internet – check it and try again.'); });
  }
  function msg(text, cls) { var m = $('ob_msg'); m.hidden = false; m.textContent = ''; m.appendChild(el('p', cls || '', text)); }
  // the language: English, मराठी, हिंदी (the same words as the HR web)
  Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) { b.onclick = function () { if (window.HRLANG) window.HRLANG.set(b.dataset.lang); }; });

  var STEPS = [['who', 'About you'], ['contact', 'Contact'], ['address', 'Address'], ['ids', 'Aadhaar, PAN and bank'], ['papers', 'Papers'], ['policies', 'Policies'], ['submit', 'Submit']];
  function stepsDraw() {
    var ol = $('ob_steps'); ol.textContent = '';
    STEPS.forEach(function (s, i) { var li = el('li', i === V.step ? 'on' : i < V.step ? 'done' : '', (i + 1) + '. ' + s[1]); ol.appendChild(li); });
  }
  function input(fd, val) {
    var i;
    if (fd.type === 'long') { i = el('textarea'); i.maxLength = fd.max || 300; }
    else if (fd.type === 'gender' || fd.type === 'relation') { i = el('select'); [['', '–']].concat(fd.type === 'gender' ? [['male', 'Male'], ['female', 'Female'], ['other', 'Other']] : V.v.relations.map(function (r) { return [r, r.charAt(0).toUpperCase() + r.slice(1)]; })).forEach(function (o) { var x = el('option', '', o[1]); x.value = o[0]; i.appendChild(x); }); }
    else { i = el('input'); i.type = fd.type === 'date' ? 'date' : fd.type === 'email' ? 'email' : fd.type === 'mobile' || fd.type === 'pin' || fd.type === 'account' || fd.type === 'aadhaar' ? 'text' : 'text'; if (/mobile|pin|account|aadhaar/.test(fd.type)) i.inputMode = 'numeric'; if (fd.max) i.maxLength = fd.max; i.autocomplete = 'off'; }
    i.id = 'f_' + fd.key; i.value = val === undefined || val === null ? '' : val; return i;
  }
  function group(key) { return V.v.form.filter(function (g) { return g.key === key; })[0]; }
  function collect() { Array.prototype.forEach.call(document.querySelectorAll('#ob_step [id^="f_"]'), function (i) { V.data[i.id.slice(2)] = i.value; }); }
  function errBox(c) { var e = el('p', 'err'); e.hidden = true; e.setAttribute('role', 'alert'); c.appendChild(e); return e; }
  function nav(c, err, next) {
    var a = el('div', 'acts');
    if (V.step > 0) { var b = el('button', '', 'Back'); b.type = 'button'; b.onclick = function () { collect(); save().then(function () { V.step--; draw(); }, function (x) { err.textContent = x.message; err.hidden = false; }); }; a.appendChild(b); }
    if (next) { var n = el('button', 'pri', 'Save and next'); n.type = 'button'; n.onclick = function () { n.disabled = true; collect(); save().then(function () { V.step++; draw(); }, function (x) { n.disabled = false; err.textContent = x.message; err.hidden = false; }); }; a.appendChild(n); }
    c.appendChild(a);
  }
  var save = function () { return call('save', { t: T, data: V.data }).then(function (r) { V.v.email_verified = r.email_verified; }); };
  function fields(c, key) {
    var g = group(key); c.appendChild(el('h2', '', g.name));
    var row = null; g.fields.forEach(function (fd, i) {
      if (fd.type === 'long') { row = null; var d = el('div'), l = el('label', '', fd.label + (fd.need ? ' *' : '')); l.htmlFor = 'f_' + fd.key; d.appendChild(l); d.appendChild(input(fd, V.data[fd.key])); c.appendChild(d); return; }
      if (!row || row.childNodes.length === 2) { row = el('div', 'row'); c.appendChild(row); }
      var x = el('div'), lb = el('label', '', fd.label + (fd.need ? ' *' : '')); lb.htmlFor = 'f_' + fd.key; x.appendChild(lb); x.appendChild(input(fd, V.data[fd.key])); row.appendChild(x);
    });
  }
  function draw() {
    stepsDraw(); var c = $('ob_step'); c.textContent = ''; var key = STEPS[V.step][0];
    if (key === 'who' || key === 'address' || key === 'ids') { fields(c, key); if (key === 'ids') c.appendChild(el('p', 'muted', 'The bank: all four (bank, IFSC, account number, name as on bank) – or none. The HR office checks it before it is used.')); var e = errBox(c); nav(c, e, true); }
    else if (key === 'contact') { fields(c, key); emailBox(c); var e2 = errBox(c); nav(c, e2, true); }
    else if (key === 'papers') papersDraw(c);
    else if (key === 'policies') policiesDraw(c);
    else submitDraw(c);
    try { c.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) { /* fine */ }
  }
  // the e-mail: a 6-digit code sent to it
  function emailBox(c) {
    var b = el('div', 'paper'); c.appendChild(b);
    var st = el('p', V.v.email_verified ? 'ok' : 'muted', V.v.email_verified ? 'E-mail verified: ' + V.v.verified_email : 'Your e-mail must be verified: press “Send the code”, then type the code from the e-mail.'); b.appendChild(st);
    if (V.v.email_verified) return;
    var send = el('button', '', 'Send the code'); send.type = 'button'; var code = el('input'); code.inputMode = 'numeric'; code.maxLength = 6; code.placeholder = '6-digit code'; code.style.maxWidth = '180px'; code.autocomplete = 'one-time-code';
    var ok = el('button', 'pri', 'Verify'); ok.type = 'button'; var e = el('p', 'err'); e.hidden = true; var a = el('div', 'acts'); a.appendChild(send); a.appendChild(code); a.appendChild(ok); b.appendChild(a); b.appendChild(e);
    send.onclick = function () { collect(); send.disabled = true; e.hidden = true; save().then(function () { return call('emailCode', { t: T, email: V.data.email }); }).then(function () { send.disabled = false; st.textContent = 'The code was sent to ' + V.data.email + ' – it works 15 minutes.'; code.focus(); }, function (x) { send.disabled = false; e.textContent = x.message; e.hidden = false; }); };
    ok.onclick = function () { collect(); ok.disabled = true; e.hidden = true; call('emailVerify', { t: T, email: V.data.email, code: code.value }).then(function () { ok.disabled = false; V.v.email_verified = true; V.v.verified_email = V.data.email; draw(); }, function (x) { ok.disabled = false; e.textContent = x.message; e.hidden = false; }); };
  }
  // the papers: the ones asked for his work, each in its box; any other paper in ONE box (choose its kind); a paper he does not have – with why
  function paperForm(p, kinds, isNeed, have, na) {
    var kindSel = null, f = el('input'); f.type = 'file'; f.accept = 'image/jpeg,image/png,image/webp,application/pdf'; f.setAttribute('aria-label', 'File');
    var num = el('input'); num.placeholder = 'its number (if any)'; num.maxLength = 40; num.setAttribute('aria-label', 'Its number'); var exp = el('input'); exp.type = 'date'; exp.setAttribute('aria-label', 'Valid up to');
    if (kinds.length > 1) { kindSel = el('select'); kinds.forEach(function (k) { var o = el('option', '', k.name); o.value = k.key; kindSel.appendChild(o); }); var lk = el('label', '', 'Which paper'); p.appendChild(lk); p.appendChild(kindSel); }
    var kind = function () { var key = kindSel ? kindSel.value : kinds[0].key; return kinds.filter(function (k) { return k.key === key; })[0]; };
    var r = el('div', 'row'), a = el('div'), b = el('div'); a.appendChild(el('label', '', 'File')); a.appendChild(f); b.appendChild(el('label', '', 'Its number')); b.appendChild(num); r.appendChild(a); r.appendChild(b); p.appendChild(r);
    var eb = el('div'); eb.appendChild(el('label', '', 'Valid up to')); eb.appendChild(exp); p.appendChild(eb); var showExp = function () { eb.hidden = !kind().expires; }; showExp(); if (kindSel) kindSel.onchange = showExp;
    var e = el('p', 'err'); e.hidden = true; var acts = el('div', 'acts'), up = el('button', '', have ? 'Attach a new one' : 'Attach'); up.type = 'button'; acts.appendChild(up);
    up.onclick = function () { var file = f.files[0], k = kind(); e.hidden = true; if (!file) { e.textContent = 'Choose the file first.'; e.hidden = false; return; } up.disabled = true;
      call('uploadUrl', { t: T, kind: k.key, type: file.type, bytes: file.size }).then(function (u) { return fetch(u.url, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file }).then(function (rs) { if (!rs.ok) throw new Error('The file was not kept (' + rs.status + ') – try again.'); return call('docAdd', { t: T, kind: k.key, path: u.path, bytes: file.size, number: num.value, expires_on: eb.hidden ? '' : exp.value }); }); })
        .then(function () { return reload(); }, function (x) { up.disabled = false; e.textContent = x.message; e.hidden = false; }); };
    if (isNeed && !have) { var k0 = kinds[0], nb = el('button', '', na ? 'I have it after all' : 'I do not have it'); nb.type = 'button'; acts.appendChild(nb);
      nb.onclick = function () { if (na) { call('docNa', { t: T, kind: k0.key, na: false }).then(reload, function (x) { e.textContent = x.message; e.hidden = false; }); return; } var why = window.prompt('Why do you not have “' + k0.name + '”?'); if (why === null) return; call('docNa', { t: T, kind: k0.key, reason: why }).then(reload, function (x) { e.textContent = x.message; e.hidden = false; }); }; }
    p.appendChild(acts); p.appendChild(e);
  }
  function papersDraw(c) {
    c.appendChild(el('h2', '', 'Papers')); c.appendChild(el('p', 'muted', 'A photo or a PDF, at most ' + V.v.maxMb + ' MB each. The ones marked * are asked of you – if you do not have one, say why.'));
    var need = V.v.docs_needed, nameOf = function (k) { return (V.v.kinds.filter(function (x) { return x.key === k; })[0] || { name: k }).name; };
    V.v.kinds.filter(function (k) { return need.indexOf(k.key) > -1; }).forEach(function (k) {
      var have = V.v.docs.filter(function (d) { return d.kind === k.key; }), na = V.v.na[k.key], p = el('div', 'paper');
      p.appendChild(el('b', '', k.name + ' *')); p.appendChild(el('span', 'st ' + (have.length ? 'have' : na ? '' : 'miss'), have.length ? 'Attached ' + have.map(function (d) { return dmy(d.at); }).join(', ') : na ? 'You do not have it: ' + na : 'Not attached yet'));
      paperForm(p, [k], true, have.length > 0, na); c.appendChild(p);
    });
    var other = V.v.kinds.filter(function (k) { return need.indexOf(k.key) < 0; }), extra = V.v.docs.filter(function (d) { return need.indexOf(d.kind) < 0; });
    if (other.length) { var p2 = el('div', 'paper'); p2.appendChild(el('b', '', 'Another paper (optional)')); p2.appendChild(el('span', 'st' + (extra.length ? ' have' : ''), extra.length ? 'Attached: ' + extra.map(function (d) { return nameOf(d.kind); }).join(', ') : 'e.g. education certificate, driving licence, experience letter'));
      paperForm(p2, other, false, false, null); c.appendChild(p2); }
    var er = errBox(c); nav(c, er, true);
  }
  function policiesDraw(c) {
    c.appendChild(el('h2', '', 'Policies')); if (!V.v.policies.length) c.appendChild(el('p', 'muted', 'No policy to accept.'));
    V.v.policies.forEach(function (p) {
      var b = el('div', 'policy'); b.appendChild(el('b', '', p.title + (p.mandatory ? ' *' : ''))); b.appendChild(el('p', 'muted', 'Version ' + p.version + ' · in force from ' + dmy(p.effective_from)));
      if (p.body) b.appendChild(el('pre', '', p.body)); if (p.has_file) b.appendChild(el('p', 'muted', 'It also has a PDF – the HR office gives it to you.'));
      if (p.accepted_at) b.appendChild(el('p', 'ok', 'Accepted ' + dmy(p.accepted_at)));
      else { var t = el('label', 'tick'), cb = el('input'); cb.type = 'checkbox'; t.appendChild(cb); t.appendChild(el('span', '', 'I have read this policy and I accept it.')); b.appendChild(t); var e = el('p', 'err'); e.hidden = true; var go = el('button', 'pri', 'Accept'); go.type = 'button'; b.appendChild(go); b.appendChild(e);
        go.onclick = function () { go.disabled = true; call('accept', { t: T, version: p.version_id, read: cb.checked, device: navigator.userAgent.slice(0, 100) }).then(reload, function (x) { go.disabled = false; e.textContent = x.message; e.hidden = false; }); }; }
      c.appendChild(b);
    });
    var er = errBox(c); nav(c, er, true);
  }
  function submitDraw(c) {
    c.appendChild(el('h2', '', 'Submit')); c.appendChild(el('p', 'muted', 'The HR office checks what you wrote and your papers. You get your sign-in for the app after it is approved.'));
    var t = el('label', 'tick'), cb = el('input'); cb.type = 'checkbox'; t.appendChild(cb); t.appendChild(el('span', '', 'What I have written is true, and the papers are mine.')); c.appendChild(t);
    var e = errBox(c), a = el('div', 'acts'), back = el('button', '', 'Back'); back.type = 'button'; back.onclick = function () { V.step--; draw(); }; a.appendChild(back);
    var go = el('button', 'pri', 'Submit'); go.type = 'button'; a.appendChild(go); c.appendChild(a);
    go.onclick = function () { go.disabled = true; e.hidden = true; call('submit', { t: T, declare: cb.checked }).then(function () { done('Submitted. Thank you – the HR office checks it and tells you.'); }, function (x) { go.disabled = false; e.textContent = x.message; e.hidden = false; }); };
  }
  function done(text) { $('ob_form').hidden = true; msg(text, 'ok'); }
  function reload() { return call('open', { t: T }).then(function (v) { V.v = v; V.data = v.data || {}; draw(); }); }
  function start() {
    if (EC) { msg('Checking…'); call('verify', { e: EC }).then(function (r) { msg(r.already ? 'Your e-mail was already verified.' : 'Thank you – your e-mail is verified.', 'ok'); }, function (x) { msg(x.message, 'err'); }); return; }
    if (!T) { msg('This page opens from the link the HR office sent you.', 'err'); return; }
    call('open', { t: T }).then(function (v) {
      V.v = v; V.data = v.data || {};
      if (v.status === 'submitted' || v.status === 'under_verification') return done('Your form is submitted – the HR office is checking it.');
      if (v.status === 'approved' || v.status === 'active') return done('Your joining is approved. The HR office gives you your sign-in for the app.');
      $('ob_msg').hidden = true; $('ob_form').hidden = false; $('ob_hello').textContent = 'Welcome, ' + (v.name || '') + '!';
      $('ob_until').textContent = 'Fill your details, attach your papers and accept the policies. This link works until ' + dmy(v.until) + ' and only for you.';
      if (v.back_reason) { $('ob_back').textContent = 'The HR office asks you to correct: ' + v.back_reason; $('ob_back').hidden = false; }
      draw();
    }, function (x) { msg(x.message, 'err'); });
  }
  start();
})();
