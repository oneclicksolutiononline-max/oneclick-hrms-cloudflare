/* HR – REPORTS (18-11-2026, Phase 6): the reports of this site this sign-in may see (the server decides – lib/act_reports.js), each with
 * its filters; shown on the screen, taken as Excel, or printed as PDF (the browser's own Print → "Save as PDF").
 * Every text of a person is put in as TEXT, never as HTML. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  var api = function (action, body) { return window.HRAPI('api/hr', Object.assign({ action: action }, body || {})); };
  var V = { key: '', f: {} }, CAT = null;
  var rs = function (n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); };
  function toast(t, bad) { var e = $('toast'); e.textContent = t; e.className = bad ? 'bad' : ''; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, bad ? 9000 : 3500); }
  function fail(e) { toast(e && e.message ? e.message : 'HR did not answer – try again.', true); }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
  function inp(type, val, label) { var i = el('input'); i.type = type; if (val) i.value = val; i.setAttribute('aria-label', label); i.style.flex = '0 0 170px'; return i; }
  function sel(list, val, label) { var s = el('select'); s.setAttribute('aria-label', label); list.forEach(function (o) { var x = el('option', '', o[1]); x.value = o[0]; x.selected = String(o[0]) === String(val || ''); s.appendChild(x); }); return s; }
  function xlsxLib() { return new Promise(function (ok) { if (window.XLSX) return ok(true); var s = document.createElement('script'); s.src = '/vendor/xlsx-0.18.5.full.min.js'; s.onload = function () { ok(!!window.XLSX); }; s.onerror = function () { ok(false); }; document.head.appendChild(s); }); }
  var fileName = function (r) { return r.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '') + '_' + r.site + '_' + r.made_at.slice(0, 10); };
  function excel(r) {
    var head = r.cols.map(function (c) { return c.label; }), rows = r.rows.map(function (x) { return r.cols.map(function (c) { var v = x[c.key]; return v === undefined || v === null ? '' : v; }); });
    xlsxLib().then(function (ok) {
      if (ok) { try { var ws = window.XLSX.utils.aoa_to_sheet([head].concat(rows)), wb = window.XLSX.utils.book_new(); ws['!cols'] = head.map(function (h) { return { wch: Math.max(10, String(h).length + 2) }; }); window.XLSX.utils.book_append_sheet(wb, ws, 'Report'); window.XLSX.writeFile(wb, fileName(r) + '.xlsx'); return; } catch (e) { /* the CSV below */ } }
      var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }, a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + [head].concat(rows).map(function (x) { return x.map(q).join(','); }).join('\r\n')], { type: 'text/csv' })); a.download = fileName(r) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    });
  }
  // PDF: a clean page in a new window – the browser's Print → "Save as PDF"
  function pdf(r) {
    var w = window.open('', '_blank'); if (!w) return toast('The browser stopped the new window – allow pop-ups for this page.', true);
    var d = w.document, add = function (p, tag, text) { var x = d.createElement(tag); if (text !== undefined) x.textContent = String(text); p.appendChild(x); return x; };
    d.title = fileName(r); var st = d.createElement('style'); st.textContent = 'body{font:12px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:20px}h1{font-size:17px;margin:0}p{margin:4px 0 10px;color:#444}table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#f1f1f1}td.n{text-align:right}@media print{button{display:none}body{margin:8mm}}'; d.head.appendChild(st);
    add(d.body, 'h1', r.name); add(d.body, 'p', r.site + ' · ' + filt(r.filters) + ' · ' + r.rows.length + ' rows · made ' + new Date(Date.parse(r.made_at) + 19800000).toISOString().slice(0, 16).replace('T', ' '));
    var t = add(d.body, 'table'), h = add(t, 'tr'); r.cols.forEach(function (c) { add(h, 'th', c.label); });
    r.rows.forEach(function (x) { var tr = add(t, 'tr'); r.cols.forEach(function (c) { var v = x[c.key], td = add(tr, 'td', typeof v === 'number' ? rs(v) : v === undefined || v === null ? '' : v); if (typeof v === 'number') td.className = 'n'; }); });
    var b = add(d.body, 'button', 'Print / Save as PDF'); b.style.cssText = 'margin-top:12px;padding:8px 14px;font-size:14px'; b.onclick = function () { w.print(); };
  }
  var dmy = function (d) { return d ? String(d).split('-').reverse().join('-') : ''; };
  function filt(f) { return [f.from ? dmy(f.from) + ' to ' + dmy(f.to) : '', f.day ? dmy(f.day) : '', f.month || '', f.days ? 'next ' + f.days + ' days' : '', f.category || ''].filter(Boolean).join(' · ') || 'everybody'; }

  function draw() {
    var root = $('p_rep'); root.textContent = '';
    if (!CAT) { api('repCatalog').then(function (c) { CAT = c; draw(); }, function (e) { root.appendChild(el('p', 'none', e.message)); }); return; }
    var groups = {}; CAT.reports.forEach(function (r) { (groups[r.group] = groups[r.group] || []).push(r); });
    var r0 = CAT.reports.filter(function (r) { return r.key === V.key; })[0] || CAT.reports[0]; V.key = r0.key;
    var tools = el('div', 'tools'), pick = el('select'); pick.setAttribute('aria-label', 'Report'); pick.style.flex = '1 1 300px';
    Object.keys(groups).forEach(function (g) { var og = el('optgroup'); og.label = g; groups[g].forEach(function (r) { var o = el('option', '', r.name); o.value = r.key; o.selected = r.key === V.key; og.appendChild(o); }); pick.appendChild(og); });
    pick.onchange = function () { V.key = pick.value; draw(); }; tools.appendChild(pick);
    var F = {};
    if (r0.need.indexOf('range') > -1) { F.from = inp('date', V.f.from || CAT.today.slice(0, 8) + '01', 'From'); F.to = inp('date', V.f.to || CAT.today, 'To'); tools.appendChild(el('span', 'muted', 'From')); tools.appendChild(F.from); tools.appendChild(el('span', 'muted', 'to')); tools.appendChild(F.to); }
    if (r0.need.indexOf('day') > -1) { F.day = inp('date', V.f.day || CAT.today, 'Day'); tools.appendChild(F.day); }
    if (r0.need.indexOf('month') > -1) { F.month = inp('month', V.f.month || CAT.today.slice(0, 7), 'Month'); tools.appendChild(F.month); }
    if (r0.need.indexOf('days') > -1) { F.days = sel([['30', 'In the next 30 days'], ['7', 'In the next 7 days'], ['60', 'In the next 60 days'], ['90', 'In the next 90 days']], V.f.days || '30', 'Days'); tools.appendChild(F.days); }
    F.category = sel([['', 'Every category']].concat(CAT.categories.map(function (c) { return [c.key, c.name]; })), V.f.category, 'Category'); tools.appendChild(F.category);
    F.department = sel([['', 'Every department']].concat(CAT.departments.map(function (d) { return [d.id, d.name]; })), V.f.department, 'Department'); tools.appendChild(F.department);
    tools.querySelectorAll('span.muted').forEach(function (s) { s.style.alignSelf = 'center'; });
    var out = el('div'), got = null;
    var run = function () { var f = {}; Object.keys(F).forEach(function (k) { f[k] = F[k].value; }); V.f = f; out.textContent = ''; out.appendChild(el('p', 'muted', 'Making the report…'));
      api('repRun', Object.assign({ key: V.key }, f)).then(function (r) { got = r; show(out, r); }, function (e) { out.textContent = ''; out.appendChild(el('p', 'none', e.message)); }); };
    tools.appendChild(btn('pri', 'Show', run)); tools.appendChild(btn('sec', 'Excel', function () { if (got) excel(got); else toast('Press Show first.', true); })); tools.appendChild(btn('sec', 'PDF', function () { if (got) pdf(got); else toast('Press Show first.', true); }));
    root.appendChild(tools); root.appendChild(out); run();
  }
  function show(out, r) {
    out.textContent = ''; var p = el('p', 'muted', r.name + ' · ' + filt(r.filters) + ' · ' + r.rows.length + ' rows'); p.style.margin = '0 0 10px'; out.appendChild(p);
    var box = el('div', 'box'), t = el('table'), h = el('thead'), hr = el('tr'); r.cols.forEach(function (c) { hr.appendChild(el('th', '', c.label)); }); h.appendChild(hr); t.appendChild(h); var b = el('tbody'); t.appendChild(b); box.appendChild(t);
    r.rows.slice(0, 1000).forEach(function (x) { var tr = el('tr'); tr.style.cursor = 'default'; r.cols.forEach(function (c) { var v = x[c.key], td = el('td', '', typeof v === 'number' ? rs(v) : v === undefined || v === null || v === '' ? '–' : v); if (typeof v === 'number') td.style.textAlign = 'right'; tr.appendChild(td); }); b.appendChild(tr); });
    if (!r.rows.length) box.appendChild(el('p', 'none', 'Nothing in this report for these filters.'));
    if (r.rows.length > 1000) box.appendChild(el('p', 'muted', 'The first 1000 rows are shown – Excel and PDF have all ' + r.rows.length + '.'));
    out.appendChild(box);
  }
  window.HRREP = { pages: [['reports', 'Reports']], has: function (page) { return page === 'reports'; }, open: function () { draw(); } };
})();
