# HR – how to use it (the guide the "Ask" button answers from)

This is the user guide of the HR module (HRMS & Attendance) of the company's ERP. It describes what each person can do and
where. It holds NO data of any person or site. Keep it in step with the screens: a change of a page or a rule changes this guide in
the same piece of work.

## 1. Where HR is and how it opens
* HR opens from the ERP's menu ("HR") or from the Portal's dashboard. Nobody signs in to HR itself: the Portal's sign-in is used,
  and HR renews it by itself every 10 minutes while the page is open.
* On top: the three lines (open / close the menu), "Back", the search box ("Search a page, an employee, an action…" – also
  Ctrl K), the site chooser, the language chooser (English / मराठी / हिंदी – for the web, for that person only), his name and
  role, "‹ ERP" (back to the ERP of the site), "‹ Portal" (the other modules and sites), "Log out" (ends the sign-in here and in the
  Portal), and "Ask" (this help).
* The menu on the left, in groups: Dashboard; HR Management – Employees, Joining, Papers to verify, Attendance, Leave, Muster,
  Requests, Approvals, Reports; Organization – Departments & designations, Lists, Rule Book, Notifications, AI assistant,
  Work places, Phones; Payroll – Payroll, Month verification. A person sees only the pages he may open. A number beside a page
  = work waiting there.
* **Site chooser:** the sites where the person has HR (the sites are the Portal's – HR makes none). **"All sites"** (for a person
  with HR on two or more sites): Dashboard, Employees, Attendance, Muster, Leave, Requests and Approvals of every one of his sites,
  one under the other; each part works exactly as on that site.
* A save shows "Saving…", then "Saved". An error stays on the page and nothing is saved.
* "The sign-in ended" / "You no longer have HR on this site": open HR again from the Portal; if it repeats, the Super Admin has to
  give HR on that site (Portal → Users & Access).

## 2. Who is who (roles)
* **Super Admin** – does everything on every site; gives access in the Portal; makes the Rule Book policies; gives or takes the
  HR Admin's powers per site; opens a closed month again.
* **HO HR** – a person the Super Admin marked as HO HR (Head Office HR): sees every site of his sign-in for the month's approval,
  salary approvals, Payroll, bank-change approvals, company policies, all 25 reports. Given by the Super Admin in HR → **Month
  verification → HO HR → Give HO HR** (the e-mail he signs in with); in the Portal he also needs HR on every site he is to see.
* **HR Admin (of a site)** – runs HR of his site: employees, work places, phones, shifts and rules (when he has those powers),
  papers to verify, activation, sign-ins of employees, manual entries and corrections, month verification. What he may do is set by
  the Super Admin in **Rule Book → HR Admin's powers**:
  Work places and projects · Release a phone · Decide doubtful punches · Shifts, holidays and the rules · Manual entry (a day
  without a punch) · Correct a day that has punches · Decide requests (regularization) · Verify the month's attendance · Propose
  an employee's salary · Give a sign-in to every employee at once (this last one is OFF until the Super Admin gives it).
  Message "The Super Admin has not given the HR Admin this power on this site (…)" = ask the Super Admin to switch that power on.
