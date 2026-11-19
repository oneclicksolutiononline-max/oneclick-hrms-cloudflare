/* (with Mechanical's update-263 – the Smart Log Book plan approved 15/16-11-2026: "HR मधील Driver / Operator employees link / import;
 * duplicate नाहीत") THE DRIVERS AND OPERATORS OF ONE SITE, for Mechanical's Driver Master ("Bring from HR"). It answers ONLY
 * Mechanical's server, asked with BACKUP_EXPORT_SECRET (lib/bkexport.js allowed – the same secret as the backup: no new setting).
 * It only READS – nothing is written in HR, nothing of HR is changed. It gives ONLY, of each employee of the site whose category is
 * Driver or Operator: his id and code, name, mobile, category, status (active / pending / incomplete / left) and the day he left.
 * Nothing else of a person leaves this way (no birth date, e-mail, KYC, bank or pay).
 *   POST { site: 'S1' }  →  { site, employees: [{ id, code, name, mobile, category, status, left }] }   (by name; at most 2000) */
'use strict';
const { handler, readBody, send, fail } = require('../lib/http');
const { allowed } = require('../lib/bkexport');
const { db } = require('../lib/db');
const COLS = 'id,code,name,mobile,category,status,left_on';
module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });
  allowed(req);
  const x = await readBody(req), site = String((x && x.site) || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(site)) throw fail(400, 'Which site?', 'shape');
  const rows = await db('GET', 'hr_employees?site=eq.' + encodeURIComponent(site) + '&category=in.(driver,operator)&select=' + COLS + '&order=name.asc&limit=2000') || [];
  return send(res, 200, { site, employees: rows.map(r => ({ id: String(r.id), code: String(r.code || ''), name: String(r.name || ''), mobile: String(r.mobile || ''),
    category: r.category === 'operator' ? 'Operator' : 'Driver', status: String(r.status || ''), left: r.left_on ? String(r.left_on).slice(0, 10) : '' })) });
});
module.exports.COLS = COLS;
