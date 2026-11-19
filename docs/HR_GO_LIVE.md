# RCL ERP – HR enterprise build: going live (Phases 2–8, 18-11-2026)

Everything new is **OFF or inert until he switches it on**; the HR of today keeps working between every step. Each PR works
before its SQL step is run (the new parts say "run step N").

## 1. The pull requests and their order

| # | Repository | Pull request | What | SQL |
|---|---|---|---|---|
| 1 | rcl-hr | #61 | Phase 2 – Employee Master, papers & verification, reporting managers, insurance, company policies, onboarding link, activation | step 15 |
| 2 | rcl-hr | #62 | Phase 3 – seven-day document rule (Staff, off by default), My work locations, take back a request, Play Integrity (off) | step 16 |
| 3 | rcl-hr | #63 | Phase 4 – one message queue: WhatsApp templates (his kinds), e-mail, the app's list; shift reminders (off) | step 17 (+17b optional) |
| 4 | rcl-hr | #64 | Phase 5 – payroll: structures, statutory settings + CA check, release & payment, full & final, registers, compare | step 18 |
| 5 | rcl-hr | #65 | Phase 6 – 25 reports (per role), Excel / PDF; My team | – |
| 6 | rcl-hr | #66 | Phase 7 – AI door (off), log + cost; read a paper, ask the policies, checks | step 19 |
| 7 | rcl-hr | #67 | Phase 8 – readiness: security sweep, speed, recovery drill, this guide | – |
| A | rcl-mobile | #180 → #181 → #182 → #183 → #184 → #185 | the app 3.134.0 → 3.135.0 … 3.139.0 (each phase's employee screens; the CI fixes are in #180) | – |

Merge them **in this order** (each PR contains the ones before it). The app PRs are merged after #180, in version order.

## 2. The SQL steps (Supabase → project **rcl-hr** → SQL Editor → paste the whole file → Run)

| Step | File | Expected last line |
|---|---|---|
| 15 | `sql/hr_step15_employee.sql` | `HR step 15 done · new tables 9 of 9 · paper columns 6 of 6 · place columns …` |
| 16 | `sql/hr_step16_attendance.sql` | `HR step 16 done · new tables 1 of 1` |
| 17 | `sql/hr_step17_notify.sql` | `HR step 17 done · new tables 2 of 2` |
| 17b (optional – the 5-minute timer) | `sql/hr_step17b_timer.sql` | `HR step 17b done · timer 1 of 1` – first the two Vault secrets `hr_cron_secret` (= CRON_SECRET) and `hr_jobs_url` (= HR address + /api/jobs) |
| 18 | `sql/hr_step18_payroll.sql` | `HR step 18 done · new tables 6 of 6 · pay columns 3 of 3` |
| 19 | `sql/hr_step19_ai.sql` | `HR step 19 done · new tables 1 of 1` |

Every step only adds (tables, columns with defaults, grants); none deletes or changes a row of today. Each file's head has its
rollback (only while nothing new is entered).

## 3. Vercel settings of the HR project (Settings → Environment Variables) – all optional, each switches one thing ON

