/**
 * ONECLICK HRMS - Layer A: SaaS Owner Portal
 * Built for Cloudflare Workers + D1 + R2
 * Provides complete Multi-Tenant B2B Management, 8-Step Onboarding Wizard,
 * Real-time MRR analytics, Plans & Subscription governance, and Support desk.
 */

(function () {
  'use strict';

  var S = {
    view: 'dashboard', // 'dashboard', 'clients', 'onboard', 'plans', 'subs', 'tickets', 'customizations'
    stats: null,
    clients: [],
    plans: [],
    subs: [],
    tickets: [],
    customizations: [],
    step: 1,
    wizardData: {},
    container: null
  };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function api(url, method, body) {
    var opts = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (j) {
          throw new Error(j.error || ('HTTP ' + res.status));
        }, function () {
          throw new Error('HTTP ' + res.status);
        });
      }
      return res.json();
    });
  }

  function formatInr(val) {
    return '₹' + Number(val || 0).toLocaleString('en-IN');
  }

  function toast(msg, bad) {
    var t = document.getElementById('toast');
    if (!t) {
      t = el('div', bad ? 'bad' : '', msg);
      t.id = 'toast';
      document.body.appendChild(t);
    } else {
      t.className = bad ? 'bad' : '';
      t.textContent = msg;
      t.hidden = false;
    }
    setTimeout(function () { t.hidden = true; }, 4000);
  }

  // -------------------------------------------------------------
  // VIEW RENDERERS
  // -------------------------------------------------------------

  function renderNav(root) {
    var nav = el('div', 'portal-nav');
    nav.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;background:#fff;padding:12px 16px;border-radius:18px;border:1px solid #E3EAF6;box-shadow:0 2px 10px rgba(10,27,68,0.04);';

    var items = [
      { id: 'dashboard', label: '📊 Executive Dashboard' },
      { id: 'clients', label: '🏢 Client Organizations' },
      { id: 'onboard', label: '➕ Onboard New Client (8-Step)' },
      { id: 'plans', label: '🏷️ Plans & Pricing' },
      { id: 'subs', label: '💳 Subscriptions & MRR' },
      { id: 'tickets', label: '🎫 Support Tickets' },
      { id: 'customizations', label: '✨ Customizations' }
    ];

    items.forEach(function (item) {
      var btn = el('button', 'tab' + (S.view === item.id ? ' on' : ''), item.label);
      btn.type = 'button';
      btn.style.cssText = 'border-radius:12px;padding:8px 16px;font-weight:600;cursor:pointer;font-size:14px;';
      btn.onclick = function () {
        S.view = item.id;
        refreshView();
      };
      nav.appendChild(btn);
    });

    root.appendChild(nav);
  }

  // 1. Dashboard View
  function renderDashboard(root) {
    var wrap = el('div', 'portal-dashboard');

    // Header
    var hdr = el('div', 'portal-hdr');
    hdr.style.cssText = 'margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;';
    hdr.innerHTML = '<div><h2 style="margin:0;font-size:24px;font-weight:800;color:#0A1B44;">ONECLICK HRMS — SaaS Owner Central</h2><p style="margin:4px 0 0;color:#64748B;font-size:14.5px;">Global platform telemetry, revenue metrics, and multi-tenant management.</p></div>';
    
    var onbBtn = el('button', 'pri', '+ Onboard New Client');
    onbBtn.type = 'button';
    onbBtn.onclick = function () { S.view = 'onboard'; S.step = 1; refreshView(); };
    hdr.appendChild(onbBtn);
    wrap.appendChild(hdr);

    // KPI Cards Grid
    var kpiGrid = el('div', 'kpi-grid');
    kpiGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:16px;margin-bottom:24px;';

    var stats = S.stats || {
      total_clients: 0,
      active_clients: 0,
      total_employees: 0,
      active_subscriptions: 0,
      monthly_recurring_revenue: 0,
      open_tickets: 0,
      system_status: { workers_api: 'healthy', d1_database: 'online', r2_storage: 'online', turnstile_protection: 'active' }
    };

    var kpis = [
      { label: 'Total Clients', value: stats.total_clients, sub: stats.active_clients + ' active organizations', color: '#1056B4', bg: '#EFF6FF' },
      { label: 'Active Employees', value: stats.total_employees, sub: 'Across all client tenants', color: '#0F766E', bg: '#F0FDFA' },
      { label: 'Monthly Revenue (MRR)', value: formatInr(stats.monthly_recurring_revenue), sub: stats.active_subscriptions + ' active paid subscriptions', color: '#047857', bg: '#ECFDF5' },
      { label: 'Open Support Tickets', value: stats.open_tickets, sub: 'Awaiting SLA resolution', color: '#C2410C', bg: '#FFF7ED' },
      { label: 'Workers API Status', value: '100% Operational', sub: 'Cloudflare Edge APAC-SIN', color: '#166534', bg: '#F0FDF4' },
      { label: 'D1 & R2 Health', value: 'D1 & R2 Active', sub: 'Encrypted SQLite & Object Store', color: '#4338CA', bg: '#EEF2FF' }
    ];

    kpis.forEach(function (k) {
      var c = el('div', 'kpi-card');
      c.style.cssText = 'background:#fff;border-radius:18px;border:1px solid #E2E8F0;padding:18px;box-shadow:0 4px 12px rgba(10,27,68,0.03);border-left:5px solid ' + k.color + ';';
      c.innerHTML = '<div style="font-size:13.5px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">' + k.label + '</div>' +
                    '<div style="font-size:28px;font-weight:800;color:#0F172A;margin:8px 0 4px;">' + k.value + '</div>' +
                    '<div style="font-size:13px;color:#64748B;">' + k.sub + '</div>';
      kpiGrid.appendChild(c);
    });
    wrap.appendChild(kpiGrid);

    // Recent Clients Table
    var sec = el('div', 'portal-sec');
    sec.style.cssText = 'background:#fff;border-radius:20px;border:1px solid #E2E8F0;padding:22px;box-shadow:0 4px 14px rgba(10,27,68,0.03);';
    sec.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;"><h3 style="margin:0;font-size:18px;font-weight:700;color:#0F172A;">Recently Onboarded Clients</h3><button class="sec" style="font-size:13.5px;" id="btn_see_all_clients">View All Clients →</button></div>';
    
    var tblBox = el('div', 'tbl-box');
    tblBox.style.overflowX = 'auto';

    var table = el('table');
    table.innerHTML = '<thead><tr><th>Company Name</th><th>Code</th><th>Plan</th><th>Monthly Fee</th><th>Contact Email</th><th>Status</th><th>Onboarded</th></tr></thead>';
    var tbody = el('tbody');

    var recents = S.stats?.recent_clients || [];
    if (!recents.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748B;">No client organizations found.</td></tr>';
    } else {
      recents.forEach(function (c) {
        var tr = el('tr');
        tr.innerHTML = '<td style="font-weight:700;color:#0A1B44;">' + (c.name || '—') + '</td>' +
                       '<td><span style="font-family:monospace;background:#F1F5F9;padding:3px 8px;border-radius:6px;font-weight:600;">' + (c.code || '—') + '</span></td>' +
                       '<td><span class="st s-active">' + (c.plan_name || 'Standard') + '</span></td>' +
                       '<td style="font-weight:700;color:#0F766E;">' + formatInr(c.monthly_amount) + '</td>' +
                       '<td>' + (c.contact_email || '—') + '</td>' +
                       '<td><span class="st ' + (c.status === 'ACTIVE' ? 's-active' : 's-incomplete') + '">' + c.status + '</span></td>' +
                       '<td style="color:#64748B;font-size:13.5px;">' + (c.created_at ? c.created_at.slice(0, 10) : '—') + '</td>';
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    tblBox.appendChild(table);
    sec.appendChild(tblBox);
    wrap.appendChild(sec);

    root.appendChild(wrap);

    var seeAll = sec.querySelector('#btn_see_all_clients');
    if (seeAll) {
      seeAll.onclick = function () {
        S.view = 'clients';
        refreshView();
      };
    }
  }

  // 2. Clients View
  function renderClients(root) {
    var wrap = el('div', 'portal-clients');
    
    var hdr = el('div', 'hdr');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
    hdr.innerHTML = '<div><h2 style="margin:0;font-size:22px;font-weight:800;color:#0A1B44;">Client Organizations Directory</h2><p style="margin:4px 0 0;color:#64748B;font-size:14px;">Manage client tenant isolations, quotas, and impersonate client HR workspace.</p></div>';
    
    var onbBtn = el('button', 'pri', '+ Onboard New Client');
    onbBtn.type = 'button';
    onbBtn.onclick = function () { S.view = 'onboard'; S.step = 1; refreshView(); };
    hdr.appendChild(onbBtn);
    wrap.appendChild(hdr);

    var card = el('div', 'box');
    card.style.cssText = 'background:#fff;border-radius:18px;border:1px solid #E2E8F0;box-shadow:0 4px 14px rgba(10,27,68,0.03);padding:18px;overflow-x:auto;';

    var table = el('table');
    table.innerHTML = '<thead><tr><th>Client Organization</th><th>Code</th><th>Plan</th><th>Staff Count</th><th>Monthly Revenue</th><th>Primary Admin</th><th>Status</th><th>Actions</th></tr></thead>';
    var tbody = el('tbody');

    if (!S.clients.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#64748B;">No clients onboarded yet.</td></tr>';
    } else {
      S.clients.forEach(function (c) {
        var tr = el('tr');
        var statusBadge = c.status === 'ACTIVE' ? '<span class="st s-active">ACTIVE</span>' : '<span class="st s-incomplete">' + c.status + '</span>';
        
        tr.innerHTML = '<td><b>' + c.name + '</b><br><small style="color:#64748B;">' + (c.legal_name || c.name) + '</small></td>' +
                       '<td><span style="font-family:monospace;background:#F1F5F9;padding:3px 8px;border-radius:6px;font-weight:600;">' + c.code + '</span></td>' +
                       '<td><b>' + (c.plan_name || 'Standard') + '</b><br><small style="color:#64748B;">Max ' + (c.employee_limit || 100) + ' emp</small></td>' +
                       '<td><b style="color:#1056B4;font-size:16px;">' + (c.employee_count || 0) + '</b> active</td>' +
                       '<td style="font-weight:700;color:#0F766E;">' + formatInr(c.monthly_amount) + '</td>' +
                       '<td>' + (c.contact_email || '—') + '<br><small style="color:#64748B;">' + (c.contact_phone || '—') + '</small></td>' +
                       '<td>' + statusBadge + '</td>' +
                       '<td style="white-space:nowrap;">' +
                         '<button class="sec sm switch-tenant-btn" style="margin-right:6px;" data-id="' + c.id + '" data-name="' + c.name + '" title="Impersonate & inspect this client tenant\'s HRMS">Open HRMS</button>' +
                         '<button class="sec sm toggle-status-btn" data-id="' + c.id + '" data-status="' + c.status + '">' + (c.status === 'ACTIVE' ? 'Suspend' : 'Activate') + '</button>' +
                       '</td>';
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    card.appendChild(table);
    wrap.appendChild(card);
    root.appendChild(wrap);

    // Event listeners
    card.querySelectorAll('.switch-tenant-btn').forEach(function (btn) {
      btn.onclick = function () {
        var orgId = btn.dataset.id;
        var orgName = btn.dataset.name;
        if (!confirm('Switch workspace to client organization: "' + orgName + '"?')) return;
        api('/api/portal/switch-tenant', 'POST', { organization_id: orgId }).then(function () {
          toast('Switched workspace context to ' + orgName);
          setTimeout(function () { location.reload(); }, 600);
        }).catch(function (err) { toast(err.message, true); });
      };
    });

    card.querySelectorAll('.toggle-status-btn').forEach(function (btn) {
      btn.onclick = function () {
        var orgId = btn.dataset.id;
        var currentStatus = btn.dataset.status;
        var nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        if (!confirm('Change status of this client organization to ' + nextStatus + '?')) return;
        api('/api/portal/clients/' + orgId, 'PATCH', { status: nextStatus }).then(function () {
          toast('Client organization updated to ' + nextStatus);
          loadClients().then(refreshView);
        }).catch(function (err) { toast(err.message, true); });
      };
    });
  }

  // 3. 8-Step Onboarding Wizard View
  function renderOnboardWizard(root) {
    var wrap = el('div', 'portal-wizard');
    wrap.style.cssText = 'max-width:820px;margin:0 auto;background:#fff;border-radius:24px;border:1px solid #E2E8F0;box-shadow:0 8px 30px rgba(10,27,68,0.06);padding:30px;';

    // Header
    var hdr = el('div', 'wiz-hdr');
    hdr.style.cssText = 'text-align:center;margin-bottom:24px;';
    hdr.innerHTML = '<h2 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0A1B44;">Client Onboarding Wizard</h2>' +
                    '<p style="margin:0;color:#64748B;font-size:15px;">Setup and provision a new multi-tenant commercial client organization in 8 simple steps.</p>';
    wrap.appendChild(hdr);

    // Step Progress Indicators (1 to 8)
    var prog = el('div', 'wiz-prog');
    prog.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:28px;position:relative;padding:0 10px;';
    
    var stepLabels = [
      'Company Profile', 'Admin User', 'SaaS Plan', 'Workplace',
      'Masters', 'Attendance Rules', 'Statutory Payroll', 'Confirm & Launch'
    ];

    stepLabels.forEach(function (lbl, idx) {
      var num = idx + 1;
      var active = S.step === num;
      var done = S.step > num;

      var stepCol = el('div', 'step-col');
      stepCol.style.cssText = 'display:flex;flex-direction:column;align-items:center;position:relative;z-index:2;flex:1;';

      var circle = el('div', 'step-num', done ? '✓' : String(num));
      circle.style.cssText = 'width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:14px;font-weight:700;margin-bottom:6px;' +
        (done ? 'background:#10B981;color:#fff;' : (active ? 'background:#0A1B44;color:#fff;box-shadow:0 0 0 4px rgba(10,27,68,0.15);' : 'background:#F1F5F9;color:#64748B;'));

      var title = el('div', 'step-lbl', lbl);
      title.style.cssText = 'font-size:11.5px;font-weight:600;text-align:center;color:' + (active ? '#0A1B44' : '#64748B') + ';line-height:1.2;';

      stepCol.appendChild(circle);
      stepCol.appendChild(title);
      prog.appendChild(stepCol);
    });
    wrap.appendChild(prog);

    // Step Body Container
    var body = el('div', 'wiz-body');
    body.style.cssText = 'background:#F8FAFC;border-radius:18px;border:1px solid #E2E8F0;padding:24px;margin-bottom:24px;';

    // RENDER STEP CONTENT
    var D = S.wizardData;

    if (S.step === 1) {
      // Step 1: Company Profile
      body.innerHTML = '<h3 style="margin:0 0 16px;color:#0A1B44;">Step 1: Client Organization Profile</h3>' +
        '<div class="grid">' +
          '<div class="full"><label>Company / Brand Name *</label><input id="w_name" value="' + (D.company_name || '') + '" placeholder="e.g. Apex Engineering Solutions Pvt Ltd" required></div>' +
          '<div><label>Organization Code (Slug) *</label><input id="w_code" value="' + (D.code || '') + '" placeholder="e.g. APEX"></div>' +
          '<div><label>Industry</label><select id="w_ind"><option value="Construction">Construction / Real Estate</option><option value="Manufacturing">Manufacturing</option><option value="IT">IT & Tech Services</option><option value="Healthcare">Healthcare</option><option value="Retail">Retail & Logistics</option><option value="Other">Other</option></select></div>' +
          '<div class="full"><label>Registered Address</label><input id="w_addr" value="' + (D.address || '') + '" placeholder="Street address"></div>' +
          '<div><label>City</label><input id="w_city" value="' + (D.city || 'Mumbai') + '"></div>' +
          '<div><label>State</label><input id="w_state" value="' + (D.state || 'Maharashtra') + '"></div>' +
          '<div class="full"><label>GSTIN Number</label><input id="w_gst" value="' + (D.gst_number || '') + '" placeholder="27AAAAA0000A1Z5"></div>' +
        '</div>';
    } else if (S.step === 2) {
      // Step 2: Primary Administrator
      body.innerHTML = '<h3 style="margin:0 0 16px;color:#0A1B44;">Step 2: Primary Client Administrator</h3>' +
        '<p style="margin:0 0 16px;font-size:14px;color:#64748B;">This user will receive initial administrative access to the client portal.</p>' +
        '<div class="grid">' +
          '<div class="full"><label>Admin Full Name *</label><input id="w_aname" value="' + (D.admin_name || '') + '" placeholder="e.g. Rajesh Sharma" required></div>' +
          '<div class="full"><label>Admin Login Email *</label><input type="email" id="w_aemail" value="' + (D.admin_email || '') + '" placeholder="admin@clientdomain.com" required></div>' +
          '<div><label>Mobile Number (for SMS & WhatsApp)</label><input type="tel" id="w_aphone" value="' + (D.contact_phone || '') + '" placeholder="9876543210"></div>' +
          '<div><label>Initial Login Password *</label><input type="text" id="w_apwd" value="' + (D.admin_password || 'Admin@12345') + '" required></div>' +
        '</div>';
    } else if (S.step === 3) {
      // Step 3: SaaS Plan
      var selPlan = D.plan_id || 'plan_standard';
      body.innerHTML = '<h3 style="margin:0 0 16px;color:#0A1B44;">Step 3: Select Commercial SaaS Plan</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div class="plan-pick ' + (selPlan === 'plan_starter' ? 'on' : '') + '" data-plan="plan_starter" style="background:#fff;border:2px solid ' + (selPlan === 'plan_starter' ? '#10B981' : '#E2E8F0') + ';border-radius:14px;padding:14px;cursor:pointer;">' +
            '<b style="font-size:16px;">Starter Plan</b><br><span style="font-size:20px;font-weight:800;color:#0F766E;">₹1,499</span>/mo<p style="margin:6px 0 0;font-size:13px;color:#64748B;">Up to 25 employees · GPS & Face Punch · Core HR</p>' +
          '</div>' +
          '<div class="plan-pick ' + (selPlan === 'plan_standard' ? 'on' : '') + '" data-plan="plan_standard" style="background:#fff;border:2px solid ' + (selPlan === 'plan_standard' ? '#10B981' : '#E2E8F0') + ';border-radius:14px;padding:14px;cursor:pointer;">' +
            '<b style="font-size:16px;">Standard Plan</b><br><span style="font-size:20px;font-weight:800;color:#0F766E;">₹3,999</span>/mo<p style="margin:6px 0 0;font-size:13px;color:#64748B;">Up to 100 employees · Multi-Workplace · Leave & Shifts</p>' +
          '</div>' +
          '<div class="plan-pick ' + (selPlan === 'plan_pro' ? 'on' : '') + '" data-plan="plan_pro" style="background:#fff;border:2px solid ' + (selPlan === 'plan_pro' ? '#10B981' : '#E2E8F0') + ';border-radius:14px;padding:14px;cursor:pointer;">' +
            '<b style="font-size:16px;">Professional Plan</b><br><span style="font-size:20px;font-weight:800;color:#0F766E;">₹7,999</span>/mo<p style="margin:6px 0 0;font-size:13px;color:#64748B;">Up to 300 employees · Full Statutory Payroll & PF/ESIC · Muster</p>' +
          '</div>' +
          '<div class="plan-pick ' + (selPlan === 'plan_enterprise' ? 'on' : '') + '" data-plan="plan_enterprise" style="background:#fff;border:2px solid ' + (selPlan === 'plan_enterprise' ? '#10B981' : '#E2E8F0') + ';border-radius:14px;padding:14px;cursor:pointer;">' +
            '<b style="font-size:16px;">Enterprise Plan</b><br><span style="font-size:20px;font-weight:800;color:#0F766E;">₹14,999</span>/mo<p style="margin:6px 0 0;font-size:13px;color:#64748B;">Up to 1000 employees · Unlimited Sites · AI Assistant · SLA Support</p>' +
          '</div>' +
        '</div>';
      setTimeout(function () {
        body.querySelectorAll('.plan-pick').forEach(function (pk) {
          pk.onclick = function () {
            D.plan_id = pk.dataset.plan;
            renderOnboardWizard(root);
          };
        });
      }, 0);
    } else if (S.step === 4) {
      // Step 4: Workplace & Geofence
      body.innerHTML = '<h3 style="margin:0 0 16px;color:#0A1B44;">Step 4: Primary Workplace & Geofence</h3>' +
        '<div class="grid">' +
          '<div class="full"><label>Primary Office / Site Name *</label><input id="w_sname" value="' + (D.site_name || 'Head Office') + '" required></div>' +
          '<div><label>Latitude *</label><input type="number" step="any" id="w_lat" value="' + (D.latitude || '19.0760') + '" required></div>' +
          '<div><label>Longitude *</label><input type="number" step="any" id="w_lng" value="' + (D.longitude || '72.8777') + '" required></div>' +
          '<div class="full"><label>Geofence Radius (Meters) *</label><input type="number" id="w_rad" value="' + (D.radius_meters || '500') + '" required></div>' +
        '</div>' +
        '<p style="margin:14px 0 0;font-size:13.5px;color:#64748B;">Punches made outside this boundary will trigger a geofence deviation alert.</p>';
    } else if (S.step === 5) {
      // Step 5: Department & Designation Templates
      body.innerHTML = '<h3 style="margin:0 0 16px;color:#0A1B44;">Step 5: Master Data Templates</h3>' +
        '<p style="margin:0 0 12px;font-size:14.5px;color:#334155;">The following initial standard departments and designations will be auto-provisioned:</p>' +
        '<div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #E2E8F0;font-size:14px;">' +
          '<b>Departments:</b> Administration, Human Resources, Operations, Accounts, Engineering<br><br>' +
          '<b>Designations:</b> Director / Proprietor, HR Manager, Executive, Site Engineer, Supervisor' +
        '</div>' +
        '<p style="margin:14px 0 0;font-size:13px;color:#64748B;">Client HR Admin can add, edit, or customize more departments anytime.</p>';
    } else if (S.step === 6) {
      // Step 6: Attendance Rules
      body.innerHTML = '<h3 style="margin:0 0 16px;color:#0A1B44;">Step 6: Attendance & Shift Policies</h3>' +
        '<div class="grid">' +
          '<div><label>Standard Shift Start Time</label><input type="time" id="w_sstart" value="' + (D.shift_start || '09:30') + '"></div>' +
          '<div><label>Standard Shift End Time</label><input type="time" id="w_send" value="' + (D.shift_end || '18:30') + '"></div>' +
          '<div><label>Grace Period for Late Mark (Minutes)</label><input type="number" id="w_grace" value="' + (D.grace_mins || '15') + '"></div>' +
          '<div><label>Half-Day Threshold (Hours)</label><input type="number" id="w_half" value="' + (D.half_day_hrs || '4') + '"></div>' +
        '</div>';
    } else if (S.step === 7) {
      // Step 7: Statutory Payroll Configuration
      body.innerHTML = '<h3 style="margin:0 0 16px;color:#0A1B44;">Step 7: Statutory Payroll Settings</h3>' +
        '<div style="display:flex;flex-direction:column;gap:12px;">' +
          '<label class="ck"><input type="checkbox" id="w_pf" ' + (D.enable_pf !== false ? 'checked' : '') + '> <span><b>Provident Fund (PF)</b> — Enable 12% statutory employee/employer contribution calculation</span></label>' +
          '<label class="ck"><input type="checkbox" id="w_esic" ' + (D.enable_esic !== false ? 'checked' : '') + '> <span><b>ESIC</b> — Enable Employee State Insurance (0.75% / 3.25% for gross &le; ₹21,000)</span></label>' +
          '<label class="ck"><input type="checkbox" id="w_pt" ' + (D.enable_pt !== false ? 'checked' : '') + '> <span><b>Professional Tax (PT)</b> — Enable state slab deduction (e.g. ₹200/mo, ₹300 Feb)</span></label>' +
          '<label class="ck"><input type="checkbox" id="w_lwf" ' + (D.enable_lwf !== false ? 'checked' : '') + '> <span><b>Labor Welfare Fund (LWF)</b> — Enable bi-annual statutory deduction</span></label>' +
        '</div>';
    } else if (S.step === 8) {
      // Step 8: Confirmation & Launch
      body.innerHTML = '<h3 style="margin:0 0 16px;color:#0A1B44;">Step 8: Review & Instant Provisioning</h3>' +
        '<div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #E2E8F0;font-size:14.5px;line-height:1.7;">' +
          '<b>Organization:</b> ' + (D.company_name || '—') + ' (' + (D.code || '—') + ')<br>' +
          '<b>Primary Admin:</b> ' + (D.admin_name || '—') + ' (' + (D.admin_email || '—') + ')<br>' +
          '<b>SaaS Plan:</b> ' + (D.plan_id || 'Standard') + '<br>' +
          '<b>Primary Workplace:</b> ' + (D.site_name || 'Head Office') + ' (' + (D.radius_meters || '500') + 'm radius)<br>' +
          '<b>Default Password:</b> ' + (D.admin_password || 'Admin@12345') + '<br>' +
        '</div>' +
        '<p style="margin:16px 0 0;color:#0F766E;font-weight:600;">Clicking "Provision Client Organization" will immediately configure D1 database records, issue credentials, and activate the tenant workspace.</p>';
    }

    wrap.appendChild(body);

    // Wizard Controls (Back / Next / Finish)
    var acts = el('div', 'wiz-acts');
    acts.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

    var backBtn = el('button', 'sec', '‹ Previous Step');
    backBtn.type = 'button';
    backBtn.disabled = S.step === 1;
    backBtn.onclick = function () {
      saveStepData();
      S.step--;
      refreshView();
    };
    acts.appendChild(backBtn);

    var rightBtn;
    if (S.step < 8) {
      rightBtn = el('button', 'pri', 'Next Step ›');
      rightBtn.type = 'button';
      rightBtn.onclick = function () {
        if (!validateStep()) return;
        saveStepData();
        S.step++;
        refreshView();
      };
    } else {
      rightBtn = el('button', 'pri', '🚀 Provision Client Organization');
      rightBtn.type = 'button';
      rightBtn.style.background = '#10B981';
      rightBtn.onclick = function () {
        submitWizard(rightBtn);
      };
    }
    acts.appendChild(rightBtn);
    wrap.appendChild(acts);

    root.appendChild(wrap);

    function validateStep() {
      if (S.step === 1) {
        var nm = document.getElementById('w_name');
        if (!nm || !nm.value.trim()) { toast('Company name is required', true); return false; }
      }
      if (S.step === 2) {
        var em = document.getElementById('w_aemail');
        if (!em || !em.value.trim()) { toast('Admin email is required', true); return false; }
      }
      return true;
    }

    function saveStepData() {
      if (S.step === 1) {
        D.company_name = (document.getElementById('w_name')?.value || '').trim();
        D.code = (document.getElementById('w_code')?.value || '').trim().toUpperCase();
        D.industry = document.getElementById('w_ind')?.value || 'Other';
        D.address = (document.getElementById('w_addr')?.value || '').trim();
        D.city = (document.getElementById('w_city')?.value || '').trim();
        D.state = (document.getElementById('w_state')?.value || '').trim();
        D.gst_number = (document.getElementById('w_gst')?.value || '').trim();
      } else if (S.step === 2) {
        D.admin_name = (document.getElementById('w_aname')?.value || '').trim();
        D.admin_email = (document.getElementById('w_aemail')?.value || '').trim().toLowerCase();
        D.contact_phone = (document.getElementById('w_aphone')?.value || '').trim();
        D.admin_password = (document.getElementById('w_apwd')?.value || '').trim();
      } else if (S.step === 4) {
        D.site_name = (document.getElementById('w_sname')?.value || '').trim();
        D.latitude = document.getElementById('w_lat')?.value || '19.0760';
        D.longitude = document.getElementById('w_lng')?.value || '72.8777';
        D.radius_meters = document.getElementById('w_rad')?.value || '500';
      } else if (S.step === 6) {
        D.shift_start = document.getElementById('w_sstart')?.value || '09:30';
        D.shift_end = document.getElementById('w_send')?.value || '18:30';
        D.grace_mins = document.getElementById('w_grace')?.value || '15';
        D.half_day_hrs = document.getElementById('w_half')?.value || '4';
      } else if (S.step === 7) {
        D.enable_pf = !!document.getElementById('w_pf')?.checked;
        D.enable_esic = !!document.getElementById('w_esic')?.checked;
        D.enable_pt = !!document.getElementById('w_pt')?.checked;
        D.enable_lwf = !!document.getElementById('w_lwf')?.checked;
      }
    }

    function submitWizard(btn) {
      btn.disabled = true;
      btn.textContent = 'Provisioning…';
      api('/api/portal/clients', 'POST', D).then(function (res) {
        toast('Client organization successfully onboarded and provisioned!');
        S.step = 1;
        S.wizardData = {};
        S.view = 'clients';
        loadAllData().then(refreshView);
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '🚀 Provision Client Organization';
        toast(err.message, true);
      });
    }
  }

  // 4. Plans View
  function renderPlans(root) {
    var wrap = el('div', 'portal-plans');
    wrap.innerHTML = '<div style="margin-bottom:18px;"><h2 style="margin:0;font-size:22px;font-weight:800;color:#0A1B44;">Commercial Subscription Plans</h2><p style="margin:4px 0 0;color:#64748B;font-size:14px;">Configure subscription tiers, employee quotas, and feature entitlements.</p></div>';

    var grid = el('div', 'plans-grid');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:18px;';

    (S.plans || []).forEach(function (p) {
      var card = el('div', 'plan-card');
      card.style.cssText = 'background:#fff;border-radius:20px;border:1px solid #E2E8F0;box-shadow:0 4px 16px rgba(10,27,68,0.04);padding:22px;display:flex;flex-direction:column;';
      card.innerHTML = '<div style="font-size:20px;font-weight:800;color:#0A1B44;">' + p.name + '</div>' +
                       '<div style="font-size:32px;font-weight:800;color:#0F766E;margin:12px 0 6px;">' + formatInr(p.monthly_price_inr) + '<span style="font-size:15px;color:#64748B;font-weight:500;">/mo</span></div>' +
                       '<div style="font-size:14px;color:#64748B;margin-bottom:16px;">' + (p.description || 'Standard corporate plan') + '</div>' +
                       '<ul style="list-style:none;padding:0;margin:0 0 20px;font-size:14px;display:flex;flex-direction:column;gap:8px;">' +
                         '<li>👥 Up to <b>' + p.employee_limit + '</b> Employees</li>' +
                         '<li>📍 Up to <b>' + p.site_limit + '</b> Workplaces / Sites</li>' +
                         '<li>🛡️ Up to <b>' + p.admin_limit + '</b> Admin Seats</li>' +
                         '<li>📱 Mobile App + Web Access</li>' +
                       '</ul>' +
                       '<button class="sec edit-plan-btn" data-id="' + p.id + '" style="margin-top:auto;width:100%;">Edit Plan Quotas</button>';
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    root.appendChild(wrap);

    wrap.querySelectorAll('.edit-plan-btn').forEach(function (btn) {
      btn.onclick = function () {
        var pid = btn.dataset.id;
        var p = S.plans.find(function (x) { return x.id === pid; });
        if (!p) return;
        var newPrice = prompt('Enter new monthly price in INR for ' + p.name + ':', p.monthly_price_inr);
        if (newPrice === null) return;
        var newLimit = prompt('Enter employee limit for ' + p.name + ':', p.employee_limit);
        if (newLimit === null) return;

        api('/api/portal/plans', 'POST', {
          id: p.id,
          name: p.name,
          description: p.description,
          monthly_price_inr: parseFloat(newPrice) || p.monthly_price_inr,
          employee_limit: parseInt(newLimit, 10) || p.employee_limit
        }).then(function () {
          toast('Plan updated successfully');
          loadPlans().then(refreshView);
        }).catch(function (err) { toast(err.message, true); });
      };
    });
  }

  // 5. Subscriptions View
  function renderSubscriptions(root) {
    var wrap = el('div', 'portal-subs');
    wrap.innerHTML = '<div style="margin-bottom:16px;"><h2 style="margin:0;font-size:22px;font-weight:800;color:#0A1B44;">Client Subscriptions & Billing</h2><p style="margin:4px 0 0;color:#64748B;font-size:14px;">Real-time tenant billing ledger, recurring renewals, and active contracts.</p></div>';

    var card = el('div', 'box');
    card.style.cssText = 'background:#fff;border-radius:18px;border:1px solid #E2E8F0;box-shadow:0 4px 14px rgba(10,27,68,0.03);padding:18px;overflow-x:auto;';

    var table = el('table');
    table.innerHTML = '<thead><tr><th>Organization</th><th>Code</th><th>Plan</th><th>Interval</th><th>Monthly Fee</th><th>Renewal Date</th><th>Status</th></tr></thead>';
    var tbody = el('tbody');

    if (!S.subs.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748B;">No active subscriptions found.</td></tr>';
    } else {
      S.subs.forEach(function (s) {
        var tr = el('tr');
        tr.innerHTML = '<td><b>' + (s.organization_name || s.organization_id) + '</b></td>' +
                       '<td><span style="font-family:monospace;background:#F1F5F9;padding:3px 8px;border-radius:6px;font-weight:600;">' + (s.organization_code || '—') + '</span></td>' +
                       '<td><span class="st s-active">' + (s.plan_name || s.plan_id) + '</span></td>' +
                       '<td style="text-transform:capitalize;">' + s.billing_interval + '</td>' +
                       '<td style="font-weight:700;color:#0F766E;">' + formatInr(s.monthly_amount) + '</td>' +
                       '<td>' + (s.renewal_date || '—') + '</td>' +
                       '<td><span class="st ' + (s.status === 'ACTIVE' ? 's-active' : 's-incomplete') + '">' + s.status + '</span></td>';
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    card.appendChild(table);
    wrap.appendChild(card);
    root.appendChild(wrap);
  }

  // 6. Support Tickets View
  function renderTickets(root) {
    var wrap = el('div', 'portal-tickets');
    wrap.innerHTML = '<div style="margin-bottom:16px;"><h2 style="margin:0;font-size:22px;font-weight:800;color:#0A1B44;">Client Helpdesk & Support Tickets</h2><p style="margin:4px 0 0;color:#64748B;font-size:14px;">Customer issues, troubleshooting requests, and service SLA management.</p></div>';

    var card = el('div', 'box');
    card.style.cssText = 'background:#fff;border-radius:18px;border:1px solid #E2E8F0;box-shadow:0 4px 14px rgba(10,27,68,0.03);padding:18px;overflow-x:auto;';

    var table = el('table');
    table.innerHTML = '<thead><tr><th>Ticket #</th><th>Organization</th><th>Subject</th><th>Sender Email</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead>';
    var tbody = el('tbody');

    if (!S.tickets.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748B;">No support tickets logged.</td></tr>';
    } else {
      S.tickets.forEach(function (t) {
        var tr = el('tr');
        tr.innerHTML = '<td><b>#' + t.id + '</b></td>' +
                       '<td>' + (t.organization_name || t.organization_id) + '</td>' +
                       '<td><b>' + t.subject + '</b><br><small style="color:#64748B;">' + (t.message ? t.message.slice(0, 60) + '…' : '') + '</small></td>' +
                       '<td>' + t.user_email + '</td>' +
                       '<td><span class="tag">' + t.priority + '</span></td>' +
                       '<td><span class="st ' + (t.status === 'RESOLVED' ? 's-active' : 's-incomplete') + '">' + t.status + '</span></td>' +
                       '<td><button class="sec sm resolve-ticket-btn" data-id="' + t.id + '" data-status="' + t.status + '">' + (t.status === 'RESOLVED' ? 'Reopen' : 'Mark Resolved') + '</button></td>';
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    card.appendChild(table);
    wrap.appendChild(card);
    root.appendChild(wrap);

    wrap.querySelectorAll('.resolve-ticket-btn').forEach(function (btn) {
      btn.onclick = function () {
        var tid = btn.dataset.id;
        var currentStatus = btn.dataset.status;
        var nextStatus = currentStatus === 'RESOLVED' ? 'OPEN' : 'RESOLVED';
        api('/api/portal/support-tickets', 'POST', { id: tid, status: nextStatus }).then(function () {
          toast('Ticket #' + tid + ' marked ' + nextStatus);
          loadTickets().then(refreshView);
        }).catch(function (err) { toast(err.message, true); });
      };
    });
  }

  // 7. Customizations View
  function renderCustomizations(root) {
    var wrap = el('div', 'portal-cust');
    wrap.innerHTML = '<div style="margin-bottom:16px;"><h2 style="margin:0;font-size:22px;font-weight:800;color:#0A1B44;">Client Customization Requests</h2><p style="margin:4px 0 0;color:#64748B;font-size:14px;">Bespoke reports, custom salary structures, integrations, and commercial work orders.</p></div>';

    var card = el('div', 'box');
    card.style.cssText = 'background:#fff;border-radius:18px;border:1px solid #E2E8F0;box-shadow:0 4px 14px rgba(10,27,68,0.03);padding:18px;overflow-x:auto;';

    var table = el('table');
    table.innerHTML = '<thead><tr><th>ID</th><th>Organization</th><th>Title</th><th>Category</th><th>Estimated Cost</th><th>Status</th><th>Action</th></tr></thead>';
    var tbody = el('tbody');

    if (!S.customizations.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748B;">No customization requests logged.</td></tr>';
    } else {
      S.customizations.forEach(function (c) {
        var tr = el('tr');
        tr.innerHTML = '<td><b>#' + c.id + '</b></td>' +
                       '<td>' + (c.organization_name || c.organization_id) + '</td>' +
                       '<td><b>' + c.title + '</b><br><small style="color:#64748B;">' + (c.description ? c.description.slice(0, 60) + '…' : '') + '</small></td>' +
                       '<td>' + c.category + '</td>' +
                       '<td style="font-weight:700;color:#0F766E;">' + formatInr(c.estimated_cost) + '</td>' +
                       '<td><span class="st ' + (c.status === 'COMPLETED' ? 's-active' : 's-incomplete') + '">' + c.status + '</span></td>' +
                       '<td><button class="sec sm edit-cust-btn" data-id="' + c.id + '">Update Status</button></td>';
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    card.appendChild(table);
    wrap.appendChild(card);
    root.appendChild(wrap);

    wrap.querySelectorAll('.edit-cust-btn').forEach(function (btn) {
      btn.onclick = function () {
        var cid = btn.dataset.id;
        var nextStatus = prompt('Enter new status (SUBMITTED / IN_DEVELOPMENT / COMPLETED / REJECTED):', 'IN_DEVELOPMENT');
        if (!nextStatus) return;
        var cost = prompt('Enter estimated billable cost in INR:', '5000');
        api('/api/portal/customizations', 'POST', {
          id: cid,
          status: nextStatus.toUpperCase(),
          estimated_cost: parseFloat(cost) || 0
        }).then(function () {
          toast('Customization #' + cid + ' updated');
          loadCustomizations().then(refreshView);
        }).catch(function (err) { toast(err.message, true); });
      };
    });
  }

  // -------------------------------------------------------------
  // DATA LOADERS
  // -------------------------------------------------------------

  function loadStats() {
    return api('/api/portal/dashboard').then(function (res) {
      S.stats = res.stats;
      S.stats.recent_clients = res.recent_clients;
    }).catch(function (err) { console.error('Failed to load stats:', err); });
  }

  function loadClients() {
    return api('/api/portal/clients').then(function (res) {
      S.clients = res.clients || [];
    }).catch(function (err) { console.error('Failed to load clients:', err); });
  }

  function loadPlans() {
    return api('/api/portal/plans').then(function (res) {
      S.plans = res.plans || [];
    }).catch(function (err) { console.error('Failed to load plans:', err); });
  }

  function loadSubs() {
    return api('/api/portal/subscriptions').then(function (res) {
      S.subs = res.subscriptions || [];
    }).catch(function (err) { console.error('Failed to load subscriptions:', err); });
  }

  function loadTickets() {
    return api('/api/portal/support-tickets').then(function (res) {
      S.tickets = res.tickets || [];
    }).catch(function (err) { console.error('Failed to load tickets:', err); });
  }

  function loadCustomizations() {
    return api('/api/portal/customizations').then(function (res) {
      S.customizations = res.customizations || [];
    }).catch(function (err) { console.error('Failed to load customizations:', err); });
  }

  function loadAllData() {
    return Promise.all([
      loadStats(),
      loadClients(),
      loadPlans(),
      loadSubs(),
      loadTickets(),
      loadCustomizations()
    ]);
  }

  // -------------------------------------------------------------
  // MAIN VIEW ORCHESTRATION
  // -------------------------------------------------------------

  function refreshView() {
    if (!S.container) return;
    S.container.textContent = '';
    renderNav(S.container);

    var viewContainer = el('div', 'portal-view-container');
    if (S.view === 'dashboard') renderDashboard(viewContainer);
    else if (S.view === 'clients') renderClients(viewContainer);
    else if (S.view === 'onboard') renderOnboardWizard(viewContainer);
    else if (S.view === 'plans') renderPlans(viewContainer);
    else if (S.view === 'subs') renderSubscriptions(viewContainer);
    else if (S.view === 'tickets') renderTickets(viewContainer);
    else if (S.view === 'customizations') renderCustomizations(viewContainer);

    S.container.appendChild(viewContainer);
  }

  window.SAAS_PORTAL = {
    open: function (containerNode) {
      S.container = containerNode;
      S.container.textContent = 'Loading SaaS Owner Central…';
      loadAllData().then(function () {
        refreshView();
      }).catch(function (err) {
        S.container.textContent = 'Error loading portal: ' + err.message;
      });
    },
    setView: function (viewName) {
      S.view = viewName;
      refreshView();
    }
  };

})();
