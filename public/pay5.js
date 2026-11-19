/* HR – PAYROLL, PHASE 5 (18-11-2026, step 18): the parts of the payroll page beside the pay sheet – only the HO HR and the Super
 * Admin. payroll.js opens them: HRPAY5.release / registers / compare / fnf / structures / checks / person.
 *   Release & payment – a locked month's payslips: ready, held, rejected, paid (how, the reference, the day).
 *   Registers         – salary, PF, ESIC, PT, LWF, TDS, payments, full & final – on the screen and as Excel.
 *   Compare           – the file of the present method beside the ERP's month, line by line.
 *   Full & final      – a relieved person's settlement: made → checked → approved → paid, by different people.
 *   Structures        – Basic, HRA, … as a % of the pay; a version counts after another person approved it.
 * Every text of a person is put in as TEXT, never as HTML. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  var api = function (action, body) { return window.HRAPI('api/hr', Object.assign({ action: action }, body || {})); };
  var dmy = function (d) { return d ? String(d).slice(0, 10).split('-').reverse().join('-') : ''; };
  var when = function (t) { return t ? dmy(new Date(Date.parse(t) + 19800000).toISOString()) : ''; };
  var rs = function (n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); };
  var mName = function (m) { return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m.slice(5) - 1] + ' ' + m.slice(0, 4); };
  var STAND = { approved: 'Approved', ready: 'Ready to pay', paid: 'Paid', hold: 'Held', rejected: 'Rejected' };
  var FNF = { made: 'Made – to be checked', checked: 'Checked – to be approved', approved: 'Approved – to be paid', paid: 'Paid', cancelled: 'Cancelled' };
  var MODES = [['bank', 'Bank'], ['cash', 'Cash'], ['cheque', 'Cheque'], ['upi', 'UPI']];
  function toast(t, bad) { var e = $('toast'); e.textContent = t; e.className = bad ? 'bad' : ''; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, bad ? 9000 : 3500); }
  function fail(e) { toast(e && e.message ? e.message : 'HR did not answer – try again.', true); }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
  function table(heads) { var box = el('div', 'box'), t = el('table'), h = el('thead'), r = el('tr'); heads.forEach(function (x) { if (x && x.nodeType) { var th0 = el('th'); th0.appendChild(x); r.appendChild(th0); } else r.appendChild(el('th', '', x)); }); h.appendChild(r); t.appendChild(h); var b = el('tbody'); t.appendChild(b); box.appendChild(t); return { box: box, body: b }; }
  function note(text, kind) { var p = el('p', '', text); p.style.cssText = 'margin:0 0 12px;padding:11px 14px;border-radius:14px;font-size:15.5px;' + (kind === 'ok' ? 'background:#DDF5E6;color:#0B6B3A' : kind === 'warn' ? 'background:#FFF1CC;color:#6B4700' : 'background:#E9F2FF;color:#0B3A6B'); return p; }
  function field(parent, label, input, full) { var d = el('div', full ? 'full' : ''); d.appendChild(el('label', '', label)); d.appendChild(input); parent.appendChild(d); return input; }
  var BOX = 'width:100%;height:44px;border:1px solid #D7E0EF;border-radius:12px;padding:0 12px;background:#fff';
  function input(ph, val, type) { var i = el('input'); i.type = type || 'text'; if (!type) i.inputMode = 'decimal'; if (ph) i.placeholder = ph; if (val !== undefined && val !== null && val !== '') i.value = val; i.style.cssText = BOX; return i; }
  function text(ph, val, max) { var i = el('input'); i.type = 'text'; if (ph) i.placeholder = ph; if (val) i.value = val; i.maxLength = max || 200; i.style.cssText = BOX; return i; }
  function select(list, val) { var s = el('select'); s.style.cssText = BOX; list.forEach(function (o) { var x = el('option', '', o[1]); x.value = o[0]; x.selected = String(o[0]) === String(val); s.appendChild(x); }); return s; }
  function num(tr, v, bold) { var c = el('td', '', v ? rs(v) : '–'); c.style.textAlign = 'right'; if (bold) c.style.fontWeight = '700'; tr.appendChild(c); return c; }
  function row(tr) { tr.style.cursor = 'default'; return tr; }
  function dialog(title, sub) {
    var d = el('div', 'dlg'), s = el('div', 'sheet'), body = el('div'), er = el('p', 'err'), acts = el('div', 'acts'); s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.appendChild(el('h2', '', title)); if (sub) s.appendChild(el('p', 'sub', sub));
    er.hidden = true; er.setAttribute('role', 'alert'); s.appendChild(body); s.appendChild(er); s.appendChild(acts); d.appendChild(s); document.body.appendChild(d);
    var o = { body: body, acts: acts, err: function (e) { er.textContent = e ? (e.message || String(e)) : ''; er.hidden = !e; }, close: function () { document.removeEventListener('keydown', key); if (d.parentNode) d.parentNode.removeChild(d); } };
    var key = function (ev) { if (ev.key === 'Escape') o.close(); }; document.addEventListener('keydown', key); acts.appendChild(btn('sec', 'Close', o.close)); return o;
  }
  function xlsxLib() { return new Promise(function (ok) { if (window.XLSX) return ok(true); var s = document.createElement('script'); s.src = '/vendor/xlsx-0.18.5.full.min.js'; s.onload = function () { ok(!!window.XLSX); }; s.onerror = function () { ok(false); }; document.head.appendChild(s); }); }
  // rows → an Excel file (a CSV when the Excel maker cannot be loaded); the columns named in asText stay text (a long number is not rounded)
  function excel(name, head, rows, asText) {
    var aoa = [head].concat(rows), save = function (blob, ext) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + ext; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
    return xlsxLib().then(function (ok) {
      if (ok) { try { var ws = window.XLSX.utils.aoa_to_sheet(aoa), wb = window.XLSX.utils.book_new(); ws['!cols'] = head.map(function (h) { return { wch: Math.max(10, String(h).length + 2) }; });
          (asText || []).forEach(function (ci) { rows.forEach(function (r, i) { var c = ws[window.XLSX.utils.encode_cell({ r: i + 1, c: ci })]; if (c && r[ci] !== '') { c.t = 's'; c.v = String(r[ci]); } }); });
          window.XLSX.utils.book_append_sheet(wb, ws, 'Register'); window.XLSX.writeFile(wb, name + '.xlsx'); return; } catch (e) { ok = false; } }
      var q = function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; };
      save(new Blob(['﻿' + aoa.map(function (x) { return x.map(function (v, i) { return (asText || []).indexOf(i) > -1 && v ? '="' + String(v) + '"' : q(v); }).join(','); }).join('\r\n')], { type: 'text/csv' }), '.csv');
    });
  }

  /* ───── RELEASE & PAYMENT of a locked month ───── */
  function release(root, month) {
    api('payRelease', { month: month }).then(function (r) {
      root.textContent = '';
      if (!r.locked) { root.appendChild(note('The pay of ' + mName(month) + ' is not locked yet – the payslips are released and paid after the lock (Pay sheet).', 'warn')); return; }
      var n = {}; r.rows.forEach(function (x) { n[x.status] = (n[x.status] || 0) + 1; });
      root.appendChild(note('A locked payslip is Approved. Mark it Ready to pay, then Paid with how it was paid. A Held one goes back to Approved first; a Rejected or Paid one stays as it is. ' + Object.keys(STAND).filter(function (k) { return n[k]; }).map(function (k) { return STAND[k] + ': ' + n[k]; }).join(' · ')));
      var ticks = [], all = el('input'); all.type = 'checkbox'; all.setAttribute('aria-label', 'Tick all');
      all.onchange = function () { ticks.forEach(function (t) { t.box.checked = all.checked; }); };
      var picked = function () { return ticks.filter(function (t) { return t.box.checked; }).map(function (t) { return t.id; }); };
      var tools = el('div', 'tools'), why = text('Reason (for Held / Rejected)', '', 200); why.style.flex = '1 1 240px';
      var move = function (to) { var ids = picked(); if (!ids.length) return toast('Tick at least one payslip.', true);
        api('payReleaseSet', { ids: ids, status: to, note: why.value }).then(function (x) { toast(x.done + ' moved' + (x.skipped ? ' · ' + x.skipped + ' could not move from where they stand' : '') + '.', !!x.skipped); release(root, month); }, fail); };
      tools.appendChild(btn('pri', 'Ready to pay', function () { move('ready'); })); tools.appendChild(btn('sec', 'Paid…', function () { var ids = picked(); if (!ids.length) return toast('Tick at least one payslip.', true); paid(ids, function () { release(root, month); }); }));
      tools.appendChild(why); tools.appendChild(btn('sm ghost', 'Hold', function () { move('hold'); })); tools.appendChild(btn('sm ghost', 'Reject', function () { move('rejected'); })); tools.appendChild(btn('sm ghost', 'Back to approved', function () { move('approved'); }));
      root.appendChild(tools);
      var t = table([all, 'Code', 'Name', 'Net pay ₹', 'Where it stands', 'Payment']);
      r.rows.forEach(function (x) { var tr = row(el('tr')), c = el('td'), b = el('input'); b.type = 'checkbox'; b.setAttribute('aria-label', x.code); c.appendChild(b); tr.appendChild(c); ticks.push({ id: x.id, box: b });
        tr.appendChild(el('td', '', x.code)); tr.appendChild(el('td', '', x.name)); num(tr, x.net, true);
        tr.appendChild(el('td', '', STAND[x.status] + (x.note && x.status !== 'paid' ? ' – ' + x.note : '') + (x.by ? ' (' + x.by + ')' : '')));
        tr.appendChild(el('td', '', x.payments.map(function (p) { return (MODES.filter(function (m) { return m[0] === p.mode; })[0] || [0, p.mode])[1] + (p.ref ? ' ' + p.ref : '') + ', ' + dmy(p.paid_on); }).join(' · ') || '–'));
        t.body.appendChild(tr); });
      if (!r.rows.length) t.box.appendChild(el('p', 'none', 'Nobody was paid in ' + mName(month) + '.'));
      root.appendChild(t.box);
    }, function (e) { root.textContent = ''; root.appendChild(el('p', 'none', e.message)); });
  }
  function paid(ids, done) {
    var d = dialog('Paid – ' + ids.length + ' payslip(s)', 'Only a payslip that is Ready to pay is marked paid; its net pay is written as the payment.'), g = el('div', 'grid');
    var mode = field(g, 'How it was paid', select(MODES, 'bank')), ref = field(g, 'Reference (bank UTR / cheque / UPI)', text('', '', 80)), on = field(g, 'Paid on (empty = today)', input('', '', 'date'));
    d.body.appendChild(g);
    d.acts.appendChild(btn('pri', 'Mark paid', function () { api('payPaid', { ids: ids, mode: mode.value, ref: ref.value, paid_on: on.value }).then(function (x) { d.close(); toast(x.done + ' paid' + (x.skipped ? ' · ' + x.skipped + ' were not Ready to pay' : '') + '.', !!x.skipped); done(); }, d.err); }));
  }

  /* ───── REGISTERS ───── */
  var KINDS = [['salary', 'Salary register'], ['pf', 'PF register'], ['esic', 'ESIC register'], ['pt', 'Profession Tax register'], ['lwf', 'LWF register'], ['tds', 'TDS register'], ['payments', 'Payments'], ['fnf', 'Full & final settlements']];
  var HEAD = { code: 'Code', name: 'Name', pay_days: 'Pay days', earned: 'Earned', extra: 'Extra pay', overtime: 'Overtime', other_earn: 'Other +', gross: 'Gross', pf: 'PF', esic: 'ESIC', pt: 'PT', lwf: 'LWF', tds: 'TDS', advance: 'Advance', other_ded: 'Other −', net: 'Net pay',
    uan: 'UAN', pf_wage: 'PF wage', ee_pf: 'Employee PF', er_epf: 'Employer EPF', er_eps: 'Employer EPS', edli: 'EDLI', admin: 'PF admin', esic_no: 'ESIC number', ee_esic: 'Employee ESIC', er_esic: 'Employer ESIC', ee_lwf: 'Employee LWF', er_lwf: 'Employer LWF',
    status: 'Where it stands', mode: 'Paid by', ref: 'Reference', paid_on: 'Paid on', last_day: 'Last day', made_by: 'Made by', checked_by: 'Checked by', approved_by: 'Approved by', paid_ref: 'Reference' };
  var TEXTCOLS = ['code', 'uan', 'esic_no', 'ref', 'paid_ref'];
  function registers(root, month, V) {
    root.textContent = ''; var tools = el('div', 'tools'), kind = select(KINDS, V.reg || 'salary'); kind.style.flex = '0 0 260px'; kind.onchange = function () { V.reg = kind.value; registers(root, month, V); };
    tools.appendChild(kind); var out = el('div'), got = null;
    tools.appendChild(btn('pri', 'Excel', function () { if (!got) return; var keys = cols(got.rows); excel(KINDS.filter(function (k) { return k[0] === got.kind; })[0][1].replace(/ /g, '_') + (got.month ? '_' + got.month : ''), keys.map(function (k) { return HEAD[k] || k; }),
      got.rows.map(function (r) { return keys.map(function (k) { var v = r[k]; return v === undefined || v === null ? '' : /_on$|_day$/.test(k) && v ? dmy(v) : v; }); }), keys.map(function (k, i) { return TEXTCOLS.indexOf(k) > -1 ? i : -1; }).filter(function (i) { return i > -1; })).then(function () { toast('Saved.'); }); }));
    root.appendChild(tools); root.appendChild(out);
    api('payRegister', { month: month, kind: kind.value }).then(function (r) {
      got = r; var keys = cols(r.rows), t = table(keys.map(function (k) { return HEAD[k] || k; }));
      r.rows.forEach(function (x) { var tr = row(el('tr')); keys.forEach(function (k) { var v = x[k]; if (typeof v === 'number') num(tr, v, k === 'net'); else tr.appendChild(el('td', '', v === undefined || v === null || v === '' ? '–' : /_on$|_day$/.test(k) ? dmy(v) : k === 'status' ? STAND[v] || FNF[v] || v : v)); }); t.body.appendChild(tr); });
      if (!r.rows.length) t.box.appendChild(el('p', 'none', 'Nobody in this register' + (r.month ? ' for ' + mName(r.month) : '') + '.'));
      if (r.kind !== 'fnf') out.appendChild(note(KINDS.filter(function (k) { return k[0] === r.kind; })[0][1] + ' of ' + mName(r.month) + ' – from the locked payslips: ' + r.rows.length + ' people.'));
      out.appendChild(t.box);
    }, function (e) { out.appendChild(el('p', 'none', e.message)); });
  }
  function cols(rows) { var seen = {}, keys = []; rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (!seen[k]) { seen[k] = 1; keys.push(k); } }); }); return keys; }

  /* ───── THE PRESENT METHOD BESIDE THE ERP ───── */
  var ALIAS = { code: 'code', 'emp code': 'code', 'employee code': 'code', gross: 'gross', 'gross pay': 'gross', pf: 'pf', 'employee pf': 'pf', esic: 'esic', 'employee esic': 'esic', pt: 'pt', 'profession tax': 'pt', lwf: 'lwf', tds: 'tds', advance: 'advance', net: 'net', 'net pay': 'net', 'net salary': 'net' };
  function compare(root, month) {
    root.textContent = '';
    root.appendChild(note('Two months beside the present method before the ERP is used alone: put the file of the present method (Excel or CSV) – a line a person, the column Code and any of Gross, PF, ESIC, PT, LWF, TDS, Advance, Net. A difference of less than ₹ 1 is the same.'));
    var tools = el('div', 'tools'), f = el('input'); f.type = 'file'; f.accept = '.xlsx,.xls,.csv'; tools.appendChild(f); root.appendChild(tools); var out = el('div'); root.appendChild(out);
    f.onchange = function () { var file = f.files && f.files[0]; if (!file) return; out.textContent = '';
      xlsxLib().then(function (ok) { if (!ok) return toast('The Excel reader could not be loaded – try again.', true);
        var rd = new FileReader(); rd.onload = function () { var rows; try { var wb = window.XLSX.read(new Uint8Array(rd.result), { type: 'array' }); rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); } catch (e) { return toast('This file could not be read.', true); }
          var list = rows.map(function (x) { var o = {}; Object.keys(x).forEach(function (k) { var a = ALIAS[String(k).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()]; if (a && o[a] === undefined) o[a] = x[k]; }); return o; }).filter(function (o) { return o.code; });
          api('payCompare', { month: month, rows: list }).then(function (r) { shown(out, r); }, fail); }; rd.readAsArrayBuffer(file); }); };
  }
  function shown(out, r) {
    out.textContent = '';
    out.appendChild(note(r.equal + ' the same · ' + r.differ + ' differ · ' + r.missing + ' of the file not in the ERP\'s month · ' + r.not_in_file.length + ' of the ERP not in the file' + (r.locked ? '' : ' (the ERP\'s month is not locked yet – counted as it stands now)'), r.differ || r.missing || r.not_in_file.length ? 'warn' : 'ok'));
    var t = table(['Code', 'Name', 'What', 'ERP ₹', 'Present method ₹', 'Difference ₹']);
    r.rows.forEach(function (x) { var tr = row(el('tr')); [x.code, x.name, x.note || (HEAD[x.field] || x.field)].forEach(function (v) { tr.appendChild(el('td', '', v || '–')); }); num(tr, x.ours); num(tr, x.theirs); num(tr, x.diff, true); t.body.appendChild(tr); });
    if (!r.rows.length) t.box.appendChild(el('p', 'none', 'No difference.')); out.appendChild(t.box);
    if (r.not_in_file.length) { out.appendChild(el('label', '', 'In the ERP\'s month, not in the file')); out.appendChild(el('p', 'muted', r.not_in_file.map(function (p) { return p.code + ' ' + p.name; }).join(' · '))); }
  }

  /* ───── FULL & FINAL ───── */
  function fnf(root) {
    root.textContent = ''; var card = el('div', 'dz-card'); card.style.marginBottom = '14px'; card.appendChild(el('h3', '', 'Make a full & final'));
    card.appendChild(el('p', 'muted', 'For a relieved person, after the pay of the month of his last day is locked. The ERP fills what it can work out (unused leave, gratuity from the pay settings, the advance left, the notice); every line can be changed until it is checked. Made, checked and approved by three different people (the Super Admin may approve).'));
    var g = el('div', 'grid'), who = field(g, 'Relieved employee', select([['', 'Choose…']], '')); card.appendChild(g);
    api('empList', { status: 'left' }).then(function (x) { (x.rows || []).forEach(function (p) { var o = el('option', '', p.name + ' (' + p.code + ') – left ' + dmy(p.left_on)); o.value = p.id; who.appendChild(o); }); }, function () {});
    var a = el('div', 'acts'); a.style.justifyContent = 'flex-start'; a.appendChild(btn('pri', 'Make it', function () { if (!who.value) return toast('Choose the employee.', true); api('fnfMake', { id: who.value }).then(function (x) { toast('Made.'); fnf(root); open(x.id, root); }, fail); })); card.appendChild(a); root.appendChild(card);
    api('fnfList').then(function (r) {
      var t = table(['Code', 'Name', 'Last day', 'Net ₹', 'Where it stands', 'Made by', 'Checked by', 'Approved by', '']);
      r.rows.forEach(function (x) { var tr = row(el('tr')); [x.code, x.name, dmy(x.last_day)].forEach(function (v) { tr.appendChild(el('td', '', v)); }); num(tr, x.net, true);
        [FNF[x.status] + (x.status === 'paid' ? ' ' + dmy(x.paid_on) : ''), x.made_by, x.checked_by || '–', x.approved_by || '–'].forEach(function (v) { tr.appendChild(el('td', '', v)); });
        var c = el('td'); c.appendChild(btn('sm ghost', 'Open', function () { open(x.id, root); })); tr.appendChild(c); t.body.appendChild(tr); });
      if (!r.rows.length) t.box.appendChild(el('p', 'none', 'No full & final on this site yet.')); root.appendChild(t.box);
    }, function (e) { root.appendChild(el('p', 'none', e.message)); });
  }
  function open(id, root) {
    api('fnfList').then(function (r) {
      var f = r.rows.filter(function (x) { return x.id === id; })[0]; if (!f) return;
      var d = dialog('Full & final – ' + f.name + ' (' + f.code + ')', 'Last day ' + dmy(f.last_day) + ' · ' + FNF[f.status] + ' · made by ' + f.made_by + (f.checked_by ? ' · checked by ' + f.checked_by : '') + (f.approved_by ? ' · approved by ' + f.approved_by : ''));
      var edit = f.status === 'made', lines = [], list = el('div'), total = el('p', 'net'); total.style.cssText = 'font-size:17px;font-weight:700;margin:10px 0';
      var sum = function () { var n = 0; lines.forEach(function (l) { var v = Number(String(l.amount.value).replace(/[,\s₹]/g, '')) || 0; n += l.kind.value === 'ded' ? -v : v; }); total.textContent = 'Net: ₹ ' + rs(Math.round(n * 100) / 100); };
      function add(l) { var line = el('div'); line.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap';
        var nm = text('What it is', l.name, 80), kd = select([['earn', 'Paid to him (+)'], ['ded', 'Taken from him (−)']], l.kind || 'earn'), am = input('₹', l.amount === undefined ? '' : l.amount), nt = text('Note', l.note, 200);
        nm.style.flex = '2 1 200px'; kd.style.flex = '1 1 150px'; am.style.flex = '0 0 120px'; nt.style.flex = '2 1 200px'; [nm, kd, am, nt].forEach(function (i) { i.disabled = !edit; line.appendChild(i); });
        am.oninput = kd.onchange = sum; list.appendChild(line); lines.push({ key: l.key || 'other', name: nm, kind: kd, amount: am, note: nt }); }
      (f.lines || []).forEach(add); d.body.appendChild(list); if (edit) d.body.appendChild(btn('sm ghost', '+ another line', function () { add({}); })); d.body.appendChild(total); sum();
      if (f.note) d.body.appendChild(el('p', 'muted', f.note));
      var go = function (step, extra) { api('fnfStep', Object.assign({ id: f.id, step: step }, extra || {})).then(function () { d.close(); toast('Done.'); fnf(root); }, d.err); };
      if (edit) { d.acts.appendChild(btn('sec', 'Save', function () { api('fnfSave', { id: f.id, lines: lines.map(function (l) { return { key: l.key, name: l.name.value, kind: l.kind.value, amount: l.amount.value, note: l.note.value }; }) }).then(function () { toast('Saved.'); }, d.err); }));
        d.acts.appendChild(btn('pri', 'Checked', function () { go('check'); })); }
      if (f.status === 'checked') d.acts.appendChild(btn('pri', 'Approve', function () { go('approve'); }));
      if (f.status === 'approved') { var g = el('div', 'grid'), mode = field(g, 'How it was paid', select(MODES, 'bank')), ref = field(g, 'Reference', text('', '', 80)), on = field(g, 'Paid on (empty = today)', input('', '', 'date')); d.body.appendChild(g);
        d.acts.appendChild(btn('pri', 'Mark paid', function () { go('paid', { mode: mode.value, ref: ref.value, paid_on: on.value }); })); }
      if (f.status !== 'paid' && f.status !== 'cancelled') { var why = text('Why it is cancelled', '', 200); why.hidden = true; d.body.appendChild(why);
        d.acts.appendChild(btn('sm ghost', 'Cancel it…', function () { if (why.hidden) { why.hidden = false; why.focus(); return; } go('cancel', { note: why.value }); })); }
    }, fail);
  }

  /* ───── SALARY STRUCTURES ───── */
  function structures(root) {
    api('structList').then(function (r) {
      root.textContent = ''; var card = el('div', 'dz-card'); card.style.marginBottom = '14px'; card.appendChild(el('h3', '', 'A new salary structure'));
      card.appendChild(el('p', 'muted', 'The parts of the earned pay as a % (Basic, HRA, …); the last part may take the rest. A version counts from its date after ANOTHER person of the HO HR approved it. A person is given a structure in the pay sheet (Set…). Without a structure his pay is made exactly as before.'));
      var g = el('div', 'grid'), nm = field(g, 'Name (e.g. Staff structure)', text('', '', 60)), nt = field(g, 'Note', text('', '', 200)); card.appendChild(g);
      var a = el('div', 'acts'); a.style.justifyContent = 'flex-start'; a.appendChild(btn('pri', 'Add', function () { api('structSave', { name: nm.value, note: nt.value }).then(function () { toast('Added.'); structures(root); }, fail); })); card.appendChild(a); root.appendChild(card);
      r.rows.forEach(function (s) {
        var c = el('div', 'dz-card'); c.style.marginBottom = '12px'; c.appendChild(el('h3', '', s.name + (s.active ? '' : ' (not in use)') + ' – ' + s.people + ' people')); if (s.note) c.appendChild(el('p', 'muted', s.note));
        var ul = el('ul', 'hist'); s.versions.forEach(function (v) { var li = el('li', '', 'v' + v.version + ' from ' + dmy(v.valid_from) + ' — ' + v.parts.map(function (p) { return p.name + (p.pct ? ' ' + p.pct + ' %' : ' (the rest)'); }).join(' · ') + ' — ' + (v.status === 'approved' ? 'approved by ' + v.approved_by + ', ' + when(v.approved_at) : 'DRAFT by ' + v.created_by));
          if (v.status === 'draft') { li.appendChild(document.createTextNode(' ')); li.appendChild(btn('sm', 'Approve', function () { api('structApprove', { version: v.id }).then(function () { toast('Approved.'); structures(root); }, fail); })); }
          ul.appendChild(li); });
        if (!s.versions.length) ul.appendChild(el('li', '', 'No version yet.')); c.appendChild(ul);
        var acts = el('div', 'acts'); acts.style.justifyContent = 'flex-start';
        acts.appendChild(btn('sec', s.versions.some(function (v) { return v.status === 'draft'; }) ? 'Change the draft…' : 'New version…', function () { version(s, root); }));
        acts.appendChild(btn('sm ghost', s.active ? 'Not in use' : 'In use again', function () { api('structSave', { id: s.id, name: s.name, note: s.note, active: !s.active }).then(function () { structures(root); }, fail); }));
        c.appendChild(acts); root.appendChild(c);
      });
    }, function (e) { root.textContent = ''; root.appendChild(el('p', 'none', e.message)); });
  }
  function version(s, root) {
    var draft = s.versions.filter(function (v) { return v.status === 'draft'; })[0], base = draft || s.versions.filter(function (v) { return v.status === 'approved'; })[0];
    var d = dialog(s.name + (draft ? ' – the draft' : ' – a new version'), 'Each part a % of the earned pay; the last may be left without a % (it takes the rest). It counts after another person approved it.');
    var list = el('div'), rows = []; function add(p) { var line = el('div'); line.style.cssText = 'display:flex;gap:10px;margin-bottom:8px;align-items:center'; var n = text('Part (e.g. Basic)', p ? p.name : '', 40), pc = input('%', p ? p.pct : ''); n.style.flex = '2'; pc.style.flex = '1'; line.appendChild(n); line.appendChild(pc); line.appendChild(el('span', '', '%')); list.appendChild(line); rows.push([n, pc]); }
    ((base && base.parts) || [{ name: 'Basic' }, { name: 'HRA' }, { name: 'Special allowance' }]).forEach(add); d.body.appendChild(list); d.body.appendChild(btn('sm ghost', '+ another part', function () { add(null); }));
    var g = el('div', 'grid'), from = field(g, 'Counts from (empty = today)', input('', draft ? draft.valid_from : '', 'date')); g.style.marginTop = '12px'; d.body.appendChild(g);
    d.acts.appendChild(btn('pri', 'Save the draft', function () { api('structVersionSave', { structure: s.id, valid_from: from.value, parts: rows.map(function (x) { return { name: x[0].value, pct: x[1].value }; }).filter(function (x) { return x.name || x.pct; }) }).then(function () { d.close(); toast('Saved – another person of the HO HR approves it.'); structures(root); }, d.err); }));
  }

  /* ───── the CA's check of the settings (under the settings) ───── */
  function checks(card) {
    api('statChecks').then(function (r) {
      card.appendChild(el('label', '', 'Checked by the CA')); var ul = el('ul', 'hist');
      r.rows.slice(0, 8).forEach(function (v) { var li = el('li'); li.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
        var tx = el('span', '', 'From ' + dmy(v.valid_from) + (v.settings && v.settings.source ? ' — source: ' + v.settings.source : '') + ' — ' + (v.checks.length ? v.checks.map(function (c) { return c.checked_by + ', ' + when(c.checked_at) + ': ' + c.note; }).join(' · ') : 'not checked yet')); tx.style.flex = '1 1 320px'; li.appendChild(tx);
        var w = text('What was checked', '', 300); w.hidden = true; w.style.flex = '1 1 260px'; li.appendChild(w); li.appendChild(btn('sm ghost', 'Checked…', function () { if (w.hidden) { w.hidden = false; w.focus(); return; } api('statCheck', { settings: v.id, note: w.value }).then(function () { toast('Written.'); card.removeChild(ul); card.removeChild(lab); checks(card); }, fail); })); ul.appendChild(li); });
      var lab = card.lastChild; card.appendChild(ul);
    }, function () { /* before step 18: nothing more here */ });
  }

  /* ───── a person in the pay sheet: his structure, LWF and TDS of a month (only when step 18 is there) ───── */
  var LIST = null;
  function person(body, w) {
    if (!w.pay18) return null;
    var box = el('div'), g = el('div', 'grid'), st = field(g, 'Salary structure', select([['', 'None – as before']], w.pay18.structure || '')), tds = field(g, 'TDS of a month (₹)', input('0', w.pay18.tds_monthly || ''));
    var l = el('label', 'ck'), c = el('input'); c.type = 'checkbox'; c.checked = !!w.pay18.lwf; c.style.cssText = 'width:18px;height:18px;margin-right:6px'; l.style.cssText = 'display:flex;align-items:center;font-size:16px;margin:4px 0 12px'; l.appendChild(c); l.appendChild(document.createTextNode('Labour Welfare Fund (in its months)'));
    box.appendChild(g); box.appendChild(l); body.appendChild(box);
    (LIST ? Promise.resolve(LIST) : api('structList').then(function (r) { LIST = r; return r; })).then(function (r) { r.rows.filter(function (s) { return s.active || s.id === w.pay18.structure; }).forEach(function (s) { var o = el('option', '', s.name); o.value = s.id; o.selected = s.id === w.pay18.structure; st.appendChild(o); }); }, function () {});
    return function () { LIST = null; return api('payEmpSet', { id: w.id, structure: st.value, lwf: c.checked, tds_monthly: tds.value }); };
  }
  window.HRPAY5 = { release: release, registers: registers, compare: compare, fnf: fnf, structures: structures, checks: checks, person: person };
})();
