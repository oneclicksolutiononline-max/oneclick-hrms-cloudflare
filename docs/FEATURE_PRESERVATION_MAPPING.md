# ONECLICK HRMS — FEATURE PRESERVATION MAPPING

This document maps every existing HRMS feature from the legacy single-enterprise architecture (`rcl-hr`) to the multi-tenant **ONECLICK HRMS SaaS Architecture**, ensuring zero feature loss during transformation.

---

## Complete Module Mapping Matrix

| Original Module | Original Source Files | Original Implementation | Target SaaS Layer | Target Multi-Tenant Schema | Status in Cloudflare Release |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **SSO & Ticket Auth** | `api/sso.js`, `lib/portal.js`, `sql/hr_step1_base.sql` | JWKS ES256 ticket validation, `hr_tickets`, `hr_sessions` | Layer A & B Shared Auth | `sessions`, `users`, `roles` | **Active on D1** (direct login + token auth) |
| **Session Fingerprinting** | `lib/session.js`, `api/me.js` | SHA-256 token hash, 15-min cookie | Shared Auth Middleware | `sessions` (24h validity, Bearer + Cookie) | **Active on D1** |
| **Multi-Site Tenancy** | `lib/act_attend.js`, `public/allsites.js` | `site` column on every row | Layer B: Client Org | `organizations` (Tenant) + `sites` (Branch) | **Active on D1** |
| **Employee Master** | `lib/act_masters.js`, `public/hr.js`, `sql/hr_step2` | `hr_employees`, `hr_departments`, `hr_designations`, `hr_next_no()` | Layer B: People | `employees`, `departments`, `designations` | **Active on D1** |
| **Employee Onboarding** | `api/onboard.js`, `lib/act_onboard.js`, `public/onboard.js` | Single-use joining link, expiring token | Layer B: People | `onboarding_invites`, `employees` | **Migrated to Cloudflare API** |
| **Documents & KYC** | `lib/act_docs.js`, `lib/store.js`, `sql/hr_step3` | Verhoeff Aadhaar, PAN, Supabase `hr-docs` | Layer B & C: Docs | `employee_documents` + Cloudflare R2 | **Active on R2 & D1** |
| **7-Day Document Rule** | `lib/act_docrule.js`, `lib/docrule.js` | Block punch if KYC pending > 7 days | Layer B: Policy Config | Configurable tenant rule flag in `saas_feature_flags` | **Preserved in Domain Logic** |
| **Work Places / Geofence** | `lib/geo.js`, `lib/attend.js`, `sql/hr_step4` | Radial (20-5000m), Polygon (Ray-cast), Polyline | Layer B: Attendance | `work_places` (`latitude`, `longitude`, `radius_meters`, `polygon_json`) | **Active on D1 & Worker** |
| **Device Binding** | `lib/act_attend.js`, `lib/integrity.js` | 1 phone per person, `hr_devices`, Play Integrity | Layer C: Mobile App | `device_bindings` + Play Integrity / App Attest | **Preserved in Domain Logic** |
| **Attendance Punch** | `lib/act_attend.js`, `public/att.js`, `sql/hr_step4` | GPS + front selfie, offline counter | Layer C: Self-Service | `attendance_punches` (D1) + R2 selfies | **Active on D1 & R2** |
| **Selfie 24h Rotation** | `lib/retention.js`, `sql/hr_step14` | 90-day retention in legacy | Layer B & C Storage | R2 `attendance/<emp>/latest.jpg` + 24h cleanup | **Active on Cloudflare R2** |
| **Face Match (Biometrics)** | `lib/face.js`, `api/face.js`, `sql/hr_step9` | Node.js TFJS/WASM 128D embedding | Layer C: Mobile App | Flutter On-Device ML (TFLite / Google ML Kit) | **Refactored for Mobile** |
| **Shifts & Auto-Out** | `lib/act_muster.js`, `sql/hr_step5`, `step8` | Overnight shifts, forgotten auto-out | Layer B: Attendance | `shifts`, `shift_assignments` | **Preserved in Domain Logic** |
| **Daily Muster Ledger** | `lib/act_muster.js`, `public/mus.js` | Present, Half-day, Absent, Week-off codes | Layer B: Attendance | `muster_records`, `attendance_punches` | **Active on D1** |
| **Attendance Corrections** | `lib/act_muster.js`, `lib/act_asks.js` | Regularization workflow with audit trail | Layer B & C: Approvals | `attendance_corrections` | **Preserved in Domain Logic** |
| **Leave Policy & Balances** | `lib/act_leave.js`, `lib/leave.js`, `sql/hr_step7` | Paid Leave, Comp-off, accrual math | Layer B & C: Leave | `leave_policies`, `leave_balances`, `leave_requests` | **Active on D1** |
| **Leave Approvals (Asks)** | `lib/act_asks.js`, `sql/hr_step13_rulebook` | 2-stage approval workflow (`hr_asks`) | Layer B & C: Approvals | `approval_requests`, `leave_requests` | **Active on D1** |
| **Statutory Payroll** | `lib/pay.js`, `lib/act_payroll.js`, `sql/hr_step12` | PF (12%), ESIC (0.75%), PT, LWF, TDS | Layer B: Payroll | `payroll_structures`, `payroll_runs`, `payslips` | **Preserved in Domain Logic** |
| **Advances & Deductions** | `lib/act_payroll.js`, `sql/hr_step12` | Advance loan recovery EMI | Layer B: Payroll | `salary_advances` | **Preserved in Domain Logic** |
| **Payroll Lock & Release** | `lib/act_payx.js`, `sql/hr_step18` | Draft → Lock (`hr_pay_lock`) → Release → Paid | Layer B: Payroll | `payroll_runs` (`status='LOCKED'`) via D1 batch | **Preserved in Domain Logic** |
| **Full & Final Settlement** | `lib/act_payx.js`, `sql/hr_step18_payroll` | Gratuity, leave encashment, clearance | Layer B: Payroll | `fnf_settlements` | **Preserved in Domain Logic** |
| **25 Reports & Exports** | `lib/act_reports.js`, `lib/act_sheet.js` | Role-masked CSV/Excel report generators | Layer B: Reports | `reports_engine` | **Preserved in Domain Logic** |
| **WhatsApp Notifications** | `lib/whatsapp.js`, `api/wa-hook.js`, `sql/hr_step17` | Meta Cloud API templates & delivery hooks | Shared Worker Hook | `notification_queue`, `api/wa-hook` | **Migrated to Cloudflare Worker** |
| **Email Integration** | `lib/mail.js` | Resend API client | Shared Worker Service | Direct Resend / Cloudflare Email Routing | **Preserved in Domain Logic** |
| **AI Assistant Gateway** | `lib/ai.js`, `lib/act_ai.js`, `sql/hr_step19` | Anthropic / OpenAI unified client + budget caps | Layer B & C: AI Assist | `ai_runs_log` + Cloudflare Workers AI / OpenAI | **Preserved in Domain Logic** |
| **Immutable Audit Logs** | `lib/audit.js`, `sql/hr_step1` | Immutable operation ledger (`hr_audit`) | Layer A & B: Security | `audit_logs` (Tenant-scoped) | **Active on D1** |
