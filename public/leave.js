/* HR – LEAVE, the HR office's page (step 7, 12-11-2026). hr.js opens it: HRLEAVE.open(page, me).
 *   Requests – people's leave requests: approve / refuse (after the reporting person, when the policy has two levels); (19-11-2026)
 *              Waiting · Approved · Refused · Deleted · All; who a request waits for; its history; change / delete (the server decides who).
 *   Balances – everybody's leave as of today; the HR office adds to or takes from one balance, with the reason.
 *   (19-11-2026, asked: "leave policy ekach thikani rule book madhech thew n leave madhe ajun ka diley") the leave policy is ONLY in
 *   the Rule Book (Leave) – its "Policy" part is gone from here; the policy of before is shown there while it still counts.
 * Every text of a person is put in as TEXT, never as HTML. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  var api = function (action, body) { return window.HRAPI('api/hr', Object.assign({ action: action }, body || {})); };
  var V = { me: null, view: 'requests', status: 'pending', open: null, picked: {}, why: '' };
  var CAT = { staff: 'Staff', operator: 'Operator', driver: 'Driver', labour: 'Labour' }, PART = { full: '', first: ' · first half', second: ' · second half' };
  var dmy = function (d) { return d ? String(d).slice(0, 10).split('-').reverse().join('-') : ''; };
  function toast(t, bad) { var e = $('toast'); e.textContent = t; e.className = bad ? 'bad' : ''; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, bad ? 8000 : 3500); }
  function fail(e) { toast(e && e.message ? e.message : 'HR did not answer – try again.', true); }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
  function table(heads) { var box = el('div', 'box'), t = el('table'), h = el('thead'), r = el('tr'); heads.forEach(function (x) { r.appendChild(el('th', '', x)); }); h.appendChild(r); t.appendChild(h); var b = el('tbody'); t.appendChild(b); box.appendChild(t); return { box: box, body: b }; }
  function face(td, key) { if (window.HRDASH && window.HRDASH.face) td.insertBefore(window.HRDASH.face(td.textContent, key), td.firstChild); return td; }
  function field(parent, label, input) { var d = el('div'), l = el('label', '', label); d.appendChild(l); d.appendChild(input); parent.appendChild(d); return input; }

  function draw() {
    var root = $('p_leave'); root.textContent = ''; var tools = el('div', 'tools');
    [['requests', 'Requests'], ['balances', 'Balances']].forEach(function (k) { tools.appendChild(btn(V.view === k[0] ? 'pri' : 'sec', k[1], function () { V.view = k[0]; V.picked = {}; V.why = ''; draw(); })); }); root.appendChild(tools);
    var body = el('div'); root.appendChild(body);
    if (V.view === 'balances') balances(body); else requests(body);
  }
  /* (19-11-2026) where a request stands – for a waiting one WHO it waits for (his leave policy says it; else the reporting person,
   * then the HR office); its whole history; the Site HR Admin, the HO HR and the Super Admin change or delete one that waits or is
   * approved (q.edit – the server decides), always with the reason. */
  var ROLE = { reporting: 'Reporting person', site_hr: 'Site HR Admin', ho_hr: 'HO HR', super: 'Super Admin', office: 'HR office' };
  var KIND = { asked: 'Asked', extension: 'Asked – the extra days of a leave', verified: 'Verified', approved: 'Approved', refused: 'Refused', shortened: 'Made shorter', extended: 'Made longer – the extra days asked', edited: 'Changed by the HR office', deleted: 'Deleted' };
  var range = function (a, b, n) { return dmy(a) + (b && b !== a ? ' – ' + dmy(b) : '') + (n !== undefined && n !== null ? ' (' + n + ')' : ''); };
  function stands(q) {
    if (q.status === 'pending') {
      if (!q.waits) return q.stage ? (q.stage === 'verify' ? 'Waits for verify' : 'Waits for approval') : q.level === 1 ? 'With the reporting person' : 'With the HR office';
      var who = q.waits.who.map(function (w) { return w.role === 'person' ? w.name : w.name ? w.name + ' (' + (ROLE[w.role] || w.role) + ')' : (ROLE[w.role] || w.role); }).join(' / ');
      return q.waits.stage === 'verify' ? 'Waits for verify: ' + who : 'Waits for approval: ' + who;
    }
    if (q.status === 'refused') return 'Refused: ' + q.note;
    if (q.status === 'approved') return 'Approved';
    var d = (q.history || []).filter(function (h) { return h.kind === 'deleted'; }).pop();
    return !d ? 'Deleted' : d.self ? 'Deleted by himself' : 'Deleted by ' + d.by + (d.note ? ': ' + d.note : '');
  }
  function history(q) {
    var ul = el('ul', 'hist lv-hist');
    (q.history || []).forEach(function (h) {
      var li = el('li'), at = h.at ? new Date(h.at) : null, when = at && !isNaN(at) ? dmy(new Date(at.getTime() + 19800000).toISOString().slice(0, 10)) + ' ' + new Date(at.getTime() + 19800000).toISOString().slice(11, 16) : '';
      li.appendChild(el('b', '', KIND[h.kind] || h.kind)); var by = el('span', '', ' — ' + (h.self ? h.by + ' (himself)' : h.by) + ' · ' + when); by.setAttribute('data-noi18n', ''); li.appendChild(by);
      var d = h.kind === 'asked' || h.kind === 'extension' ? range(h.from, h.to, h.days) : h.kind === 'shortened' || h.kind === 'edited' ? range(h.was && h.was.from, h.was && h.was.to, h.was && h.was.days) + ' → ' + range(h.from, h.to, h.days) : h.kind === 'extended' ? '+ ' + range(h.from, h.to, h.days) : '';
      if (d) { var x = el('div', 'muted', d); x.setAttribute('data-noi18n', ''); li.appendChild(x); }
      if (h.note && h.kind !== 'asked') { var nt = el('div', 'muted', h.note); nt.setAttribute('data-noi18n', ''); li.appendChild(nt); }
      ul.appendChild(li);
    });
    return ul;
  }
  // the box under a request: its history, a change of its days, or its deletion
  function under(q, what, done) {
    var box = el('div', 'lv-under'), inp = function (type, v, w) { var i = el('input'); i.type = type; if (v) i.value = v; i.style.cssText = 'height:38px;border:1px solid #D7E0EF;border-radius:10px;padding:0 10px;margin:0 6px 6px 0;width:' + w; return i; };
    if (what === 'hist') { box.appendChild(history(q)); return box; }
    var why = inp('text', '', '280px'); why.maxLength = 200; why.className = 'lv-why'; why.setAttribute('aria-label', 'Reason'); why.placeholder = what === 'del' ? 'Why it is deleted' : 'Why it is changed';
    var err = el('p', 'warn'); err.hidden = true; var bad = function (e) { err.hidden = false; err.textContent = e && e.message ? e.message : String(e); };
    if (what === 'edit') {
      var f = inp('date', q.from, '160px'), t = inp('date', q.to, '160px'), part = el('select'); f.className = 'lv-from'; t.className = 'lv-to'; part.className = 'lv-part'; part.style.cssText = 'height:38px;border:1px solid #D7E0EF;border-radius:10px;padding:0 10px;margin:0 6px 6px 0';
      [['full', 'Whole days'], ['first', 'First half'], ['second', 'Second half']].forEach(function (o) { var x = el('option', '', o[1]); x.value = o[0]; x.selected = q.part === o[0]; part.appendChild(x); });
      f.setAttribute('aria-label', 'From'); t.setAttribute('aria-label', 'To'); part.setAttribute('aria-label', 'Whole or half day');
      box.appendChild(el('label', '', 'New days of this leave – the reason is written in its history')); var row = el('div'); [f, t, part, why].forEach(function (i) { row.appendChild(i); }); box.appendChild(row);
      box.appendChild(btn('sm lv-save', 'Save the change', function () { api('leaveEdit', { id: q.id, from: f.value, to: t.value, part: part.value, reason: why.value }).then(function () { toast('Changed.'); done(); }, bad); }));
    } else {
      box.appendChild(el('label', '', 'Delete this leave – it stays in the record as "Deleted", with the reason')); box.appendChild(why);
      box.appendChild(btn('sm lv-del', 'Delete this leave', function () { api('leaveRemove', { id: q.id, reason: why.value }).then(function () { toast('Deleted.'); done(); }, bad); }));
    }
    box.appendChild(btn('sm ghost', 'Close', function () { V.open = null; draw(); })); box.appendChild(err);
    return box;
  }
  /* (19-11-2026, asked: "bulk madhe delete leave cha option de ani select krun pn delete kra yawet"; then on Balances: "ethe kuthe tick
   * cha option nahi delete krnyasathi … jo balance aahe to chukun aalela aahe") TICKS: a tick on every line that may be done, "Select
   * all" ticks every one of the list; the bar does it to the ticked ones at once with one reason – a second press says yes (no browser
   * dialog on this page). A tick changes only the bar (the list is not read again). o: { ids, word, yes, sure, why, send(ids, why) } */
  function ticks(o) {
    var bar = el('div', 'lv-bulk'); bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:10px 12px;border:1px solid #E4EAF5;border-radius:12px;background:#fff';
    var picked = function () { return o.ids.filter(function (k) { return V.picked[k]; }); };
    var boxes = function () { var all = document.querySelectorAll('#p_leave .lv-tick'); for (var i = 0; i < all.length; i++) all[i].checked = !!V.picked[all[i].getAttribute('data-k')]; };
    function paint() {
      bar.textContent = ''; var n = picked().length;
      bar.appendChild(btn('sm ghost lv-all', n === o.ids.length ? 'Clear the ticks' : 'Select all (' + o.ids.length + ')', function () { var on = n !== o.ids.length; V.picked = {}; if (on) o.ids.forEach(function (k) { V.picked[k] = true; }); boxes(); paint(); }));
      bar.appendChild(el('b', 'lv-n', n + ' selected'));
      if (!n) return;
      var why = el('input'); why.type = 'text'; why.maxLength = 200; why.className = 'lv-bwhy'; why.placeholder = o.why; why.setAttribute('aria-label', o.why); why.value = V.why || ''; why.oninput = function () { V.why = why.value; };
      why.style.cssText = 'height:38px;border:1px solid #D7E0EF;border-radius:10px;padding:0 10px;min-width:240px;flex:1'; bar.appendChild(why);
      var sure = el('small', 'muted lv-sure', o.sure); sure.hidden = true; sure.style.flexBasis = '100%';
      var go = btn('sm lv-bdel', o.word(n), function () {
        if (!go.dataset.sure) { go.dataset.sure = '1'; go.textContent = o.yes(n); sure.hidden = false; return; } go.disabled = true;
        o.send(picked(), why.value).then(function () { V.picked = {}; V.why = ''; draw(); }, function (e) { go.disabled = false; fail(e); });
      });
      bar.appendChild(go); bar.appendChild(sure);
    }
    paint();
    return { bar: bar, tick: function (k) { var cb = el('input'); cb.type = 'checkbox'; cb.className = 'lv-tick'; cb.setAttribute('data-k', k); cb.checked = !!V.picked[k]; cb.onchange = function () { V.picked[k] = cb.checked; paint(); }; return cb; } };
  }
  var left = function (r) { return r.skipped && r.skipped.length ? ' · ' + r.skipped.length + ' left as they are: ' + r.skipped.map(function (k) { return k.why; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' ') : ''; };
  function requests(root) {
    var tools = el('div', 'tools'); [['pending', 'Waiting'], ['approved', 'Approved'], ['refused', 'Refused'], ['cancelled', 'Deleted'], ['all', 'All']].forEach(function (k) { var b = btn(V.status === k[0] ? 'sm' : 'sm ghost', k[1], function () { V.status = k[0]; V.open = null; V.picked = {}; draw(); }); b.setAttribute('data-st', k[0]); tools.appendChild(b); }); root.appendChild(tools);
    api('leaveList', { status: V.status }).then(function (r) {
      var tick = r.rows.some(function (q) { return q.edit; }), t = table((tick ? [''] : []).concat(['Code', 'Name', 'Days', 'Reason', 'Asked', 'Where it stands', '']));
      var T = tick ? ticks({ ids: r.rows.filter(function (q) { return q.edit; }).map(function (q) { return String(q.id); }), why: 'Why they are deleted', sure: 'Each stays in the record as "Deleted", with this reason – press again to delete.',
        word: function (n) { return 'Delete ' + n + (n === 1 ? ' leave' : ' leaves'); }, yes: function (n) { return 'Yes – delete ' + n + (n === 1 ? ' leave' : ' leaves'); },
        send: function (ids, why) { return api('leaveRemoveMany', { ids: ids.map(Number), reason: why }).then(function (x) { toast(x.done.length + ' deleted' + left(x) + '.', x.skipped.length > 0); }); } }) : null;
      r.rows.forEach(function (q) {
        var tr = el('tr'); tr.style.cursor = 'default'; tr.setAttribute('data-id', q.id);
        if (tick) { var c = el('td'); if (q.edit) { var cb = T.tick(String(q.id)); cb.setAttribute('aria-label', 'Select ' + (q.name || '')); c.appendChild(cb); } tr.appendChild(c); }
        tr.appendChild(el('td', '', q.code)); tr.appendChild(face(el('td', 'nm', q.name), q.code));
        var dd = el('td'); dd.appendChild(el('div', '', dmy(q.from) + (q.to !== q.from ? ' – ' + dmy(q.to) : '') + PART[q.part])); dd.appendChild(el('small', 'muted', q.days + (q.days === 1 || q.days === 0.5 ? ' day' : ' days'))); tr.appendChild(dd);
        var why = el('td', 'lv-why0', q.reason); tr.appendChild(why);
        tr.appendChild(el('td', '', dmy(String(q.asked_at).slice(0, 10))));
        var at = el('td', 'lv-stand', stands(q)); tr.appendChild(at);
        var a = el('td', 'lv-acts');
        if (q.status === 'pending' && (q.can !== undefined ? q.can : (r.can && (q.level === 2 || (V.me && V.me.user.role === 'super'))))) {      // (step 13) q.can: his leave policy of the Rule Book says who does this step
          var note = el('input'); note.type = 'text'; note.maxLength = 200; note.placeholder = 'Why it is refused'; note.setAttribute('aria-label', 'Why it is refused'); note.hidden = true; note.style.cssText = 'height:38px;border:1px solid #D7E0EF;border-radius:10px;padding:0 10px;margin-right:6px';
          var send = function (dec) { api('leaveDecide', { id: q.id, decision: dec, note: note.value }).then(function () { toast(dec === 'approved' ? 'Approved.' : 'Refused.'); draw(); }, fail); };
          a.appendChild(note); a.appendChild(btn('mz-ok', q.stage === 'verify' ? 'Verify' : 'Approve', function () { send('approved'); })); a.appendChild(btn('mz-no', 'Refuse', function () { if (note.hidden) { note.hidden = false; note.focus(); } else send('refused'); }));
        }
        if (q.files !== undefined && window.HRBOOK && window.HRBOOK.papers && q.status !== 'cancelled') a.appendChild(btn(q.files ? 'sm' : 'sm ghost', q.files ? 'Papers (' + q.files + ')' : 'Attach paper', function () { window.HRBOOK.papers(q, draw); }));      // (step 13) the papers of the request
        var open = function (what) { return function () { V.open = V.open && V.open.id === q.id && V.open.what === what ? null : { id: q.id, what: what }; draw(); }; };
        var hb = btn('sm ghost lv-hb', 'History (' + (q.history || []).length + ')', open('hist')); a.appendChild(hb);
        if (q.edit) { a.appendChild(btn('sm ghost lv-eb', 'Change', open('edit'))); a.appendChild(btn('sm ghost lv-db', 'Delete', open('del'))); }
        tr.appendChild(a); t.body.appendChild(tr);
        if (V.open && V.open.id === q.id) { var sub = el('tr', 'lv-sub'), td = el('td'); td.colSpan = tick ? 8 : 7; td.appendChild(under(q, V.open.what, function () { V.open = null; draw(); })); sub.appendChild(td); t.body.appendChild(sub); }
      });
      if (!r.rows.length) t.box.appendChild(el('p', 'none', V.status === 'pending' ? 'Nothing is waiting.' : 'Nothing here.'));
      // (13-11-2026, the picture he approved) the counts of the list shown – nothing new is asked
      if (window.HRDASH && window.HRDASH.cards) {
        var days = Math.round(r.rows.reduce(function (a, q) { return a + (+q.days || 0); }, 0) * 10) / 10, who = {}; r.rows.forEach(function (q) { who[q.code] = 1; }); var word = { pending: 'Waiting', approved: 'Approved', refused: 'Refused', cancelled: 'Deleted', all: 'All' }[V.status];
        var list = [['▤', V.status === 'pending' ? 'amber' : V.status === 'approved' ? 'green' : V.status === 'refused' ? 'red' : 'grey', word, r.rows.length, '', 'requests in this list'], ['◉', 'violet', 'People', Object.keys(who).length, '', 'who asked'], ['☾', 'blue', 'Days', days, '', 'asked in these requests']];
        if (V.status === 'pending') { list.push(['↑', 'cyan', 'With the reporting person', r.rows.filter(function (q) { return q.level === 1; }).length, '', 'first step']); list.push(['✓', 'green', 'With the HR office', r.rows.filter(function (q) { return q.level !== 1; }).length, '', 'to decide here']); }
        root.appendChild(window.HRDASH.cards(list));
      }
      if (T) root.appendChild(T.bar);
      root.appendChild(t.box);
    }, function (e) { root.appendChild(el('p', 'none', e.message)); });
  }
  function balances(root) {
    api('leaveBalances').then(function (r) {
      if (r.book) root.appendChild(el('p', 'muted', 'Counted by the leave policies of the Rule Book (Leave) · as of ' + dmy(r.today)));
      else if (!r.policy) root.appendChild(el('p', 'warn', 'No leave policy counts on this site yet – the Rule Book (Leave) gives one. Until then every balance is 0.'));
      else root.appendChild(el('p', 'muted', 'The leave policy of before (shown in the Rule Book): ' + r.policy.per_month + ' leaves a month · ' + (r.policy.carry ? 'unused leaves go on' : 'unused leaves lapse at the month\'s end') + ' · ' + (r.policy.auto_absent ? 'an absent day takes one leave' : 'an absent day takes nothing') + ' · as of ' + dmy(r.today)));
      // (19-11-2026) ticks: the whole balance of the ticked people taken off at once (it reads 0; kept in the record, with the reason)
      var may = r.can && (r.policy || r.book), t = table((may ? [''] : []).concat(['Code', 'Name', 'Category', 'Balance', 'This month: added', 'used', 'Booked', 'Asked', '']));
      var T = may ? ticks({ ids: r.rows.filter(function (w) { return w.balance > 0; }).map(function (w) { return w.id; }), why: 'Why the balance is taken off', sure: 'The whole balance of each is taken off – it reads 0; the record keeps who, when and why, and days can be added back. Press again.',
        word: function (n) { return 'Make the balance 0 (' + n + ')'; }, yes: function (n) { return 'Yes – make ' + n + (n === 1 ? ' balance' : ' balances') + ' 0'; },
        send: function (ids, why) { return api('leaveZero', { ids: ids, reason: why }).then(function (x) { toast(x.zeroed.length + (x.zeroed.length === 1 ? ' balance' : ' balances') + ' made 0' + left(x) + '.', x.skipped.length > 0); }); } }) : null;
      r.rows.forEach(function (w) {
        var tr = el('tr'); tr.style.cursor = 'default'; tr.setAttribute('data-id', w.id);
        if (may) { var c = el('td'); if (w.balance > 0) { var cb = T.tick(w.id); cb.setAttribute('aria-label', 'Select ' + (w.name || '')); c.appendChild(cb); } tr.appendChild(c); }
        tr.appendChild(el('td', '', w.code)); tr.appendChild(face(el('td', 'nm', w.name), w.id)); tr.appendChild(el('td', '', CAT[w.category] || ''));
        var b = el('td', 'nm lv-bal', w.balance); b.style.fontWeight = '800'; tr.appendChild(b); tr.appendChild(el('td', '', w.credit + (w.added ? ' ' + (w.added > 0 ? '+' : '') + w.added : ''))); tr.appendChild(el('td', '', w.used)); tr.appendChild(el('td', '', w.booked || '–')); tr.appendChild(el('td', '', w.pending || '–'));
        var a = el('td');
        if (r.can && (r.policy || r.book)) {
          var n = el('input'), why = el('input'); n.type = 'number'; n.step = '0.5'; n.placeholder = '+ / −'; n.setAttribute('aria-label', 'Days to add or take'); why.type = 'text'; why.maxLength = 200; why.placeholder = 'Reason'; why.setAttribute('aria-label', 'Reason');
          [n, why].forEach(function (i) { i.hidden = true; i.style.cssText = 'height:38px;border:1px solid #D7E0EF;border-radius:10px;padding:0 10px;margin-right:6px;width:' + (i === n ? '84px' : '180px'); a.appendChild(i); });
          a.appendChild(btn('sm ghost', 'Add / take', function () { if (n.hidden) { n.hidden = false; why.hidden = false; n.focus(); return; } api('leaveAdjust', { id: w.id, days: n.value, reason: why.value }).then(function () { toast('Saved.'); draw(); }, fail); }));
        }
        tr.appendChild(a); t.body.appendChild(tr);
      });
      if (!r.rows.length) t.box.appendChild(el('p', 'none', 'No employee on this site yet.'));
      if (T) root.appendChild(T.bar);
      root.appendChild(t.box);
    }, function (e) { root.appendChild(el('p', 'none', e.message)); });
  }
  window.HRLEAVE = { pages: [['leave', 'Leave']], has: function (page) { return page === 'leave'; }, open: function (page, me) { V.me = me; draw(); } };
})();
