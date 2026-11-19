/* "ASK" – HELP WITH HR IN ONE'S OWN WORDS (19-11-2026, asked: "portal and hr madhe ask button de … kahi hi vicharle app badal sagli
 * detail proper tyane sangawi … user mala vicharne peksha tithech vicharel systeam tyala guide krel"; his answers: guidance only, the
 * web first). The "Ask" button on top opens a panel on the right: a few questions to start with, the conversation, a box to type in
 * (Enter sends, Shift + Enter a new line). The answer is the server's (helpAsk – from the guide and his role, never from anybody's
 * data). The conversation stays only in this open page. The person's words and the answers are put in as TEXT, never as HTML, and
 * are never turned by the page's language (data-noi18n). */
(function () {
  'use strict';
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  var S = { open: false, busy: false, turns: [], panel: null, list: null, box: null, send: null, back: null };
  var START = ['How do I add an employee?', 'An employee cannot mark attendance – what should I check?', 'How does an employee get his sign-in for the app?', 'How do I switch the face check off for my site?'];

  /* an answer's few marks: **bold**, lines "- " / "• " (a list), "1. " (numbered), an empty line (a new paragraph) – as elements */
  function inline(p, t) {
    String(t).split(/(\*\*[^*]+\*\*)/).forEach(function (part) {
      if (/^\*\*[^*]+\*\*$/.test(part)) p.appendChild(el('b', '', part.slice(2, -2))); else if (part) p.appendChild(document.createTextNode(part.replace(/`/g, '')));
    });
  }
  function rich(text) {
    var box = el('div', 'ak-ans'), list = null, kind = '';
    String(text).replace(/\r/g, '').split('\n').forEach(function (line) {
      var l = line.replace(/\s+$/, ''), m;
      if (!l.trim()) { list = null; return; }
      if ((m = /^\s*(?:[-•*])\s+(.*)$/.exec(l))) { if (!list || kind !== 'ul') { list = el('ul'); kind = 'ul'; box.appendChild(list); } var li = el('li'); inline(li, m[1]); list.appendChild(li); return; }
      if ((m = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(l))) { if (!list || kind !== 'ol') { list = el('ol'); kind = 'ol'; box.appendChild(list); } var lo = el('li'); inline(lo, m[2]); list.appendChild(lo); return; }
      list = null; var h = /^#{1,4}\s+(.*)$/.exec(l), p = el(h ? 'h4' : 'p'); inline(p, h ? h[1] : l); box.appendChild(p);
    });
    return box;
  }
  function scroll() { var l = S.list; if (l) l.scrollTop = l.scrollHeight; }
  function say(who, text, bad) {
    var row = el('div', 'ak-row ' + who);
    if (who === 'me') { var b = el('div', 'ak-me', text); b.setAttribute('data-noi18n', ''); row.appendChild(b); }
    else { var a = bad ? el('div', 'ak-ans ak-bad', text) : rich(text); if (!bad) a.setAttribute('data-noi18n', ''); row.appendChild(a); }
    S.list.appendChild(row); scroll(); return row;
  }
  function start() {
    var w = el('div', 'ak-start');
    w.appendChild(el('p', 'ak-hi', 'Ask how to do something in HR, where a thing is, or what a message means – in Marathi, Hindi or English.'));
    var chips = el('div', 'ak-chips');
    START.forEach(function (q) { var c = el('button', 'ak-chip', q); c.type = 'button'; c.onclick = function () { S.box.value = c.textContent; ask(); }; chips.appendChild(c); });
    w.appendChild(chips); S.list.appendChild(w);
  }
  function ask() {
    var q = S.box.value.trim(); if (!q || S.busy) return;
    if (!window.HRAPI) return;
    S.busy = true; S.send.disabled = true; S.box.value = ''; fit();
    var st = S.list.querySelector('.ak-start'); if (st) st.remove();
    say('me', q);
    var wait = el('div', 'ak-row bot'), dots = el('div', 'ak-wait'); dots.setAttribute('aria-label', 'Thinking'); dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i')); wait.appendChild(dots); S.list.appendChild(wait); scroll();
    var lang = window.HRLANG && window.HRLANG.lang ? window.HRLANG.lang() : '';
    window.HRAPI('api/hr', { action: 'helpAsk', q: q, past: S.turns.slice(-6), lang: lang === 'mr' || lang === 'hi' ? lang : 'en' }).then(function (r) {
      wait.remove(); say('bot', r.answer); S.turns.push({ q: q, a: String(r.answer || '').slice(0, 3000) });
    }, function (e) { wait.remove(); say('bot', e && e.message ? e.message : 'HR did not answer – try again.', true); })
      .then(function () { S.busy = false; S.send.disabled = false; if (S.open) S.box.focus(); });
  }
  function fit() { var b = S.box; b.style.height = 'auto'; b.style.height = Math.min(b.scrollHeight, 140) + 'px'; }
  function build() {
    var back = el('div', 'ak-shade'); back.hidden = true; back.onclick = close;
    var p = el('aside', 'ak-panel'); p.id = 'ask_panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Ask'); p.hidden = true;
    var head = el('header', 'ak-head'), tt = el('div'); tt.appendChild(el('b', '', 'Ask')); tt.appendChild(el('small', '', 'Help with HR – how to do it, where it is, whom to ask'));
    var x = el('button', 'ak-x', '×'); x.type = 'button'; x.title = 'Close'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
    var nw = el('button', 'ak-new', 'New'); nw.type = 'button'; nw.title = 'Start a new conversation'; nw.onclick = function () { if (S.busy) return; S.turns = []; S.list.textContent = ''; start(); S.box.focus(); };
    head.appendChild(tt); head.appendChild(nw); head.appendChild(x);
    var list = el('div', 'ak-list'); list.setAttribute('aria-live', 'polite');
    var form = el('form', 'ak-form'); form.setAttribute('autocomplete', 'off');
    var box = el('textarea', 'ak-box'); box.id = 'ask_q'; box.rows = 1; box.maxLength = 1000; box.placeholder = 'Type your question…'; box.setAttribute('aria-label', 'Your question');
    var send = el('button', 'ak-send', 'Send'); send.type = 'submit';
    form.appendChild(box); form.appendChild(send);
    form.onsubmit = function (e) { e.preventDefault(); ask(); };
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(); } });
    box.addEventListener('input', fit);
    var foot = el('p', 'ak-foot', 'Ask only explains how to use HR – it does not see or change anybody\'s data.');
    p.appendChild(head); p.appendChild(list); p.appendChild(form); p.appendChild(foot);
    document.body.appendChild(back); document.body.appendChild(p);
    S.panel = p; S.list = list; S.box = box; S.send = send; S.back = back;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) close(); });
    start();
  }
  function open() { if (!S.panel) build(); S.open = true; S.panel.hidden = false; S.back.hidden = false; document.body.classList.add('ak-on'); setTimeout(function () { S.box.focus(); }, 30); }
  function close() { if (!S.panel) return; S.open = false; S.panel.hidden = true; S.back.hidden = true; document.body.classList.remove('ak-on'); var b = document.getElementById('ask_open'); if (b) b.focus(); }
  window.HRASK = { open: open, close: close, toggle: function () { if (S.open) close(); else open(); }, _rich: rich };
})();
