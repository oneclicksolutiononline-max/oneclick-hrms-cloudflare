/* POST /api/onboard – THE PAGE OF AN ONBOARDING LINK (and of an e-mail check link), WITHOUT A SIGN-IN (18-11-2026, Phase 2 – step 15).
 * The key is the link's own code (from the address's # part, sent in the body – never in an address, never in a log): it opens
 * exactly ONE new joiner's form and nothing else of HR. What it may do is lib/act_onboard.js (PUB): open, save, papers, the e-mail
 * code, the policies, submit; verify (an employee's e-mail check). A wrong or old code gets the same short answer. */
'use strict';
const { handler, readBody, send, sameSite, fail } = require('../lib/http');
const HR = require('./hr');
const ACTIONS = ['open', 'save', 'uploadUrl', 'docAdd', 'docDrop', 'docNa', 'emailCode', 'emailVerify', 'accept', 'submit', 'verify'];
module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });
  sameSite(req);
  const x = await readBody(req), a = String(x.action || '');
  if (ACTIONS.indexOf(a) < 0) throw fail(400, 'Unknown action.');
  await require('../lib/step15').need();
  send(res, 200, Object.assign({ ok: true }, await HR.ONB.PUB[a](x, req)));
});
