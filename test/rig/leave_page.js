// RIG ONLY – (19-11-2026, asked: "leave policy ekach thikani rule book madhech thew n leave madhe ajun ka diley ani ha bulk madhe delet
// leave ch apn option de ani select krun pn delet kra yawet" and, before it, the Leave screen: who a request waits for, its history,
// change / delete by the Site HR Admin, HO HR, Super Admin) THE HR OFFICE'S LEAVE PAGE in a browser against a local HR server on :3081
// and the local test database (never live). Made-up people only.
//   timeout 300 node test/rig/leave_page.js
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr'), R = require('../../lib/rules'), D = require('../../lib/day');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'LP' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig leave page ' + tag, role: 'admin' }], shots = process.env.SHOTS || os.tmpdir(), today = R.today(), day = k => D.addDays(today, k);
  const A = { site: site, email: 'admin.' + tag.toLowerCase() + '@rig.test', name: 'Rig Admin', role: 'admin', info: { sites: sites } };
  let k = 0; const mob = () => '9' + String(Date.now()).slice(-6) + String(100 + (k++)).slice(-3);
  const boss = await ACT.empSave(A, { name: 'Page Boss', category: 'staff', mobile: mob(), email: 'boss.' + tag.toLowerCase() + '@rig.test', dob: '1980-01-01', joined_on: '2026-01-01' });
  const w = await ACT.empSave(A, { name: 'Page Worker', category: 'staff', mobile: mob(), email: 'work.' + tag.toLowerCase() + '@rig.test', dob: '1990-01-01', joined_on: '2026-01-01', reports_to: boss.id });
  const o = await ACT.empSave(A, { name: 'Page Other', category: 'labour', mobile: mob(), email: 'other.' + tag.toLowerCase() + '@rig.test', dob: '1991-01-01', joined_on: '2026-01-01' });
  await ACT.leavePolicySave(Object.assign({}, A, { role: 'super' }), { per_month: 4, valid_from: today.slice(0, 8) + '01', levels: 2 });
  for (const e of [w, o]) await ACT.leaveAdjust(Object.assign({}, A, { role: 'super' }), { id: e.id, days: 20, reason: 'opening balance' });
  const mk = async (e, a, b, why, level, status) => (await db('POST', 'hr_leave_requests', [{ employee_id: e.id, site: site, from_day: day(a), to_day: day(b), part: 'full', days: b - a + 1, reason: why, level: level, status: status || 'pending', asked_by: e.email || 'rig@rig.test' }], 'return=representation'))[0];
  const q1 = await mk(w, 10, 12, 'Family function ' + tag, 1), q2 = await mk(o, 14, 15, 'Native place ' + tag, 2), q3 = await mk(o, 20, 20, 'Bank work ' + tag, 2), q4 = await mk(o, 24, 24, 'Market ' + tag, 2), q5 = await mk(w, 30, 31, 'Village fair ' + tag, 2, 'approved');
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3081' }), stdio: 'ignore' });
  const sess = async (role, email, name) => { const t = crypto.randomBytes(32).toString('base64url'); await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: email, name: name, role: role, expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: [{ code: site, name: 'Rig leave page ' + tag, role: role }], siteName: 'Rig leave page ' + tag, mods: [] } }], 'return=minimal'); return t; };
  const tA = await sess('admin', A.email, 'Rig Admin'), tU = await sess('user', 'user.' + tag.toLowerCase() + '@rig.test', 'Rig User');
  const b = await chromium.launch(), errs = [], st = async id => ((await db('GET', 'hr_leave_requests?select=status,from_day,to_day,days,steps&id=eq.' + id)) || [])[0];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const open = async t => { const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message)); p.on('dialog', d => d.accept()); await p.goto('http://localhost:3081/#page=leave'); await p.waitForSelector('#p_leave tbody tr', { timeout: 20000 }); await p.waitForTimeout(400); return p; };
    const p = await open(tA), row = id => p.locator('#p_leave tbody tr[data-id="' + id + '"]');
    // 1. ONE PLACE FOR THE POLICY: no "Policy" here
    const tabs = await p.locator('#p_leave > .tools button').allInnerTexts(); ok(tabs.join('|') === 'Requests|Balances', 'the Leave page: Requests and Balances only – the policy is the Rule Book\'s: ' + tabs.join(', '));
    // 2. WHO IT WAITS FOR
    ok((await row(q1.id).locator('.lv-stand').innerText()) === 'Waits for verify: Page Boss (Reporting person)', 'it says who it waits for: ' + await row(q1.id).locator('.lv-stand').innerText());
    ok((await row(q2.id).locator('.lv-stand').innerText()) === 'Waits for approval: HR office', 'and for the HR office');
    await p.screenshot({ path: shots + '/LP_1_list.png' });
    // 3. HISTORY
    await row(q1.id).locator('.lv-hb').click(); await p.waitForSelector('.lv-hist li'); ok(/^Asked/.test(await p.locator('.lv-hist li').first().innerText()), 'its history opens under it: ' + (await p.locator('.lv-hist li').first().innerText()).split('\n')[0]);
    // 4. CHANGE (the HR office): the reason is asked; saved – in its history
    await row(q2.id).locator('.lv-eb').click(); await p.waitForSelector('.lv-under .lv-to'); await p.fill('.lv-under .lv-to', day(16)); await p.click('.lv-under .lv-save'); await p.waitForTimeout(700);
    ok(/Reason/.test(await p.locator('.lv-under .warn').innerText()) && (await st(q2.id)).to_day === day(15), 'no reason – nothing changed');
    await p.fill('.lv-under .lv-why', 'Stays a day more – told by phone'); await p.screenshot({ path: shots + '/LP_2_change.png' }); await p.click('.lv-under .lv-save'); await p.waitForFunction(() => !document.querySelector('.lv-under'), null, { timeout: 15000 }).catch(async e => { console.log('warn:', await p.locator('.lv-under .warn').innerText().catch(() => '-'), await p.locator('#toast').innerText().catch(() => '-')); throw e; });
    const c2 = await st(q2.id); ok(c2.to_day === day(16) && +c2.days === 3 && c2.steps.slice(-1)[0].kind === 'edited', 'changed: 3 days, in its history');
    // 5. DELETE one, with the reason
    await row(q3.id).locator('.lv-db').click(); await p.waitForSelector('.lv-under .lv-del'); await p.fill('.lv-under .lv-why', 'Asked twice'); await p.click('.lv-under .lv-del'); await p.waitForFunction(id => !document.querySelector('#p_leave tbody tr[data-id="' + id + '"]'), q3.id, { timeout: 15000 });
    ok((await st(q3.id)).status === 'cancelled', 'deleted – gone from Waiting');
    // 6. TICKS: two ticked, one reason, deleted at once
    await row(q1.id).locator('.lv-tick').check(); await row(q4.id).locator('.lv-tick').check(); await p.waitForSelector('.lv-bulk .lv-bdel');
    ok((await p.locator('.lv-bulk .lv-n').innerText()) === '2 selected' && (await p.locator('.lv-bulk .lv-bdel').innerText()) === 'Delete 2 leaves', 'the bar: 2 selected – "Delete 2 leaves"');
    await p.fill('.lv-bulk .lv-bwhy', 'The work at the site goes on'); await p.screenshot({ path: shots + '/LP_3_ticks.png' });
    await p.click('.lv-bulk .lv-bdel'); ok((await p.locator('.lv-bulk .lv-bdel').innerText()) === 'Yes – delete 2 leaves' && await p.locator('.lv-sure').isVisible() && (await st(q1.id)).status === 'pending', 'the first press only asks: "Yes – delete 2 leaves"');
    await p.click('.lv-bulk .lv-bdel'); await p.waitForFunction(ids => ids.every(id => !document.querySelector('#p_leave tbody tr[data-id="' + id + '"]')), [q1.id, q4.id], { timeout: 15000 });
    ok((await st(q1.id)).status === 'cancelled' && (await st(q4.id)).status === 'cancelled' && (await st(q1.id)).steps.slice(-1)[0].note === 'The work at the site goes on', 'both deleted, each with the reason');
    // 7. "Select all" on Approved; "Deleted" lists them; "All"
    await p.click('#p_leave .tools button[data-st="approved"]'); await p.waitForSelector('.lv-all'); await p.click('.lv-all'); await p.waitForSelector('.lv-bulk .lv-bdel');
    ok((await p.locator('.lv-tick:checked').count()) === (await p.locator('.lv-tick').count()) && (await p.locator('.lv-tick').count()) >= 1, '"Select all" ticks every one of the list');
    await p.click('.lv-all'); ok((await p.locator('.lv-tick:checked').count()) === 0, '…and clears them');
    await p.click('#p_leave .tools button[data-st="cancelled"]'); await p.waitForSelector('#p_leave tbody tr[data-id="' + q1.id + '"]');
    ok(/^Deleted by Rig Admin: The work at the site goes on/.test(await row(q1.id).locator('.lv-stand').innerText()), 'in "Deleted": who and why');
    await p.click('#p_leave .tools button[data-st="all"]'); await p.waitForSelector('#p_leave tbody tr[data-id="' + q5.id + '"]'); ok((await p.locator('#p_leave tbody tr[data-id]').count()) === 5, '"All": every request of the site');
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no sideways scroll');
    // 7b. BALANCES: ticks – the whole balance of the ticked people taken off at once ("jo balance aahe to chukun aalela aahe")
    await p.click('#p_leave > .tools button:has-text("Balances")'); await p.waitForSelector('#p_leave tbody tr[data-id="' + w.id + '"] .lv-tick', { timeout: 15000 });
    const brow = id => p.locator('#p_leave tbody tr[data-id="' + id + '"]'), bal0 = await brow(boss.id).locator('.lv-bal').innerText();
    await brow(w.id).locator('.lv-tick').check(); await brow(o.id).locator('.lv-tick').check();
    ok((await p.locator('.lv-bulk .lv-bdel').innerText()) === 'Make the balance 0 (2)', 'Balances: two ticked – "Make the balance 0 (2)"');
    await p.fill('.lv-bulk .lv-bwhy', 'The balance came by mistake'); await p.click('.lv-bulk .lv-bdel'); ok((await p.locator('.lv-bulk .lv-bdel').innerText()) === 'Yes – make 2 balances 0', 'the first press only asks');
    await p.screenshot({ path: shots + '/LP_5_balances.png' });
    await p.click('.lv-bulk .lv-bdel'); await p.waitForFunction(id => { const r = document.querySelector('#p_leave tbody tr[data-id="' + id + '"] .lv-bal'); return r && r.textContent === '0'; }, w.id, { timeout: 20000 });
    ok((await brow(o.id).locator('.lv-bal').innerText()) === '0' && (await brow(boss.id).locator('.lv-bal').innerText()) === bal0 && (await brow(w.id).locator('.lv-tick').count()) === 0, 'both read 0 (no tick now – nothing left); the one not ticked is as he was (' + bal0 + ')');
    await p.screenshot({ path: shots + '/LP_6_zero.png' });
    // 8. AN HR USER sees – no tick, no Change, no Delete
    const u = await open(tU); ok((await u.locator('.lv-tick').count()) === 0 && (await u.locator('.lv-eb, .lv-db').count()) === 0 && (await u.locator('.lv-hb').count()) >= 1, 'an HR User: the list and the history – no change, no delete');
    // 9. THE RULE BOOK – Leave: the policy of before is shown there
    await p.goto('http://localhost:3081/#page=rulebook'); await p.waitForSelector('.rb-k', { timeout: 20000 }); await p.locator('.rb-k', { hasText: 'Leave' }).first().click(); await p.waitForTimeout(500);
    const old = await p.locator('.rb-old').innerText().catch(() => ''); ok(/The site's rules of before – they count now/.test(old) && /4 leaves every month/.test(old) && /the reporting person, then the HR office/.test(old), 'the Rule Book\'s Leave shows the policy of before: ' + old.replace(/\s+/g, ' ').slice(0, 140));
    await p.screenshot({ path: shots + '/LP_4_rulebook.png' });
  } finally { await b.close(); srv.kill(); await db('DELETE', 'hr_sessions?site=eq.' + site, undefined, 'return=minimal').catch(() => {}); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
