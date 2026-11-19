/* "ASK" – HELP WITH HR IN ONE'S OWN WORDS (19-11-2026, asked: "portal and hr madhe ask button de ani tya madhe api mi dileli aahe
 * adhich app ani mechnical sathi tich api rahude kahi hi vicharle app badal sagli detail proper tyane sangawi … user mala vicharne
 * peksha tithech vicharel systeam tyala guide krel"; his answers: guidance only – how to do something, where it is, what a message
 * means, whom to ask – it reads no data of anybody and changes nothing; the web first, the phone app later).
 *   helpAsk { q, past: [{ q, a }], lang } → { answer }
 * The answer comes from the guide (help/hr_guide.md) and what the person IS (his role, HO HR or not, his pages) – never from the
 * database. Through HR's one AI door (lib/ai.js: switched on, the provider, the model and the key in Vercel; every call logged without
 * its words – purpose "help"). The guide is the same in every question: the provider keeps it (prompt caching) – later questions
 * pay about a tenth for it. At most HELP_PER_HOUR questions an hour a person. The HR office's pages only ("My HR": with the app). */
'use strict';
const fs = require('fs');
const path = require('path');
const { fail } = require('./http');
const { db, enc } = require('./db');
const AI = require('./ai');
const PG = require('./pages');
const { isHo } = require('./act_month');

const GUIDE = fs.readFileSync(path.join(__dirname, '..', 'help', 'hr_guide.md'), 'utf8');
const HELP_PER_HOUR = 40;
const ROLE = { super: 'Super Admin', admin: 'HR Admin of this site', user: 'HR User of this site', self: 'employee ("My HR")' };
const LANG = { mr: 'Marathi', hi: 'Hindi', en: 'English' };

// the rules of the answer – the same for everybody (they are kept with the guide by the provider)
const RULES = `You are "Ask", the help inside the HR module of the company's ERP (Sketchline). People of the HR office and the company
ask you how to use HR. You answer ONLY from the guide below and from what is said about the person asking.

How to answer:
* Answer in the language and the script of the question. A question in Marathi or Hindi written in English letters (for example
  "employee add kasa karu") gets its answer in that language in Devanagari, simple words. Names of pages, buttons and messages stay
  exactly as on the screen, in English, in quotes – the screen may show them in the person's language.
* Answer first, then the steps: short numbered steps, each one action ("Employees → + Add employee → …"). No long introductions.
  Use **bold** only for the name of a button or a page. At most about 200 words unless the person asks for more detail.
* Say what HIS role can do: if his role or his pages do not allow it, say so plainly and whom to ask (the HR Admin of his site, or
  the Super Admin). Never send him to a page he has "No access" to.
* When a message from the screen is asked about, say what it means and what to do.
* You have NO data: you cannot see or check any employee, attendance, leave, salary or setting. Never invent a person, a number, a
  date or a setting. If he asks about his data, tell him where in HR he can see it himself.
* You change nothing. Never say that something was done, saved, given or sent.
* Never ask for or repeat a sign-in secret, a one-time code, an OTP, a key, an Aadhaar, PAN or bank number.
* If the guide does not cover the question, say so in one line and tell him to ask the Super Admin (with a screenshot if something
  looks wrong). Do not guess how the screens work.
* Questions that are not about the ERP: say in one line that you help only with HR in this ERP.

THE GUIDE:
`;

const str = (v, n) => String(v === undefined || v === null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);

// who is asking – only what the sign-in says (his role here, HO HR, his pages); nothing of the database's people
async function who(s, lang) {
  const lines = ['The person asking: ' + (ROLE[s.role] || s.role) + ' – site ' + (s.info && s.info.siteName ? s.info.siteName + ' (' + s.site + ')' : s.site) + '.'];
  if (s.role !== 'self' && await isHo(s).catch(() => false)) lines.push('He is also HO HR (Head Office HR).');
  const pg = PG.mine(s);
  if (pg) lines.push('His pages of HR (given by the Super Admin): ' + PG.PAGES.map(p => p.name + ' – ' + (pg[p.key] === 'None' ? 'No access' : pg[p.key])).join('; ') + '.');
  const sites = ((s.info && s.info.sites) || []).filter(x => x && x.code);
  if (sites.length > 1) lines.push('He has HR on ' + sites.length + ' sites (the site chooser and "All sites" are his).');
  lines.push('The language of his HR screen: ' + (LANG[lang] || 'English') + '.');
  return lines.join('\n');
}

const ACT = {
  async helpAsk(s, x) {
    if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role');
    const q = str(x.q, 1000); if (q.length < 2) throw fail(400, 'Type your question.', 'q');
    const past = (Array.isArray(x.past) ? x.past : []).slice(-6).map(t => ({ q: str(t && t.q, 1000), a: str(t && t.a, 3000) })).filter(t => t.q && t.a);
    const lang = ['mr', 'hi', 'en'].indexOf(x.lang) > -1 ? x.lang : 'en';
    // at most so many an hour a person (counted from the AI log: his "help" lines of the last hour)
    if (AI.on()) {
      let n = 0;
      try { n = ((await db('GET', 'hr_ai_runs?select=id&purpose=eq.help&by=eq.' + enc(s.email) + '&at=gte.' + enc(new Date(Date.now() - 3600000).toISOString()) + '&limit=' + (HELP_PER_HOUR + 1))) || []).length; }
      catch (e) { if (!e || e.code !== 'notinstalled') throw e; }      // (the AI door says step 19 plainly)
      if (n >= HELP_PER_HOUR) throw fail(429, 'You asked ' + HELP_PER_HOUR + ' questions in the last hour – ask again a little later.', 'helplimit');
    }
    const text = (await who(s, lang)) + '\n\n' + (past.length ? 'Earlier in this conversation:\n' + past.map(t => 'Q: ' + t.q + '\nA: ' + t.a).join('\n\n') + '\n\n' : '') + 'The question: ' + q;
    const r = await AI.call({ s: s, purpose: 'help', system: RULES + GUIDE, cache: true, text: text, max_tokens: 1200, timeout: 25000 });
    const answer = String(r.text || '').trim();
    if (!answer) throw fail(502, 'The AI service gave no answer – ask again in other words.', 'aiempty');
    return { answer: answer };
  },
};
module.exports = { ACT, GUIDE, RULES, HELP_PER_HOUR, who };
