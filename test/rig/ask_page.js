// RIG ONLY – (19-11-2026, asked: "portal and hr madhe ask button de … user mala vicharne peksha tithech vicharel systeam tyala guide krel")
// "ASK": the button on top of HR, its panel, a question and its answer – through HR's own AI door to a STAND-IN of the AI service on
// :3998 (nothing reaches a real provider; no key of any account). It checks what the service is sent: the guide as one kept block, the
// person's role and pages, the question – and no data of anybody. The limit an hour; an HR User's View / No access pages in what is
// sent. A local HR server on :3077 and the local test database (never live). Made-up people only.   timeout 240 node test/rig/ask_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const { db } = require('../../lib/db');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'AK' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, shots = process.env.SHOTS || os.tmpdir(), H = 'http://localhost:3077';
  // the stand-in of the AI service: it keeps what it was sent and answers in the guide's way
  const seen = [];
  const ai = http.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
    const j = JSON.parse(b || '{}'); seen.push({ path: req.url, key: req.headers['x-api-key'], body: j });
    const q = String(((j.messages || [])[0] || {}).content[0].text || '');
    const text = /kasa|कसा/.test(q) ? 'नवीन employee असा add करा:\n1. डावीकडील **Employees** उघडा.\n2. **+ Add employee** दाबा.\n3. नाव, जन्मतारीख, mobile किंवा e-mail भरा आणि **Save** दाबा.\n\n- Mobile / e-mail एकाच employee चा असतो.'
      : 'Check these:\n1. **Work places** → By person: is he given a place?\n2. **Phones**: is his attendance tied to another phone?\n- Location ON, Developer Options OFF.';
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ content: [{ type: 'text', text: text }], usage: { input_tokens: 120, cache_read_input_tokens: seen.length > 1 ? 9000 : 0, cache_creation_input_tokens: seen.length > 1 ? 0 : 9000, output_tokens: 90 } }));
  }); }).listen(3998, '127.0.0.1');
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3077', HR_AI_ENABLED: 'true', HR_AI_PROVIDER: 'anthropic', HR_AI_MODEL: 'rig-model', ANTHROPIC_API_KEY: 'k-rig-standin', HR_AI_PRICE: '{"in":3,"out":15}', HR_AI_API_BASE: 'http://127.0.0.1:3998' }), stdio: 'ignore' });
  const sign = async (role, pages) => { const t = crypto.randomBytes(32).toString('base64url'); await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: role + '.' + tag.toLowerCase() + '@rig.test', name: 'Rig ' + role, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: Object.assign({ sites: [{ code: site, name: 'Rig ask ' + tag, role: role }], siteName: 'Rig ask ' + tag, mods: [] }, pages ? { pages: pages } : {}) }], 'return=minimal'); return t; };
  const call = async (tok, action, body) => { const r = await fetch(H + '/api/hr', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RCL': '1', Cookie: 'rcl_hr=' + tok, Origin: H }, body: JSON.stringify(Object.assign({ action: action }, body || {})) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1500));
    const admin = await sign('admin'), user = await sign('user', { leave: 'None', employees: 'View' }), self = await sign('self');
    // ---- the server
    let r = await call(self, 'helpAsk', { q: 'How?' }); ok(r.status === 403 && /HR office only/.test(r.j.error), '"My HR": not on the web (with the app, later) – ' + r.j.error);
    r = await call(user, 'helpAsk', { q: 'Why can I not open Leave?', lang: 'en' }); ok(r.status === 200 && /Work places/.test(r.j.answer), 'an HR User asks – an answer (' + r.status + ')');
    const s0 = seen[0] || { body: {} }, txt = String(((s0.body.messages || [])[0] || { content: [{}] }).content[0].text || '');
    ok(s0.path === '/v1/messages' && s0.key === 'k-rig-standin' && s0.body.model === 'rig-model', 'the AI door: its key, its model');
    ok(Array.isArray(s0.body.system) && s0.body.system.length === 1 && s0.body.system[0].cache_control && /THE GUIDE:/.test(s0.body.system[0].text) && /HR – how to use it/.test(s0.body.system[0].text), 'the rules and the guide: one block the provider keeps');
    ok(/HR User of this site/.test(txt) && /Leave – No access/.test(txt) && /Employees – View/.test(txt) && /The question: Why can I not open Leave\?$/.test(txt), 'what is sent: his role, his pages, the question');
    ok(!/@rig\.test/.test(JSON.stringify(s0.body)) && !/Rig user/.test(JSON.stringify(s0.body)), 'no e-mail, no name of anybody is sent');
    const runs = await db('GET', 'hr_ai_runs?select=purpose,by,tokens_in,tokens_out,cost_usd,ok&by=eq.user.' + tag.toLowerCase() + '@rig.test');
    ok(runs.length === 1 && runs[0].purpose === 'help' && runs[0].tokens_in === 9120 && Number(runs[0].cost_usd) > 0, 'the AI log: one "help" line with its tokens and cost (' + JSON.stringify(runs[0]) + ')');
    // ---- the page
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: admin, domain: 'localhost', path: '/' }]);
    const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    await p.goto(H + '/#page=employees'); await p.waitForSelector('#ask_open:not([hidden])', { timeout: 20000 }); await p.waitForTimeout(800);
    await p.screenshot({ path: shots + '/AK_1_button.png' });
    await p.click('#ask_open'); await p.waitForSelector('#ask_panel:not([hidden]) .ak-chip'); await p.waitForTimeout(400);
    const chips = await p.$$eval('.ak-chip', l => l.length); ok(chips === 4, 'the panel opens with four questions to start with');
    await p.screenshot({ path: shots + '/AK_2_panel.png' });
    await p.fill('#ask_q', 'employee add kasa karu'); await p.keyboard.press('Enter');
    await p.waitForSelector('.ak-row.bot .ak-ans ol li', { timeout: 30000 });
    const ans = await p.$eval('.ak-row.bot .ak-ans', e => ({ li: e.querySelectorAll('ol li').length, b: [].map.call(e.querySelectorAll('b'), x => x.textContent), ul: e.querySelectorAll('ul li').length, raw: /\*\*/.test(e.textContent), noi: e.hasAttribute('data-noi18n') }));
    ok(ans.li === 3 && ans.ul === 1 && ans.b.indexOf('Employees') > -1 && ans.b.indexOf('+ Add employee') > -1 && !ans.raw && ans.noi, 'the answer: numbered steps, bold names, no stars, never turned by the page\'s language');
    const mine = await p.$eval('.ak-row.me .ak-me', e => e.textContent); ok(mine === 'employee add kasa karu', 'his question on the right, as he typed it');
    await p.screenshot({ path: shots + '/AK_3_answer.png' });
    // the second question carries the first (the conversation)
    await p.click('.ak-chip').catch(() => {});      // (none any more – the questions to start with go after the first question)
    await p.fill('#ask_q', 'And the employee cannot mark attendance?'); await p.click('.ak-send');
    await p.waitForFunction(() => document.querySelectorAll('.ak-row.bot .ak-ans').length === 2, null, { timeout: 30000 });
    const t2 = String(seen[seen.length - 1].body.messages[0].content[0].text);
    ok(/Earlier in this conversation:\nQ: employee add kasa karu\nA: नवीन employee/.test(t2) && /HR Admin of this site/.test(t2), 'the second question carries the first, and he is the HR Admin');
    // a script typed as a question stays text
    await p.fill('#ask_q', '<img src=x onerror="window.__x=1">'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
    ok(!(await p.evaluate(() => window.__x)), 'what is typed is never HTML');
    // the limit an hour (40 "help" lines of the last hour)
    await db('POST', 'hr_ai_runs', Array.from({ length: 40 }, () => ({ site: site, by: 'admin.' + tag.toLowerCase() + '@rig.test', purpose: 'help', provider: 'anthropic', model: 'rig-model', ok: true })), 'return=minimal');
    await p.fill('#ask_q', 'One more?'); await p.keyboard.press('Enter');
    await p.waitForSelector('.ak-bad', { timeout: 20000 }); const lim = await p.$eval('.ak-bad', e => e.textContent);
    ok(/40 questions in the last hour/.test(lim), 'the limit an hour, said plainly – ' + lim);
    await p.screenshot({ path: shots + '/AK_4_limit.png' });
    await p.keyboard.press('Escape'); ok(await p.$eval('#ask_panel', e => e.hidden), 'Esc closes it');
    // a phone's width
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await m.addCookies([{ name: 'rcl_hr', value: admin, domain: 'localhost', path: '/' }]);
    const mp = await m.newPage(); mp.on('pageerror', x => errs.push(x.message)); await mp.goto(H + '/#page=employees'); await mp.waitForSelector('#ask_open:not([hidden])', { timeout: 20000 });
    await mp.click('#ask_open'); await mp.waitForSelector('#ask_panel:not([hidden])'); await mp.waitForTimeout(400);
    const w = await mp.$eval('#ask_panel', e => e.getBoundingClientRect().width); ok(w <= 390, 'on a phone the panel is the screen\'s width (' + w + ')');
    await mp.screenshot({ path: shots + '/AK_5_phone.png' });
  } finally { await b.close(); srv.kill(); ai.close(); await db('DELETE', 'hr_sessions?site=eq.' + site, undefined, 'return=minimal').catch(() => {}); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
