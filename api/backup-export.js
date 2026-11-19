/* (with Mechanical's update-243, asked 14-11-2026 – "hr sathi google sheet jodleli nahiye"; "sheet madhe saglach data jayla
 * pahije"; "fkt rcl hr") HR's data for the backup – only for Mechanical's backup, asked with BACKUP_EXPORT_SECRET
 * (lib/bkexport.js – the Portal's, Engineering's and Purchase's file). HR is one database for EVERY site: its rows of every site
 * go into HR's own numbered Google Sheets ("HR – …" tabs; the Super Admin gives them in the Portal → Sites → HR backup), each row
 * with its site. "My HR" has no data of its own – it is the same database.
 *   EVERYTHING goes (his word): the employees and all their details – also the KYC and bank numbers and the pay – the attendance,
 *   leave, the Rule Book, work places, months, salary and payroll, the settings and the record of who did what.
 *   NOT given: the sign-ins (hr_sessions) and the used tickets (hr_tickets) – they are not data; the face numbers of a person
 *   (hr_faces.descriptors) go as "(hidden)". A photo, a selfie or a paper is a FILE in HR's private store: a Sheet holds its
 *   place (path) only, never the file.
 *   since: only for a list that is only ever added to (for the backup's Sheet 2 and after); every other table is given whole. */
