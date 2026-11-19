/* (19-11-2026, asked: "site hr admin nasel ok to user asel ani tyala pages wise access deta yawa"; his answers: given in the Portal →
 * Users & Access → Pages, like Mechanical / the Store; Edit / View / No access) AN HR USER'S PAGES.
 *   The Super Admin gives an HR User (never an HR Admin, never the Super Admin) each page of HR as Edit / View / No access; the Portal
 *   keeps it on his access line and writes it into his ticket (as the Store's pages) – for this site and for each of his HR sites
 *   ("All sites"). NOTHING GIVEN (no pages at all, or a page not named) = as before: the page with everything an HR User had.
 *   The check is HERE, at the one door of every action (api/hr.js, api/face.js) – hiding a page in the menu is only for the eye:
 *     No access → the page's actions are refused; View → only its reading actions.
 *   Never touched: his own things ("My HR": his attendance, leave, papers, policies, notifications, his team's requests – SELF), what
 *   every page needs to work (ANY), and the actions an HR User never has anyway (OWN: the HR Admin's / HO HR's / Super Admin's own
 *   checks stay as they are). Every action of HR is in exactly one place here (the unit test says so). */
'use strict';
const { fail } = require('./http');

// the pages, as the Portal lists them (key, name, View only?) – the Rule Book with its parts (Shifts & holidays, Face & requests,
// HR Admin's powers, Company policies); the menu's own page keys map to them (PAGE_OF)
const PAGES = [
  { key: 'dashboard', name: 'Dashboard', view: true },
  { key: 'employees', name: 'Employees' },
  { key: 'joining', name: 'Joining' },
  { key: 'papers', name: 'Papers to verify' },
  { key: 'attendance', name: 'Attendance' },
  { key: 'leave', name: 'Leave' },
  { key: 'muster', name: 'Muster' },
  { key: 'requests', name: 'Requests' },
  { key: 'approvals', name: 'Approvals' },
  { key: 'reports', name: 'Reports', view: true },
  { key: 'rulebook', name: 'Rule Book' },
  { key: 'notices', name: 'Notifications' },
  { key: 'ai', name: 'AI assistant', view: true },
  { key: 'places', name: 'Work places' },
  { key: 'phones', name: 'Phones' },
  { key: 'month', name: 'Month verification' },
];
const PAGE_OF = { rules: 'rulebook', rface: 'rulebook', rpowers: 'rulebook', cpolicies: 'rulebook' };      // a part of the Rule Book

// every action of a page: [reading, changing]
const MAP = {
  dashboard: [['attDash', 'hrComing'], []],
  employees: [['empList', 'empGet', 'empPage', 'empAround', 'empExport', 'privGet', 'docList', 'empPhotos', 'signinPeople', 'sheetCols', 'sheetExport', 'profGet', 'insGet', 'repPick', 'repGet', 'salaryGet', 'faceInfo', 'holdList'],
    ['empSave', 'empTransfer', 'empExit', 'empDelete', 'privSave', 'docUploadUrl', 'docAdd', 'docLink', 'docRemove', 'signinLinked', 'empImport', 'sheetImport', 'emailCheckSend', 'empActivate',
      'profSave', 'profRowSave', 'profRowRemove', 'insSave', 'insVerify', 'repSet', 'repEnd', 'salaryAsk', 'faceReset', 'holdSave', 'holdRelease']],
  joining: [['invList', 'invGet'], ['invMake', 'invResend', 'invCancel', 'invDecide']],
  papers: [['docQueue', 'docEvents', 'docRuleGet', 'docRuleList'], ['docTake', 'docVerify', 'docNa', 'docRuleSave', 'docOverride', 'docOverrideEnd']],
  attendance: [['punchDay', 'punchSelfie'], ['punchReview']],
  leave: [['leaveList', 'leaveBalances', 'leavePolicy'], ['leaveDecide', 'leaveAdjust', 'leavePolicySave', 'leaveEdit', 'leaveRemove', 'leaveRemoveMany', 'leaveZero']],
  muster: [['muster', 'dayGet'], ['daySet']],
  requests: [['regList'], ['regDecide']],
  approvals: [['askList', 'extraFind', 'leaveLedger', 'attImports', 'leaveFiles', 'leaveFileUrl'],
    ['askDecide', 'askCancel', 'extraAsk', 'leaveOpening', 'leaveCreditAsk', 'attImport', 'leaveFileAdd', 'leaveFileLink', 'leaveFileRemove']],
  reports: [['repCatalog', 'repRun'], []],
  rulebook: [['rbList', 'rbPeople', 'cpList', 'cpFileUrl', 'cpAccepts'],
    ['rbSave', 'rbClose', 'rbDelete', 'rbDefault', 'rbAssign', 'rbDayOff', 'shiftSave', 'shiftRemove', 'holidaySave', 'holidayRemove', 'rulesSave', 'powerSet',
      'cpSave', 'cpVersionSave', 'cpPublish', 'cpDraftDelete', 'cpFileLink']],
  notices: [['noticeList'], ['noticeSettingSave', 'noticeRetry', 'noticeCancel']],
  ai: [['aiStatus', 'aiReadDoc', 'aiAsk', 'aiChecks'], []],
  places: [['placeMap', 'placePeople', 'placePerson', 'placeAccess'], ['projSave', 'placeSave', 'placeBulk', 'placeImport', 'placeRemove', 'placeGuest', 'placeAccessSet', 'placeAnywhere']],
  phones: [['devList'], ['devRelease']],
  month: [['monthList', 'monthSites'], ['monthVerify', 'monthReturn', 'monthApprove', 'monthReopen']],
};
// what every page needs to work (the sign-in's own start, his language, picking a person, the shifts and places named on many pages,
// the lists of a form, a person's policies; (19-11-2026) "Ask" – the help, on every page, reading nothing of anybody) – reading only
const ANY = ['init', 'langSet', 'empPick', 'attSetup', 'placeList', 'listAll', 'rbOf', 'helpAsk'];
// never an HR User's (the HR Admin's masters and lists, the HO HR's / Super Admin's pay, bank and HO HR list): their own checks decide
const OWN = ['masterSave', 'masterDelete', 'masterSeed', 'listSave', 'profRequiredSave', 'salaryWaiting', 'salaryDecide', 'bankList', 'bankDecide', 'hoList', 'hoSet',
  'paySlipOf', 'payBank', 'payList', 'payFlags', 'payAdjust', 'payLock', 'paySettings', 'paySettingsSave', 'advList', 'advGive', 'advClose',
  'structList', 'structSave', 'structVersionSave', 'structApprove', 'payEmpSet', 'statChecks', 'statCheck', 'payRelease', 'payReleaseSet', 'payPaid',
  'fnfList', 'fnfMake', 'fnfSave', 'fnfStep', 'payRegister', 'payCompare'];

