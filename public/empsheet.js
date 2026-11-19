/* HR – THE EMPLOYEE SHEET IN STEPS (18-11-2026, asked: "excel khup mothi aahe … basic ekasath ghe nantr kyc ek sath … step by step de
 * … drop down pn yeude … kay bhraych te hi samjayla haw"). Instead of one sheet of 80 columns, five small files – one a step:
 *   1 Basic (adds the new people)  2 KYC & address  3 Bank & PF  4 Job details  5 Pay (HR Admin / Super Admin)
 * Each file: its columns only, a DROP-DOWN wherever there is a choice (gender, designation, department, the lists, Yes / No), a note
 * on every heading ("what to fill" + an example), the compulsory headings marked, long numbers kept as text, and a second sheet
 * "How to fill" (English + मराठी). Steps 2–5 come filled with this site's employees (code + name) – only the rest is typed.
 * The file goes back through the same Import (hr.js): it knows its step by its sheet's name, and the server refuses a row of steps
 * 2–5 whose code is not an employee of this site (lib/act_sheet.js, part). The full sheet of 80 columns stays as it was.
 * Made with ExcelJS (/vendor/exceljs-4.4.0.min.js – the ERP's own address serves it). */
(function () {
  'use strict';
  var api = function (action, body) { return window.HRAPI('api/hr', Object.assign({ action: action }, body || {})); };
  var YN = ['Yes', 'No'];
  // key → [what to fill (English), मराठी, example, kind] – kind: list:<list kind> | yn | gender | designation | department | date | text (a number kept as text)
  var HELP = {
    code: ['Employee code. Empty in Step 1 = made by itself (RCL…). In Steps 2–5: already filled – do not change.', 'कर्मचारी code. Step 1 मध्ये रिकामा = आपोआप बनतो. Steps 2–5 मध्ये आधीच भरलेला – बदलू नका.', 'RCL012', 'text'],
    name: ['Full name. In Steps 2–5 it is only shown – it is not changed from here.', 'पूर्ण नाव. Steps 2–5 मध्ये फक्त दाखवलं आहे – इथून बदलत नाही.', 'Suresh Patil', ''],
    mobile: ['10-digit mobile. A new employee needs a mobile OR an e-mail (he signs in with it).', '10 अंकी mobile. नवीन कर्मचाऱ्याला mobile किंवा e-mail पाहिजेच.', '9876543210', 'text'],
    email: ['E-mail – his own (he signs in with it).', 'त्याचा स्वतःचा e-mail.', 'suresh@example.com', ''],
    dob: ['Date of birth, DD-MM-YYYY. He must be 18 on the joining date.', 'जन्मतारीख, DD-MM-YYYY. रुजू तारखेला 18 वर्षे पूर्ण हवीत.', '05-04-1992', 'date'],
    gender: ['Choose from the list.', 'यादीतून निवडा.', 'Male', 'gender'],
    designation: ['Choose from the list – the designation also gives his category (Staff / Operator / Driver / Labour).', 'यादीतून निवडा – पदावरून category ठरते.', '', 'designation'],
    department: ['Choose from the list.', 'यादीतून निवडा.', '', 'department'],
    joined_on: ['Joining date, DD-MM-YYYY.', 'रुजू तारीख, DD-MM-YYYY.', '01-11-2026', 'date'],
    father_name: ['Father\'s or husband\'s name.', 'वडील / पतीचं नाव.', 'Ramesh Patil', ''],
    aadhaar: ['12-digit Aadhaar number.', '12 अंकी Aadhaar नंबर.', '123412341234', 'text'],
    pan: ['PAN, 10 letters / digits.', 'PAN, 10 अक्षरे / अंक.', 'ABCDE1234F', ''],
    name_aadhaar: ['The name exactly as on the Aadhaar card.', 'Aadhaar वर जसं आहे तसंच नाव.', '', ''],
    address_current: ['Where he lives now.', 'सध्याचा पत्ता.', '', ''], address_permanent: ['His permanent (home) address.', 'कायमचा (गावचा) पत्ता.', '', ''],
    city: ['City.', 'शहर.', 'Pune', ''], state: ['State.', 'राज्य.', 'Maharashtra', ''], pin: ['6-digit PIN code.', '6 अंकी PIN code.', '411001', 'text'],
    prefix: ['Choose from the list.', 'यादीतून निवडा.', 'Mr.', 'list:prefix'], marital: ['Choose from the list.', 'यादीतून निवडा.', '', 'list:marital'], blood: ['Choose from the list.', 'यादीतून निवडा.', '', 'list:blood'],
    nationality: ['Choose from the list.', 'यादीतून निवडा.', 'Indian', 'list:nationality'], disability: ['Empty = none.', 'रिकामे = नाही.', '', ''],
    mobile2: ['A second mobile, if any.', 'दुसरा mobile असल्यास.', '', 'text'], family_name: ['A family member – name.', 'घरातील एका व्यक्तीचं नाव.', '', ''], family_relation: ['His / her relation.', 'नातं.', 'Wife', ''], family_mobile: ['His / her mobile.', 'त्यांचा mobile.', '', 'text'],
    emergency_name: ['Whom to call in an emergency – name.', 'आणीबाणीत कोणाला फोन करायचा – नाव.', '', ''], emergency_relation: ['Relation.', 'नातं.', 'Brother', ''], emergency_mobile: ['Mobile.', 'Mobile.', '', 'text'],
    uan: ['12-digit UAN.', '12 अंकी UAN.', '', 'text'], pf_no: ['PF number.', 'PF नंबर.', '', ''], pf_join: ['PF joining date, DD-MM-YYYY.', 'PF सुरू तारीख.', '', 'date'], esic_no: ['ESIC number.', 'ESIC नंबर.', '', 'text'], esic_join: ['ESIC joining date, DD-MM-YYYY.', 'ESIC सुरू तारीख.', '', 'date'],
    bank_name: ['Bank.', 'बँकेचं नाव.', 'State Bank of India', ''], bank_ifsc: ['IFSC, 11 letters / digits.', 'IFSC, 11 अक्षरे / अंक.', 'SBIN0001234', ''], bank_account: ['Account number.', 'खाते नंबर.', '', 'text'], bank_holder: ['The name as on the bank account.', 'बँक खात्यावर असलेलं नाव.', '', ''],
    employment_type: ['Choose from the list.', 'यादीतून निवडा.', '', 'list:employment_type'], employee_type: ['Choose from the list.', 'यादीतून निवडा.', '', 'list:employee_type'], worker_type: ['Choose from the list.', 'यादीतून निवडा.', '', 'list:worker_type'],
    skill_category: ['Choose from the list.', 'यादीतून निवडा.', '', 'list:skill_category'], branch: ['Choose from the list.', 'यादीतून निवडा.', '', 'list:branch'], company: ['Name of the company.', 'कंपनीचं नाव.', '', ''], project: ['Current project.', 'सध्याचा project.', '', ''],
    probation_days: ['Probation – days.', 'Probation – दिवस.', '180', ''], probation_end: ['Probation ends on, DD-MM-YYYY.', 'Probation संपण्याची तारीख.', '', 'date'], confirmation_date: ['Confirmation date, DD-MM-YYYY.', 'Confirmation तारीख.', '', 'date'],
    notice_days: ['Notice period – days.', 'Notice period – दिवस.', '30', ''], retirement_age: ['Retirement age – years.', 'निवृत्तीचं वय.', '58', ''], overtime: ['Yes / No.', 'Yes / No.', 'No', 'yn'], retained: ['As in the company\'s sheet.', 'कंपनीच्या sheet प्रमाणे.', '', ''],
    sign_in: ['Sign-in time, HH:MM.', 'Sign in वेळ, HH:MM.', '09:00', ''], sign_out: ['Sign-out time, HH:MM.', 'Sign out वेळ, HH:MM.', '18:00', ''], official_email: ['Office e-mail, if any.', 'Office चा e-mail असल्यास.', '', ''], cug: ['CUG number, if any.', 'CUG नंबर असल्यास.', '', 'text'],
    territory: ['Territory.', 'Territory.', '', ''], employee_role: ['Role.', 'भूमिका.', '', ''], drives: ['Does he drive a vehicle for work? Yes / No (Yes = his driving licence is a paper he needs).', 'कामासाठी गाडी चालवतो का? Yes / No.', 'No', 'yn'], licence_class: ['Driving licence class.', 'Licence class.', 'LMV', ''],
    ctc: ['Monthly CTC (₹). For the HO HR it becomes his approved salary.', 'महिन्याचा CTC (₹).', '', ''], basic: ['Basic (₹).', 'Basic (₹).', '', ''], pf: ['Deduct PF? Yes / No.', 'PF कापायचा? Yes / No.', 'Yes', 'yn'], esic: ['Deduct ESIC? Yes / No.', 'ESIC कापायचा? Yes / No.', 'No', 'yn'], pt: ['Deduct Profession Tax? Yes / No.', 'PT कापायचा? Yes / No.', 'Yes', 'yn'],
    esic_type: ['As in the company\'s sheet.', 'कंपनीच्या sheet प्रमाणे.', '', ''], esic_contribution_rate: ['%.', '%.', '', ''], esic_deduction_rate: ['%.', '%.', '', ''], tds_type: ['As in the company\'s sheet.', 'कंपनीच्या sheet प्रमाणे.', '', ''], deduct_income_tax: ['Yes / No.', 'Yes / No.', 'No', 'yn'],
    annual_bonus: ['₹ a year.', 'वर्षाला ₹.', '', ''], annual_medical: ['₹ a year.', 'वर्षाला ₹.', '', ''], annual_lta: ['₹ a year.', 'वर्षाला ₹.', '', ''], pay_period: ['As in the company\'s sheet.', 'कंपनीच्या sheet प्रमाणे.', '', ''], attach: ['As in the company\'s sheet.', 'कंपनीच्या sheet प्रमाणे.', '', ''], totals: ['As in the company\'s sheet.', 'कंपनीच्या sheet प्रमाणे.', '', '']
  };
  var PARTS = [
    { key: 'basic', no: 1, name: 'Basic', mr: 'मूलभूत माहिती', what: 'adds the new people', need: ['name', 'mobile', 'email', 'dob'], cols: ['code', 'name', 'mobile', 'email', 'dob', 'gender', 'designation', 'department', 'joined_on', 'father_name'] },
    { key: 'kyc', no: 2, name: 'KYC & address', mr: 'KYC व पत्ता', what: 'Aadhaar, PAN, address, family, emergency contact', need: ['code'], cols: ['code', 'name', 'aadhaar', 'pan', 'name_aadhaar', 'address_current', 'address_permanent', 'city', 'state', 'pin', 'prefix', 'marital', 'blood', 'nationality', 'disability', 'mobile2', 'family_name', 'family_relation', 'family_mobile', 'emergency_name', 'emergency_relation', 'emergency_mobile'] },
    { key: 'bank', no: 3, name: 'Bank & PF', mr: 'Bank व PF', what: 'bank, IFSC, account, UAN, PF, ESIC (a bank change waits for the HO HR)', need: ['code'], cols: ['code', 'name', 'bank_name', 'bank_ifsc', 'bank_account', 'bank_holder', 'uan', 'pf_no', 'pf_join', 'esic_no', 'esic_join'] },
    { key: 'job', no: 4, name: 'Job details', mr: 'कामाची माहिती', what: 'employment type, probation, notice, sign-in time, driving …', need: ['code'], cols: ['code', 'name', 'employment_type', 'employee_type', 'worker_type', 'skill_category', 'company', 'branch', 'project', 'probation_days', 'probation_end', 'confirmation_date', 'notice_days', 'retirement_age', 'overtime', 'retained', 'sign_in', 'sign_out', 'official_email', 'cug', 'territory', 'employee_role', 'drives', 'licence_class'] },
    { key: 'pay', no: 5, name: 'Pay', mr: 'पगार', what: 'CTC, Basic, deduct PF / ESIC / PT – HR Admin / Super Admin only', admin: true, need: ['code'], cols: ['code', 'name', 'ctc', 'basic', 'pf', 'esic', 'pt', 'esic_type', 'esic_contribution_rate', 'esic_deduction_rate', 'tds_type', 'deduct_income_tax', 'annual_bonus', 'annual_medical', 'annual_lta', 'pay_period', 'attach', 'totals'] }
  ];
  function lib() { return new Promise(function (ok) { if (window.ExcelJS) return ok(true); var s = document.createElement('script'); s.src = '/vendor/exceljs-4.4.0.min.js'; s.onload = function () { ok(!!window.ExcelJS); }; s.onerror = function () { ok(false); }; document.head.appendChild(s); }); }
  var colName = function (n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  // the file of one step → downloaded
  function make(part, init) {
    var P = PARTS.filter(function (p) { return p.key === part; })[0];
    return Promise.all([lib(), api('sheetCols'), api('listAll').catch(function () { return { lists: {} }; }), P.no > 1 ? api('sheetExport', {}) : Promise.resolve(null)]).then(function (x) {
      if (!x[0]) throw new Error('The Excel maker could not be loaded – open HR inside the ERP (lion.sketchline.si) and try again.');
      var heads = {}; x[1].cols.forEach(function (c) { heads[c.key] = c.head; }); var lists = (x[2] && x[2].lists) || {};
      var people = []; if (x[3]) { var ci = x[3].heads.indexOf(heads.code), ni = x[3].heads.indexOf(heads.name); x[3].rows.forEach(function (r) { if (r[ci]) people.push([r[ci], r[ni]]); }); }
      var active = function (l) { return (l || []).filter(function (v) { return v.active !== false; }).map(function (v) { return v.name; }); };
      var src = { gender: ['Male', 'Female', 'Other'], yn: YN, designation: active(init.designations), department: active(init.departments) };
      Object.keys(lists).forEach(function (k) { src['list:' + k] = active(lists[k]); });
      var wb = new window.ExcelJS.Workbook(), ws = wb.addWorksheet('Step ' + P.no + ' - ' + P.name, { views: [{ state: 'frozen', ySplit: 1 }] }), help = wb.addWorksheet('How to fill'), L = wb.addWorksheet('Lists', { state: 'veryHidden' });
      // the lists the drop-downs read (a hidden sheet – one column a list)
      var lcol = {}, li = 0; P.cols.forEach(function (k) { var kind = (HELP[k] || [])[3] || ''; if (!src[kind] || lcol[kind]) return; var c = colName(li++); lcol[kind] = c; L.getCell(c + '1').value = kind; src[kind].forEach(function (v, i) { L.getCell(c + (i + 2)).value = v; }); });
      var last = Math.max(people.length + 1, 2) + (P.no === 1 ? 500 : 50);
      P.cols.forEach(function (k, i) {
        var h = HELP[k] || ['', '', '', ''], c = colName(i), cell = ws.getCell(c + '1'), need = P.need.indexOf(k) > -1;
        cell.value = heads[k] || k; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: need ? 'FFB3001B' : 'FF1F3A5F' } }; cell.alignment = { vertical: 'middle', wrapText: true };
        cell.note = (need ? 'COMPULSORY – ' : '') + h[0] + '\n' + h[1] + (h[2] ? '\nExample / उदा.: ' + h[2] : '');
        var col = ws.getColumn(i + 1); col.width = Math.max(14, Math.min(34, String(cell.value).length + 6)); if (h[3] === 'text' || h[3] === 'date') col.numFmt = '@';
        if (src[h[3]] && lcol[h[3]] && src[h[3]].length) ws.dataValidations.add(c + '2:' + c + last, { type: 'list', allowBlank: true, formulae: ['Lists!$' + lcol[h[3]] + '$2:$' + lcol[h[3]] + '$' + (src[h[3]].length + 1)],
          showErrorMessage: true, errorStyle: h[3] === 'yn' || h[3] === 'gender' ? 'stop' : 'warning', errorTitle: 'Choose from the list', error: h[3] === 'yn' || h[3] === 'gender' ? 'Choose a value of the list.' : 'This is not in the list – it will be added to the HR lists when imported. Choose from the list if it is there.' });
      });
      ws.getRow(1).height = 32;
      people.forEach(function (p, r) { ws.getCell('A' + (r + 2)).value = p[0]; ws.getCell('B' + (r + 2)).value = p[1]; ['A', 'B'].forEach(function (c) { ws.getCell(c + (r + 2)).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F7' } }; }); });
      // HOW TO FILL
      help.getColumn(1).width = 34; help.getColumn(2).width = 70; help.getColumn(3).width = 60; help.getColumn(4).width = 22;
      var row = function (vals, bold, fill) { var r = help.addRow(vals); if (bold) r.font = { bold: true }; if (fill) r.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; }); r.alignment = { wrapText: true, vertical: 'top' }; return r; };
      row(['Step ' + P.no + ' of 5 – ' + P.name + ' / ' + P.mr], true, 'FFDDE6F3');
      [['1', 'Fill the first sheet. A red heading is compulsory. Point at a heading to read what to fill.', 'पहिली sheet भरा. लाल heading भरणं आवश्यक. काय भरायचं ते heading वर mouse नेल्यावर दिसतं.'],
        ['2', 'A column with a small arrow has a DROP-DOWN – choose from it.', 'छोटा बाण असलेल्या column मध्ये यादी (drop-down) आहे – त्यातून निवडा.'],
        ['3', 'Dates as DD-MM-YYYY (05-04-1992). Long numbers (Aadhaar, account, mobile) as they are.', 'तारीख DD-MM-YYYY (05-04-1992). मोठे नंबर (Aadhaar, account, mobile) जसेच्या तसे.'],
        ['4', P.no === 1 ? 'One row a NEW person. Leave the code empty – it is made by itself. Mobile OR e-mail is needed.' : 'The rows already have this site\'s employees (code + name). Fill only what you have – an empty cell changes nothing. Do not change the code.',
          P.no === 1 ? 'एका नवीन माणसाची एक ओळ. Code रिकामा ठेवा – आपोआप बनतो. Mobile किंवा e-mail पाहिजेच.' : 'ओळींमध्ये या site चे कर्मचारी (code + नाव) आधीच आहेत. जे आहे तेवढंच भरा – रिकामा cell काहीही बदलत नाही. Code बदलू नका.'],
        ['5', 'Save the file. In HR: Employees → Import → choose this file → it is CHECKED first (faults by line) → Save.', 'File save करा. HR मध्ये: Employees → Import → ही file निवडा → आधी तपासणी (चुका ओळीसह) → Save.'],
        ['6', P.no === 1 ? 'Then Step 2 (KYC & address), 3 (Bank & PF), 4 (Job), 5 (Pay) – any time, in any order.' : 'Papers (photos / PDFs) are attached on the employee\'s page or by his joining link – not in Excel.', P.no === 1 ? 'मग Step 2 (KYC व पत्ता), 3 (Bank व PF), 4 (काम), 5 (पगार) – केव्हाही.' : 'कागदपत्रं (फोटो / PDF) कर्मचाऱ्याच्या page वर किंवा joining link ने – Excel मध्ये नाही.']
      ].forEach(function (v) { row([v[0], v[1], v[2]]); });
      row([]); row(['Column / Column', 'What to fill', 'काय भरायचं', 'Example / उदा.'], true, 'FFDDE6F3');
      P.cols.forEach(function (k) { var h = HELP[k] || ['', '', '', '']; row([(heads[k] || k) + (P.need.indexOf(k) > -1 ? ' *' : ''), h[0] + (src[h[3]] ? ' (drop-down)' : ''), h[1], h[2]]); });
      return wb.xlsx.writeBuffer().then(function (buf) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = 'HR_Step' + P.no + '_' + P.name.replace(/[^A-Za-z]+/g, '_') + '_' + init.site + '.xlsx';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); return { people: people.length };
      });
    });
  }
  // the step of a file chosen for Import – by its first sheet's name ("Step 2 - KYC & address"); '' = the full sheet of before
  function partOf(sheetName) { var m = /^Step\s*(\d)/i.exec(String(sheetName || '')), p = m ? PARTS.filter(function (x) { return x.no === +m[1]; })[0] : null; return p && p.no > 1 ? p.key : ''; }
  window.HRSHEET = { PARTS: PARTS, make: make, partOf: partOf };
})();