| Setting | Switches on | Needs |
|---|---|---|
| `HR_NOTIFY_ENABLED=true` | messages leave the queue (e-mail; WhatsApp when also below) | `RESEND_API_KEY`, `MAIL_FROM` (already) |
| `HR_WHATSAPP_ENABLED=true`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_API_VERSION`, `HR_WA_TEMPLATES` | WhatsApp for: shift reminder, joining link, papers pending, paper running out, policy to accept, reporting change | Meta approves each template; `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` for the delivery webhook (`/api/wa-hook`) |
| `HR_INTEGRITY=record` (later `review`) | Google Play Integrity with each punch (never refuses a punch) | `PLAY_CLOUD_PROJECT`, `PLAY_INTEGRITY_SA`, `PLAY_CERT_SHA256` |
| `HR_AI_ENABLED=true`, `HR_AI_PROVIDER`, `HR_AI_MODEL`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, `HR_AI_PRICE`, (`HR_AI_MONTHLY_USD`) | the AI assistant | a provider account |

Template parameters, in order ({{1}}, {{2}} …): shift_reminder – name, shift, start · onboarding_link – name, link, until ·
doc_pending – name, papers, due · doc_expiry – name, paper, date · policy_accept – name, policy · reporting_change – name, manager, from.
`HR_WA_TEMPLATES` example: `{"shift_reminder":{"name":"hr_shift_reminder","lang":"en"}}`.

Settings switched on inside HR (no Vercel): the seven-day rule (Super Admin – Rule Book page), the shift reminders of a site
(Notifications page), salary structures and statutory numbers (Payroll – HO HR).

## 4. Who sees what (role matrix)

| | Employee (My HR / app) | Reporting manager | HR User | HR Admin | HO HR | Super Admin |
|---|---|---|---|---|---|---|
| Own attendance, leave, slips, papers, policies, notices, work locations | ✓ | ✓ | – | – | – | – |
| My team (read only) | – | ✓ | – | – | – | – |
| Employees, attendance, leave, papers (site) | – | – | ✓ | ✓ | ✓ | ✓ |
| Verify papers, activate, reporting, manual entries, phones | – | – | – | ✓ | ✓ | ✓ |
| Reports | – | – | 20 | 22 | 25 | 25 |
| Payroll (structures, release, F&F, registers, compare) | – | – | – | – | ✓ | ✓ |
| Approve a structure / check / approve F&F | – | – | – | – | another person than the maker | ✓ (may approve his own) |
| AI: ask, checks | – | – | ✓ | ✓ | ✓ | ✓ |
| AI: read a paper, AI log | – | – | – | ✓ | ✓ | ✓ |
| Seven-day rule on / off | – | – | – | – | – | ✓ |

AI never approves or changes pay, bank details, faces or attendance.

## 5. What each phase added (feature matrix)

* **Phase 2** – the Employee Master's sections, 18 on the joining date, papers submitted → verified / rejected (asked again) /
  not applicable, reporting managers with dates (no circle), work places by name with dates and IN / OUT, medical insurance,
  company policies with versions and acceptance, a joining link (only its fingerprint kept), activation.
* **Phase 3** – the seven-day document rule (Staff; off), My work locations (app), take back a waiting request, Play Integrity.
* **Phase 4** – the message queue (never twice, retried, logged), WhatsApp templates, e-mail, the app's Notifications.
* **Phase 5** – payroll as in section 1; the pay of a person without structure / LWF / TDS is exactly as before.
* **Phase 6** – 25 reports with filters, Excel / PDF; My team.
* **Phase 7** – the AI door, its log and cost, reading a paper, policy questions, checks.
* **Phase 8** – the security sweep, the speed measure, the recovery drill, this guide.

## 6. Backup and recovery

* The nightly Google Sheet backup stays as it is (his decision); every new table is in it (`api/backup-export.js`).
* **Drill on the rig** (done 18-11-2026): `timeout 300 bash tools/recovery_drill.sh` → "RESTORED: all 77 HR tables have the same rows".
* **Drill on live** (his step, once): Supabase → rcl-hr → Database → Backups → restore the newest into a NEW project (never over
  rcl-hr), open its Table Editor and compare a few tables' row counts with live, then delete the new project.
* **Going back** after a merge: Vercel → HR project → Deployments → the previous one → Instant Rollback. The SQL steps only added,
  so the older code keeps working with them.

## 7. Checks run here (18-11-2026, local rig – PostgreSQL + PostgREST with steps 1–19; made-up people)

| Check | Result |
|---|---|
| `node --test test/unit.test.js` | 61 pass |
| `node --test test/api.test.js` (rig) | 53 pass |
| `test/rig/security_sweep.js` | 215 actions: no sign-in → 401 for all; an employee → 403 for all 184 office actions; not from the page → 403 |
| `test/rig/perf.js` (300 people, a month) | muster ~0.25 s, dashboard ~0.1 s, reports ≤ 0.2 s, AI checks ~0.1 s |
| `tools/recovery_drill.sh` | 77 tables restored with the same rows |
| browser tests of steps 14–19 | all pass, no page errors |
| app (GitHub Actions): analyze, tests, screens, Android build | see each app PR |

## 8. Not verified here

The live database; real phones (punch, Play Integrity, iPhone); a real WhatsApp delivery (Meta's approval); a real AI provider
call; the CA's statutory numbers; two months of payroll beside the present method; live data volumes beyond the speed test.

## 9. Acceptance checklist (his signature)

| # | Check on live | Done | Date / sign |
|---|---|---|---|
| 1 | SQL 15–19 ran; each last line as in section 2 | ☐ | |
| 2 | An employee added with every section; a paper verified and one rejected ("asked again") | ☐ | |
| 3 | A joining link sent, filled on a phone, approved, the person activated | ☐ | |
| 4 | A company policy published and accepted in the app | ☐ | |
| 5 | The seven-day rule tried on one Staff person, then left as he decides | ☐ | |
| 6 | One real WhatsApp message delivered (after Meta's approval) | ☐ | |
| 7 | A shift reminder received and stopped after IN | ☐ | |
| 8 | Salary structure approved by another HO HR person; the pay sheet shows its parts | ☐ | |
| 9 | The CA checked the statutory numbers (Payroll → PF · ESIC · PT → Checked by the CA) | ☐ | |
| 10 | Two months: Payroll → Compare shows 0 differences with the present method | ☐ | |
| 11 | A month released → ready → paid with the bank reference | ☐ | |
| 12 | A full & final made, checked, approved and paid by different people | ☐ | |
| 13 | Each role opened Reports and saw only its own; an Excel and a PDF taken | ☐ | |
| 14 | A manager saw My team in the app | ☐ | |
| 15 | AI switched on (if wanted): a paper read, a question answered, the cost seen | ☐ | |
| 16 | The live recovery drill of section 6 done once | ☐ | |
| 17 | The app 3.139.0 installed on real Android phones; punch, slips, notices work | ☐ | |