const WHERE = {};
Object.keys(MAP).forEach(p => { MAP[p][0].forEach(a => { WHERE[a] = { page: p, write: false }; }); MAP[p][1].forEach(a => { WHERE[a] = { page: p, write: true }; }); });
const LEVELS = ['Edit', 'View', 'None'];
const nameOf = k => (PAGES.find(p => p.key === k) || { name: k }).name;

/* the pages of a ticket, as the Portal wrote them: only known pages, only Edit / View / None (a View-only page: Edit = View);
 * nothing proper = null (= as before) */
function clean(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {}; let n = 0;
  PAGES.forEach(p => { const x = v[p.key]; if (LEVELS.indexOf(x) > -1) { out[p.key] = p.view && x === 'Edit' ? 'View' : x; n++; } });
  return n ? out : null;
}
// what he has on a page: an HR User with pages given – theirs; a page not named, or nobody else – as before
function levelOf(s, page) {
  const k = PAGE_OF[page] || page;
  if (!s || s.role !== 'user') return 'Edit';
  const pg = s.info && s.info.pages; if (!pg || typeof pg !== 'object') return 'Edit';
  const v = pg[k]; return LEVELS.indexOf(v) > -1 ? v : 'Edit';
}
/* THE CHECK at the door (after the sign-in, "My HR" and the seven-day rule): an HR User's page. self = the actions of his own (SELF). */
function guard(s, action, self) {
  if (!s || s.role !== 'user') return;
  const a = String(action || ''); if ((self || []).indexOf(a) > -1 || ANY.indexOf(a) > -1 || OWN.indexOf(a) > -1) return;
  const w = WHERE[a]; if (!w) return;      // (the unit test keeps every action named – an unnamed one is as before)
  const lv = levelOf(s, w.page);
  if (lv === 'None') throw fail(403, 'You do not have access to ' + nameOf(w.page) + ' in HR. Ask the Super Admin.', 'page');
  if (lv === 'View' && w.write) throw fail(403, 'You have View access only for ' + nameOf(w.page) + ' in HR. Ask the Super Admin for Edit access.', 'page');
}
// the pages of the menu he may open (a menu key – its Rule Book part goes with the Rule Book)
const mayOpen = (s, key) => levelOf(s, key) !== 'None';
// what the HR web shows him (init): his level on each page (only for an HR User with pages given)
function mine(s) { if (!s || s.role !== 'user' || !(s.info && s.info.pages)) return null; const o = {}; PAGES.forEach(p => { o[p.key] = levelOf(s, p.key); }); return o; }

module.exports = { PAGES, PAGE_OF, MAP, ANY, OWN, WHERE, clean, levelOf, guard, mayOpen, mine };
