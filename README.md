# RCL ERP – HR module

HRMS & Attendance module of the RCL ERP (One Click Solution). The plan and the owner's decisions: the Project doc
`architecture/RCL_ERP_HRMS_Plan.md` and `CLAUDE.md`.

## What is here today (12-11-2026 – Phase 1a: HR's own sign-in)
* `sql/hr_step1_base.sql` – **run once by the owner in the rcl-hr Supabase**: `hr_people`, `hr_sessions`, `hr_tickets`,
  `hr_audit`. Only adds; row level security on, nothing for anon / authenticated; no employee data.
* `api/sso.js` – the Portal's ticket is checked (`lib/portal.js`: ES256 signature with `<PORTAL_URL>/api/jwks`, `iss`, `aud` =
  "hr", the time), **used once** (`hr_tickets`), and HR's own sign-in starts (`lib/session.js`: a cookie page scripts cannot
  read; the database keeps only its fingerprint; 15 minutes, renewed by the open page every 10). `api/me.js`, `api/logout.js`.
* `public/index.html` – signs in through the Portal (inside Mechanical's screen: a ticket asked from the Portal; by itself: the
  Portal's `#sso=`), then says who is signed in. The pages of HR come phase by phase.
* `api/menu.js` – the module's pages for Mechanical's dark menu (one page: Home).
* **The language of the web** (14-11-2026) – `public/i18n.js`, `public/i18n/mr.json`, `hi.json`, `lib/lang.js`: the page's code is English;
  the web shows English until the person chooses मराठी / हिंदी on top (next to the site). His own choice, kept with his sign-in (one
  row of `hr_settings`: site `*`, key `web_lang` – no SQL step); the phone app is not touched. Every text is turned as it appears;
  a text without a translation stays English. After new texts: `node tools/i18n/extract.js` (it prints how many have no
  translation yet), then add them to both files.
* `api/backup-export.js`, `lib/bkexport.js` – (14-11-2026) HR's data for the Google Sheet backup: only for Mechanical's backup, with
  `BACKUP_EXPORT_SECRET`. Every table of every site goes into HR's own Sheets (Portal → Sites → HR backup) – not the sign-ins,
  not the used tickets; the face numbers go as "(hidden)"; a photo or a paper is a file – the Sheet holds its place only.
  **A new table must be added to the list in `api/backup-export.js`** (the unit test fails until it is).
* `api/mech-drivers.js` – (16-11-2026, with Mechanical's update-263 – the Smart Log Book plan: "HR मधील Driver / Operator employees link /
  import") the Driver / Operator employees of ONE site for Mechanical's Driver Master ("Bring from HR"): only for Mechanical's server, with
  the same `BACKUP_EXPORT_SECRET`; it only READS and gives only id, code, name, mobile, category, status, left – nothing else of a person,
  nothing written in HR.
* Before the SQL step is run the page says so ("The HR database is not set up yet…") – nothing else happens.
* A Preview (a branch's test deployment) works only with a database marked as a test database (`lib/preview.js`) – never the live one.

## Phase 1 – the Employee Master (12-11-2026: "ata employee step continue kr")
* `sql/hr_step2_employees.sql` – **run once by the owner in the rcl-hr Supabase** (after step 1): `hr_departments`,
  `hr_designations`, `hr_employees`, `hr_employment` (the history), `hr_numbers` + `hr_next_no()` (the codes). Only adds.
* `api/hr.js` – one door for every action: the sign-in first, then the action's access, then the work; only the site of the
  sign-in; **nothing is deleted** (left / switched off); every change in `hr_audit` with the old and the new value.
  * `masterSave` (HR Admin) – departments, designations.
  * `empList`, `empGet`, `empPick`, `empSave` (HR User too) – code `RCL001, RCL002 …` by itself, or typed, and it can be changed (asked 12-11-2026 – never another employee's; the change is written down); categories Staff / Operator / Driver /
    Labour; a mobile number and an e-mail belong to ONE employee (they are what he will sign in with); under 18 is refused.
  * Status: **incomplete** (DOB, e-mail or mobile missing) → **pending** (complete – shown as "Complete" since 13-11-2026) → **active**
    (only by the activation step – not built yet) → **left**.
  * `empTransfer`, `empExit` (HR Admin) – a transfer only to a site of the sign-in, never dated before the present posting.
  * `empImport` – at most 1000 rows; first a check that saves nothing; a faulty row comes back with its line and why.
* `lib/rules.js` – the checks, in one place. `public/hr.js` – the pages (Employees, one employee, forms, import, the two lists).
  An Excel file is read with the main address's own `/vendor/xlsx…` (inside the ERP); a CSV anywhere.
* **His own details and papers (12-11-2026: "KYC DOCUMENT ATTACH … ADHAR PAN SECONDRY MOBILE NUMBER FAMILY NUMBER ADDRESS")** –
  `sql/hr_step3_kyc_docs.sql` (run by the owner in rcl-hr, after step 2): `hr_employee_private`, `hr_employee_docs`, the PRIVATE
  bucket `hr-docs`. Actions `privGet` / `privSave`, `docList` / `docUploadUrl` / `docAdd` / `docLink` / `docRemove`; `lib/store.js`.
  * Aadhaar is checked by its check digit; an HR User sees it only as `XXXX XXXX 1234`, the HR Admin / Super Admin whole; one
    Aadhaar / PAN = one employee; the record of changes holds only the last four.
  * Papers: photo, Aadhaar, PAN, education, driving licence (number, valid up to), bank passbook, salary slip of the last company,
    experience letter, other. JPG / PNG / WebP / PDF, 10 MB. Opened by a link of 5 minutes; **the pay papers (bank passbook,
    salary slip) only by the HR Admin / Super Admin**; every opening is written down. Removed = kept, with who and why.
  * The employee's page says which papers are still expected (a driver: his licence) – a reminder, never a block.
* **Attendance, the core (12-11-2026: "GEOFENCE BAHER KAHICH NHI HONAR", "DEVICE BINDING", "SELFI … FKT PROOF")** –
  `sql/hr_step4_attendance.sql` (run by the owner in rcl-hr, after step 3): `hr_projects`, `hr_places`, `hr_place_people`,
  `hr_devices`, `hr_device_tries`, `hr_punches`, `hr_punch_reviews`, the PRIVATE bucket `hr-selfies`; the role `self`.
  `lib/geo.js` (inside / how far), `lib/attend.js` (the rules), `lib/act_attend.js` (the actions), `public/att.js` (the pages).
  * **Who marks where** (13-11-2026 – "konta user konte location war sign in kartoy … konte location sathi konte user aahet … ek
    employee aso ki bulk employee"): the Work places page has three views – the places themselves · **by place** (who is there,
    a place with nobody in red) · **by person** (where each one may mark, where he marked last, "No place – cannot mark" in red).
    `placeMap` reads it with the same rule a punch is checked with; `placePeople` adds / takes single people – one or many
    (tick them, or paste their codes from Excel). A place for everybody / categories / departments is changed only after the
    Admin said yes: it becomes "Chosen people" with the people it is for now. No database change.
    (13-11-2026, "name nko dakhu count war click kel ki list disel … employee ch location change krta yeil mala ani multiple
    location access deu shakel") by place: only the number – a press on it opens the list, with "Change his places" and "Take
    out of here"; by person: "Change" opens his work places as ticks – one or several – `placePerson` sets exactly those.
  * **Work places** (`placeList`, `placeSave`, `placeBulk`, `placeImport`, `placeRemove`, `projSave` – changes: HR Admin / Super
    Admin): a point + metres (20–5000), an area drawn on the map, or along the road with metres each side; for everybody, some
    categories, some departments or chosen people; from a date; On / Off; many at once. Removed = kept with who and why.
    The map: Leaflet (BSD, `public/vendor/leaflet`) with OpenStreetMap's pictures.
  * **A punch** (`myAttend`, `selfieUrl`, `punch`, `myMonth` – every person for himself; the employee is the one whose e-mail the
    sign-in has): today only by the server's clock; refused – and nothing saved – outside his work places, with a reading worse
    than 100 m, with Developer Options ON or a made-up location, from another phone, without its photo, IN after IN / OUT
    without IN. The first punch ties the phone (`hr_devices`); one phone a person and one person a phone – the database itself
    holds it. The photo goes straight to the private bucket (JPEG, 1 MB) and is never replaced.
  * **No network:** the phone sends the punch later with its own number (`client_id` – sent twice, kept once), the server's time
    of its last contact and its own counter since switch-on; in order → it counts for its own moment; restarted, clock moved,
    older than 72 hours or out of order → `review`: the HR Admin accepts or refuses (`punchReview`, a new row – the punch stays).
  * **Phones** (`devList`, `devRelease` – HR Admin / Super Admin, with a reason); tries from another phone are listed.
  * **"My HR"** – the Portal's second module key `hrme` gives the role `self`: only the four actions above, no page of the office.
  * **The app's "Me" (12-11-2026, `lib/act_self.js`)** – a person's own record: `myHr` (who he is, how complete his profile is, his
    details to read – PF / UAN / ESIC / bank account masked, the papers still expected, his phone), `myDocs`, `myDocUploadUrl` /
    `myDocAdd` (he attaches a paper himself – the office's same checks), `myDocLink` (he opens his own). Always the employee the
    sign-in is; he changes no detail and removes no paper. No SQL step.
  * `hr_punches`, `hr_punch_reviews`, `hr_device_tries`: the server's key may only read and add – never change or delete.
  * Not built yet: the removal of photos after 90 days, the check of the phone by Play Integrity; until the e-mail OTP is there
    an employee whose details are complete ("pending") may punch (`MAY_PUNCH` in `lib/act_attend.js`).
* **The site is chosen in HR too; an employee's site; his page (12-11-2026: "HR MADHE PN SITE SELECT KARAYCHA OPTION DE …
  EMPLOYEE LA SITE ASIGN KRTA YEIL … EMPLOYEE MASTER JAR OPEN KEL SAGLE KAHI ASEL")** – no SQL.
  * The sites are the Portal's (HR makes none): the bar has a chooser of the sites where this person has HR – another site is a
    new ticket of the Portal for it, then the page opens again (`sitePick` in `public/index.html`).
  * The employee's form has **Site**: a new employee is put on the chosen site; another site for an employee of today is a
    transfer from today (HR Admin; the history keeps the old site) – `empSave`. "Transfer…" (from a date, with a note) stays.
  * The employee's page shows his attendance too (`empAround`): his work places of today, shift, phone, today, this month's
    count, requests waiting.
* **More of the office (12-11-2026 – "tu je sangtile 1 to 16 ek sath banwala ghe", the first group; no database step)** –
  **Payslip to print:** Payroll → a LOCKED month → "Payslip" of a line opens a page to print / save as PDF (`paySlipOf`; the head
  is the site's name – HR does not know the company's). **Bank list (Excel):** name, name as on bank, bank, IFSC, account number,
  net pay (`payBank` – the HO HR only; the account numbers whole only here; "Bank list taken" in the audit, never a number; a
  person without a bank account in his profile is said). **Coming up** on the dashboard (`hrComing`, `lib/coming.js`): the papers
  of this site's people whose date runs out within 30 days or has run out, the birthdays and the years at work of the coming 7
  days. A person's own (`myHr.coming`): his papers running out, his birthday today, his years at work today – for the app.
  `myAttend` also says `week_off` / `days_off` for the phone's IN / OUT reminders.
* **"All sites" (14-11-2026)** – his words: "hr portal madhe site wise bghta yet but ek as ek option banaw ki all site saglech ekdam
  sagle disel … hr admin tithunch badal pn kru shaktil". The site switch offers **All sites** to a person the Portal gave two or
  more sites with a role (the ticket's `sites[].role` – rcl-portal `api/go.js`). The open page – Dashboard, Employees, Attendance,
  Muster, Leave, Requests, Approvals – is then shown for every one of his sites, one under the other (`public/allsites.js`): each
  part IS that site's own page, opened inside HR's page for that site (`/?as=<SITE>`), so everything works in it as on the site.
  Every request of such a part names its site (`as_site`); `lib/session.js as()` lets it through only for a site of HIS ticket,
  with the role he has THERE – then the action runs as always: on that one site. No action was changed; no SQL. The other pages
  belong to one site.
* **A work place of another site for one person (14-11-2026)** – his words: "vtr cha manus head office la gela tr vtr madhunch tyala
  ho geo fence access deta yawa". The HR office of HIS OWN site (who may manage work places) opens Work places → By person → Change,
  chooses the other site, ticks its work places and writes why (`placeGuest`). He is written to that place (`hr_place_people` – **no
  new table, no SQL**); a place that is not of his site counts for him whatever its "for whom" says, while it is on. Nothing of the
  other site is changed: its office sees only its own people and keeps the guest when it saves its own. His attendance stays his own
  site's. The other sites' work places are shown by NAME only.
* **The Rule Book (step 13, 13-11-2026)** – his words: "super admin kade ek main rule book haway … ek hun anek policy banwayta
  yeil … employee la site la ho la asign krta yetil … authorization … kon verify krel kon approval krel". **UNTIL A POLICY IS GIVEN
  TO A SITE OR A PERSON NOTHING CHANGES** – the muster and the pay sheet of the test rig are the same as before (checked against
  `main` after every part). Six kinds of policy – Attendance, Late & early, Weekly off, Leave, Comp-off, Overtime – each with
  versions from a date and its own "who verifies / who approves" (by role or by name with a stand-in). Only the Super Admin makes
  or changes one; the HR Admin of a site, the HO HR and the Super Admin give it: the site's own (everybody) or chosen people, from
  a date. `lib/rulebook.js` (plain rules), `lib/act_rulebook.js`, page `public/book.js` ("Rule Book", "Approvals").
  * **Leave:** two balances, Paid leave and Comp-off, shown and used as ONE (a leave takes the Comp-off days first – the person
    never chooses); a ledger of every day added and taken; a Sunday worked earns a leave on a site (at most so many a month); a
    request may be longer than the balance (the rest stays absent, marked: refused ✗ / no balance / nothing asked); papers on a
    request (`lib/act_leave_files.js` – never compulsory, never deleted); the opening balance of many people from one sheet
    (looked at first, ONE request, credited when approved, never twice); extra leave through approval.
  * **Approvals** (`lib/act_asks.js`): overtime and comp-off of a month are found from the muster and count only after "verify"
    and "approve"; a bulk correction of a month's attendance from Excel (`lib/act_import.js` – only in the person's favour, one
    reason for the file, the punches stay; a month the HO HR approved is closed).
  * **Pay** (`lib/pay.js`, `lib/act_payroll.js`): approved overtime "for pay" = the hours × a day's pay ÷ the shift's hours × the
    policy's rate; a person WITH a comp-off policy is paid an extra day only for a day approved "for pay"; unused leave is paid
    in the month of his last day when his leave policy says so. A person with no such policy is paid exactly as before. A late
    correction of a locked month is NOT counted by itself: the HO HR adds it as "Other earning" with its note in the next month.
  * **Punch** (`lib/act_attend.js` → `stand`): one IN and OUT a day and the weekly off are the person's own policy's.
  * `sql/hr_step13_rulebook.sql` – ten new tables and one new column with a default, run by the owner ONLY in rcl-hr; before it
    the pages say so and everything else works as before. Tests on the local rig only: `test/rig/rulebook_*.js`.
* **Payroll (step 12, 12-11-2026)** – his words: "HO HR … SALARY CALCULATE KRU SHAKEL JYAT PT PF DEDUCTION SALARY ADVANCE HE SAGLE HO
  WARUN KARTA YEIL"; decided: a day's pay = the month's salary ÷ the days of that month, an extra day = one day's pay. Page
  **Payroll** (web; the HO HR and the Super Admin only – `init.ho`, menu `who: 'ho'`). **Pay sheet:** a site's month, only after
  its attendance is approved (step 10) – counted fresh from the verified counts and each person's approved salary of the month's
  last day (`lib/pay.js`: a month's salary → the days counted for pay; a day's rate → present + half days as ½ + leave; extra days
  one day's pay each). "Set…" per person: ticks PF / ESIC / Profession Tax (kept for the months to come, `hr_pay_emp`), another
  earning / deduction with its note and the advance of this month (`hr_pay_adjust`). **PF · ESIC · PT** are the company's own
  settings with their date (`hr_pay_settings`, the accountant's numbers – none is in the code; empty = not applied; PF to the
  nearest rupee, ESIC rounded up, PT by the highest slab reached; no special month, no difference by gender – use "another
  deduction"). **Advances:** one running advance a person, taken back a month, never more than what is left or than the pay.
  **Lock:** the run, every payslip and the advances in ONE piece (`hr_pay_lock`); a locked month is never counted again nor
  changed (the database gives no update on a payslip) – a mistake is set right in the next month. A person without an approved
  salary is said and left out. **His own payslips:** `mySlips` (the app's "Salary slips"). `sql/hr_step12_payroll.sql` – six new
  tables and one function, run by the owner. Run beside the present method for two months before it is trusted.
* **An employee's salary – onboarding (step 11, 12-11-2026)** – his words: "SITE HR EMPLOYEE ON BORD KRU SHAKEL … TYACHI SALARY PN
  MENTION KARU SHAKEL JI BASIC SALARY ASEL ANI … APPROVAL SATHI JAIL"; decided: straight to the HO HR; a month's salary or a day's
  rate, chosen per person. The employee's page → **Salary…** (HR Admin with the power `salary`, Super Admin): type, amount, from
  which date → it waits for the HO HR (**Month verification → Salary approvals**: a new employee is said; approve / send back
  with the reason – never the person who proposed it). The newest approved salary that began by a day counts on that day; a
  later salary is a new proposal, the old ones stay (`hr_salaries`, `lib/act_pay.js`). A salary is seen by the HR Admin of the
  site, the HO HR and the Super Admin – never an HR User, never the app; the amount is not written into the audit.
  `sql/hr_step11_salary.sql` – one new table, run by the owner. Payroll (the month's pay from the approved month and this salary)
  is the next piece – not built.
* **The month: verified by the site's HR, approved by the HO HR (step 10, 12-11-2026)** – his words: "MONTH END LA JYA TYA SITE CHA HR
  ATTENDANCE VERIFY KAREL USER WISE BULK VERIFY … SITE HR NI VERIFY KEL KI DIRECT HO HR KADE DATA JAIL". Page **Month verification**
  (web only): everybody of a month with his counts – present, half, absent, leave, **extra days** (worked on a weekly off / a
  holiday), late days, days for pay (`lib/month.js`). After the month's last day the **HR Admin** (power `month`, given or taken by
  the Super Admin) ticks people and verifies them – not a person with an "IN without OUT" day or a request still waiting; the counts
  of that moment are kept (`hr_month_people`). A day changed afterwards shows "Changed since verified" – verify again. The **HO HR**
  (`hr_ho_hr`, given by the Super Admin; the Super Admin himself too) sees every site of his sign-in, sends people back with the
  reason, or **approves** the site's month when everybody is verified (`hr_months`): from then on no day of that month is changed
  (`needOpen` – a day set by hand, a request, a doubtful punch, a leave decided). Only the Super Admin opens it again, with the
  reason. Everything is in the audit. `sql/hr_step10_month.sql` – three new tables, run by the owner; before it the page says so and
  everything else works as before.
* **Once a day, a forgotten OUT, the late policy (step 8, 12-11-2026)** – his words: one sign-in and one sign-out a day; who forgets
  OUT is signed out by the system and is absent; three late marks a month, the fourth is a half day; a "no late" policy; the times
  by the shift. All of it is the site's **dated rules** and its **shifts** – nothing in the code (`lib/day.js`):
  rules `once` (the server refuses a second IN: `stand`), `late_free` (so many late days a month are only marked, every later one is a
  half day – counted from the 1st, `lateHalves`), `half_after_min` (later than the shift's start + this = a half day at once); no late
  policy = `grace_min` empty. A shift's **`auto_out`** (`sql/hr_step8_auto_out.sql` – ONE new column, run by the owner): at that time a
  day with IN and no OUT is closed by itself and reads **absent** (a night shift: the next morning) – only READ so, no punch is
  written or changed; he can ask to set it right. The phone is told `next` (`in` / `out` / `done`), `once`, `closed`, his `shift`;
  a night shift's OUT the morning after is taken. Before step 8 is run everything works as before (a closing time typed is refused
  with what to do). Who decides a request (1 or 2 levels) and the leave policy's levels were there already.
* **Leave (step 7, 12-11-2026)** – `sql/hr_step7_leave.sql` (run by the owner in rcl-hr, after step 6; three new tables). His words:
  4 leaves a month at a site, Sunday is a working day there, an absent day or a leave takes one from the balance; the Head Office
  differs (its Sunday off, its holidays). So the **policy is per site, with its date** (`hr_leave_policy`: leaves a month, carry on
  or lapse, an absent day takes one or not, one or two levels of approval) – nothing in the code. **The balance is never stored**:
  `lib/leave.js` walks it day by day from the policy's first day (+ the month's leaves, + what the HR office added in
  `hr_leave_adjust`, − approved leave days, − absent days); a weekly off / holiday never takes a leave. `lib/act_leave.js`: a
  person's `myLeave`, `leaveAsk` (refused beyond the balance), `leaveCancel`, his team's `teamLeaves` / `teamLeaveDecide`; the
  office's `leaveList`, `leaveDecide`, `leaveBalances`, `leaveAdjust`, `leavePolicy(Save)`. In the muster, a person's month and the
  dashboard a day covered by leave reads **L** (the web shows it as LV – L there is "late"). The **Leave** tab: `public/leave.js`.
* **The employee's full profile (step 6, 12-11-2026)** – `sql/hr_step6_profile.sql` (run by the owner in rcl-hr, after step 5; four
  new tables, nothing existing changed). Asked with pictures of a reference product, and "nothing fixed – the Super Admin and
  the Admin change it". `lib/act_profile.js` describes every detail ONCE (`GROUPS`: Profile, Job, Statutory & bank; `ROWS`:
  Family, Education, Experience, Skills) – the server checks with it and `public/prof.js` draws the forms from it. Every
  pick-list is `hr_lists` (the **Lists** tab: add, rename, switch off; a value in use is never deleted); which details are
  compulsory for "profile complete" is the site's setting (`hr_settings`). PF / UAN / ESIC / bank numbers: masked for an HR
  User, never in a list, an export or the audit. A row is "removed" with who and why. Opened from an employee's page: **Full profile**.
  Still to come (his yes first): policies per employee, leave, salary structure and payroll, letters and ID card; the app's own screens.
* **One look on every page; the Employees tab, the employee's page and form; export; delete (12-11-2026)** – no SQL step.
  Every page has the same head (`HRHEAD.set` in `public/hr.js`: its name, one line, on the right its own controls and the site);
  the menu for Mechanical lists **Dashboard** first. Employees: the list shows **Active from** (joining) and **Relieving date**;
  "Has left" is now **Relieve…** (the same action `empExit`, the same record – only the words); **Export Excel** (`empExport`:
  the people the list shows, all of them; .xlsx with Mechanical's `/vendor/xlsx…`, else a .csv; the column names are the ones
  the import reads). **Delete…** (`empDelete`, HR Admin / Super Admin, with the reason): ONLY an employee added by mistake –
  refused while he has attendance, a phone, papers, KYC or people reporting to him (then: relieve him). What he was is in the audit.
* **The attendance dashboard and the muster's look (12-11-2026, the pictures he approved – "hech design final aahe web sathi")** –
  no SQL step, nothing is written. `lib/act_dash.js` → `attDash` (HR office only): today counted with the muster's own measure
  (`daysOf`) – at work now, present, late, not marked, **absent of yesterday** (nobody is absent while the day runs), the arrivals
  by half hour, who is at which work place (the place of his IN), the last 7 days, and what waits (requests, doubtful punches,
  tries with another phone in 7 days, people not marked with no phone tied). `public/dash.js` is the page (the first tab; asks
  again every minute while it is on the screen). The muster (`public/mus.js`) has colour cells (L = present but late) and a
  day opens in a **panel on the right** – the same actions as before (`dayGet`, `daySet`, `regDecide`); `dayGet` now also gives
  each punch's work place. "Tried from outside" of the picture is not there: nothing is saved outside a work place.
* **An employee's sign-in for the app (12-11-2026)** – the employee's page: "Sign-in for the app…" (HR Admin / Super Admin). The
  page asks the Portal (`<portal>/api/hrlogin`, with the person's own Portal sign-in – `HRPORTAL` in `public/index.html`); the
  Portal makes the user, gives "My HR" (`hrme`) on the employee's site and answers a one-time password, shown once. HR's server
  has no part in it and keeps nothing. Needs the module `hrme` in the Portal.
* **The muster, shifts, rules, requests (12-11-2026)** – `sql/hr_step5_muster.sql` (run by the owner in rcl-hr, after step 4):
  `hr_shifts`, `hr_shift_people`, `hr_holidays`, `hr_att_rules`, `hr_regularize`, `hr_day_entries`, `hr_admin_powers`.
  `lib/day.js` (one day → its code), `lib/powers.js`, `lib/act_muster.js` (the actions), `public/mus.js` (the pages).
  * **A day's code** – P, HD, A, WO, H, WOP / HP (worked on a weekly off / a holiday), IN (at work now), MIS (IN without OUT on
    a day gone). **The rules are settings with a date** (`rulesSave` → a new version; a day is measured with the version and the
    shift of THAT day): hours for a full / a half day, grace minutes, early-leaving minutes, late days for one half day, the
    weekly off, who decides a request (1 or 2 levels). **A rule left empty is not applied** – no number is in the code. Days
    before the site's first recorded attendance stay empty.
  * **Shifts** (from – to, also over midnight; break; for everybody / categories / departments / chosen people – the most exact
    wins), **holidays** (one, or a list – all or none).
  * **Muster** (`muster`, `dayGet`): the month of everybody, a CSV. What counts for a day: the newest `hr_day_entries` row, else
    the first IN and last OUT of the punches in order (a doubtful punch only when accepted; an OUT after midnight closes the IN
    of the evening before).
  * **A day set by the office** (`daySet`): a manual entry (a day without a punch) or a correction (a day with punches or an
    entry; also "no attendance on this day") – always a NEW row with the old times, the new times, the reason, who and when.
    The punches are never touched. The HR Admin: 60 days back; the Super Admin: any day.
  * **Requests** (`regAsk`, `myRegs` – a person for a day gone; `regList`, `regDecide` – the HR office; `teamRegs`,
    `teamRegDecide` – the reporting person when the rules say 2 levels): approved = the day's new entry.
  * **The HR Admin's powers** (`powerSet`, Super Admin only; no row = allowed): work places, phones, doubtful punches, shifts /
    holidays / rules, manual entry, correction, requests – each can be switched off per site.
  * Not built yet: the app's screens for a request and the reporting person; payroll's lock of a month; leave.
  * Today HR fills these. The employee filling them himself comes with his own sign-in (the activation step).
* **Not built yet (the next steps of Phase 1):** activation by e-mail OTP (Resend) and the sign-in with mobile number or e-mail
  (a change in the Portal – asked for separately), the Payroll-only details (bank account, PF…), the finer roles and powers,
  the phone app's screens.

## Leave – a paper with every leave, who it waits for, its history, shorter / longer, change and delete (19-11-2026; no SQL step)
Asked with the Leave screen ("user la aplela takleli leve delet pn krta yawi … attachment … status disel ki leave approval kuthh prynt
geley ani kona kadhun pending aahe … 5 tarkela aloy … app error deil … swatche leve che days kami … wadhwayche astil tr approval … approved
zali ti delet site hr ho hr super admin … user ni keleli changes pn diistel"), his answers: a paper for EVERY leave; no IN on an approved
or a waiting leave day; longer = the days of before stay approved, the extra days wait for approval; an approved leave is changed /
deleted by the Site HR Admin, the HO HR and the Super Admin. Then: "leave policy ekach thikani rule book madhech thew … bulk madhe delet
leave ch option de ani select krun pn delet kra yawet".
* **A paper with every leave:** the app sends the paper first (`myLeavePaperUrl`, under `leave/<employee>/`), then `leaveAsk` with
  `files` – checked to be his and arrived (`act_leave_files.papersIn`), written to the new request (`attach`). No paper – not sent; an
  app of before (no `files`) is told to update. His last paper is never removed by him.
* **Who it waits for and its history:** every request carries `waits` (the step and its people – his Rule Book policy, else the
  reporting person by name, then the HR office) and `history` (asked, verified, approved, refused, made shorter, made longer, changed /
  deleted by the HR office, deleted by himself) – kept in the request's own `steps`, nothing new in the database.
* **His own:** delete while it waits (`leaveCancel` – "Deleted", with who and when); `leaveChange` – SHORTER at once (waiting or
  approved, only days from today on; a day gone is the HR office's), LONGER at one end = a new request for the extra days with its
  reason and paper (the request of before keeps its days and where it stands).
* **A day of his leave:** `punch` refuses IN on a working day of his whole-day leave (approved or waiting) with the code `onleave` and
  the leave – the app opens "Change days"; `myAttend` says `leave` before he starts. A punch kept offline on such a day waits for the HR
  Admin ("on leave that day").
* **The HR office's Leave page:** Waiting / Approved / Refused / Deleted / All; who it waits for; History; **Change** (`leaveEdit`) and
  **Delete** (`leaveRemove`) with the reason; **ticks + "Select all" → delete at once** with one reason (`leaveRemoveMany`, each checked
  as alone – one that cannot go is left with why). Change / delete: the Site HR Admin with the power "Decide requests", the HO HR,
  the Super Admin – not an HR User, never his own. The Super Admin sees every site's with the site switch → "All sites".
* **The leave policy is only in the Rule Book:** the Leave page has no "Policy" any more; the site's leave policy of before is shown in
  the Rule Book's Leave part while the site gives no Rule Book leave policy (it counts then); balances say which counts.
* **Balances – ticks (asked: "ethe kuthe tick cha option nahi delete krnyasathi … jo balance aahe to chukun aalela aahe"):** tick people
  (or "Select all") → **Make the balance 0** with one reason (`leaveZero`): for each a line "taken off" of his whole Paid balance of
  today in `hr_leave_adjust` – it reads 0, nothing is deleted, days can be added back. The HR Admin with "Decide requests" or the Super
  Admin; never his own.
* Tests (rig only): `test/rig/leave_flow.js` (the server, 61 checks), `test/rig/leave_page.js` (the page in a browser, 20).

## Attendance from anywhere (19-11-2026; no SQL step; no app update)
Asked: "ata prynt location apan fix banwalel aahe ata all over asse kahi lok aahet ki kuthun pn login kru shaktat ass ek option banaw ani ha
web warun access dila jail app updet chi garaj lagu naye".
* **Work places → By person → Change → "Anywhere"**: up to a date (empty = no end), always with the reason (`placeAnywhere`; the HR Admin
  with the power "Work places and projects", or the Super Admin; never for himself – `own.js`). His line shows "Anywhere"; every change is
  in the audit ("Attendance from anywhere: given / taken back").
* **Kept** with the site's settings (`hr_settings`, key `att_anywhere`: `{ by: { <employee id>: { until, reason, by, at } } }` – `lib/anywhere.js`).
* **The punch** (`punch`): for such a person the geofence is not asked (also with no work place at all). A punch inside one of his places
  keeps that place as before; one outside is kept with no place, `inside: false` and the mark `flags.anywhere` (the Attendance page names
  it "Anywhere"). EVERYTHING ELSE stays: GPS and its accuracy, the selfie, the face where the site asks it, one phone, today only,
  Developer Options / made-up location refused.
* **No app update:** `myAttend` gives him one more place after his own – "Anywhere", a circle of 21,000 km round 0 / 0 (every place on
  earth is inside) – so the app's own check lets him mark (at a real place the app still names it); `myPlaces` lists "Anywhere – any
  place"; `placeAccess` (his page) says it.
* Tests: `test/api.test.js` (ANYWHERE – given / refused, the app's place, a far punch kept with the mark, taken back, up to a date, the
  audit); `test/rig/anywhere_page.js` (the page – 7 checks). Not run: a real phone (the app of today with the "Anywhere" place).

## Export → change in Excel → import the same file (19-11-2026; no SQL step)
Asked: "ekda employee add zal tyach name rcl employe code te sagle changes krta yawet … 62 employee aahet saglenche change kraych aahet …
export karel sagli list detil madhe yeil tya excel madhe mi je changes krel mg employee code aso ki baki gosti prt tich import krel tr je
changes zalet tech updet hoil as logicly banaw".
* **Export Excel** writes a last column **"HR ID (do not change)"** – the employee himself (`lib/act_sheet.js`, column kind `id`).
* **Import of a row with the HR ID** changes HIM: also his **Employee Code** (never another employee's – refused with the line) and his
  name. A row without it (an older file, a step file, a new person) is found by its code as before; an HR ID that is nobody's, or twice
  in the file, is refused with the line.
* **Only what changes:** every employee of today is compared with what he has now (the Employee Master, his own details, the profile,
  the bank, PF / ESIC / PT). The check lists, employee by employee, what will change (old → new for the master's details; only the
  name of a secret one) and how many stay the same; Save writes only those – a row that changes nothing is not written (its
  `updated_at` stays). A bank detail that is the same is not asked again.
* **A changed date of birth / joining date** (before: refused from the sheet): one reason for the file (`reason`, at least 5 letters) –
  asked on the page before saving, kept in the audit line with the codes changed (`codes: [[old, new]]`).
* The page: the change list, "Nothing changes – the file is the same as HR.", the reason box; the import dialog says how. मराठी / हिंदी.
* Tests: `test/api.test.js` (the sheet test – code and name changed by the HR ID, only the changed one written, the reason, another's
  code, an unknown / twice HR ID, an older file by its code); `test/rig/sheet_roundtrip_page.js` (the browser: Export → openpyxl changes
  → Import → the list → Save; a date with its reason – 8 checks).

## "Ask" – help with HR in one's own words (19-11-2026; no SQL step)
Asked: "portal and hr madhe ask button de ani tya madhe api mi dileli aahe adhich app ani mechnical sathi tich api rahude kahi hi vicharle
app badal sagli detail proper tyane sangawi … user mala vicharne peksha tithech vicharel systeam tyala guide krel"; his answers: **guidance
only** (how to do something, where it is, what a message means, whom to ask – it reads no data of anybody and changes nothing); **the web
first** ("My HR" in the phone app later).
* **The button "Ask"** on top of every HR page (the HR office; not inside "All sites"' parts, not for "My HR") opens a panel on the right
  (`public/ask.js`): four questions to start with, the conversation, a box (Enter sends). Marathi, Hindi or English – the answer comes in
  the language of the question. Every word is put in as text (never HTML) and never turned by the page's language.
* **The server** (`lib/act_help.js`, action `helpAsk` – every page's, `lib/pages.js` ANY): the answer comes from **the guide**
  (`help/hr_guide.md` – every page, role, rule and message of HR, in the screens' own words; no person, no number) and from what the
  person IS (his role, HO HR or not, his pages Edit / View / No access) – never from the database's people. Through HR's one AI door
  (`lib/ai.js`, purpose "help", logged without its words); the guide is kept by the provider (prompt caching – later questions pay about
  a tenth for it; the log's cost counts it). At most 40 questions an hour a person; the month's limit of `HR_AI_MONTHLY_USD` as always.
* **To switch it on** (Vercel → the HR project → Settings → Environment Variables – the same key as Mechanical's, put there by him):
  `HR_AI_ENABLED=true`, `HR_AI_PROVIDER=anthropic`, `HR_AI_MODEL` (e.g. `claude-sonnet-5-5`), `ANTHROPIC_API_KEY`; `HR_AI_PRICE` (for the
  cost) and `HR_AI_MONTHLY_USD` optional; step 19 (`sql/hr_step19_ai.sql`) run once. Not set: the panel says "AI is not switched on for HR".
* **The guide is part of the code:** a change of a page, a rule or a message changes `help/hr_guide.md` in the same piece of work.
* Tests: the unit test ("Ask"); `test/rig/ask_page.js` (the rig, with a stand-in of the AI service on :3998 – 15 checks: what is sent,
  the log line, the limit, the page, a phone's width). Not run: a real AI provider.

## The employee sheet – one Excel format in and out (13-11-2026)
Asked with the company's own sheet ("Employee Detail All"): "je excel madhe column aahet te same column sagle … apli excel pn same
asel import export sathi … excel madhle code as it is … categery colum remove kruya ani designation he theu … email mobile nasel tr
import nahi honar … adhar pan … bank details … ifsc … sagle kahi import export excel madhe asel … yes no … tas".
**No SQL step** – the new details are kept in the profile's own columns (`hr_employee_profile.data` / `.secret`, step 6) and a
designation's category beside the settings (`hr_settings`, site `*`).
* `lib/act_sheet.js` – `sheetCols`, `sheetImport`, `sheetExport` (the page's Import / Export buttons use them; `empImport` /
  `empExport` stay as they were).
  * **Columns:** the company's 29, heading for heading in its order (Name of Company … Totals), then Mobile, E-mail, Date of
    Birth, Gender, Designation, Department, Aadhaar, the family number, the addresses, the profile, PF / ESIC / bank. No
    "Category": a **designation carries its category** (Designations page; none set / no designation = Staff). A file of before
    with a Category column is still read.
  * **Import = add or change.** A row whose Employee Code is an employee of this site changes him – only the filled cells. A
    new code (kept as it is) or none (made by itself) adds him; **a new employee needs a mobile or an e-mail**. A faulty row
    comes back with its line and why; the good rows are saved; a check first that saves nothing. The company's sheet is read
    as it is: company / branch standing once for a group are carried down, a total's row is left out; with several projects in
    the file the page asks which of them belong to this site – the others are not imported here.
  * **Pay:** CTC, Basic and the other pay details (`GROUPS.pay` in `lib/act_profile.js` – seen and changed only by the HR Admin /
    Super Admin) and Deduct PF / ESIC / PT (`hr_pay_emp`) are read only from the HR Admin / Super Admin. The monthly CTC
    becomes the **approved salary** (`hr_salaries`) only when the HO HR / Super Admin imports, and only when it is not his
    salary already.
  * **Export** = the same columns (the format = the same file without rows). Pay and the secret numbers (Aadhaar, UAN, PF,
    ESIC, bank account) are written only for the HR Admin / Super Admin. Import and export are in the audit – never a number.
* **Removing the demo employees (asked 13-11-2026: "demo saglech delet kraych ahe")** – two one-time files, run by the owner in
  the rcl-hr Supabase, never by the app: `sql/hr_once_remove_demo_1_count.sql` (only counts) and
  `sql/hr_once_remove_demo_2_delete.sql` (**deletes for ever**, in one transaction: every employee of every site and what hangs
  on him – attendance, phones, faces, leave, months, salaries, payslips; the masters, work places, shifts, rules, settings and
  the audit stay; the Portal and the files in Storage are not touched). A backup first.
* **Sign-in by e-mail OR mobile number; everybody at once (13-11-2026 – with the Portal's step 12).** An employee is complete with
  his date of birth and an e-mail **or** a mobile number (`lib/rules.js`). His page's "Sign-in" sends both to the Portal
  (`api/hrlogin`); the user ID of an employee without an e-mail (`<number>@mobile.id`) is kept in `hr_employees.portal_email`
  (`signinLinked`) – "My HR" finds him by it, also after his number changed. **"Give sign-in to all"** (`signinPeople`, the
  Portal 20 a call): the Super Admin, or an HR Admin he gave the power `signin` (Shifts & rules → Powers; off until given).
  HR's server keeps and sees nothing of the passwords. No SQL step in HR.
* Still to come: the phone app's sign-in box and its screens for the new details.

## The new look of the web pages and Ctrl K (13-11-2026 – the pictures he approved: "all approved aahe … ctrl k thew … pr de")
* **The frame:** the pages are a menu down the left side (People · Attendance · Leave & pay), the search and the site on top. In
  Mechanical's screen (`?embed=1`) and on a narrow screen the menu is the row of buttons as before. The same pages for the same
  people – a page a person may not open is not in his menu.
* **Ctrl K** (`public/find.js`, also the search box on top): one box finds a page, an employee of the site (name, code, mobile,
  e-mail – the server's own `empList`), a department, a designation or an action (Add employee, Import, Export, Give sign-in to
  all – only when that button is on his screen). Arrows, Enter, Esc.
* **The dashboard** as in the picture: six counts, the day's sky, today's ring, "Needs you"; then who is in, the places, what
  comes up, the week and the quick actions. It asks nothing new (`attDash`, `hrComing`); Requests / Phones / Attendance show the
  number waiting beside their name in the menu.
* **The other pages:** the new cards, tables and buttons (the look only – every button and rule as before).
* **The rest of the pictures (13-11-2026, "ek sath saglech kr"):**
  * the counts on top of **Attendance** (punches, people, first IN, sent later, to be looked at), **Phones** (in use, released,
    tries, people who tried – and the tries beside the list), **Leave** (the list shown) and **Payroll** (the totals + the
    month Open / Locked) – each counted from what the page already has;
  * the dashboard's **Absent today** and **On leave**: `attDash` now also says `count.leave`, `count.absent` and each person's
    `mark` – both are inside "not marked" as before (on + out + off + none = everybody); it still only reads;
  * **Work places:** one map of every work place of the list beside it – a place on the map opens the same form as its row;
  * **Employees: the column "Sign-in"** (Given / Not given / Switched off) – asked from the PORTAL (`api/hrlogin` with `check`,
    read only; the HR Admin of the site and the Super Admin). With an older Portal or for an HR User the column stays away;
  * **Shifts & rules:** the HR Admin's powers as switches (the same checkbox, the same action).
* **An employee is ONE full page (13-11-2026, "ekach screen madhe sagle … half screen nkot full screen"):** a press on a person
  opens his page beside the menu – his head (photo, code, status, how far the profile is filled, the buttons Change · Transfer ·
  Sign-in · Salary · Face · Relieve · Delete), then **Overview** (work, contact, history, attendance, documents & KYC, "Still
  to do") and the tabs of his **full profile** (Profile, Job, Statutory & bank, Pay details, Family, Education, Experience,
  Skills – a tab shows how many compulsory details it still misses). "+ Add employee" and "Change" are a full page too. A
  window closed without saving goes back to his page; another page of the menu leaves it. The same actions of the server.
  Still small windows over his page: the sign-in, Personal details & KYC, Documents, Salary, Face, Transfer, Relieve, Delete.
  Not built from the picture: the month's strip of days, the "Pay" card, "Sign-in given / Phone tied" in the history.
* **A save is seen at once (13-11-2026, "save mhanle ki ek pop up yewa confirmation cha ani lagech save pn hoyla pahije"):** the
  button says "Saving…" the moment it is pressed; when the server has saved, a window in the middle says "Saved" (it goes by
  itself, or OK / Enter / Esc); an error stays on the page and nothing is said saved. A profile tab is answered from what was
  just read and saved (`profSave` does not read the whole profile a second time).
* **Departments & designations on ONE page (13-11-2026, "department and designation ektr thew … edit and delet pn karta yawet …
  construction line madhe je astat te auto tu fill kr"):** the two lists side by side with a search; a name is a line – Edit,
  Switch off / on, **Delete** (`masterDelete`: only a name that no employee has today or in his history – one in use is refused
  and is switched off instead; written in the audit). **"Add the usual construction list"** (`masterSeed`, `lib/act_masters.js`):
  the usual departments and designations of a road / construction company, each designation with its category – only the names
  that are not there yet; nothing of before is changed. (His Excel has no department / designation column – nothing was taken from it.)
* **An employee's page in ONE reading (13-11-2026, "data lagech yet nahi to pn fast yeyla hawa"):** `empPage` gives the person, his
  attendance, his papers and his profile together (the four readings of before, each with its own check); opened again within
  5 minutes the page shows at once what it read, and the fresh answer follows. The buttons of his head stay readable meanwhile.
* **"Not available" (13-11-2026, "jith details available nahit … not available ha option de"):** a tick under a box of the profile
  that is a name, a number or a date (PF number, CUG number, IFSC …) – kept as `NA`, it counts as filled. Never for an amount,
  Yes / No, a time or a list. The Excel sheet takes and gives "NA" too.
* **Sign in / Sign out (time) are not on the page any more (13-11-2026, "apan shift wise deto … ethe he nko"):** the shift says
  the times. The two columns stay in the Excel sheet as before (`sheet: true`); the page, the count of details and the app do
  not show them, and a save of the Job tab leaves them as they are.
* **"‹ Portal" and "Log out" on top (13-11-2026, "prt portal la jayla option disat nahiye n log out kahich nahi"):** when HR is
  opened by itself. "‹ Portal" goes back (the sign-in stays); "Log out" ends HR's sign-in and the Portal's, then shows the
  Portal's sign-in page. Inside Mechanical's screen they are not shown (its own are there).
* **One look wherever HR is opened from (13-11-2026, "hr portal kuthun pn open houde asach disla pahije ani ethun portal madhe
  back ani site madhe back jata ale pahije"):** when the ERP shows HR in its screen, HR takes the whole window (the site, the
  page and the person go along in the address) – its own menu on the left, **"‹ ERP"**, "‹ Portal" and "Log out" on top. The
  ERP also loads HR ahead, out of sight: while its frame is hidden nothing is taken. The browser's Back returns to the ERP.
  Nothing of the ERP (Mechanical) is changed for it.
* **The RCL look (13-11-2026, his picture: "dashbord ui asa asawa … aplela logo pn lawaycha aahe … tree line war click kel ki menu
  open … je haw tya war click kel ki te open ani menu band ekdam smooth … rcl logo cha jo colur aahe tyach fade madhe … red balance
  thew … baki che pages pn yach colour shade madhe"):** white pages with thin grey lines; the logo's red only for what matters –
  the page of the menu, the main button, the day's panel, an employee's head. The menu is white with the company's logo (the
  same picture as the ERP's; `rcl-mark.png` when it cannot be loaded), in the groups of the picture (HR Management ·
  Organization · Payroll) with a sign for each page. **The three lines** open and close it with a slide; a page picked closes
  it; a narrow screen starts closed and the menu slides over the page. The top row stays on top of every page. The dashboard:
  a greeting, the day's curve of arrivals with "Now" and the shift, the rows of the picture, one row of quick actions.
  Not in the picture's way: "Reports" (no such page), the drawings of machines, "Mark attendance / Move / Leave request" (the
  office does not punch for a person) – the quick actions are the real ones.
* **Only the web.** Nothing of the phone app and nothing of the database is changed; of the server only `attDash` (reading).

## Settings (Vercel → Project → Settings → Environment Variables – never in a file)
| Name | What |
|---|---|
| `PORTAL_URL` | the Portal's address: `https://oneclicksolution.online/portal` (an address, not a secret) |
| `PUBLIC_URL` | this module under the one address: `https://oneclicksolution.online/hr` (an address, not a secret) |
| `SUPABASE_URL` | the HR Supabase project's address |
| `SUPABASE_SECRET_KEY` | its secret key – only in Vercel |
| `BACKUP_EXPORT_SECRET` | (with Mechanical's update-243) the SAME long secret word as in rclerp, rcl-portal, rcl-engineering and rcl-purchase – only in Vercel. Mechanical's nightly backup asks `/api/backup-export` with it, and (update-263) Mechanical's Driver Master asks `/api/mech-drivers`; without it nothing is given |
| `RESEND_API_KEY`, `MAIL_FROM` | (step 14) the e-mail to an employee whose bank details change – the Resend key (the Portal's own may be used) and the sender, e.g. `RCL HR <hr@…>` of a domain verified in Resend. Not set: nothing is sent and the bank change says "Not told: e-mail is not set up" |
| `CRON_SECRET` | (step 14) a long random word; Vercel sends it to `/api/jobs` with its daily timer. Not set: no timed job runs |
| `SELFIE_RETENTION_ENABLED` | (step 14) `true` = the 90-day removal of punch photos runs (daily, 03:00 India). Off until he sets it. `SELFIE_DAYS` only makes the time longer than 90 |
| `FACE_CONSENT_REQUIRED` | (step 14) `true` = no face registration without the employee's consent – set it once the app 3.134.0 (which shows the words) is with everybody |
| `HR_DEVICE_KEY_REQUIRED` | (step 14) `true` = a punch without the phone's own key, or with another key, is refused – set it once the app 3.134.0 is with everybody (a phone whose app was removed and put back is then released by the HR Admin, as a new phone) |
| `HR_ANCHOR_REQUIRED` | (step 14) `true` = an offline punch without the server's seal of its time waits for review. Optional. `HR_ANCHOR_SECRET` (optional) – the seal's own secret; without it the seal is made from the database key |

## Step 14 – security (18-11-2026, Phase 1 of the enterprise HRMS; the plan and his answers: the doc "RCL ERP – HR Enterprise Build")
* **A bank change waits for a second person** (`lib/act_bank.js`; his answer "बदल मंजुरीला जाईल"): the four bank details (bank, IFSC,
  account number, name as on bank) are never saved by the employee's page (`profSave`) or the employee sheet (`sheetImport`): the new
  details wait in `hr_bank_changes` and the OLD ones stay in use until the **HO HR or the Super Admin** approves – never the person who
  asked, never the employee himself (`bankList`, `bankDecide`; one or many at once; Approvals → Bank changes, and on the employee's
  Statutory & bank tab). The Super Admin's own change counts at once (as his salary decision does) and is written there too. A newer
  request replaces the one that waits. The employee is told by e-mail when it is asked, approved or refused (`lib/mail.js`, Resend; the
  last four digits only). The audit never holds a number. Before step 14 is run a bank detail cannot be changed (said plainly); every
  other detail is saved as before.
* **Nobody decides his own** (`lib/own.js`): his own day (`daySet`), his own request (`regDecide`), his own leave (`leaveDecide`), a
  Rule Book request about him or asked by him at the approval step (`askDecide`), his own salary (`salaryDecide`), his own attendance
  phone (`devRelease`), his own month's row (`monthVerify` – said in "skipped"). The Super Admin excepted, as for the salary.
* **The PAN is masked for an HR User** (`privGet` – `XXXXXX234F`; a box left masked keeps the number; the employee sheet gives him no
  PAN), like the Aadhaar and the bank numbers.
* **The database's own words go to the server's log only** (`lib/db.js`): the page gets "The HR database could not do this …".
* **The face: consent and erasure** – the consent words are the server's (`lib/consent.js`, English / मराठी / हिंदी, their version made
  from the words); the app shows them and sends `{ consent: { version, lang } }` with `faceEnrol`, written in `hr_face_consents`
  (asked for when `FACE_CONSENT_REQUIRED=true`). When an employee is relieved (`empExit`) his face is erased: the numbers of every
  registration of his are emptied, the registration pictures are removed from the store; the rows stay (who, when, who reset).
* **Punch photos: 90 days** (`lib/retention.js`, `api/jobs.js`, `vercel.json` crons – once a day): photos older than 90 days are removed
  from `hr-selfies`, except a day under a hold (`hr_selfie_holds`; the face panel of an employee: "Keep these photos" / "Release…",
  always with the reason) and a punch that still waits for review. The punch rows are never changed. Off until
  `SELFIE_RETENTION_ENABLED=true`. The words of the consent say "removed after 90 days": switch the job on before the consent is asked.
* **The phone's own key and the sealed server time** (with the app 3.134.0): `myAttend` gives `anchor_sig` (the server's seal of its
  time); an offline punch whose seal does not fit waits for review. Every punch carries the phone's own key; the server keeps its
  fingerprint (`hr_devices.key_hash`) and checks it once `HR_DEVICE_KEY_REQUIRED=true`.
* **`TRUNCATE`** is taken away from the "only added" tables (his live check showed Supabase's default).
* SQL: `sql/hr_step14_security.sql` – four new tables, one new column with a default, one index, one read-only function; nothing of
  today deleted or changed; safe to run twice. Play Integrity / App Attest (the phone's own proof) come in Phase 3 – they need his
  Google Play Console and Apple settings.

## Step 15 – the Employee Master, papers, onboarding, policies (18-11-2026, Phase 2 of the enterprise HRMS)
* **18 on the joining date** (`lib/rules.js` – `turns`, `adultOn`, `latestDob`): the 18th birthday is the birth date 18 years on (born
  on 29 February: 1 March); he joins on that day or later; no year is fixed in the code. An employee of today whose birth date and
  joining date are not changed keeps the check of before (18 today) – his record is never refused for the newer rule. A changed birth
  / joining date of an employee of today needs **the reason** (`change_reason` – written in the activity); the employee sheet does not
  change them (said per row).
* **New details** of the record (the profile's groups, the employee sheet's columns): city, state, PIN, the emergency contact, the
  territory, the employee's role, "Drives a vehicle for work" and the licence class; a **Restricted (optional)** group – caste – seen
  only by the HR Admin / Super Admin (like the pay details), never asked, never used to decide anything.
* **Papers** (`lib/act_docs.js`, `lib/step15.js`): each paper is *submitted → under verification → verified / rejected* (with why); a
  rejected one is "asked again" and a newer one is attached **in its place** (the old one stays, marked replaced); the day it was
  issued; a kind **not applicable** to a person (with the reason) is not asked of him. The papers a person needs: by his category, his
  driving licence also when he drives for work. **Papers to verify** (the web page): the HR Admin / Super Admin verify or reject the
  ticked ones – never their own. Every step is a row of `hr_doc_events` (only added). Two new kinds: caste certificate (restricted, the
  office only) and medical insurance.
* **Reporting managers with dates** (`lib/act_reporting.js`): the primary one is "Reports to" as today, kept with dates in
  `hr_reporting`; others (functional, administrative, project, site, other) are a record; history kept. The picker finds people by name,
  code, designation, department or site (any site of the sign-in) with their card and photo. Never himself, never one who left, never
  in a circle (A → B → … → A), never his own reporting.
* **Where he may mark** (`placeAccess`, `placeAccessSet`): a work place given to him by name has from / up to dates and IN / OUT / both;
  the punch looks only at the places allowed for it (the app 3.135.0 too). Saving a place's people again keeps everybody's dates.
* **Medical insurance** (`lib/act_insurance.js`): written by the office, verified by the HR Admin (never his own); a change goes back for
  verification; past its date it reads "expired".
* **Company policies** (`lib/act_cpolicy.js`, apart from the Rule Book): made, versioned and published only by the HO HR / Super Admin;
  a published version never changes; for everybody or some sites / categories / departments; a person accepts the version in force
  himself (the app's Me → Company policies, or at onboarding); who accepted which version when (`hr_cpolicy_accepts`, only added).
* **Onboarding by a link** (`lib/act_onboard.js`, `api/onboard.js`, `public/onboard.html`): the office makes a link for a new joiner
  (the Joining page; e-mailed to him, and shown once to copy); it works 7 days (1–30), for one person; only its fingerprint is kept; a
  new link kills the old one. He fills his details, attaches his papers (or says why he has none), verifies his e-mail with a 6-digit
  code, accepts the policies and submits. The HR Admin / Super Admin checks it: approve (the employee is made – his record, details,
  papers for verification, the bank details through the bank approval of step 14, his acceptances), send back to correct, or reject.
* **E-mail check and activation**: "Send the e-mail check" (a link to an employee's e-mail) verifies it; **Make active** (HR Admin /
  Super Admin) needs his date of birth (18 on joining), his e-mail verified and the papers he needs. Until then he works as today.
* SQL: `sql/hr_step15_employee.sql` – nine new tables, new columns with defaults (every row of today keeps working), the list of paper
  kinds made wider, the right to set a place's dates; nothing of today deleted or changed; safe to run twice. Until it is run, every
  page of today works exactly as before and the new pages say what to run.
* WhatsApp for the onboarding link, papers, policies and a reporting change comes with Phase 4 (the notification queue).

## Step 16 – attendance & compliance (18-11-2026, Phase 3 of the enterprise HRMS)
* **The seven-day document rule** (`lib/docrule.js`, `lib/act_docrule.js`; his answer: Staff only): a setting, not a number in the code
  (`hr_settings` "doc_rule" – the company's row "ALL" or a site's own): on / off, the days, the categories, the papers. **Off until the
  Super Admin turns it on** (Papers to verify → Seven-day rule). A person it applies to has until his joining date + the days; after
  that his "My HR" opens only his papers, his policies and his own record (`myHr`, `myDocs`, `myDocUploadUrl`, `myDocAdd`,
  `myDocLink`, `myPolicies`, `myPolicyAccept`, `myPolicyFile`, `langSet`) until they are there – or until the HR Admin / Super
  Admin lets him in up to a day (`docOverride` – the reason; never his own; `hr_doc_overrides`). The HR office's sign-in and the
  other categories are not touched. His app says on Home when the papers are due (`myHr.doc_rule`).
* **My work locations** (`myPlaces`, the app 3.136.0): where he may sign in / out today, IN / OUT, and a place given to him that does
  not count today with why.
* **A request that still waits is taken back** (`askCancel` – Approvals → "Take back"): a bulk correction file, an opening balance …
  nothing of it was applied; it reads "cancelled" with who and why. The bulk correction itself (export with the day codes, a look
  first, one reason, only in the employee's favour, a pay-locked month refused, approval by the Rule Book) is step 13's, unchanged.
* **The phone's own proof – Google Play Integrity** (`lib/integrity.js`, the app 3.136.0 on Android): off until `HR_INTEGRITY` is
  `record` (Google's answer is written with the punch) or `review` (a punch without a good answer waits for the HR Admin – never
  refused). Needs from him: the app linked to a Google Cloud project in the Play Console (`PLAY_CLOUD_PROJECT`), a service account
  key (`PLAY_INTEGRITY_SA` – a secret, only in Vercel), the app's signing certificate digest (`PLAY_CERT_SHA256`). iPhone (App
  Attest): not built – it needs the Apple Developer account.
* SQL: `sql/hr_step16_attendance.sql` – one new table (`hr_doc_overrides`); nothing of today deleted or changed; safe to run twice.

## Step 17 – notifications (18-11-2026, Phase 4 of the enterprise HRMS)
* **One queue for every message** (`lib/notify.js`, `hr_notify_queue`): WhatsApp, e-mail and the app's own list ("Notifications" in the
  app 3.137.0). A message is never made twice (its dedupe key); a fault is tried again after 5, 30 and 120 minutes, then "failed".
* **WhatsApp** (`lib/whatsapp.js`, Meta's Cloud API, template messages) only for his kinds: the **shift reminders**, the **joining
  link**, **papers pending / running out**, a **policy to accept**, a **reporting change** – each only when its template (approved by
  Meta) is set in `HR_WA_TEMPLATES`; otherwise e-mail. Everything else: the app and e-mail.
* **Shift reminders**: four a shift by default (15 minutes before, at, 15 and 30 minutes after the start), set per site on the
  Notifications page; none once he has signed in, none on his weekly off or a holiday.
* **Daily**: a paper running out (30, 7 and 0 days before), papers missing under the seven-day rule, a mandatory policy not accepted
  (every 7th day). **At once**: the joining link (also WhatsApp), a policy published (everybody it is for), a reporting change (the
  person and the new manager), a paper rejected.
* **The timer**: `/api/jobs?job=notify` every 5 minutes by Supabase's own timer (`sql/hr_step17b_timer.sql` – pg_cron + pg_net, the
  address and `CRON_SECRET` in Supabase's Vault); Vercel's own timer runs at most once a day on the Hobby plan.
* **WhatsApp's word** (`api/wa-hook.js`): delivered / read / failed – only with Meta's signature (`WHATSAPP_APP_SECRET`).
* **The Notifications page** (Organization): the switches, the site's shift reminders, every message with how it went (addresses
  masked), "Send again" / "Cancel".
* **Off until switched on**: `HR_NOTIFY_ENABLED=true` (while off only the app's own list gets messages – nothing piles up to go out
  later); WhatsApp also `HR_WHATSAPP_ENABLED=true`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `HR_WA_TEMPLATES`; the site's reminders on
  the Notifications page.
* SQL: `sql/hr_step17_notify.sql` – two new tables; `sql/hr_step17b_timer.sql` – optional, the timer. Nothing of today changed.

## Step 18 – payroll, Phase 5 of the enterprise HRMS (18-11-2026)
Beside the payroll of steps 11–12, which stays exactly as it is (a person without a structure, LWF or TDS is paid as before).
* **Salary structures** (`lib/act_payx.js`, Payroll → Structures): Basic, HRA, … as a % of the earned pay; versions from a date; a
  version counts only after ANOTHER person of the HO HR (or the Super Admin) approved it. A person is given a structure, LWF and a
  monthly TDS in the pay sheet (Set…). The payslip shows the parts.
* **The statutory numbers** stay the dated pay settings – new, all optional: PF on the Basic, the employer's shares (EPF / EPS / EDLI
  / admin, ESIC – EPS is taken out of the employer's whole PF %), LWF (amounts, months), gratuity (days, divisor, years) and the
  **source** of every version; the **CA's check** of a version is written (who, when, what). No number is in the code.
* **Release & payment**: a locked payslip is Approved → Ready to pay → Paid (bank / cash / cheque / UPI, reference, day); or Held
  (back to Approved first) / Rejected. Only added rows – a paid one never moves.
* **Full & final** for a relieved person after his last month is locked: the lines the ERP can work out (unused leave when the month
  did not pay it, gratuity from the settings, the advance left, notice), each changeable until checked; made → checked → approved →
  paid by three different people (the Super Admin excepted).
* **Registers** (salary, PF, ESIC, PT, LWF, TDS, payments, F&F) on the screen and as Excel; an HR User sees UAN / ESIC numbers masked.
* **Compare**: the file of the present method beside the ERP's month, line by line – two months before the ERP is used alone.
* SQL: `sql/hr_step18_payroll.sql` – six new tables, three new columns of `hr_pay_emp` with defaults. Nothing of today changed.

## Add employee – one form of 8 steps (18-11-2026, asked: "employee add krtana document upload sagle kahi")
Who (with father's / husband's name) · Work (with employment type) · Contact (with city, state, PIN, emergency contact) → **Save &
continue** makes the employee, and the SAME form goes on: Bank & PF (waits for the HO HR's approval) · Reporting · Work place ·
**Documents (attached here)** · Insurance + Activate. Each step can be skipped and filled later on his page; "Change" keeps the 3 steps
of before. Only the actions of his page are used (`public/addemp.js`) – nothing new on the server, no SQL.

## Import in steps (18-11-2026, asked: "excel khup mothi aahe … basic ekasath ghe nantr kyc … step by step … drop down")
Employees → Import: five small Excel files instead of one of 80 columns – **1 Basic** (adds the new people), **2 KYC & address**,
**3 Bank & PF** (a bank change waits for the HO HR), **4 Job details**, **5 Pay** (HR Admin / Super Admin). Each file (ExcelJS,
`public/empsheet.js`): its columns only, drop-downs for every choice (gender, designation, department, the HR lists, Yes / No), a note
on every heading (what to fill + example, English and मराठी), red = compulsory, long numbers kept as text, and a "How to fill" sheet.
Steps 2–5 come filled with the site's employees (code + name). The same Import reads them: the server refuses a row of steps 2–5
whose code is not an employee of the site, and a step file never changes a name (`sheetImport` part). The full sheet stays.

## Phase 6 – reports and the manager's dashboard (18-11-2026; no SQL step)
* **Reports** (HR Management → Reports, `lib/act_reports.js`, `public/reports.js`): 25 reports of the site – employees (list,
  joined, left, headcount, birthdays / anniversaries, who reports to whom), papers (missing, running out, waiting to be verified,
  policies not accepted), attendance (a day, the month's summary, late, early, absent, overtime / comp-off, correction requests,
  punches waiting for review, manual entries, phones), leave (balances, requests), pay (locked months, advances, salaries approved).
  Filters: period / day / month, category, department. On the screen, as Excel, as PDF (the browser's Print → "Save as PDF").
* **Who sees which** (the server checks every run): an HR User – no Admin and no pay report, mobile numbers masked; an HR Admin – +
  the manual entries and the phones; the HO HR / Super Admin – + the pay reports. An employee: none. One audit line a report.
* **My team** (`myTeam`, the app's Me → My team, app 3.139.0): a reporting manager's own team only – today (in, late, on leave, not
  marked, off), this month's counts, what waits for him, papers missing. Read only.

## Step 19 – AI, Phase 7 of the enterprise HRMS (18-11-2026)
* **One door** (`lib/ai.js`) for Anthropic or OpenAI – chosen in Vercel: `HR_AI_ENABLED=true`, `HR_AI_PROVIDER`, `HR_AI_MODEL`, the
  provider's key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`), `HR_AI_PRICE` ({"in", "out"} USD a million tokens), optional
  `HR_AI_MONTHLY_USD` (the month's limit). OFF until set.
* **Every call logged** (`hr_ai_runs`): who, what for, provider, model, tokens, cost, time, ok / why not – never the question, the paper
  or the answer. The AI assistant page (Organization) shows them and this month's cost.
* **What it does** (`lib/act_ai.js`, the AI assistant page): reads a PHOTO of a paper waiting to be verified and shows what it read
  beside the record (HR Admin; nothing saved, the paper stays "submitted"); answers a question only from this site's published company
  policies; **checks** to look at (one phone used by several people, many punches to review, many hand entries, a bank change asked
  twice, a big salary change – plain rules, no AI call).
* **Never**: it approves or changes nothing – pay, bank details, faces, attendance (a unit test checks that the AI actions write nothing).
* SQL: `sql/hr_step19_ai.sql` – one new table, only added. Nothing of today changed.

## Tests
`timeout 120 node --test test/unit.test.js` – no real database, no network (the Portal's key and a stand-in of the database are
made in the test).
`timeout 120 node --test test/api.test.js` – the actions on a REAL database: only the local test rig (PostgreSQL + PostgREST with
`sql/` applied to a scratch database, `HR_RIG_URL`, default `http://127.0.0.1:3140`), made-up people. Never a live database.
`timeout 240 node test/rig/security_step14_page.js` – (step 14) the new screens in a browser against the local rig only.
`timeout 300 node test/rig/payroll_step18_page.js` – (step 18) the payroll page's new parts in a browser against the local rig only.
`timeout 240 node test/rig/reports_page.js` – (Phase 6) the Reports page per role in a browser against the local rig only.
`timeout 240 node test/rig/ai_page.js` – (step 19) the AI assistant page with a stand-in provider on this computer – never a real one.
`timeout 300 node test/rig/security_sweep.js` – (Phase 8) every action through the real door: no sign-in 401, an employee 403 on office actions.
`timeout 600 node test/rig/perf.js` – (Phase 8) the heavy pages with 300 made-up people and a month of attendance (fails over 10 s).
`timeout 300 bash tools/recovery_drill.sh` – (Phase 8) the rig's database copied out and restored into a scratch one, every table compared.
`timeout 300 node test/rig/import_steps_page.js` – (18-11-2026) the Import in steps: Step 1 added, Step 2 filled in, drop-downs and notes read.
`timeout 240 node test/rig/addemp_page.js` – (18-11-2026) Add employee in one form of 8 steps, a paper attached while adding.
**Going live (Phases 2–8): `docs/HR_GO_LIVE.md`** – the PRs in order, the SQL steps, the Vercel switches, the role matrix, backup and
recovery, what was checked, what was not, and the acceptance checklist.


## The product's name – "Sketchline Lion", from the Portal (14-11-2026)
Asked 14-11-2026 (the app and the web are "Sketchline Lion"; the Super Admin changes the name in the Portal, not in the code): the
page's title and the line "by …" show the name the Portal's "Branding" keeps (`/portal/api/brand`, asked once when the page opens,
written as text); the built-in "Sketchline Lion" until it answers. Nothing else of the page is changed; the papers are headed as before.


## The main address is lion.sketchline.si (17-11-2026)
Asked 17-11-2026 ("lion.sketchline.si he chalu karayche main he asel"; previously sketchline.in, 15-11-2026): the two messages that
name the address (the Portal link that is missing; an Excel file read only inside the ERP) say `lion.sketchline.si`. Nothing else is
changed – HR works at whichever address it is opened; `PUBLIC_URL` (`https://lion.sketchline.si/hr`) / `PORTAL_URL`
(`https://lion.sketchline.si/portal`) in Vercel are the owner's to change.