'use strict';
const { handler, readBody, send, fail } = require('../lib/http');
const { allowed, make } = require('../lib/bkexport');
const TABLES = {
  // the people
  hr_employees: { title: 'Employees', key: 'id' },
  hr_employee_private: { title: 'Employees – KYC and family', key: 'employee_id' },
  hr_employee_profile: { title: 'Employees – profile, statutory, bank, pay details', key: 'employee_id' },
  hr_employee_rows: { title: 'Employees – education, experience, family rows', key: 'id' },
  hr_employee_docs: { title: 'Employees – papers (the place of each file)', key: 'id' },
  hr_employment: { title: 'Employment history', key: 'id' },
  hr_departments: { title: 'Departments', key: 'id' },
  hr_designations: { title: 'Designations', key: 'id' },
  hr_lists: { title: 'Lists', key: 'id' },
  hr_numbers: { title: 'Numbers', key: 'kind' },
  hr_people: { title: 'People of the HR office', key: 'site,email' },
  hr_ho_hr: { title: 'Head Office HR', key: 'email' },
  hr_admin_powers: { title: 'Powers of the HR Admin', key: 'site,power' },
  hr_settings: { title: 'Settings', key: 'site,key' },
  // attendance
  hr_projects: { title: 'Projects', key: 'id' },
  hr_places: { title: 'Work places', key: 'id' },
  hr_place_people: { title: 'Work places – for whom', key: 'place_id,employee_id' },
  hr_shifts: { title: 'Shifts', key: 'id' },
  hr_shift_people: { title: 'Shifts – for whom', key: 'shift_id,employee_id' },
  hr_holidays: { title: 'Holidays', key: 'id' },
  hr_weekoff_days: { title: 'Weekly off – days changed', key: 'id' },
  hr_att_rules: { title: 'Attendance rules', key: 'id' },
  hr_devices: { title: 'Phones', key: 'id' },
  hr_device_tries: { title: 'Phones – refused tries', key: 'id', since: 'at' },
  hr_punches: { title: 'Punches', key: 'id', since: 'received_at' },
  hr_punch_reviews: { title: 'Punches – reviews', key: 'id', since: 'at' },
  hr_day_entries: { title: 'Manual entries and corrections', key: 'id', since: 'entered_at' },
  hr_regularize: { title: 'Attendance requests', key: 'id' },
  hr_att_imports: { title: 'Attendance imports', key: 'id' },
  hr_att_import_rows: { title: 'Attendance imports – rows', key: 'import_id,entry_id' },
  hr_faces: { title: 'Faces (enrolment record)', key: 'id', hide: ['descriptors'] },
  hr_face_tries: { title: 'Faces – tries', key: 'id', since: 'at' },
  // leave and the Rule Book
  hr_leave_policy: { title: 'Leave policy (old)', key: 'id' },
  hr_leave_requests: { title: 'Leave requests', key: 'id' },
  hr_leave_files: { title: 'Leave papers (the place of each file)', key: 'id' },
  hr_leave_adjust: { title: 'Leave – adjustments', key: 'id', since: 'entered_at' },
  hr_leave_credits: { title: 'Leave – credits', key: 'id', since: 'entered_at' },
  hr_policies: { title: 'Rule Book – policies', key: 'id' },
  hr_policy_versions: { title: 'Rule Book – versions', key: 'id' },
  hr_policy_defaults: { title: 'Rule Book – site defaults', key: 'id' },
  hr_policy_assign: { title: 'Rule Book – given to people', key: 'id' },
  hr_asks: { title: 'Requests for approval', key: 'id' },
  // the month, salary and payroll
  hr_months: { title: 'Months', key: 'id' },
  hr_month_people: { title: 'Months – people', key: 'id' },
  hr_salaries: { title: 'Salaries', key: 'id' },
  hr_pay_settings: { title: 'Pay settings', key: 'id' },
  hr_pay_emp: { title: 'Pay – per employee', key: 'employee_id' },
  hr_pay_adjust: { title: 'Pay – adjustments of a month', key: 'site,month,employee_id' },
  hr_advances: { title: 'Advances', key: 'id' },
  hr_pay_runs: { title: 'Pay runs (locked months)', key: 'id' },
  hr_payslips: { title: 'Pay slips', key: 'id' },
  // (18-11-2026, step 14 – "sheet madhe saglach data jayla pahije": the new tables go too)
  hr_bank_changes: { title: 'Bank changes – asked and approved', key: 'id' },
  hr_face_consents: { title: 'Faces – consent given', key: 'id', since: 'given_at' },
  hr_selfie_holds: { title: 'Punch photos – holds', key: 'id' },
  hr_job_runs: { title: 'Timed jobs – runs', key: 'id', since: 'started_at' },
  // (18-11-2026, step 15 – the Employee Master, papers, onboarding, policies) the fingerprints of the links' codes are not copied
  hr_doc_events: { title: 'Papers – what happened', key: 'id', since: 'at' },
  hr_doc_na: { title: 'Papers – not applicable', key: 'employee_id,kind' },
  hr_reporting: { title: 'Reporting managers', key: 'id' },
  hr_insurance: { title: 'Medical insurance', key: 'employee_id' },
  hr_invites: { title: 'Onboarding links', key: 'id', hide: ['token_hash'] },
  hr_email_checks: { title: 'E-mail checks', key: 'id', hide: ['token_hash'] },
  hr_cpolicies: { title: 'Company policies', key: 'id' },
  hr_cpolicy_versions: { title: 'Company policies – versions', key: 'id' },
  hr_cpolicy_accepts: { title: 'Company policies – accepted', key: 'id', since: 'accepted_at' },
  // (18-11-2026, step 16) the seven-day rule: who was let in before his papers were there
  hr_doc_overrides: { title: 'Seven-day rule – let in', key: 'id' },
  // (18-11-2026, step 17) the messages and WhatsApp's word of them (the addresses are the employees' own – kept as in the Employee Master)
  hr_notify_queue: { title: 'Messages', key: 'id' },      // (its state moves on – given whole)
  hr_notify_events: { title: 'Messages – WhatsApp delivery', key: 'id', since: 'at' },
  // (18-11-2026, step 18) payroll phase 5: structures, the CA's checks, where a payslip stands, its payments, the full & final
  hr_pay_structures: { title: 'Salary structures', key: 'id' },
  hr_pay_structure_versions: { title: 'Salary structures – versions', key: 'id' },
  hr_pay_checks: { title: 'Pay settings – checked', key: 'id', since: 'checked_at' },
  hr_pay_release: { title: 'Payslips – where they stand', key: 'id', since: 'at' },
  hr_pay_payments: { title: 'Payslips – payments', key: 'id', since: 'at' },
  hr_fnf: { title: 'Full & final settlements', key: 'id' },      // (its state moves on – given whole)
  // (18-11-2026, step 19) the AI calls – who, what for, cost (never the question, the paper or the answer)
  hr_ai_runs: { title: 'AI calls', key: 'id', since: 'at' },
  // who did what
  hr_audit: { title: 'Activity', key: 'id', since: 'at' },
};
const run = make(TABLES, {});      // (every site – HR's own Sheet, like Purchase's)
module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });
  allowed(req);
  const c = { url: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), key: String(process.env.SUPABASE_SECRET_KEY || '') };
  if (!c.url || !c.key) throw fail(500, 'The HR server is not set up: SUPABASE_URL and SUPABASE_SECRET_KEY are missing in Vercel.');
  const x = await readBody(req);
  if (x && x.action === 'usage') throw fail(400, 'Not given here (HR\'s database size is not in the Storage panel yet).');
  send(res, 200, await run(c, x));
});
module.exports.TABLES = TABLES;