* **HR User (of a site)** – works on the HR pages of his site. The Super Admin can give him each page as **Edit / View / No
  access** (Portal → Users & Access → ⋯ → View details → Pages… → HR). Not given = as before (the page with everything an HR User
  has). No access = the page is not in his menu and its actions are refused ("You do not have access to X in HR. Ask the Super
  Admin."). View = he reads it but cannot change it ("You have View access only for X in HR. Ask the Super Admin for Edit
  access."). An HR User never sees salaries, bank lists, pay papers; Aadhaar, PAN, PF / UAN / ESIC / bank numbers are masked for him.
* **Reporting manager** – an employee others report to: he sees "My team" in the phone app and, when the rules say two levels,
  decides his team's requests and leave first.
* **Employee ("My HR")** – a person who uses HR only for himself, in the phone app: his own attendance, leave, requests, papers,
  policies, salary slips, notifications. The HR web pages are for the HR office: an employee who opens them is told "Your
  attendance is marked in the phone app".
* **Site HR vs HO HR:** a site's HR is its HR Admin / HR User (given in the Portal per site). HO HR is the extra mark the Super
  Admin gives in HR. Giving HR roles is done ONLY by the Super Admin in the Portal (Users & Access → the person → his site × HR →
  User or Admin).

## 3. Employees (HR Management → Employees)
* The list of this site: search, Status, Category; columns include Active from (joining), Relieving date and – for the HR Admin
  and Super Admin – **Sign-in** (Given / Not given / Switched off). A press on a person opens his page.
* **+ Add employee** (a full page): name, employee code (made by itself – RCL001, RCL002 … – or typed; never another's), date of
  birth, mobile and/or e-mail, department, designation (the designation carries the category: Staff, Operator, Driver or Labour),
  site, joining date … A mobile number and an e-mail belong to ONE employee only. Under 18 on the joining date is refused.
* **Status:** Incomplete (date of birth, or both mobile and e-mail missing) → Complete (shown "Complete") → Active (after "Make
  active") → Relieved.
* **His page:** the head (photo, code, status, how full his profile is) with the buttons **Change · Transfer · Sign-in · Salary ·
  Face · Relieve · Delete**; then Overview (work, contact, history, attendance, documents & KYC, "Still to do") and the tabs of the
  full profile – Profile, Job, Statutory & bank, Pay details, Family, Education, Experience, Skills (each tab says how many
  compulsory details it still misses). "Not available" tick under a name / number / date box = kept as NA and counts as filled.
* **Transfer…** (HR Admin) – to another site of his sign-in, from a date, with a note; the history keeps the old site.
* **Relieve…** – his relieving date; he stays in the records (attendance and papers are never deleted); his face is erased.
* **Delete…** (HR Admin / Super Admin, with the reason) – ONLY an employee added by mistake; refused while he has attendance, a
  phone, papers, KYC or people reporting to him – then relieve him instead.
* **Import / Export (Excel):** one format in and out (the company's sheet columns, then mobile, e-mail, date of birth, gender,
  designation, department, Aadhaar, addresses, profile, PF / ESIC / bank, and last "HR ID (do not change)"). Import = add or change:
  a new row (no HR ID, a new code or no code) adds him – **a new employee needs a mobile or an e-mail**. First a check that saves
  nothing; faulty rows come back with their line and why; the good ones are saved. Pay details and secret numbers are read / written
  only for the HR Admin / Super Admin. At most 1000 rows.
* **Changing many employees at once (also the Employee Code or the name):** Employees → **Export Excel** → change the cells in Excel
  (code, name, mobile, designation, any detail) → Employees → **Import Excel** → choose that same file. The check lists, employee by
  employee, **what will change** ("Employee Code RCL001 → RCL101", "Employee Name: … → …") and how many stay the same → **Save N
  employees**. Only what differs is saved; an empty cell changes nothing. Keep the last column "HR ID (do not change)" as it is – it
  ties each row to its employee (that is why his code can change). A code that belongs to another employee is refused. A changed
  date of birth / joining date asks one reason for the file ("Why do the dates … change?"). A row without the HR ID (an older file,
  a step file) is found by its Employee Code. One employee: his page → **Change** (code, name and the rest).
* **Departments & designations** (Organization): two lists side by side – add, edit, switch off, delete (only a name nobody has
  or had); "Add the usual construction list". A designation says its category.
* **Lists** (HR Admin): every pick-list of the profile, and which details are compulsory for "profile complete".
* **Reporting managers:** on his page – "Reports to" (the primary one, with dates) and others (functional, administrative,
  project, site). Never himself, never one who left, never a circle.

## 4. Employees' sign-in for the phone app
* An employee signs in with his **e-mail or his mobile number** and a password. He gets "My HR" on his site – nothing else.
* **By itself:** an employee added, imported or approved from a joining link **by the HR Admin or the Super Admin** gets his
  sign-in at once. The first password = his first name with a capital first letter, then @1234 (for example Ramesh@1234) – a
  one-time password: he sets his own at the first sign-in. Nobody's existing password is changed.
* An **HR User's** new employee: the HR Admin gives the sign-in from the employee's page ("Sign-in…").
* **"Sign-in…"** on his page (HR Admin / Super Admin): gives it, or a **new one-time password when he forgot his** (shown only
  once – tell it to him yourself; it is kept nowhere).
* **"Give sign-in to all"** (Employees page): the Super Admin, or an HR Admin given that power – every employee of the site who
  has none yet.
* Sign-in "Not given" after an import: press "Give sign-in to all" (or "Sign-in…" on his page). It cannot be given when: he has
  neither e-mail nor mobile; the person already has other work in the ERP (another module – then the Super Admin adds "My HR" in
  the Portal); he is the Super Admin; his Portal user is switched off.
* **Other modules for an employee** (Machinery, Store, Purchase, Engineering, HR office pages): only the Super Admin gives them
  in the Portal → Users & Access (per site, per module: User / Admin; and per page with "Pages…").

## 5. Attendance in the phone app (what the employee does)
* Install the app once (Portal → "Download the Android app"); updates come inside the app (a pop-up "Update" / "Close" – the work
  can go on while it updates).
* Sign in → Home (the dial of his shift) → slide / press to mark **IN**, later **OUT**. Every punch takes his place (GPS) and a
  photo (selfie). **Today only** (the server's clock decides the day). One IN and one OUT a day when the rules say so.
* Rules of a punch – refused, nothing saved:
  * **outside his work places** ("You are outside your work place (X – N m away)") – go inside the place;
  * **no work place set** for him ("No work place is set for you yet") – the HR office gives him one (Work places);
  * **location off / not exact** ("switch on Location"; "not exact enough yet – stand in the open for a moment");
  * **Developer Options ON** – switch them off (Settings → Developer options) – this blocks only HR attendance;
  * **a made-up location** (fake GPS app) – remove it;
  * **another phone** – "Your attendance is tied to another phone. Only the HR Admin can release it" (see Phones);
  * **this phone is tied to another employee** – the HR Admin releases it first;
  * "You are already IN since …" – mark OUT; "IN after IN / OUT without IN" are refused;
  * "Your employee record is not complete (date of birth, e-mail, mobile)" – the HR office completes his record;
  * "Your sign-in (…) is not in the Employee Master" – the HR office puts his e-mail or mobile (exactly as his sign-in) on his record;
  * "Your sign-in fits N employees" – the same e-mail / mobile is on several records; the HR office keeps it on one only.
* **No network:** the phone keeps the punch exactly as taken and sends it later by itself (never twice). Doubtful ones (clock
  changed, phone restarted, older than 72 hours) wait for the HR Admin (Attendance → to be looked at).
* **Forgot OUT:** at the shift's "auto out" time the day is closed by itself and reads absent (MIS / A) – he sends a **request**
  for that day from the app; it counts when approved.
* **One phone a person:** the first punch ties his phone; only attendance is tied to it (other modules work on any phone).

## 6. The face
* Set per site in **Rule Book → Face & requests** → "The face at every attendance": **Not asked – the photo is proof only**, or
  **Needed – no attendance without the registered face**; "at least so much must match, percent" (empty = 90); "Counts from"
  (empty = today). This is ONE setting for the whole site. To switch the face off for everybody: choose "Not asked" and save.
* The employee registers his face **once** in the app: he reads and accepts the consent, then takes five pictures (front, then
  turning his head a little). Tips for "no face was found in the picture": good light on the face (not a window behind him), the
  whole face in the frame, only one person, the head turned only a little, the phone at eye height, a clean camera.
* At every punch the selfie is compared with the registered face: "Not marked: the face does not match the registered face of
  … (N % – at least M % is needed)" – take it again in good light; if it keeps failing, the HR Admin resets the face and he
  registers again.
* **Reset** (HR Admin / Super Admin): employee's page → **Face** → "Reset the face…" with the reason → he registers again in the app.
  "Your face is registered already" = it must be reset first.
* Punch photos are kept 90 days (longer under a hold: the face panel → "Keep these photos").

## 7. Work places, phones (Organization)
* **Work places** (HR Admin with that power / Super Admin): where attendance can be marked – a point + metres (20–5000), an area
  drawn on the map, or along the road with metres each side; for everybody, some categories, some departments or chosen people;
  from a date; On / Off; one by one, many at once, or from a file. Three views: the places · **by place** (who may mark there;
  press the number for the list) · **by person** (where each one may mark; "No place – cannot mark" in red; **Change** = tick his
  places). A place given to a person by name has from / up to dates and IN / OUT / both.
* **A person of this site working at another site's place** (e.g. a VTR man at Head Office): Work places → By person → Change →
  choose the other site, tick its places, write why. His attendance stays his own site's.
* **"Anywhere" – a person who may mark attendance from any place** (Head Office staff, people who travel): Work places → By person →
  **Change** → tick **Anywhere**, "up to" a date (empty = no end), write why → **Save "Anywhere"** (the HR Admin with the power "Work
  places and projects", or the Super Admin; never for himself). His line then says "Anywhere". No work place is asked of him – his
  GPS and selfie are still taken (the Attendance page shows the punch as "Anywhere"), the face where the site asks it, one phone,
  Developer Options / made-up location still refused. The phone app needs no update. To take it back: untick, write why, Save.
* **Phones** (HR Admin with that power / Super Admin): the phones tied to attendance, and tries from other phones. **Release** the
  old phone (with the reason) – then his new phone works at the next punch. Nobody releases his own.

## 8. Shifts, holidays, rules, Rule Book (Organization → Rule Book)
* The Rule Book is the ONE place of every rule. Its row of parts: **Policies · Shifts & holidays · Face & requests · HR Admin's
  powers · Company policies.**
* **Shifts & holidays:** a shift from – to (also over midnight), break, "auto out" time, for everybody / categories / departments /
  chosen people – the most exact one wins for a person. Each site has its own shifts; a shift shown at a site belongs to that site –
  removing it there does not touch another site. Two shifts "for everybody" of the same site from the same date confuse the late
  marks – keep one. Holidays: one, or a list.
* **Policies** (made only by the Super Admin): Attendance, Late & early, Weekly off, Leave, Comp-off, Overtime – each with
  versions from a date and who verifies / approves. The HR Admin of a site, the HO HR and the Super Admin give a policy to the
  site (everybody) or to chosen people, from a date. **Until a policy is given, nothing changes.** Every policy belongs to its own
  site (HO's for HO, VTR's for VTR …).
* The rules are dated: a day is always measured with the rules and the shift of THAT day. A rule left empty is not applied.
  Rules for days already gone: only the Super Admin.
* **Face & requests:** the face (section 6) and "Who decides a request": the HR office, or first the reporting person then the HR office.
* **Company policies:** see section 13.

## 9. Attendance, Muster, Requests (HR Management)
* **Dashboard:** today at a glance – at work now, present, late, not marked, absent of yesterday, on leave, arrivals by half hour,
  who is at which place, the last 7 days, "Needs you" (requests, doubtful punches, tries from another phone …), quick actions.
* **Attendance:** every punch of a day as taken, with its photo and place; the doubtful ones to accept or refuse (a new row – the
  punch stays).
* **Muster:** the month of everybody; a day's code – **P** present, **HD** half day, **A** absent, **WO** weekly off, **H**
  holiday, **WOP / HP** worked on a weekly off / holiday, **IN** at work now, **MIS** IN without OUT on a day gone, **L** present but
  late, **LV** leave. A press on a day opens it on the right: its punches and places, and (with the power) **set the day**: a manual
  entry (no punch – e.g. labour without a phone) or a correction – always a NEW row with the old and new times, the reason, who and
  when; the punches are never changed. The HR Admin: up to 60 days back; the Super Admin: any day. Nobody sets his own day.
  CSV / Excel of the month.
* **Requests:** an employee asks from the app to set a day gone right (forgot OUT, no network, worked at another place …). The HR
  office approves or refuses with the reason (with two levels: first his reporting person). Approved = the day's new entry.
* Late / half day: by the site's rules and the Late & early policy (for example so many late days a month free, each later one a
  half day) – all settings, nothing fixed.

## 10. Leave (HR Management → Leave)
* The leave policy is ONLY in the **Rule Book → Leave** (made by the Super Admin, given to the site or to people, with its date):
  how leave is earned, carry on or lapse, an absent day, who verifies and who approves. A site that gives no Rule Book leave policy
  still counts by its leave policy of before – shown there in the Leave part. "No leave policy is set for your site yet" = the
  Rule Book has none for him.
* Two balances – Paid leave and Comp-off – shown and used as one (Comp-off days are taken first). A weekly off or holiday never
  takes a leave.
* The employee asks in the app: today or a day to come (up to a year ahead); a day gone is set right with a request instead.
  **Every leave is asked with its paper** (a photo or a PDF) – without one it is not sent; his last paper is never removed by him.
* He sees where his request stands and **who it waits for** (the reporting person by name, the Site HR Admin, the HO HR, the
  HR office), and its **history** (asked, verified, approved, refused, made shorter, made longer, changed or deleted by the HR office).
* He **deletes** his own request while it waits. He makes a leave **shorter** at once (waiting or approved; only days from today on –
  a day gone is the HR office's). **Longer**: the extra days are a new request with its reason and paper that waits for approval;
  the days approved stay approved.
* **On a day of his leave (approved or waiting) he cannot mark IN**: the app says so and offers "Change days" – he makes the leave
  shorter, then marks IN. A weekly off or holiday inside a leave is no leave day.
* The Leave page: **Requests** – Waiting / Approved / Refused / Deleted / All; for each: who it waits for, **History**, Papers;
  Approve, or refuse with the reason. **Change** and **Delete** (with the reason; a waiting or an approved leave) are for the Site
  HR Admin (with the power "Decide requests"), the HO HR and the Super Admin – not an HR User, never for his own. **Tick** leaves
  (or "Select all") and **Delete** them at once with one reason. **Balances** of everybody; adding or taking days by hand: with
  the reason; **tick** people (or "Select all") → **Make the balance 0** – the whole balance taken off at once with one reason (kept
  in the record; days can be added back). The Super Admin sees every site's: the site switch → "All sites".
* **Approvals** page: overtime and comp-off of a month (found from the muster, counted only after verify and approve), a bulk
  correction of a month from Excel (only in the person's favour), opening balances of many people from one sheet, extra leave,
  bank changes (HO HR / Super Admin).

## 11. The month (Payroll → Month verification)
* After the month's last day the **HR Admin** (power "Verify the month's attendance") ticks people and verifies them – not a person
  with an MIS day or a waiting request (set those right first). A day changed later shows "Changed since verified" – verify again.
* The **HO HR** sees every site, sends people back with the reason, or approves the site's month when everybody is verified. Then
  no day of that month changes; only the Super Admin opens it again (with the reason).
* **Salary approvals** tab: salaries proposed on employees' pages wait here for the HO HR.

## 12. Salary and Payroll (HO HR / Super Admin; web only)
* **Salary…** on the employee's page (HR Admin with the power / Super Admin): a month's salary or a day's rate, the amount, from
  which date → waits for the HO HR (never the person who proposed it). Seen only by the HR Admin of the site, the HO HR and the
  Super Admin.
* **Payroll:** a site's month after its attendance is approved – counted from the verified days and each person's approved salary;
  **Set…** per person: PF / ESIC / Profession Tax, another earning / deduction with its note, the advance; **Lock** (then never
  counted again – a mistake is set right next month); **Payslip** of a locked month; **Bank list** (Excel). Salary structures (made
  and approved by different people), PF · ESIC · PT settings with their date and the CA's check, release → ready → paid, full &
  final, registers, compare with the present method.
* The employee sees his payslips in the app (Me → Salary slips).
* **Bank details** change only through approval: the new details wait for the HO HR / Super Admin; the old ones stay in use until
  approved; the employee is told by e-mail.

## 13. Papers, joining, policies, activation
* **Documents** (employee's page → Documents & KYC; the employee too, in the app → Me → My documents): photo, Aadhaar, PAN,
  education, driving licence, bank passbook, last salary slip, experience letter, medical insurance, other – JPG / PNG / WebP / PDF
  up to 10 MB. Each paper: submitted → verified / rejected (asked again – a new one in its place) / not applicable (with the reason).
* **Papers to verify:** the HR Admin / Super Admin verify or reject the ticked papers – never their own.
* **Seven-day rule** (Super Admin, Rule Book; off by default; Staff): a late person's app opens only his papers, policies and record
  until his papers are there or the HR Admin lets him in.
* **Joining:** "New joining link" – the joiner's name, category, mobile, e-mail … and how many days the link works (7 by
  default). It is e-mailed and shown once to copy (send it on WhatsApp yourself). He fills his details, attaches papers, verifies
  his e-mail with a code, accepts the policies and submits. The HR Admin / Super Admin approves (the employee is made), sends it
  back to correct, or rejects.
* **Activation:** "Send the e-mail check" (a link to his e-mail) and **Make active** (HR Admin / Super Admin) – needs his date of
  birth (18 on joining), his e-mail verified and the papers he needs.
* **Company policies** (Rule Book → Company policies): made, versioned and published by the HO HR / Super Admin, for everybody or
  some sites / categories / departments; each employee accepts the version in force in the app (Me → Company policies).

## 14. Notifications, Reports, AI assistant
* **Notifications:** the messages to employees (app, e-mail, WhatsApp when switched on): shift reminders, joining link, papers,
  policies, reporting changes – sent, waiting, failed (retry / cancel). Switched on by the Super Admin's settings.
* **Reports:** 25 reports with filters (site, dates, people …), on the screen, as Excel or PDF. Each role sees its own: an HR
  User no Admin or pay report (mobiles masked); the HR Admin also manual entries and phones; the HO HR / Super Admin also pay.
* **AI assistant** page: questions about the published company policies, reading a paper's photo beside the record (HR Admin),
  checks to look at. AI only reads and suggests – it never approves or changes pay, bank, faces or attendance.

## 15. Messages and what to do
* "This is for the HR office only." – an employee ("My HR") tried an office page: he uses the phone app.
* "You do not have access to X in HR" / "View access only" – the Super Admin changes his pages (Portal → Users & Access → Pages…).
* "Only the HR Admin or the Super Admin can do this." – ask the site's HR Admin.
* "The Super Admin has not given the HR Admin this power on this site" – the Super Admin switches it on (Rule Book → HR Admin's powers).
* "The HR database is not set up yet" / "… runs sql/hr_stepN… once" – a setting step for the Super Admin.
* "AI is not switched on for HR" – the Super Admin's Vercel settings.
* "HR did not answer – try again." – a network moment: try again; if it repeats, tell the Super Admin with a screenshot.
* Anything that looks wrong (a number, a missing person, a page that does not open): tell the Super Admin with a screenshot and the
  time it happened.
