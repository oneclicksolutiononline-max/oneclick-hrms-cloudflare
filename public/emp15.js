/* HR – PHASE 2 (step 15, 18-11-2026): the new joiner's LINK, the PAPERS TO VERIFY, the COMPANY'S POLICIES (three pages), and on an
 * employee's page: his REPORTING managers with dates, WHERE HE MAY MARK (IN / OUT, dates), his MEDICAL INSURANCE, his e-mail check
 * and "Make active". hr.js opens it: HR15.open(page, me, init) and HR15.emp(employee, live, me, init).
 * Every text of a person is put in as TEXT, never as HTML. What the server refuses is said as it said it. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  var api = function (action, body) { return window.HRAPI('api/hr', Object.assign({ action: action }, body || {})); };
  var dmy = function (d) { return d ? String(d).slice(0, 10).split('-').reverse().join('-') : ''; };
  var when = function (t) { if (!t) return ''; var d = new Date(t); return dmy(new Date(d.getTime() + 19800000).toISOString()) + ' ' + new Date(d.getTime() + 19800000).toISOString().slice(11, 16); };
  function toast(t, bad) { var e = $('toast'); e.textContent = t; e.className = bad ? 'bad' : ''; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, bad ? 8000 : 3500); }
  function fail(e) { toast(e && e.message ? e.message : 'HR did not answer – try again.', true); }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
  function busy(b, on) { if (b) b.disabled = !!on; }
  function field(label, input) { var d = el('div'), l = el('label', '', label); if (input.id) l.htmlFor = input.id; d.appendChild(l); d.appendChild(input); return d; }
  function inp(type, val, ph) { var i = el('input'); i.type = type || 'text'; if (val !== undefined && val !== null) i.value = val; if (ph) i.placeholder = ph; i.autocomplete = 'off'; return i; }
  function sel(list, val) { var s = el('select'); list.forEach(function (o) { var x = el('option', '', o[1]); x.value = o[0]; s.appendChild(x); }); if (val !== undefined) s.value = val; return s; }
  var base = function () { return location.origin + location.pathname.replace(/[^/]*$/, ''); };
  var V = { me: null, init: null, page: '', which: 'waiting', ticked: {} };
  var isAdmin = function () { return V.me && (V.me.user.role === 'admin' || V.me.user.role === 'super'); };
  var CAT = [['staff', 'Staff'], ['operator', 'Operator'], ['driver', 'Driver'], ['labour', 'Labour']];
  var INV_ST = { sent: 'Sent', in_progress: 'Being filled', submitted: 'Submitted – to check', under_verification: 'Being checked', rejected: 'Rejected', approved: 'Approved – employee added', active: 'Active', cancelled: 'Cancelled', expired: 'Expired' };
  var stCls = function (s) { return s === 'approved' || s === 'active' || s === 'verified' ? 's-active' : s === 'rejected' || s === 'cancelled' || s === 'expired' ? 's-pending' : 's-incomplete'; };
  function table(heads) { var t = el('table'), h = el('tr'); heads.forEach(function (x) { h.appendChild(el('th', '', x)); }); var th = el('thead'); th.appendChild(h); t.appendChild(th); var tb = el('tbody'); t.appendChild(tb); return { t: t, b: tb }; }
  function readyNote(root, e) { root.textContent = ''; var p = el('p', 'warn', e && e.message ? e.message : 'HR did not answer – try again.'); root.appendChild(p); }

  /* ───────────── THE NEW JOINER'S LINK (Joining) ───────────── */
  // keep: the card above the list (a link just made) stays
  function joining(keep) {
    var root = $('p_15'), make = keep && $('j_make'), list = el('div'); if (!make) { root.textContent = ''; make = el('div'); make.id = 'j_make'; } else { while (make.nextSibling) make.nextSibling.remove(); }
    root.appendChild(make); root.appendChild(list); list.appendChild(el('p', 'none', 'Reading…'));
    if (window.HRHEAD) window.HRHEAD.set('Joining', 'A link for a new joiner: he fills his details, attaches his papers, verifies his e-mail and accepts the policies – the HR Admin checks and approves.', [btn('pri', 'New joining link', function () { makeForm(); })]);
    api('invList', {}).then(function (r) {
      list.textContent = ''; var box = el('div', 'pc15'); list.appendChild(box);
      if (!r.rows.length) { box.appendChild(el('p', 'none', 'No joining link yet – press “New joining link”.')); return; }
      var T = table(['Name', 'Category', 'Mobile / e-mail', 'State', 'Sent', 'Opened', 'Submitted', '']); box.appendChild(T.t);
      r.rows.forEach(function (x) {
        var tr = el('tr'); tr.appendChild(el('td', '', x.prefill.name)); tr.appendChild(el('td', '', (CAT.filter(function (c) { return c[0] === x.prefill.category; })[0] || [0, x.prefill.category])[1]));
        tr.appendChild(el('td', '', [x.prefill.mobile, x.prefill.email].filter(Boolean).join(' · '))); var st = el('td'); st.appendChild(el('span', 'st ' + stCls(x.status), INV_ST[x.status] || x.status)); tr.appendChild(st);
        tr.appendChild(el('td', '', when(x.last_sent_at) + (x.sends > 1 ? ' (' + x.sends + '×)' : ''))); tr.appendChild(el('td', '', when(x.opened_at))); tr.appendChild(el('td', '', when(x.submitted_at)));
        var a = el('td'); a.appendChild(btn('sm', x.status === 'submitted' ? 'Check…' : 'Open', function () { review(x.id); }));
        if (['sent', 'in_progress', 'expired'].indexOf(x.status) > -1) a.appendChild(btn('sm ghost', 'Send again', function (ev) { var b = ev.target; busy(b, true); api('invResend', { id: x.id, base: base() }).then(function (k) { busy(b, false); linkShown(k.link, k.mail); joining(true); }, function (er) { busy(b, false); fail(er); }); }));
        if (['approved', 'active', 'cancelled', 'rejected'].indexOf(x.status) < 0) a.appendChild(btn('sm ghost', 'Cancel', function () { var why = window.prompt('Why is this link cancelled?'); if (why === null) return; api('invCancel', { id: x.id, reason: why }).then(function () { toast('Cancelled – the link no longer works.'); joining(); }, fail); }));
        tr.appendChild(a); T.b.appendChild(tr);
      });
    }, function (e) { readyNote(list, e); });
  }
  function linkShown(link, mail) {
    var box = $('j_make') || $('p_15'); box.textContent = ''; var c = el('div', 'pc15'); c.appendChild(el('h3', '', 'The link'));
    c.appendChild(el('p', '', mail && mail.sent ? 'It was sent to his e-mail. You can also send it on WhatsApp – it is shown only now:' : 'It was NOT sent by e-mail (' + ((mail && mail.why) || 'no e-mail') + '). Send it to him yourself – it is shown only now:'));
    var i = inp('text', link); i.readOnly = true; i.style.width = '100%'; c.appendChild(i);
    c.appendChild(btn('sec', 'Copy the link', function () { i.select(); try { navigator.clipboard.writeText(link).then(function () { toast('Copied.'); }, function () { document.execCommand('copy'); toast('Copied.'); }); } catch (e) { document.execCommand('copy'); toast('Copied.'); } }));
    box.appendChild(c);
  }
  function makeForm() {
    var box = $('j_make'); if (!box) return; box.textContent = ''; var c = el('div', 'pc15'); c.appendChild(el('h3', '', 'New joining link')); var g = el('div', 'grid g3');
    var f = { name: inp('text', '', 'as on Aadhaar'), category: sel([['', '– choose –']].concat(CAT)), mobile: inp('tel', '', '10 digits'), email: inp('email', '', 'the link goes here'), joined_on: inp('date'), days: sel([['7', '7 days'], ['3', '3 days'], ['15', '15 days'], ['30', '30 days']], '7'),
      department_id: sel([['', '– none –']].concat(((V.init && V.init.departments) || []).filter(function (d) { return d.active; }).map(function (d) { return [d.id, d.name]; }))), designation_id: sel([['', '– none –']].concat(((V.init && V.init.designations) || []).filter(function (d) { return d.active; }).map(function (d) { return [d.id, d.name]; }))) };
    [['Name *', 'name'], ['Category *', 'category'], ['Mobile', 'mobile'], ['E-mail', 'email'], ['Joining date', 'joined_on'], ['Department', 'department_id'], ['Designation', 'designation_id'], ['The link works for', 'days']].forEach(function (x) { g.appendChild(field(x[0], f[x[1]])); });
    c.appendChild(g); var err = el('p', 'err'); err.hidden = true; c.appendChild(err);
    var go = btn('pri', 'Make the link and send it', function () {
      busy(go, true); err.hidden = true; var p = {}; Object.keys(f).forEach(function (k) { if (k !== 'days') p[k] = f[k].value; });
      api('invMake', { prefill: p, days: +f.days.value, base: base() }).then(function (r) { busy(go, false); linkShown(r.link, r.mail); joining(true); }, function (e) { busy(go, false); err.textContent = e.message; err.hidden = false; });
    });
    var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start'; acts.appendChild(go); acts.appendChild(btn('sec', 'Cancel', function () { box.textContent = ''; })); c.appendChild(acts); box.appendChild(c); f.name.focus();
  }
  // one joiner's form: what he wrote, his papers, the policies; approve / send back / reject (the HR Admin)
  function review(id) {
    var root = $('p_15'); root.textContent = ''; root.appendChild(el('p', 'none', 'Reading…'));
    api('invGet', { id: id }).then(function (r) {
      root.textContent = ''; var inv = r.invite, c = el('div', 'pc15');
      c.appendChild(btn('sm ghost', '‹ Joining', function () { joining(); })); c.appendChild(el('h3', '', (inv.prefill.name || '') + ' – ' + (INV_ST[inv.status] || inv.status)));
      c.appendChild(el('p', 'muted', 'Link works until ' + when(inv.expires_at) + ' · opened ' + (when(inv.opened_at) || '–') + ' · submitted ' + (when(inv.submitted_at) || '–') + (inv.from_ip ? ' · from ' + inv.from_ip : '') + ' · e-mail ' + (inv.email_verified_at ? 'verified' : 'NOT verified')));
      if (inv.reject_reason) c.appendChild(el('p', 'warn', 'Said to him: ' + inv.reject_reason));
      r.form.forEach(function (g) { c.appendChild(el('h4', '', g.name)); var dl = el('dl', 'kv'); g.fields.forEach(function (fd) { var v = r.data[fd.key]; if (v === undefined || v === '') return; dl.appendChild(el('dt', '', fd.label)); dl.appendChild(el('dd', '', fd.type === 'date' ? dmy(v) : v)); }); c.appendChild(dl); });
      c.appendChild(el('h4', '', 'Papers'));
      var ul = el('ul', 'hist'); r.docs.forEach(function (d) { var li = el('li'); li.appendChild(el('b', '', d.kind_name)); li.appendChild(el('span', '', (d.number ? ' · ' + d.number : '') + (d.issued_on ? ' · issued ' + dmy(d.issued_on) : '') + (d.expires_on ? ' · valid up to ' + dmy(d.expires_on) : '')));
        if (d.url) li.appendChild(btn('sm', 'Open', function () { window.open(d.url, '_blank', 'noopener'); })); else li.appendChild(el('span', 'muted', ' · opened only by the HR Admin')); ul.appendChild(li); });
      Object.keys(r.na || {}).forEach(function (k) { ul.appendChild(el('li', '', k + ' – he does not have it: ' + r.na[k])); });
      if (!ul.childNodes.length) ul.appendChild(el('li', 'muted', 'None.')); c.appendChild(ul);
      c.appendChild(el('h4', '', 'Policies accepted')); var pl = el('ul', 'hist'); (r.accepts || []).forEach(function (a) { pl.appendChild(el('li', '', 'version ' + a.version_id + ' · ' + when(a.at))); }); if (!pl.childNodes.length) pl.appendChild(el('li', 'muted', 'None.')); c.appendChild(pl);
      if (['submitted', 'under_verification'].indexOf(inv.status) > -1) {
        if (isAdmin()) {
          var why = inp('text', '', 'what is wrong / needed (for Send back and Reject)'); why.style.width = '100%'; c.appendChild(field('Reason', why));
          var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start';
          var dec = function (o, label) { return btn(o.ok ? 'pri' : o.back ? 'sec' : 'danger', label, function (ev) { var b = ev.target; busy(b, true); api('invDecide', Object.assign({ id: id, reason: why.value }, o)).then(function (x) { busy(b, false); toast(o.ok ? 'Approved – ' + x.employee.code + ' added' + (x.bank && x.bank.waiting ? '; his bank details wait for their approval' : '') + '.' : o.back ? 'Sent back to him.' : 'Rejected.'); if (o.ok && x.employee && window.HR && window.HR.signin) window.HR.signin([x.employee]); review(id); }, function (er) { busy(b, false); fail(er); }); }); };
          acts.appendChild(dec({ ok: true }, 'Approve – add the employee')); acts.appendChild(dec({ ok: false, back: true }, 'Send back to correct')); acts.appendChild(dec({ ok: false }, 'Reject')); c.appendChild(acts);
        } else c.appendChild(el('p', 'muted', 'The HR Admin or the Super Admin approves it.'));
      }
      root.appendChild(c);
    }, function (e) { readyNote(root, e); });
  }

  /* ───────────── THE PAPERS TO VERIFY ───────────── */
  var DOC_ST = { submitted: 'Submitted', under_verification: 'Under verification', verified: 'Verified', rejected: 'Rejected' };
  function papers() {
    var root = $('p_15'); root.textContent = ''; root.appendChild(el('p', 'none', 'Reading…')); V.ticked = {};
    var chips = el('div', 'tools'); [['waiting', 'To verify'], ['expiring', 'Running out (30 days)'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['seven', 'Seven-day rule']].forEach(function (w) { var b = btn(V.which === w[0] ? 'sm' : 'sm ghost', w[1], function () { V.which = w[0]; papers(); }); if (V.which === w[0]) b.setAttribute('aria-pressed', 'true'); chips.appendChild(b); });
    if (window.HRHEAD) window.HRHEAD.set('Papers to verify', 'Every paper attached on this site – the HR Admin looks at it and marks it verified or rejected (never his own).', []);
    var top = function () { root.textContent = ''; root.appendChild(chips); };
    if (V.which === 'seven') return seven(root, top);
    api('docQueue', { which: V.which }).then(function (r) {
      top(); var c = el('div', 'pc15'); root.appendChild(c);
      if (!r.rows.length) { c.appendChild(el('p', 'none', V.which === 'waiting' ? 'Nothing waits – every paper is looked at.' : 'None.')); return; }
      var T = table(['', 'Employee', 'Paper', 'Number', 'Issued', 'Valid up to', 'Attached', 'State', '']); c.appendChild(T.t);
      r.rows.forEach(function (x) {
        var tr = el('tr'), tk = el('td'); if (x.can && (V.which === 'waiting' || V.which === 'expiring')) { var cb = inp('checkbox'); cb.onchange = function () { if (cb.checked) V.ticked[x.id] = 1; else delete V.ticked[x.id]; }; tk.appendChild(cb); } else if (x.own) tk.appendChild(el('span', 'muted', 'yours'));
        tr.appendChild(tk); tr.appendChild(el('td', '', x.employee.name + ' (' + x.employee.code + ')')); tr.appendChild(el('td', '', x.kind_name)); tr.appendChild(el('td', '', x.number || '')); tr.appendChild(el('td', '', dmy(x.issued_on))); tr.appendChild(el('td', '', dmy(x.expires_on)));
        tr.appendChild(el('td', '', when(x.created_at) + ' · ' + x.created_by)); var st = el('td'); st.appendChild(el('span', 'st ' + stCls(x.status), DOC_ST[x.status] || x.status)); if (x.verify_note) st.appendChild(el('div', 'muted', x.verify_note)); tr.appendChild(st);
        var o = el('td'); o.appendChild(btn('sm', 'Open', function (ev) { var b = ev.target; busy(b, true); api('docLink', { doc: x.id }).then(function (k) { busy(b, false); window.open(k.url, '_blank', 'noopener'); if (x.status === 'submitted' && x.can) api('docTake', { ids: [x.id] }).catch(function () { /* fine */ }); }, function (er) { busy(b, false); fail(er); }); })); tr.appendChild(o);
        T.b.appendChild(tr);
      });
      if (isAdmin() && (V.which === 'waiting' || V.which === 'expiring')) {
        var note = inp('text', '', 'why rejected / what is needed'); note.style.minWidth = '280px'; var again = inp('checkbox'); again.checked = true; again.id = 'pv_again';
        var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start'; acts.style.flexWrap = 'wrap';
        var dec = function (ok) { return function (ev) { var ids = Object.keys(V.ticked), b = ev.target; if (!ids.length) return toast('Tick the papers first.', true); busy(b, true); api('docVerify', { ids: ids, ok: ok, note: note.value, again: !ok && again.checked }).then(function (k) { busy(b, false); toast(k.done + ' paper(s) ' + (ok ? 'verified' : 'rejected') + '.' + (k.skipped.length ? ' Not done: ' + k.skipped.join('; ') : ''), !!k.skipped.length); papers(); }, function (er) { busy(b, false); fail(er); }); }; };
        acts.appendChild(btn('pri', 'Verified – the ticked', dec(true))); acts.appendChild(note); var lb = el('label', '', ' ask him to attach it again'); lb.prepend(again); acts.appendChild(lb); acts.appendChild(btn('danger', 'Reject the ticked', dec(false))); c.appendChild(acts);
      }
    }, function (e) { readyNote(root, e); });
  }

  /* (step 16) THE SEVEN-DAY RULE: the setting (the Super Admin changes it) and the people late with their papers – held, or let in */
  function seven(root, top) {
    api('docRuleGet', {}).then(function (g) {
      top(); var c = el('div', 'pc15'), r = g.rule; root.appendChild(c);
      c.appendChild(el('h3', '', 'Seven-day document rule – ' + (r.on ? 'ON' : 'OFF')));
      c.appendChild(el('p', 'muted', r.on ? 'A ' + r.categories.join(' / ') + ' person must have these papers within ' + r.days + ' days of joining: ' + g.kinds.filter(function (k) { return r.docs.indexOf(k.key) > -1; }).map(function (k) { return k.name; }).join(', ') + '. After that his “My HR” opens only his papers, his policies and his record – until they are there, or until the HR Admin lets him in.' : 'Off – nobody is held. Only the Super Admin turns it on.'));
      if (!g.ready) c.appendChild(el('p', 'warn', 'This part is not set up yet: the Super Admin runs sql/hr_step16_attendance.sql once in the rcl-hr Supabase → SQL Editor.'));
      if (g.can && g.ready) {
        var f = el('div', 'grid g3'), on = sel([['1', 'On'], ['0', 'Off']], r.on ? '1' : '0'), days = inp('number', r.days), where = sel([['ALL', 'Every site'], ['SITE', 'This site only']], r.from === 'ALL' || !r.from ? 'ALL' : 'SITE'), cats = el('div'), docs = el('div');
        days.min = 1; days.max = 60;
        g.categories.forEach(function (k) { var l = el('label', '', ' ' + k.name), cb = inp('checkbox'); cb.value = k.key; cb.checked = r.categories.indexOf(k.key) > -1; l.prepend(cb); cats.appendChild(l); });
        g.kinds.forEach(function (k) { var l = el('label', '', ' ' + k.name), cb = inp('checkbox'); cb.value = k.key; cb.checked = r.docs.indexOf(k.key) > -1; l.prepend(cb); l.style.display = 'block'; docs.appendChild(l); });
        f.appendChild(field('Rule', on)); f.appendChild(field('Days after joining', days)); f.appendChild(field('For', where)); f.appendChild(field('Categories', cats)); f.appendChild(field('Papers', docs)); c.appendChild(f);
        var ticked = function (box) { return Array.prototype.filter.call(box.querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return i.value; }); };
        c.appendChild(btn('pri sm', 'Save the rule', function (ev) { var b = ev.target; busy(b, true); api('docRuleSave', { site: where.value === 'ALL' ? 'ALL' : '', rule: { on: on.value === '1', days: +days.value, categories: ticked(cats), docs: ticked(docs) } }).then(function () { busy(b, false); toast('Saved.'); seven(root, top); }, function (x) { busy(b, false); fail(x); }); }));
      }
      if (!r.on) return;
      var lc = el('div', 'pc15'); root.appendChild(lc); lc.appendChild(el('p', 'none', 'Reading…'));
      api('docRuleList', {}).then(function (l) {
        lc.textContent = ''; lc.appendChild(el('h3', '', 'People with papers still missing'));
        if (!l.rows.length) { lc.appendChild(el('p', 'none', 'Nobody – every paper is there.')); return; }
        var T = table(['Employee', 'Joined', 'Due by', 'Missing', 'Where he stands', '']); lc.appendChild(T.t);
        l.rows.forEach(function (x) {
          var tr = el('tr'); tr.appendChild(el('td', '', x.name + ' (' + x.code + ')')); tr.appendChild(el('td', '', dmy(x.joined_on))); tr.appendChild(el('td', '', dmy(x.due))); tr.appendChild(el('td', '', x.missing.join(', ')));
          var st = el('td'); st.appendChild(el('span', 'st ' + (x.blocked ? 's-pending' : x.override ? 's-active' : 's-incomplete'), x.blocked ? 'Held – only his papers open' : x.override ? 'Let in up to ' + dmy(x.override.until) : 'Not due yet')); if (x.override) st.appendChild(el('div', 'muted', x.override.reason)); tr.appendChild(st);
          var a = el('td');
          if (isAdmin()) {
            if (x.override) a.appendChild(btn('sm ghost', 'End', function () { var why = window.prompt('Why does it end?'); if (why === null) return; api('docOverrideEnd', { id: x.id, reason: why }).then(function () { toast('Ended.'); seven(root, top); }, fail); }));
            else if (x.late) { var u = inp('date'), w = inp('text', '', 'why'); u.style.maxWidth = '150px'; w.style.maxWidth = '180px'; a.appendChild(u); a.appendChild(w); a.appendChild(btn('sm', 'Let in', function (ev) { var b = ev.target; busy(b, true); api('docOverride', { id: x.id, until: u.value, reason: w.value }).then(function () { busy(b, false); toast('Let in.'); seven(root, top); }, function (er) { busy(b, false); fail(er); }); })); }
          }
          tr.appendChild(a); T.b.appendChild(tr);
        });
      }, function (e) { readyNote(lc, e); });
    }, function (e) { readyNote(root, e); });
  }

  /* ───────────── THE COMPANY'S POLICIES ───────────── */
  // (18-11-2026, his correction) a policy is of its own site; one made before without a site is of every site until it is saved again
  var scopeWords = function (sc) { sc = sc || {}; var o = [sc.sites ? 'site ' + sc.sites.join(', ') : 'every site (an old policy)']; if (sc.categories) o.push(sc.categories.join(', ')); if (sc.departments) o.push(sc.departments.length + ' department(s)'); return o.join(' · '); }, cpSite = '';
  function cpolicies() {
    var root = $('p_15'); root.textContent = ''; root.appendChild(el('p', 'none', 'Reading…'));
    api('cpList', {}).then(function (r) {
      cpSite = r.site || '';
      if (window.HRHEAD) window.HRHEAD.set('Rule Book', 'Company policies – documents every person reads and accepts. Made and published by the HO HR or the Super Admin; a change is a new version.', r.can ? [btn('pri', 'New policy', function () { polForm(null); })] : []);
      root.textContent = ''; var top = el('div'); top.id = 'cp_form'; root.appendChild(top);
      if (!r.rows.length) { root.appendChild(el('p', 'none', 'No company policy yet.')); return; }
      r.rows.forEach(function (p) {
        var c = el('div', 'pc15'), h = el('h3', '', p.title + (p.active ? '' : ' (switched off)')); c.appendChild(h);
        c.appendChild(el('p', 'muted', (p.category ? p.category + ' · ' : '') + (p.mandatory ? 'must be accepted' : 'to read') + ' · for: ' + scopeWords(p.scope) + ' · in force: ' + (p.in_force ? 'version ' + p.in_force.version + ' from ' + dmy(p.in_force.effective_from) : 'none yet') + ' · this site: ' + p.accepted + ' of ' + p.people + ' accepted'));
        var ul = el('ul', 'hist'); p.versions.forEach(function (v) { var li = el('li'); li.appendChild(el('b', '', 'Version ' + v.version)); li.appendChild(el('span', '', ' · from ' + dmy(v.effective_from) + ' · ' + (v.status === 'published' ? 'published ' + when(v.published_at) + ' by ' + v.published_by : 'draft')));
          if (v.file_path) li.appendChild(btn('sm', 'PDF', function () { api('cpFileLink', { version: v.id }).then(function (k) { window.open(k.url, '_blank', 'noopener'); }, fail); }));
          if (r.can && v.status === 'draft') { li.appendChild(btn('sm', 'Change', function () { verForm(p, v); })); li.appendChild(btn('sm pri', 'Publish', function () { if (!window.confirm('Publish version ' + v.version + '? A published version is never changed, and everybody it is for is asked to accept it.')) return; api('cpPublish', { version: v.id }).then(function () { toast('Published.'); cpolicies(); }, fail); })); li.appendChild(btn('sm ghost', 'Throw away', function () { api('cpDraftDelete', { version: v.id }).then(function () { cpolicies(); }, fail); })); }
          ul.appendChild(li); }); c.appendChild(ul);
        var acts = el('div', 'ep-row'); acts.appendChild(btn('sec sm', 'Who accepted', function (ev) { whoAccepted(p, c, ev.target); }));
        if (r.can) { acts.appendChild(btn('sec sm', 'Change', function () { polForm(p); })); if (!p.versions.some(function (v) { return v.status === 'draft'; })) acts.appendChild(btn('sec sm', 'New version', function () { verForm(p, null); })); }
        c.appendChild(acts); root.appendChild(c);
      });
    }, function (e) { readyNote(root, e); });
  }
  function polForm(p) {
    var box = $('cp_form'); box.textContent = ''; var c = el('div', 'pc15'); c.appendChild(el('h3', '', p ? 'Change “' + p.title + '”' : 'New policy')); var g = el('div', 'grid g3');
    var sc = (p && p.scope) || { all: true }, t = inp('text', p ? p.title : ''), cat = inp('text', p ? p.category : '', 'e.g. Conduct, Safety, IT'), mand = sel([['1', 'Must be accepted'], ['0', 'Only to read']], p && !p.mandatory ? '0' : '1'), act = sel([['1', 'On'], ['0', 'Off']], p && !p.active ? '0' : '1');
    var sites = el('div', 'muted', ((p && sc.sites) || [cpSite]).join(', ') + (p ? '' : ' – only this site; for another site, open that site at the top')), cats = el('div'); CAT.forEach(function (k) { var l = el('label', '', ' ' + k[1]), cb = inp('checkbox'); cb.value = k[0]; cb.checked = (sc.categories || []).indexOf(k[0]) > -1; l.prepend(cb); cats.appendChild(l); });
    g.appendChild(field('Title *', t)); g.appendChild(field('Kind', cat)); g.appendChild(field('Accepting', mand)); g.appendChild(field('Site', sites)); g.appendChild(field('For the categories (none ticked = all)', cats)); g.appendChild(field('Switched', act)); c.appendChild(g);
    var err = el('p', 'err'); err.hidden = true; c.appendChild(err);
    var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start';
    acts.appendChild(btn('pri', 'Save', function (ev) { var b = ev.target, cs = Array.prototype.filter.call(cats.querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return i.value; });
      busy(b, true); api('cpSave', { id: p ? p.id : 0, title: t.value, category: cat.value, mandatory: mand.value === '1', active: act.value === '1', scope: { categories: cs } }).then(function () { busy(b, false); toast('Saved.'); cpolicies(); }, function (e) { busy(b, false); err.textContent = e.message; err.hidden = false; }); }));
    acts.appendChild(btn('sec', 'Cancel', function () { box.textContent = ''; })); c.appendChild(acts); box.appendChild(c); t.focus();
  }
  function verForm(p, v) {
    var box = $('cp_form'); box.textContent = ''; var c = el('div', 'pc15'); c.appendChild(el('h3', '', p.title + ' – ' + (v ? 'version ' + v.version + ' (draft)' : 'new version')));
    var body = el('textarea'); body.rows = 12; body.style.width = '100%'; body.placeholder = 'The policy as people will read it (or attach its PDF)'; var from = inp('date', v ? v.effective_from : new Date(Date.now() + 19800000).toISOString().slice(0, 10)), file = inp('file'); file.accept = 'application/pdf';
    c.appendChild(field('Text', body)); var g = el('div', 'grid g3'); g.appendChild(field('In force from', from)); g.appendChild(field('PDF (optional, at most 10 MB)', file)); c.appendChild(g);
    var err = el('p', 'err'); err.hidden = true; c.appendChild(err); var path = v ? v.file_path || '' : '';
    if (v) api('cpList', {}).then(function () { /* the text of a draft is in the version row – asked with the file */ });
    var save = btn('pri', 'Save the draft', function () {
      busy(save, true); err.hidden = true; var f = file.files[0];
      var up = f ? api('cpFileUrl', { policy: p.id, type: f.type, bytes: f.size }).then(function (u) { return fetch(u.url, { method: 'PUT', headers: { 'Content-Type': f.type, 'x-upsert': 'false' }, body: f }).then(function (rs) { if (!rs.ok) throw new Error('The PDF was not kept (' + rs.status + ') – try again.'); path = u.path; }); }) : Promise.resolve();
      up.then(function () { return api('cpVersionSave', { policy: p.id, body: body.value, effective_from: from.value, file_path: path }); }).then(function (r) { busy(save, false); toast('Draft version ' + r.version + ' saved – publish it when it is ready.'); cpolicies(); }, function (e) { busy(save, false); err.textContent = e.message; err.hidden = false; });
    });
    var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start'; acts.appendChild(save); acts.appendChild(btn('sec', 'Cancel', function () { box.textContent = ''; })); c.appendChild(acts); box.appendChild(c); body.focus();
  }
  function whoAccepted(p, card, b) {
    var old = card.querySelector('.cp-who'); if (old) { old.remove(); return; } busy(b, true);
    api('cpAccepts', { policy: p.id }).then(function (r) { busy(b, false); var w = el('div', 'cp-who'), T = table(['Code', 'Name', 'Accepted']); r.rows.forEach(function (x) { var tr = el('tr'); tr.appendChild(el('td', '', x.code)); tr.appendChild(el('td', '', x.name)); tr.appendChild(el('td', '', x.accepted_at ? when(x.accepted_at) + ' (' + x.via + ')' : 'not yet')); T.b.appendChild(tr); });
      w.appendChild(el('p', 'muted', 'Version ' + (r.version || '–') + ' · ' + r.rows.filter(function (x) { return x.accepted_at; }).length + ' of ' + r.rows.length + ' accepted')); w.appendChild(T.t); card.appendChild(w); }, function (e) { busy(b, false); fail(e); });
  }

  /* ───────────── ON AN EMPLOYEE'S PAGE ───────────── */
  var ROLE = { primary: 'Reports to', functional: 'Functional', administrative: 'Administrative', project: 'Project', site: 'Site', other: 'Other' };
  function emp(e, live, me, init) {
    V.me = me; V.init = init; var box = $('d_15'); if (!box) return; box.textContent = '';
    if (!e || !e.id) return;
    var rep = el('div', 'ep-card'), plc = el('div', 'ep-card'), ins = el('div', 'ep-card'), act = el('div', 'ep-card');
    [act, rep, plc, ins].forEach(function (c) { c.appendChild(el('p', 'muted', 'Reading…')); box.appendChild(c); });
    activeCard(act, e, live); reporting(rep, e, live); access(plc, e, live); insurance(ins, e, live);
  }
  function activeCard(c, e, live) {
    c.textContent = ''; c.appendChild(el('h4', '', 'E-mail and activation'));
    c.appendChild(el('p', '', e.email ? 'E-mail ' + e.email + ' – ' + (e.email_verified_at ? 'verified ' + when(e.email_verified_at) : 'not verified yet') : 'No e-mail in his record.'));
    c.appendChild(el('p', 'muted', e.status === 'active' ? 'Active.' : 'Not active yet – he works as today; “Make active” needs his date of birth (18 on joining), his e-mail verified and his papers.'));
    var row = el('div', 'ep-row');
    if (e.email && !e.email_verified_at && e.status !== 'left') row.appendChild(btn('sec sm', 'Send the e-mail check', function (ev) { var b = ev.target; busy(b, true); api('emailCheckSend', { id: e.id, base: base() }).then(function (r) { busy(b, false); toast(r.mail.sent ? 'Sent – he opens the link in the e-mail.' : 'Not sent: ' + r.mail.why, !r.mail.sent); }, function (x) { busy(b, false); fail(x); }); }));
    if (isAdmin() && e.status !== 'active' && e.status !== 'left') row.appendChild(btn('pri sm', 'Make active', function (ev) { var b = ev.target; busy(b, true); api('empActivate', { id: e.id }).then(function () { busy(b, false); toast('Active.'); e.status = 'active'; if (live()) activeCard(c, e, live); }, function (x) { busy(b, false); fail(x); }); }));
    if (row.childNodes.length) c.appendChild(row);
  }
  function reporting(c, e, live) {
    api('repGet', { id: e.id }).then(function (r) {
      if (!live()) return; c.textContent = ''; c.appendChild(el('h4', '', 'Reporting'));
      if (!r.ready) { c.appendChild(el('p', 'muted', r.primary ? 'Reports to ' + r.primary.name + ' (' + r.primary.code + ').' : 'Reports to nobody.')); return; }
      var ul = el('ul', 'hist'); r.now.forEach(function (x) { var li = el('li'); li.appendChild(el('b', '', (ROLE[x.role] || x.role) + ': ' + (x.manager ? x.manager.name + ' (' + x.manager.code + ')' : '?'))); li.appendChild(el('span', '', ' · from ' + dmy(x.valid_from) + (x.manager && x.manager.designation ? ' · ' + x.manager.designation : '') + (x.manager && x.manager.site !== e.site ? ' · site ' + x.manager.site : '') + (x.note ? ' · ' + x.note : '')));
        if (e.status !== 'left') li.appendChild(btn('sm ghost', 'End…', function () { var why = window.prompt('Why does this end? (It stays in his history.)'); if (why === null) return; api('repEnd', { row: x.id, reason: why }).then(function () { toast('Ended.'); reporting(c, e, live); }, fail); })); ul.appendChild(li); });
      if (!r.now.length) ul.appendChild(el('li', 'muted', 'Reports to nobody.')); c.appendChild(ul);
      if (r.team.length) c.appendChild(el('p', 'muted', r.team.length + ' report(s) to him: ' + r.team.slice(0, 6).map(function (t) { return t.name; }).join(', ') + (r.team.length > 6 ? '…' : '')));
      var row = el('div', 'ep-row'); if (e.status !== 'left') row.appendChild(btn('sec sm', 'Set a manager…', function () { repForm(c, e, live, r); }));
      if (r.history.length) row.appendChild(btn('sec sm', 'History (' + r.history.length + ')', function (ev) { var h = c.querySelector('.rep-h'); if (h) { h.remove(); return; } h = el('ul', 'hist rep-h'); r.history.forEach(function (x) { h.appendChild(el('li', '', (ROLE[x.role] || x.role) + ': ' + (x.manager ? x.manager.name + ' (' + x.manager.code + ')' : '?') + ' · ' + dmy(x.valid_from) + ' – ' + dmy(x.valid_to) + (x.note ? ' · ' + x.note : ''))); }); c.appendChild(h); }));
      c.appendChild(row);
    }, function (x) { if (live()) { c.textContent = ''; c.appendChild(el('h4', '', 'Reporting')); c.appendChild(el('p', 'warn', x.message)); } });
  }
  // the picker: by name, code, designation, department or site – with the person's card (photo, designation, site)
  function repForm(c, e, live, r) {
    var f = c.querySelector('.rep-f'); if (f) { f.remove(); return; } f = el('div', 'rep-f'); var g = el('div', 'grid g3');
    var role = sel(r.roles.map(function (x) { return [x.key, x.name]; }), 'primary'), q = inp('text', '', 'name, code, designation, department, site'), from = inp('date', new Date(Date.now() + 19800000).toISOString().slice(0, 10)), note = inp('text', '', 'optional');
    g.appendChild(field('Role', role)); g.appendChild(field('Search the manager', q)); g.appendChild(field('From', from)); g.appendChild(field('Note', note)); f.appendChild(g);
    var list = el('div', 'rep-list'), chosen = null, err = el('p', 'err'); err.hidden = true; f.appendChild(list); f.appendChild(err);
    var t; q.oninput = function () { clearTimeout(t); t = setTimeout(function () { api('repPick', { q: q.value, not: e.id }).then(function (k) { list.textContent = ''; k.rows.forEach(function (p) {
      var b = el('button', 'rep-card' + (chosen && chosen.id === p.id ? ' on' : '')); b.type = 'button'; var av = el('span', 'dz-av'); if (p.photo) { var im = document.createElement('img'); im.alt = ''; im.src = p.photo; av.appendChild(im); } else av.textContent = (p.name || '?').slice(0, 1);
      b.appendChild(av); var tx = el('span'); tx.appendChild(el('b', '', p.name + ' (' + p.code + ')')); tx.appendChild(el('small', '', [p.designation, p.department, 'site ' + p.site, p.category].filter(Boolean).join(' · '))); b.appendChild(tx);
      b.onclick = function () { chosen = p; Array.prototype.forEach.call(list.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; list.appendChild(b); }); if (!k.rows.length) list.appendChild(el('p', 'muted', 'Nobody found.')); }, fail); }, 250); };
    var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start';
    acts.appendChild(btn('pri sm', 'Save', function (ev) { if (!chosen) { err.textContent = 'Choose the manager from the list.'; err.hidden = false; return; } var b = ev.target; busy(b, true); api('repSet', { id: e.id, manager: chosen.id, role: role.value, from: from.value, note: note.value }).then(function () { busy(b, false); toast('Saved.'); reporting(c, e, live); }, function (x) { busy(b, false); err.textContent = x.message; err.hidden = false; }); }));
    acts.appendChild(btn('sec sm', 'Cancel', function () { f.remove(); })); f.appendChild(acts); c.appendChild(f); q.focus(); q.oninput();
  }
  // "Employee can Sign In / Sign Out at the following locations"
  function access(c, e, live) {
    api('placeAccess', { employee_id: e.id }).then(function (r) {
      if (!live()) return; c.textContent = ''; c.appendChild(el('h4', '', 'He can sign in / out at'));
      var ul = el('ul', 'hist'); r.places.forEach(function (p) {
        var li = el('li' , p.counts ? '' : 'off'); li.appendChild(el('b', '', p.name + (p.site !== e.site ? ' (site ' + p.site + ')' : '')));
        li.appendChild(el('span', '', ' · ' + (p.can_in && p.can_out ? 'IN and OUT' : p.can_in ? 'IN only' : 'OUT only') + ' · ' + p.by + (p.from || p.to ? ' · ' + (dmy(p.from) || '…') + ' – ' + (dmy(p.to) || '…') : '') + (p.counts ? '' : ' · not today')));
        if (p.own && r.ready && e.status !== 'left') li.appendChild(btn('sm ghost', 'Change…', function () { accessForm(c, e, live, p); }));
        ul.appendChild(li); });
      if (!r.places.length) ul.appendChild(el('li', 'muted', 'No work place counts for him – he cannot mark attendance.')); c.appendChild(ul);
    }, function (x) { if (live()) { c.textContent = ''; c.appendChild(el('h4', '', 'He can sign in / out at')); c.appendChild(el('p', 'muted', x.message)); } });
  }
  function accessForm(c, e, live, p) {
    var f = c.querySelector('.acc-f'); if (f) f.remove(); f = el('div', 'acc-f'); f.appendChild(el('p', '', p.name)); var g = el('div', 'grid g3');
    var cin = inp('checkbox'), cout = inp('checkbox'), from = inp('date', p.from || ''), to = inp('date', p.to || ''), why = inp('text', '', 'why'); cin.checked = p.can_in; cout.checked = p.can_out;
    var ci = el('label', '', ' IN'); ci.prepend(cin); var co = el('label', '', ' OUT'); co.prepend(cout); var io = el('div'); io.appendChild(ci); io.appendChild(co);
    g.appendChild(field('He may mark', io)); g.appendChild(field('From (empty = no limit)', from)); g.appendChild(field('Up to (empty = no limit)', to)); g.appendChild(field('Reason *', why)); f.appendChild(g); var err = el('p', 'err'); err.hidden = true; f.appendChild(err);
    var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start';
    acts.appendChild(btn('pri sm', 'Save', function (ev) { var b = ev.target; busy(b, true); api('placeAccessSet', { employee_id: e.id, place: p.id, can_in: cin.checked, can_out: cout.checked, from: from.value, to: to.value, reason: why.value }).then(function () { busy(b, false); toast('Saved.'); access(c, e, live); }, function (x) { busy(b, false); err.textContent = x.message; err.hidden = false; }); }));
    acts.appendChild(btn('sec sm', 'Cancel', function () { f.remove(); })); f.appendChild(acts); c.appendChild(f);
  }
  var INS_ST = { draft: 'Not written', submitted: 'Submitted', under_verification: 'Under verification', verified: 'Verified', rejected: 'Rejected', expired: 'Expired' };
  function insurance(c, e, live) {
    api('insGet', { id: e.id }).then(function (r) {
      if (!live()) return; var i = r.insurance; c.textContent = ''; c.appendChild(el('h4', '', 'Medical insurance'));
      var p = el('p'); p.appendChild(el('span', 'st ' + stCls(i.status), i.applicable ? INS_ST[i.status] || i.status : 'Not applicable / not written')); c.appendChild(p);
      if (i.applicable) { var dl = el('dl', 'kv'); [['Company', i.provider], ['Policy', i.policy_no], ['Him', i.employee_cover], ['Family', i.dependent_cover], ['From – to', dmy(i.start_on) + ' – ' + dmy(i.expires_on)], ['Sum insured', i.sum_insured ? '₹ ' + Number(i.sum_insured).toLocaleString('en-IN') : '']].forEach(function (x) { if (!x[1]) return; dl.appendChild(el('dt', '', x[0])); dl.appendChild(el('dd', '', x[1])); }); c.appendChild(dl);
        if (i.verified_by) c.appendChild(el('p', 'muted', (i.status === 'rejected' ? 'Rejected' : 'Verified') + ' by ' + i.verified_by + ' · ' + when(i.verified_at) + (i.note ? ' · ' + i.note : ''))); }
      var row = el('div', 'ep-row');
      if (e.status !== 'left' && !r.mine) row.appendChild(btn('sec sm', i.applicable ? 'Change…' : 'Write…', function () { insForm(c, e, live, i); }));
      if (isAdmin() && !r.mine && i.applicable && (i.status === 'submitted' || i.status === 'under_verification')) { row.appendChild(btn('pri sm', 'Verified', function () { api('insVerify', { id: e.id, ok: true }).then(function () { toast('Verified.'); insurance(c, e, live); }, fail); })); row.appendChild(btn('danger sm', 'Reject…', function () { var why = window.prompt('Why is it rejected?'); if (why === null) return; api('insVerify', { id: e.id, ok: false, note: why }).then(function () { toast('Rejected.'); insurance(c, e, live); }, fail); })); }
      c.appendChild(el('p', 'muted', 'The policy paper itself: Documents → “Medical insurance”.'));
      if (row.childNodes.length) c.appendChild(row);
    }, function (x) { if (live()) { c.textContent = ''; c.appendChild(el('h4', '', 'Medical insurance')); c.appendChild(el('p', 'muted', x.message)); } });
  }
  function insForm(c, e, live, i) {
    var f = c.querySelector('.ins-f'); if (f) { f.remove(); return; } f = el('div', 'ins-f'); var g = el('div', 'grid g3');
    var ap = sel([['1', 'Yes – he is insured'], ['0', 'No']], i.applicable ? '1' : '0'), pr = inp('text', i.provider || ''), pn = inp('text', i.policy_no || ''), ec = inp('text', i.employee_cover || ''), dc = inp('text', i.dependent_cover || '', 'e.g. wife, 2 children'), st = inp('date', i.start_on || ''), ex = inp('date', i.expires_on || ''), si = inp('text', i.sum_insured || '');
    [['Insured', ap], ['Insurance company', pr], ['Policy number', pn], ['Cover – him', ec], ['Cover – his family', dc], ['Start', st], ['Expiry', ex], ['Sum insured (₹)', si]].forEach(function (x) { g.appendChild(field(x[0], x[1])); }); f.appendChild(g);
    var err = el('p', 'err'); err.hidden = true; f.appendChild(err); var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start';
    acts.appendChild(btn('pri sm', 'Save', function (ev) { var b = ev.target; busy(b, true); api('insSave', { id: e.id, applicable: ap.value === '1', provider: pr.value, policy_no: pn.value, employee_cover: ec.value, dependent_cover: dc.value, start_on: st.value, expires_on: ex.value, sum_insured: si.value }).then(function () { busy(b, false); toast('Saved – it waits for verification.'); insurance(c, e, live); }, function (x) { busy(b, false); err.textContent = x.message; err.hidden = false; }); }));
    acts.appendChild(btn('sec sm', 'Cancel', function () { f.remove(); })); f.appendChild(acts); c.appendChild(f);
  }

  /* ───────────── (step 17) THE MESSAGES: what went out, how it went; the site's shift reminders ───────────── */
  var N_ST = { queued: 'Waiting', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed', skipped: 'Skipped', cancelled: 'Cancelled' };
  var CH = { whatsapp: 'WhatsApp', email: 'E-mail', app: 'App' };
  function notices() {
    var root = $('p_15'); root.textContent = ''; root.appendChild(el('p', 'none', 'Reading…'));
    if (window.HRHEAD) window.HRHEAD.set('Notifications', 'Every message HR sent – WhatsApp (shift reminders, joining link, papers, policies, a reporting change), e-mail and the app – and how it went.', []);
    api('noticeList', { status: V.nst || '', kind: V.nkind || '' }).then(function (r) {
      root.textContent = ''; var top = el('div', 'pc15'); root.appendChild(top);
      var sw = r.switches; top.appendChild(el('p', '', 'Messages: ' + (sw.notify ? 'ON' : 'OFF (HR_NOTIFY_ENABLED in Vercel)') + ' · WhatsApp: ' + (sw.whatsapp ? 'ON' : 'OFF') + ' · E-mail: ' + (sw.email ? 'set up' : 'not set up')));
      top.appendChild(el('p', 'muted', 'WhatsApp templates approved by Meta: ' + (r.kinds.filter(function (k) { return k.wa; }).map(function (k) { return k.name + (k.ready ? ' ✓' : ' –'); }).join(', '))));
      var c7 = Object.keys(r.counts).map(function (k) { return (N_ST[k] || k) + ' ' + r.counts[k]; }).join(' · '); top.appendChild(el('p', 'muted', 'Last 7 days: ' + (c7 || 'nothing')));
      // the site's shift reminders
      var st = r.setting, sc = el('div', 'pc15'); root.appendChild(sc); sc.appendChild(el('h3', '', 'Shift reminders – ' + (st.shift_on ? 'ON' : 'OFF')));
      sc.appendChild(el('p', 'muted', 'Before and after the start of his shift (minutes; before = minus). They stop once he has signed in; none on his weekly off or a holiday.'));
      if (r.can) { var g = el('div', 'grid g3'), on = sel([['1', 'On'], ['0', 'Off']], st.shift_on ? '1' : '0'), mins = inp('text', (st.offsets || []).join(', ')); g.appendChild(field('Reminders', on)); g.appendChild(field('Minutes from the start', mins)); sc.appendChild(g);
        sc.appendChild(btn('pri sm', 'Save', function (ev) { var b = ev.target; busy(b, true); api('noticeSettingSave', { shift_on: on.value === '1', offsets: mins.value }).then(function () { busy(b, false); toast('Saved.'); notices(); }, function (x) { busy(b, false); fail(x); }); })); }
      else sc.appendChild(el('p', '', (st.offsets || []).join(', ') + ' minutes'));
      // the list
      var tools = el('div', 'tools'); [['', 'All'], ['queued', 'Waiting'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['read', 'Read'], ['failed', 'Failed']].forEach(function (k) { tools.appendChild(btn((V.nst || '') === k[0] ? 'sm' : 'sm ghost', k[1], function () { V.nst = k[0]; notices(); })); });
      var ks = sel([['', 'Every kind']].concat(r.kinds.map(function (k) { return [k.key, k.name]; })), V.nkind || ''); ks.onchange = function () { V.nkind = ks.value; notices(); }; tools.appendChild(ks); root.appendChild(tools);
      var lc = el('div', 'pc15'); root.appendChild(lc);
      if (!r.rows.length) { lc.appendChild(el('p', 'none', 'Nothing here.')); return; }
      var T = table(['When', 'To', 'What', 'How', 'State', '']); lc.appendChild(T.t);
      r.rows.forEach(function (x) {
        var tr = el('tr'); tr.appendChild(el('td', '', when(x.created_at))); tr.appendChild(el('td', '', (x.employee ? x.employee.name + ' (' + x.employee.code + ')' : '') + (x.to_addr ? ' · ' + x.to_addr : '')));
        var w = el('td'); w.appendChild(el('b', '', x.kind_name)); w.appendChild(el('div', 'muted', x.title)); tr.appendChild(w); tr.appendChild(el('td', '', CH[x.channel] || x.channel));
        var stc = el('td'); stc.appendChild(el('span', 'st ' + (x.status === 'failed' ? 's-pending' : x.status === 'queued' ? 's-incomplete' : 's-active'), N_ST[x.status] || x.status)); if (x.error) stc.appendChild(el('div', 'muted', x.error)); if (x.attempts > 1) stc.appendChild(el('div', 'muted', x.attempts + ' tries')); tr.appendChild(stc);
        var a = el('td');
        if (r.can && x.status === 'failed') a.appendChild(btn('sm', 'Send again', function () { api('noticeRetry', { id: x.id }).then(function () { toast('It goes with the next run.'); notices(); }, fail); }));
        if (r.can && x.status === 'queued') a.appendChild(btn('sm ghost', 'Cancel', function () { api('noticeCancel', { id: x.id }).then(function () { toast('Cancelled.'); notices(); }, fail); }));
        tr.appendChild(a); T.b.appendChild(tr);
      });
    }, function (e) { readyNote(root, e); });
  }

  window.HR15 = {
    pages: [['joining', 'Joining'], ['papers', 'Papers to verify'], ['cpolicies', 'Company policies'], ['notices', 'Notifications']],
    has: function (page) { return page === 'joining' || page === 'papers' || page === 'cpolicies' || page === 'notices'; },
    open: function (page, me, init) { V.me = me; V.init = init; V.page = page; if (page === 'joining') joining(); else if (page === 'papers') papers(); else if (page === 'notices') notices(); else cpolicies(); },
    emp: emp,
    // (18-11-2026, asked: "employee add krtana document upload sagle") one card of his page inside the Add employee steps
    card: function (kind, c, e, me, init) { V.me = me; V.init = init; var live = function () { return document.body.contains(c); }; ({ reporting: reporting, access: access, insurance: insurance, active: activeCard })[kind](c, e, live); }
  };
})();
