// RIG ONLY – step 19 (18-11-2026, Phase 7) in a browser against a local HR server on :3068, the local test database and a STAND-IN
// AI provider on this computer (never a real provider, never live): the AI assistant page – a policy question, the checks.
//   timeout 240 node test/rig/ai_page.js        Made-up people only.
process.env.SUPABASE_URL = 'http://127.0.0.1:3140'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_rigkey'; process.env.PORTAL_URL = 'http://127.0.0.1:9/portal'; delete process.env.VERCEL_ENV;
const { chromium } = require('playwright'), crypto = require('crypto'), os = require('os'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const { db } = require('../../lib/db'), { ACT } = require('../../api/hr');
(async () => { let n = 0, bad = 0; const ok = (c, t) => { n++; if (!c) { bad++; console.log('FAIL', t); } else console.log('ok  ', t); };
  const tag = 'AP' + Date.now().toString(36).toUpperCase().slice(-5), site = tag, sites = [{ code: site, name: 'Rig AI ' + tag, role: 'super' }], shots = process.env.SHOTS || os.tmpdir();
  const SU = { site: site, email: 'super.' + tag.toLowerCase() + '@rig.test', name: 'Rig super', role: 'super', info: { sites: sites } };
  const p0 = await ACT.cpSave(SU, { title: 'Leave policy ' + tag, scope: { sites: [site] } }), v = await ACT.cpVersionSave(SU, { policy: p0.id, body: 'Every person gets 12 days of paid leave a year.', effective_from: '2026-01-01' }); await ACT.cpPublish(SU, { version: v.id });
  const ai = http.createServer((q, r) => { q.resume(); q.on('end', () => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ content: [{ type: 'text', text: 'The Leave policy says: 12 days of paid leave a year.' }], usage: { input_tokens: 400, output_tokens: 30 } })); }); });
  await new Promise(okk => ai.listen(0, '127.0.0.1', okk));
  const srv = spawn(process.execPath, ['dev.js'], { cwd: path.join(__dirname, '..', '..'), env: Object.assign({}, process.env, { PORT: '3068', HR_AI_ENABLED: 'true', HR_AI_PROVIDER: 'anthropic', HR_AI_MODEL: 'rig-model', ANTHROPIC_API_KEY: 'rig-key', HR_AI_PRICE: '{"in":3,"out":15}', HR_AI_API_BASE: 'http://127.0.0.1:' + ai.address().port }), stdio: 'ignore' });
  const t = crypto.randomBytes(32).toString('base64url');
  await db('POST', 'hr_sessions', [{ id_hash: crypto.createHash('sha256').update(t).digest('hex'), site: site, email: SU.email, name: 'Rig super', role: 'super', expires_at: new Date(Date.now() + 900000).toISOString(), info: { sites: sites, siteName: 'Rig AI ' + tag, mods: [] } }], 'return=minimal');
  const b = await chromium.launch(), errs = [];
  try {
    await new Promise(r => setTimeout(r, 1200));
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } }); await ctx.addCookies([{ name: 'rcl_hr', value: t, domain: 'localhost', path: '/' }]); const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    await p.goto('http://localhost:3068/#page=ai'); await p.waitForSelector('text=AI is ON', { timeout: 20000 }); ok(true, 'AI is shown ON with its provider');
    await p.fill('#p_ai textarea', 'How many paid leaves a year?'); await p.click('#p_ai button:has-text("Ask")'); await p.waitForSelector('#p_ai p:has-text("12 days of paid leave")', { timeout: 15000 }); ok(true, 'a policy question answered');
    ok((await p.locator('#p_ai h3', { hasText: 'Checks to look at' }).count()) === 1, 'the checks');
    await p.screenshot({ path: shots + '/S19_ai.png', fullPage: true });
  } finally { await b.close(); srv.kill(); ai.close(); }
  console.log((n - bad) + ' passed, ' + bad + ' failed; page errors:', errs.length ? errs : 'none'); process.exit(bad || errs.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
