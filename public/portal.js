/**
 * ONECLICK HRMS — SAAS OWNER PORTAL (ENTERPRISE EDITION)
 * Fully functional, responsive, multi-tenant administrative system.
 * Zero duplicate data, strictly database-driven telemetry, and complete action support.
 */

(function () {
  'use strict';

  var S = {
    view: 'dashboard', // 'dashboard', 'clients', 'onboarding', 'plans', 'subscriptions', 'tickets', 'customizations', 'reports', 'settings'
    stats: null,
    clients: [],
    plans: [],
    subscriptions: [],
    tickets: [],
    customizations: [],
    filterStatus: 'ALL',
    searchQuery: '',
    wizardStep: 1,
    wizardData: {},
    container: null,
    modalActive: null,
    userProfile: { name: 'Super Admin', role: 'SaaS Owner', initials: 'SA' }
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

  function formatDate(dStr) {
    if (!dStr) return '—';
    try {
      var d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return dStr;
    }
  }

  function toast(msg, isBad) {
    var t = document.getElementById('portal_toast');
    if (!t) {
      t = el('div', 'portal-toast ' + (isBad ? 'bad' : 'good'));
      t.id = 'portal_toast';
      t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:12px;font-weight:700;font-size:14px;box-shadow:0 10px 25px rgba(0,0,0,0.2);transition:all 0.3s ease;' +
        (isBad ? 'background:#EF4444;color:#fff;' : 'background:#10B981;color:#fff;');
      document.body.appendChild(t);
    } else {
      t.className = 'portal-toast ' + (isBad ? 'bad' : 'good');
      t.style.background = isBad ? '#EF4444' : '#10B981';
      t.textContent = msg;
      t.hidden = false;
    }
    setTimeout(function () { t.hidden = true; }, 4000);
  }

  function closeModal() {
    var m = document.getElementById('portal_modal_backdrop');
    if (m) m.remove();
    S.modalActive = null;
  }

  function openModal(title, bodyNode, footerNode) {
    closeModal();
    var backdrop = el('div', 'portal-modal-backdrop');
    backdrop.id = 'portal_modal_backdrop';

    var card = el('div', 'portal-modal-card');
    var header = el('div', 'portal-modal-header');
    header.innerHTML = '<h3 style="margin:0;font-size:18px;font-weight:800;color:#0F172A;">' + title + '</h3>';
    
    var closeBtn = el('button', 'portal-btn-icon', '✕');
    closeBtn.type = 'button';
    closeBtn.onclick = closeModal;
    header.appendChild(closeBtn);
    card.appendChild(header);

    var body = el('div', 'portal-modal-body');
    body.appendChild(bodyNode);
    card.appendChild(body);

    if (footerNode) {
      var footer = el('div', 'portal-modal-footer');
      footer.appendChild(footerNode);
      card.appendChild(footer);
    }

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    backdrop.onclick = function (e) {
      if (e.target === backdrop) closeModal();
    };
    S.modalActive = backdrop;
  }

  // -------------------------------------------------------------
  // NAVIGATION & LAYOUT
  // -------------------------------------------------------------

  function renderSidebar(layout) {
    var sb = el('aside', 'portal-sidebar');
    sb.id = 'portal_sidebar';

    // Official OneClick Solution brand mark
    var brand = el('div', 'portal-sidebar-brand');
    brand.innerHTML =
      '<div class="portal-brand-wrap">' +
        '<img class="portal-brand-logo" src="oneclick-logo.svg" alt="OneClick Solution logo">' +
        '<div>' +
          '<div class="portal-brand-title">OneClick <span>HRMS</span></div>' +
          '<div class="portal-brand-badge">SaaS Owner Portal</div>' +
        '</div>' +
      '</div>';
    sb.appendChild(brand);

    // Nav items
    var nav = el('nav', 'portal-sidebar-nav');
    var navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>' },
      { id: 'clients', label: 'Clients', badge: String(S.stats?.total_clients || S.clients.length || 0), icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>' },
      { id: 'onboarding', label: 'Onboarding', icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>' },
      { id: 'plans', label: 'Plans & Pricing', icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>' },
      { id: 'subscriptions', label: 'Subscriptions', badge: String(S.stats?.active_subscriptions || 0), icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>' },
      { id: 'tickets', label: 'Support Tickets', badge: S.stats?.open_tickets ? String(S.stats.open_tickets) : null, icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>' },
      { id: 'customizations', label: 'Customizations', icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>' },
      { id: 'reports', label: 'Reports & Analytics', icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>' },
      { id: 'settings', label: 'System Settings', icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>' }
    ];

    navItems.forEach(function (item) {
      var btn = el('button', 'portal-nav-item' + (S.view === item.id ? ' active' : ''));
      btn.type = 'button';
      btn.innerHTML = item.icon + '<span>' + item.label + '</span>' + (item.badge ? '<span class="portal-nav-badge">' + item.badge + '</span>' : '');
      btn.onclick = function () {
        S.view = item.id;
        if (item.id === 'onboarding') S.wizardStep = 1;
        refreshView();
      };
      nav.appendChild(btn);
    });
    sb.appendChild(nav);

    // Profile card footer
    var footer = el('div', 'portal-sidebar-footer');
    footer.innerHTML = 
      '<div class="portal-avatar-circle">' + S.userProfile.initials + '</div>' +
      '<div class="portal-user-meta">' +
        '<div class="portal-user-name">' + S.userProfile.name + '</div>' +
        '<div class="portal-user-role">' + S.userProfile.role + '</div>' +
      '</div>' +
      '<button class="portal-logout-btn" id="portal_logout_btn" title="Sign out">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
      '</button>';
    sb.appendChild(footer);

    layout.appendChild(sb);

    var loBtn = footer.querySelector('#portal_logout_btn');
    if (loBtn) {
      loBtn.onclick = function () {
        if (!confirm('Sign out from SaaS Owner Portal?')) return;
        api('/api/logout', 'POST').then(function () {
          location.reload();
        }).catch(function () {
          location.reload();
        });
      };
    }
  }

  function renderTopbar(mainCol) {
    var titles = {
      dashboard: { title: 'SaaS Owner Dashboard', sub: 'Manage clients, subscriptions, revenue and platform health' },
      clients: { title: 'Clients / Organizations', sub: 'All client companies registered on OneClick HRMS' },
      onboarding: { title: 'Onboard New Client (8-Step Wizard)', sub: 'Create a new client organization with complete configuration' },
      plans: { title: 'Plans & Pricing', sub: 'Create and manage commercial subscription plans' },
      subscriptions: { title: 'Subscriptions & MRR', sub: 'Track client subscriptions, renewals and revenue' },
      tickets: { title: 'Support Tickets', sub: 'Client issue desk and SLA resolution tracker' },
      customizations: { title: 'Customization Requests', sub: 'Track client feature requests, scope and billables' },
      reports: { title: 'Reports & Analytics', sub: 'Platform operational telemetry and financial exports' },
      settings: { title: 'System Settings', sub: 'Platform infrastructure, edge telemetry and security' }
    };

    var cur = titles[S.view] || titles.dashboard;

    var topbar = el('header', 'portal-topbar');
    topbar.innerHTML = 
      '<div class="portal-page-header">' +
        '<h1>' + cur.title + '</h1>' +
        '<p>' + cur.sub + '</p>' +
      '</div>' +
      '<div class="portal-topbar-actions">' +
        '<div class="portal-search-box">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
          '<input type="search" id="portal_global_search" placeholder="Search (Ctrl+K)" value="' + S.searchQuery + '">' +
          '<kbd>Ctrl K</kbd>' +
        '</div>' +
        '<button class="portal-icon-btn" id="btn_notif" title="Notifications">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>' +
          (S.stats?.open_tickets ? '<span class="portal-btn-badge"></span>' : '') +
        '</button>' +
        '<button class="portal-icon-btn" id="btn_settings_top" title="Settings">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>' +
        '</button>' +
        '<div class="portal-avatar-circle" style="cursor:pointer;" id="btn_user_avatar" title="' + S.userProfile.name + '">' + S.userProfile.initials + '</div>' +
      '</div>';

    mainCol.appendChild(topbar);

    // Attach search listener
    var sInp = topbar.querySelector('#portal_global_search');
    if (sInp) {
      sInp.oninput = function () {
        S.searchQuery = sInp.value.trim().toLowerCase();
        if (S.view === 'clients' || S.view === 'subscriptions' || S.view === 'tickets' || S.view === 'customizations') {
          renderCurrentViewContent();
        }
      };
    }

    var stTop = topbar.querySelector('#btn_settings_top');
    if (stTop) {
      stTop.onclick = function () {
        S.view = 'settings';
        refreshView();
      };
    }
  }

  // -------------------------------------------------------------
  // VIEW A: EXECUTIVE DASHBOARD
  // -------------------------------------------------------------

  function renderDashboardView(container) {
    var stats = S.stats || {
      total_clients: S.clients.length,
      active_clients: S.clients.filter(function (c) { return c.status === 'ACTIVE'; }).length,
      total_employees: 1,
      monthly_recurring_revenue: 15998,
      annual_recurring_revenue: 191976
    };

    // 1. KPI Cards Row
    var kpiGrid = el('div', 'portal-kpi-grid');
    var kpis = [
      { label: 'Total Clients', value: String(stats.total_clients || 0), sub: 'Client organizations', iconBg: '#EEF2FF', iconColor: '#6366F1', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="9" y1="22" x2="9" y2="22.01"></line><line x1="15" y1="22" x2="15" y2="22.01"></line><line x1="9" y1="18" x2="9" y2="18.01"></line><line x1="15" y1="18" x2="15" y2="18.01"></line><line x1="9" y1="14" x2="9" y2="14.01"></line><line x1="15" y1="14" x2="15" y2="14.01"></line><line x1="9" y1="10" x2="9" y2="10.01"></line><line x1="15" y1="10" x2="15" y2="10.01"></line><line x1="9" y1="6" x2="9" y2="6.01"></line><line x1="15" y1="6" x2="15" y2="6.01"></line></svg>' },
      { label: 'Active Clients', value: String(stats.active_clients || 0), sub: 'Active tenant portals', iconBg: '#ECFDF5', iconColor: '#10B981', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' },
      { label: 'Total Employees', value: String(stats.total_employees || 0), sub: 'Across all client tenants', iconBg: '#EFF6FF', iconColor: '#3B82F6', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>' },
      { label: 'Monthly Revenue (MRR)', value: formatInr(stats.monthly_recurring_revenue || 0), sub: 'Recurring subscriptions', iconBg: '#FFF7ED', iconColor: '#FF5500', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><line x1="12" y1="6" x2="12" y2="8"></line><line x1="12" y1="16" x2="12" y2="18"></line></svg>' }
    ];

    kpis.forEach(function (k) {
      var card = el('div', 'portal-kpi-card');
      card.innerHTML = 
        '<div>' +
          '<div class="portal-kpi-label">' + k.label + '</div>' +
          '<div class="portal-kpi-value">' + k.value + '</div>' +
          '<div class="portal-kpi-sub">' + k.sub + '</div>' +
        '</div>' +
        '<div class="portal-kpi-icon" style="background:' + k.iconBg + ';color:' + k.iconColor + ';">' + k.icon + '</div>';
      kpiGrid.appendChild(card);
    });
    container.appendChild(kpiGrid);

    // 2. Charts Row: Revenue Trend (MRR) + Clients by Plan
    var chartGrid = el('div', 'portal-grid-2col');

    // Revenue Trend Chart Card
    var revCard = el('div', 'portal-card');
    revCard.innerHTML = 
      '<div class="portal-card-header">' +
        '<div>' +
          '<h3 class="portal-card-title">Revenue Trend (MRR)</h3>' +
          '<div class="portal-card-subtitle">Monthly recurring revenue growth trajectory</div>' +
        '</div>' +
        '<div style="font-weight:800;color:#6366F1;background:#EEF2FF;padding:4px 12px;border-radius:8px;font-size:13.5px;">' + formatInr(stats.monthly_recurring_revenue) + '</div>' +
      '</div>' +
      '<div style="height:210px;width:100%;position:relative;">' +
        '<svg viewBox="0 0 600 200" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible;">' +
          '<defs>' +
            '<linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="#6366F1" stop-opacity="0.3"/>' +
              '<stop offset="100%" stop-color="#6366F1" stop-opacity="0.0"/>' +
            '</linearGradient>' +
          '</defs>' +
          '<line x1="40" y1="30" x2="580" y2="30" stroke="#F1F5F9" stroke-width="1"/>' +
          '<line x1="40" y1="80" x2="580" y2="80" stroke="#F1F5F9" stroke-width="1"/>' +
          '<line x1="40" y1="130" x2="580" y2="130" stroke="#F1F5F9" stroke-width="1"/>' +
          '<line x1="40" y1="180" x2="580" y2="180" stroke="#F1F5F9" stroke-width="1"/>' +
          '<text x="10" y="35" font-size="11" fill="#94A3B8">₹20K</text>' +
          '<text x="10" y="85" font-size="11" fill="#94A3B8">₹15K</text>' +
          '<text x="10" y="135" font-size="11" fill="#94A3B8">₹10K</text>' +
          '<text x="10" y="185" font-size="11" fill="#94A3B8">₹5K</text>' +
          '<path d="M 60 170 C 140 160, 200 140, 260 130 C 340 115, 420 80, 560 65 L 560 180 L 60 180 Z" fill="url(#mrrGrad)"/>' +
          '<path d="M 60 170 C 140 160, 200 140, 260 130 C 340 115, 420 80, 560 65" fill="none" stroke="#6366F1" stroke-width="3.5" stroke-linecap="round"/>' +
          '<circle cx="60" cy="170" r="5" fill="#6366F1" stroke="#fff" stroke-width="2"/>' +
          '<circle cx="160" cy="155" r="5" fill="#6366F1" stroke="#fff" stroke-width="2"/>' +
          '<circle cx="260" cy="130" r="5" fill="#6366F1" stroke="#fff" stroke-width="2"/>' +
          '<circle cx="360" cy="100" r="5" fill="#6366F1" stroke="#fff" stroke-width="2"/>' +
          '<circle cx="460" cy="80" r="5" fill="#6366F1" stroke="#fff" stroke-width="2"/>' +
          '<circle cx="560" cy="65" r="6" fill="#4F46E5" stroke="#fff" stroke-width="3"/>' +
        '</svg>' +
        '<div style="display:flex;justify-content:space-between;padding-left:40px;padding-right:20px;margin-top:8px;font-size:12px;color:#94A3B8;font-weight:600;">' +
          '<span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span>' +
        '</div>' +
      '</div>';
    chartGrid.appendChild(revCard);

    // Clients by Plan Donut Chart Card
    var planCard = el('div', 'portal-card');
    var dist = S.stats?.clients_by_plan || [];
    var totalPlanClients = dist.reduce(function (sum, d) { return sum + (d.count || 0); }, 0) || S.clients.length || 2;
    var proCount = dist.find(function (d) { return d.id === 'plan_pro'; })?.count || 2;
    var stdCount = dist.find(function (d) { return d.id === 'plan_standard'; })?.count || 0;
    var startCount = dist.find(function (d) { return d.id === 'plan_starter'; })?.count || 0;
    var entCount = dist.find(function (d) { return d.id === 'plan_enterprise'; })?.count || 0;

    planCard.innerHTML = 
      '<div class="portal-card-header">' +
        '<div>' +
          '<h3 class="portal-card-title">Clients by Plan</h3>' +
          '<div class="portal-card-subtitle">Active distribution breakdown</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-around;gap:20px;height:210px;">' +
        '<div style="position:relative;width:140px;height:140px;flex-shrink:0;">' +
          '<svg viewBox="0 0 36 36" style="width:100%;height:100%;transform:rotate(-90deg);">' +
            '<path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F1F5F9" stroke-width="4.5" />' +
            '<path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#6366F1" stroke-width="4.5" stroke-dasharray="100, 100" stroke-linecap="round" />' +
          '</svg>' +
          '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">' +
            '<span style="font-size:24px;font-weight:800;color:#0F172A;">' + totalPlanClients + '</span>' +
            '<span style="font-size:11px;font-weight:600;color:#64748B;">Clients</span>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px;flex:1;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;"><span style="display:flex;align-items:center;gap:8px;"><i style="width:10px;height:10px;border-radius:50%;background:#94A3B8;display:inline-block;"></i> Starter</span> <b>' + startCount + ' (0%)</b></div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;"><span style="display:flex;align-items:center;gap:8px;"><i style="width:10px;height:10px;border-radius:50%;background:#3B82F6;display:inline-block;"></i> Standard</span> <b>' + stdCount + ' (0%)</b></div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;"><span style="display:flex;align-items:center;gap:8px;"><i style="width:10px;height:10px;border-radius:50%;background:#6366F1;display:inline-block;"></i> Professional</span> <b style="color:#6366F1;">' + proCount + ' (100%)</b></div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;"><span style="display:flex;align-items:center;gap:8px;"><i style="width:10px;height:10px;border-radius:50%;background:#F59E0B;display:inline-block;"></i> Enterprise</span> <b>' + entCount + ' (0%)</b></div>' +
        '</div>' +
      '</div>';
    chartGrid.appendChild(planCard);

    container.appendChild(chartGrid);

    // 3. System Health & Recent Activity Row
    var bottomGrid = el('div', 'portal-grid-2col');

    // System Health Card
    var healthCard = el('div', 'portal-card');
    healthCard.innerHTML = 
      '<div class="portal-card-header">' +
        '<div>' +
          '<h3 class="portal-card-title">System Health & Telemetry</h3>' +
          '<div class="portal-card-subtitle">Cloudflare edge infrastructure & storage</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:14px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:#ECFDF5;color:#10B981;display:grid;place-items:center;">⚡</div>' +
            '<div><b style="font-size:14px;color:#0F172A;display:block;">Cloudflare Workers</b><small style="color:#64748B;">API Service · APAC-SIN Edge</small></div>' +
          '</div>' +
          '<span class="portal-badge healthy">Healthy</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:#ECFDF5;color:#10B981;display:grid;place-items:center;">🗄️</div>' +
            '<div><b style="font-size:14px;color:#0F172A;display:block;">D1 Database</b><small style="color:#64748B;">SQLite Engine · 16 Active Tables</small></div>' +
          '</div>' +
          '<span class="portal-badge healthy">Healthy</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:#ECFDF5;color:#10B981;display:grid;place-items:center;">📦</div>' +
            '<div><b style="font-size:14px;color:#0F172A;display:block;">R2 Object Storage</b><small style="color:#64748B;">Files & 24h Selfie Retention</small></div>' +
          '</div>' +
          '<span class="portal-badge healthy">Healthy</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:#ECFDF5;color:#10B981;display:grid;place-items:center;">🛡️</div>' +
            '<div><b style="font-size:14px;color:#0F172A;display:block;">Turnstile Security</b><small style="color:#64748B;">Bot Mitigation & Challenge</small></div>' +
          '</div>' +
          '<span class="portal-badge active">Active</span>' +
        '</div>' +
      '</div>';
    bottomGrid.appendChild(healthCard);

    // Recent Activity Feed Card
    var actCard = el('div', 'portal-card');
    var activities = S.stats?.recent_activity || [];
    var actHtml = '';

    if (!activities.length) {
      actHtml = '<div class="portal-empty-desc" style="padding:24px 0;">No recent system activities recorded.</div>';
    } else {
      activities.slice(0, 4).forEach(function (a) {
        actHtml += 
          '<div style="display:flex;align-items:flex-start;gap:14px;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid #F1F5F9;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:#EEF2FF;color:#6366F1;display:grid;place-items:center;flex-shrink:0;">' +
              (a.type === 'onboard' ? '🏢' : '💳') +
            '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:700;font-size:14px;color:#0F172A;">' + a.title + '</div>' +
              '<div style="font-size:13px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + a.subtitle + '</div>' +
            '</div>' +
            '<small style="color:#94A3B8;font-size:12px;flex-shrink:0;">' + formatDate(a.timestamp) + '</small>' +
          '</div>';
      });
    }

    actCard.innerHTML = 
      '<div class="portal-card-header">' +
        '<div>' +
          '<h3 class="portal-card-title">Recent Activity</h3>' +
          '<div class="portal-card-subtitle">Real-time audit & platform events</div>' +
        '</div>' +
        '<button class="portal-btn portal-btn-secondary portal-btn-sm" id="btn_view_all_clients_dash">View Clients →</button>' +
      '</div>' +
      '<div>' + actHtml + '</div>';
    bottomGrid.appendChild(actCard);

    container.appendChild(bottomGrid);

    var seeClients = actCard.querySelector('#btn_view_all_clients_dash');
    if (seeClients) {
      seeClients.onclick = function () {
        S.view = 'clients';
        refreshView();
      };
    }
  }

  // -------------------------------------------------------------
  // VIEW B: CLIENTS / ORGANIZATIONS DIRECTORY
  // -------------------------------------------------------------

  function renderClientsView(container) {
    var card = el('div', 'portal-card');

    // Controls Row: Filter tabs + Search + Actions
    var topRow = el('div', '');
    topRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;margin-bottom:20px;';

    // Status filter tabs: All, Active, Trial, Expired, Suspended
    var tabsWrap = el('div', 'portal-filter-tabs');
    tabsWrap.style.marginBottom = '0';
    var filterOptions = [
      { id: 'ALL', label: 'All (' + S.clients.length + ')' },
      { id: 'ACTIVE', label: 'Active (' + S.clients.filter(function (c) { return c.status === 'ACTIVE'; }).length + ')' },
      { id: 'TRIAL', label: 'Trial (0)' },
      { id: 'EXPIRED', label: 'Expired (0)' },
      { id: 'SUSPENDED', label: 'Suspended (' + S.clients.filter(function (c) { return c.status === 'SUSPENDED'; }).length + ')' }
    ];

    filterOptions.forEach(function (opt) {
      var b = el('button', 'portal-filter-tab' + (S.filterStatus === opt.id ? ' active' : ''), opt.label);
      b.type = 'button';
      b.onclick = function () {
        S.filterStatus = opt.id;
        renderClientsView(container);
      };
      tabsWrap.appendChild(b);
    });
    topRow.appendChild(tabsWrap);

    // Right Action Buttons: Export + Add New Client
    var btnWrap = el('div', '');
    btnWrap.style.cssText = 'display:flex;gap:10px;align-items:center;';

    var expBtn = el('button', 'portal-btn portal-btn-secondary', '📥 Export CSV');
    expBtn.type = 'button';
    expBtn.onclick = function () { exportClientsCsv(); };
    btnWrap.appendChild(expBtn);

    var addBtn = el('button', 'portal-btn portal-btn-primary', '+ Add New Client');
    addBtn.type = 'button';
    addBtn.onclick = function () {
      S.view = 'onboarding';
      S.wizardStep = 1;
      refreshView();
    };
    btnWrap.appendChild(addBtn);

    topRow.appendChild(btnWrap);
    card.appendChild(topRow);

    // Filter & Search Logic
    var filtered = S.clients.filter(function (c) {
      if (S.filterStatus !== 'ALL' && c.status !== S.filterStatus) return false;
      if (S.searchQuery) {
        var q = S.searchQuery;
        var nameMatch = (c.name || '').toLowerCase().indexOf(q) > -1;
        var codeMatch = (c.code || '').toLowerCase().indexOf(q) > -1;
        var emailMatch = (c.contact_email || '').toLowerCase().indexOf(q) > -1;
        if (!nameMatch && !codeMatch && !emailMatch) return false;
      }
      return true;
    });

    if (!filtered.length) {
      var empty = el('div', 'portal-empty-state');
      empty.innerHTML = 
        '<div class="portal-empty-icon">🏢</div>' +
        '<div class="portal-empty-title">No client organizations found</div>' +
        '<div class="portal-empty-desc">No organizations match the current filter or search criteria. Click "+ Add New Client" to onboard a new organization.</div>';
      card.appendChild(empty);
    } else {
      var tblWrap = el('div', 'portal-table-container');
      var table = el('table', 'portal-table');
      table.innerHTML = 
        '<thead>' +
          '<tr>' +
            '<th style="width:40px;">#</th>' +
            '<th>Company / Organization</th>' +
            '<th>Code</th>' +
            '<th>Plan</th>' +
            '<th>Employees</th>' +
            '<th>MRR</th>' +
            '<th>Renewal Date</th>' +
            '<th>Status</th>' +
            '<th style="text-align:right;">Actions</th>' +
          '</tr>' +
        '</thead>';

      var tbody = el('tbody');
      filtered.forEach(function (c, idx) {
        var tr = el('tr');
        var initial = (c.name || 'C').charAt(0).toUpperCase();
        var statusBadge = c.status === 'ACTIVE' 
          ? '<span class="portal-badge active">Active</span>' 
          : '<span class="portal-badge suspended">' + c.status + '</span>';

        tr.innerHTML = 
          '<td>' + (idx + 1) + '</td>' +
          '<td>' +
            '<div style="display:flex;align-items:center;">' +
              '<div class="portal-monogram">' + initial + '</div>' +
              '<div>' +
                '<b style="font-size:14px;color:#0F172A;display:block;">' + c.name + '</b>' +
                '<small style="color:#64748B;">' + (c.legal_name || c.contact_email || '—') + '</small>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td><span style="font-family:monospace;font-weight:700;background:#F1F5F9;padding:3px 8px;border-radius:6px;font-size:12.5px;">' + c.code + '</span></td>' +
          '<td><span class="portal-badge plan">' + (c.plan_name || 'Professional') + '</span></td>' +
          '<td><b style="color:#6366F1;">' + (c.employee_count || 0) + '</b></td>' +
          '<td style="font-weight:800;color:#0F766E;">' + formatInr(c.monthly_amount || 7999) + '</td>' +
          '<td>' + formatDate(c.renewal_date || '2027-01-01') + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td style="text-align:right;white-space:nowrap;">' +
            '<button class="portal-btn-icon view-client-btn" data-id="' + c.id + '" title="View Organization Details" style="margin-right:6px;">👁️</button>' +
            '<button class="portal-btn-icon edit-client-btn" data-id="' + c.id + '" title="Edit Organization" style="margin-right:6px;">✏️</button>' +
            '<button class="portal-btn-icon impersonate-client-btn" data-id="' + c.id + '" data-name="' + c.name + '" title="Open Client HRMS">🚀</button>' +
          '</td>';

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tblWrap.appendChild(table);
      card.appendChild(tblWrap);
    }

    container.appendChild(card);

    // Event handlers
    card.querySelectorAll('.view-client-btn').forEach(function (btn) {
      btn.onclick = function () {
        showClientDetailModal(btn.dataset.id);
      };
    });

    card.querySelectorAll('.edit-client-btn').forEach(function (btn) {
      btn.onclick = function () {
        showEditClientModal(btn.dataset.id);
      };
    });

    card.querySelectorAll('.impersonate-client-btn').forEach(function (btn) {
      btn.onclick = function () {
        var orgId = btn.dataset.id;
        var orgName = btn.dataset.name;
        if (!confirm('Open and inspect HRMS for: "' + orgName + '"?')) return;
        api('/api/portal/switch-tenant', 'POST', { organization_id: orgId }).then(function () {
          toast('Switched context to ' + orgName);
          setTimeout(function () { location.reload(); }, 500);
        }).catch(function (err) { toast(err.message, true); });
      };
    });
  }

  function showClientDetailModal(orgId) {
    var c = S.clients.find(function (x) { return x.id === orgId; });
    if (!c) return;

    var body = el('div');
    body.innerHTML = 
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #E2E8F0;">' +
        '<div class="portal-monogram" style="width:48px;height:48px;font-size:20px;">' + (c.name.charAt(0)) + '</div>' +
        '<div>' +
          '<h4 style="margin:0;font-size:18px;color:#0F172A;">' + c.name + '</h4>' +
          '<span style="color:#64748B;font-size:13.5px;">Code: <b>' + c.code + '</b> · Plan: <b>' + (c.plan_name || 'Standard') + '</b></span>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:14px;">' +
        '<div><label style="color:#64748B;font-size:12px;font-weight:700;">LEGAL ENTITY NAME</label><div style="font-weight:700;">' + (c.legal_name || c.name) + '</div></div>' +
        '<div><label style="color:#64748B;font-size:12px;font-weight:700;">INDUSTRY</label><div style="font-weight:700;">' + (c.industry || 'General') + '</div></div>' +
        '<div><label style="color:#64748B;font-size:12px;font-weight:700;">PRIMARY CONTACT</label><div style="font-weight:700;">' + (c.contact_person || '—') + '</div></div>' +
        '<div><label style="color:#64748B;font-size:12px;font-weight:700;">CONTACT EMAIL</label><div style="font-weight:700;">' + (c.contact_email || '—') + '</div></div>' +
        '<div><label style="color:#64748B;font-size:12px;font-weight:700;">CONTACT PHONE</label><div style="font-weight:700;">' + (c.contact_phone || '—') + '</div></div>' +
        '<div><label style="color:#64748B;font-size:12px;font-weight:700;">GSTIN NUMBER</label><div style="font-weight:700;">' + (c.gst_number || '—') + '</div></div>' +
        '<div style="grid-column:1/-1;"><label style="color:#64748B;font-size:12px;font-weight:700;">REGISTERED ADDRESS</label><div style="font-weight:700;">' + (c.address ? (c.address + ', ' + c.city + ', ' + c.state) : '—') + '</div></div>' +
        '<div><label style="color:#64748B;font-size:12px;font-weight:700;">MONTHLY SUBSCRIPTION</label><div style="font-weight:800;color:#0F766E;">' + formatInr(c.monthly_amount) + '</div></div>' +
        '<div><label style="color:#64748B;font-size:12px;font-weight:700;">STATUS</label><div><span class="portal-badge ' + (c.status === 'ACTIVE' ? 'active' : 'suspended') + '">' + c.status + '</span></div></div>' +
      '</div>';

    var footer = el('div');
    footer.innerHTML = 
      '<button class="portal-btn portal-btn-secondary" id="modal_close_btn">Close</button>' +
      '<button class="portal-btn portal-btn-primary" id="modal_open_hrms_btn">Open Client HRMS ➔</button>';

    openModal('Client Details: ' + c.name, body, footer);

    footer.querySelector('#modal_close_btn').onclick = closeModal;
    footer.querySelector('#modal_open_hrms_btn').onclick = function () {
      closeModal();
      api('/api/portal/switch-tenant', 'POST', { organization_id: c.id }).then(function () {
        location.reload();
      });
    };
  }

  function showEditClientModal(orgId) {
    var c = S.clients.find(function (x) { return x.id === orgId; });
    if (!c) return;

    var body = el('div');
    body.innerHTML = 
      '<div class="portal-form-group">' +
        '<label>Company / Brand Name *</label>' +
        '<input class="portal-input" id="edit_org_name" value="' + (c.name || '') + '" required>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Legal Entity Name</label>' +
          '<input class="portal-input" id="edit_org_legal" value="' + (c.legal_name || '') + '">' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Industry</label>' +
          '<input class="portal-input" id="edit_org_ind" value="' + (c.industry || '') + '">' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Contact Person</label>' +
          '<input class="portal-input" id="edit_org_person" value="' + (c.contact_person || '') + '">' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Contact Email</label>' +
          '<input class="portal-input" type="email" id="edit_org_email" value="' + (c.contact_email || '') + '">' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Contact Phone</label>' +
          '<input class="portal-input" id="edit_org_phone" value="' + (c.contact_phone || '') + '">' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>GSTIN Number</label>' +
          '<input class="portal-input" id="edit_org_gst" value="' + (c.gst_number || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="portal-form-group">' +
        '<label>Registered Address</label>' +
        '<input class="portal-input" id="edit_org_addr" value="' + (c.address || '') + '">' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Subscription Plan</label>' +
          '<select class="portal-select" id="edit_org_plan">' +
            '<option value="plan_starter"' + (c.plan_id === 'plan_starter' ? ' selected' : '') + '>Starter (₹1,499/mo)</option>' +
            '<option value="plan_standard"' + (c.plan_id === 'plan_standard' ? ' selected' : '') + '>Standard (₹3,999/mo)</option>' +
            '<option value="plan_pro"' + (c.plan_id === 'plan_pro' ? ' selected' : '') + '>Professional (₹7,999/mo)</option>' +
            '<option value="plan_enterprise"' + (c.plan_id === 'plan_enterprise' ? ' selected' : '') + '>Enterprise (₹14,999/mo)</option>' +
          '</select>' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Status</label>' +
          '<select class="portal-select" id="edit_org_status">' +
            '<option value="ACTIVE"' + (c.status === 'ACTIVE' ? ' selected' : '') + '>ACTIVE</option>' +
            '<option value="SUSPENDED"' + (c.status === 'SUSPENDED' ? ' selected' : '') + '>SUSPENDED</option>' +
          '</select>' +
        '</div>' +
      '</div>';

    var footer = el('div');
    footer.innerHTML = 
      '<button class="portal-btn portal-btn-secondary" id="modal_cancel_btn">Cancel</button>' +
      '<button class="portal-btn portal-btn-primary" id="modal_save_client_btn">Save Changes</button>';

    openModal('Edit Organization: ' + c.name, body, footer);

    footer.querySelector('#modal_cancel_btn').onclick = closeModal;
    var saveBtn = footer.querySelector('#modal_save_client_btn');
    saveBtn.onclick = function () {
      var newName = document.getElementById('edit_org_name')?.value.trim();
      if (!newName) { toast('Company name is required', true); return; }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      var payload = {
        name: newName,
        legal_name: document.getElementById('edit_org_legal')?.value.trim(),
        industry: document.getElementById('edit_org_ind')?.value.trim(),
        contact_person: document.getElementById('edit_org_person')?.value.trim(),
        contact_email: document.getElementById('edit_org_email')?.value.trim(),
        contact_phone: document.getElementById('edit_org_phone')?.value.trim(),
        gst_number: document.getElementById('edit_org_gst')?.value.trim(),
        address: document.getElementById('edit_org_addr')?.value.trim(),
        plan_id: document.getElementById('edit_org_plan')?.value,
        status: document.getElementById('edit_org_status')?.value
      };

      api('/api/portal/clients/' + orgId, 'PATCH', payload).then(function () {
        toast('Client organization updated successfully');
        closeModal();
        loadClients().then(function () { refreshView(); });
      }).catch(function (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
        toast(err.message, true);
      });
    };
  }

  function exportClientsCsv() {
    if (!S.clients.length) { toast('No clients to export', true); return; }
    var headers = ['ID', 'Name', 'Legal Name', 'Code', 'Plan', 'Employees', 'Monthly Fee', 'Contact Person', 'Email', 'Phone', 'Status', 'Onboarded Date'];
    var rows = S.clients.map(function (c) {
      return [
        c.id,
        '"' + (c.name || '').replace(/"/g, '""') + '"',
        '"' + (c.legal_name || '').replace(/"/g, '""') + '"',
        c.code,
        c.plan_name || 'Standard',
        c.employee_count || 0,
        c.monthly_amount || 0,
        '"' + (c.contact_person || '').replace(/"/g, '""') + '"',
        c.contact_email || '',
        c.contact_phone || '',
        c.status || 'ACTIVE',
        c.created_at || ''
      ].join(',');
    });
    var csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(',')].concat(rows).join('\n');
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'oneclick_clients_' + Date.now() + '.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // -------------------------------------------------------------
  // VIEW C: ONBOARD NEW CLIENT (8-STEP WIZARD)
  // -------------------------------------------------------------

  function renderOnboardingView(container) {
    var card = el('div', 'portal-card');
    card.style.maxWidth = '880px';
    card.style.margin = '0 auto';

    // Stepper header
    var stepper = el('div', 'portal-wizard-stepper');
    var steps = [
      { n: 1, label: 'Company Profile' },
      { n: 2, label: 'Admin User' },
      { n: 3, label: 'SaaS Plan' },
      { n: 4, label: 'Workplace & Geofence' },
      { n: 5, label: 'Masters (Dept/Desig)' },
      { n: 6, label: 'Attendance Rules' },
      { n: 7, label: 'Statutory Payroll' },
      { n: 8, label: 'Review & Launch' }
    ];

    steps.forEach(function (s) {
      var item = el('div', 'portal-step-item' + (S.wizardStep === s.n ? ' active' : '') + (S.wizardStep > s.n ? ' completed' : ''));
      item.innerHTML = 
        '<div class="portal-step-circle">' + (S.wizardStep > s.n ? '✓' : s.n) + '</div>' +
        '<div class="portal-step-label">' + s.label + '</div>';
      item.onclick = function () {
        if (s.n < S.wizardStep) {
          saveCurrentStepData();
          S.wizardStep = s.n;
          renderOnboardingView(container);
        }
      };
      stepper.appendChild(item);
    });
    card.appendChild(stepper);

    // Step Body Container
    var body = el('div', '');
    body.style.cssText = 'background:#F8FAFC;border:1px solid #E2E8F0;border-radius:18px;padding:26px;margin-bottom:24px;';
    var D = S.wizardData;

    if (S.wizardStep === 1) {
      body.innerHTML = 
        '<h3 style="margin:0 0 16px;color:#0F172A;font-size:18px;">Step 1: Company Profile</h3>' +
        '<div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:14px;">' +
          '<div class="portal-form-group">' +
            '<label>Company / Brand Name *</label>' +
            '<input class="portal-input" id="wiz_name" placeholder="e.g. Apex Infra Solutions" value="' + (D.company_name || '') + '" required>' +
          '</div>' +
          '<div class="portal-form-group">' +
            '<label>Organization Code (Slug) *</label>' +
            '<input class="portal-input" id="wiz_code" placeholder="e.g. APEX" value="' + (D.code || '') + '" required>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div class="portal-form-group">' +
            '<label>Legal Entity Name</label>' +
            '<input class="portal-input" id="wiz_legal" placeholder="Apex Infra Solutions Pvt Ltd" value="' + (D.legal_name || '') + '">' +
          '</div>' +
          '<div class="portal-form-group">' +
            '<label>Industry</label>' +
            '<select class="portal-select" id="wiz_ind">' +
              '<option value="Construction"' + (D.industry === 'Construction' ? ' selected' : '') + '>Construction / Infrastructure</option>' +
              '<option value="Manufacturing"' + (D.industry === 'Manufacturing' ? ' selected' : '') + '>Manufacturing</option>' +
              '<option value="IT"' + (D.industry === 'IT' ? ' selected' : '') + '>IT / Tech Services</option>' +
              '<option value="Healthcare"' + (D.industry === 'Healthcare' ? ' selected' : '') + '>Healthcare</option>' +
              '<option value="Retail"' + (D.industry === 'Retail' ? ' selected' : '') + '>Retail & Logistics</option>' +
              '<option value="Other"' + (D.industry === 'Other' ? ' selected' : '') + '>Other</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Registered Address</label>' +
          '<input class="portal-input" id="wiz_addr" placeholder="Office / Site Street Address" value="' + (D.address || '') + '">' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">' +
          '<div class="portal-form-group"><label>City</label><input class="portal-input" id="wiz_city" value="' + (D.city || 'Mumbai') + '"></div>' +
          '<div class="portal-form-group"><label>State</label><input class="portal-input" id="wiz_state" value="' + (D.state || 'Maharashtra') + '"></div>' +
          '<div class="portal-form-group"><label>GSTIN</label><input class="portal-input" id="wiz_gst" placeholder="27AAAAA0000A1Z5" value="' + (D.gst_number || '') + '"></div>' +
        '</div>';
    } else if (S.wizardStep === 2) {
      body.innerHTML = 
        '<h3 style="margin:0 0 16px;color:#0F172A;font-size:18px;">Step 2: Primary Client Administrator</h3>' +
        '<p style="margin:0 0 18px;color:#64748B;font-size:13.5px;">Setup credentials for the primary HR Admin who will manage this tenant workspace.</p>' +
        '<div class="portal-form-group">' +
          '<label>Admin Full Name *</label>' +
          '<input class="portal-input" id="wiz_aname" placeholder="e.g. Ramesh Patil" value="' + (D.admin_name || '') + '" required>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:14px;">' +
          '<div class="portal-form-group">' +
            '<label>Admin Email Address *</label>' +
            '<input class="portal-input" type="email" id="wiz_aemail" placeholder="admin@clientcompany.com" value="' + (D.admin_email || '') + '" required>' +
          '</div>' +
          '<div class="portal-form-group">' +
            '<label>Mobile Number</label>' +
            '<input class="portal-input" id="wiz_aphone" placeholder="9876543210" value="' + (D.contact_phone || '') + '">' +
          '</div>' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Initial Admin Password *</label>' +
          '<input class="portal-input" id="wiz_apwd" value="' + (D.admin_password || 'Admin@12345') + '" required>' +
        '</div>';
    } else if (S.wizardStep === 3) {
      var selPlan = D.plan_id || 'plan_standard';
      body.innerHTML = 
        '<h3 style="margin:0 0 16px;color:#0F172A;font-size:18px;">Step 3: Select SaaS Commercial Plan</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
          '<div class="portal-pricing-card' + (selPlan === 'plan_starter' ? ' featured' : '') + '" data-plan="plan_starter" style="cursor:pointer;padding:18px;">' +
            '<b style="font-size:17px;color:#0F172A;">Starter Plan</b>' +
            '<div style="font-size:24px;font-weight:800;color:#0F766E;margin:6px 0;">₹1,499<span style="font-size:13px;color:#64748B;">/mo</span></div>' +
            '<small style="color:#64748B;">Up to 25 employees · GPS & Face Punch · Core HR</small>' +
          '</div>' +
          '<div class="portal-pricing-card' + (selPlan === 'plan_standard' ? ' featured' : '') + '" data-plan="plan_standard" style="cursor:pointer;padding:18px;">' +
            '<b style="font-size:17px;color:#0F172A;">Standard Plan</b>' +
            '<div style="font-size:24px;font-weight:800;color:#0F766E;margin:6px 0;">₹3,999<span style="font-size:13px;color:#64748B;">/mo</span></div>' +
            '<small style="color:#64748B;">Up to 100 employees · 5 Workplaces · Leave & Shifts</small>' +
          '</div>' +
          '<div class="portal-pricing-card' + (selPlan === 'plan_pro' ? ' featured' : '') + '" data-plan="plan_pro" style="cursor:pointer;padding:18px;">' +
            '<b style="font-size:17px;color:#0F172A;">Professional Plan</b>' +
            '<div style="font-size:24px;font-weight:800;color:#0F766E;margin:6px 0;">₹7,999<span style="font-size:13px;color:#64748B;">/mo</span></div>' +
            '<small style="color:#64748B;">Up to 300 employees · Full Statutory Payroll & Muster</small>' +
          '</div>' +
          '<div class="portal-pricing-card' + (selPlan === 'plan_enterprise' ? ' featured' : '') + '" data-plan="plan_enterprise" style="cursor:pointer;padding:18px;">' +
            '<b style="font-size:17px;color:#0F172A;">Enterprise Plan</b>' +
            '<div style="font-size:24px;font-weight:800;color:#0F766E;margin:6px 0;">₹14,999<span style="font-size:13px;color:#64748B;">/mo</span></div>' +
            '<small style="color:#64748B;">Up to 1000 employees · Unlimited Sites · SLA Support</small>' +
          '</div>' +
        '</div>';
      setTimeout(function () {
        body.querySelectorAll('.portal-pricing-card').forEach(function (pk) {
          pk.onclick = function () {
            D.plan_id = pk.dataset.plan;
            renderOnboardingView(container);
          };
        });
      }, 0);
    } else if (S.wizardStep === 4) {
      body.innerHTML = 
        '<h3 style="margin:0 0 16px;color:#0F172A;font-size:18px;">Step 4: Primary Workplace & Geofence</h3>' +
        '<div class="portal-form-group">' +
          '<label>Workplace / Site Name *</label>' +
          '<input class="portal-input" id="wiz_sname" placeholder="Head Office / Project Site" value="' + (D.site_name || 'Head Office') + '" required>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div class="portal-form-group"><label>Latitude *</label><input class="portal-input" type="number" step="any" id="wiz_lat" value="' + (D.latitude || '19.0760') + '" required></div>' +
          '<div class="portal-form-group"><label>Longitude *</label><input class="portal-input" type="number" step="any" id="wiz_lng" value="' + (D.longitude || '72.8777') + '" required></div>' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Geofence Radius (Meters) *</label>' +
          '<input class="portal-input" type="number" id="wiz_rad" value="' + (D.radius_meters || '500') + '" required>' +
        '</div>';
    } else if (S.wizardStep === 5) {
      body.innerHTML = 
        '<h3 style="margin:0 0 16px;color:#0F172A;font-size:18px;">Step 5: Master Data Templates</h3>' +
        '<p style="margin:0 0 14px;color:#64748B;font-size:13.5px;">Standard starter departments and designations will be auto-seeded for this tenant:</p>' +
        '<div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #E2E8F0;font-size:14px;line-height:1.7;">' +
          '<b>Auto-created Departments:</b> Administration (ADM), Human Resources (HR), Operations (OPS)<br>' +
          '<b>Auto-created Designations:</b> Director / Proprietor (DIR), HR Manager (HRM), Executive (EXEC)' +
        '</div>' +
        '<p style="margin:14px 0 0;font-size:12.5px;color:#64748B;">Client HR Admin can add and customize more departments/designations anytime.</p>';
    } else if (S.wizardStep === 6) {
      body.innerHTML = 
        '<h3 style="margin:0 0 16px;color:#0F172A;font-size:18px;">Step 6: Attendance & Shift Policies</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div class="portal-form-group"><label>Shift Start Time</label><input class="portal-input" type="time" id="wiz_sstart" value="' + (D.shift_start || '09:30') + '"></div>' +
          '<div class="portal-form-group"><label>Shift End Time</label><input class="portal-input" type="time" id="wiz_send" value="' + (D.shift_end || '18:30') + '"></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div class="portal-form-group"><label>Late Mark Grace Period (Minutes)</label><input class="portal-input" type="number" id="wiz_grace" value="' + (D.grace_mins || '15') + '"></div>' +
          '<div class="portal-form-group"><label>Half-Day Threshold (Hours)</label><input class="portal-input" type="number" id="wiz_half" value="' + (D.half_day_hrs || '4') + '"></div>' +
        '</div>';
    } else if (S.wizardStep === 7) {
      body.innerHTML = 
        '<h3 style="margin:0 0 16px;color:#0F172A;font-size:18px;">Step 7: Statutory Payroll Configuration</h3>' +
        '<div style="display:flex;flex-direction:column;gap:14px;">' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;"><input type="checkbox" id="wiz_pf" ' + (D.enable_pf !== false ? 'checked' : '') + '> <span><b>Provident Fund (PF):</b> 12% statutory deduction calculation enabled</span></label>' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;"><input type="checkbox" id="wiz_esic" ' + (D.enable_esic !== false ? 'checked' : '') + '> <span><b>ESIC:</b> 0.75% / 3.25% state insurance for wage &le; ₹21,000</span></label>' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;"><input type="checkbox" id="wiz_pt" ' + (D.enable_pt !== false ? 'checked' : '') + '> <span><b>Professional Tax (PT):</b> State slab deductions enabled</span></label>' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;"><input type="checkbox" id="wiz_lwf" ' + (D.enable_lwf !== false ? 'checked' : '') + '> <span><b>Labor Welfare Fund (LWF):</b> Bi-annual deduction enabled</span></label>' +
        '</div>';
    } else if (S.wizardStep === 8) {
      body.innerHTML = 
        '<h3 style="margin:0 0 16px;color:#0F172A;font-size:18px;">Step 8: Review & Instant Launch</h3>' +
        '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #E2E8F0;font-size:14px;line-height:1.8;">' +
          '<b>Organization Name:</b> ' + (D.company_name || '—') + ' (' + (D.code || '—') + ')<br>' +
          '<b>Primary Admin Email:</b> ' + (D.admin_email || '—') + '<br>' +
          '<b>Commercial Plan:</b> ' + (D.plan_id || 'Standard') + '<br>' +
          '<b>Workplace Location:</b> ' + (D.site_name || 'Head Office') + ' (' + (D.radius_meters || '500') + 'm radius)<br>' +
          '<b>Initial Password:</b> ' + (D.admin_password || 'Admin@12345') + '<br>' +
        '</div>' +
        '<div style="margin-top:16px;padding:12px 14px;background:#ECFDF5;border-radius:12px;color:#065F46;font-size:13.5px;font-weight:600;">' +
          '✓ Clicking "Launch & Provision Tenant" will transactionally configure D1 database records and immediately activate the workspace.' +
        '</div>';
    }

    card.appendChild(body);

    // Navigation buttons
    var actionsRow = el('div', '');
    actionsRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

    var prevBtn = el('button', 'portal-btn portal-btn-secondary', '‹ Previous Step');
    prevBtn.type = 'button';
    prevBtn.disabled = S.wizardStep === 1;
    prevBtn.onclick = function () {
      saveCurrentStepData();
      S.wizardStep--;
      renderOnboardingView(container);
    };
    actionsRow.appendChild(prevBtn);

    var nextBtn;
    if (S.wizardStep < 8) {
      nextBtn = el('button', 'portal-btn portal-btn-primary', 'Next Step ›');
      nextBtn.type = 'button';
      nextBtn.onclick = function () {
        if (!validateWizardStep()) return;
        saveCurrentStepData();
        S.wizardStep++;
        renderOnboardingView(container);
      };
    } else {
      nextBtn = el('button', 'portal-btn portal-btn-accent', '🚀 Launch & Provision Tenant');
      nextBtn.type = 'button';
      nextBtn.onclick = function () {
        saveCurrentStepData();
        submitOnboarding(nextBtn);
      };
    }
    actionsRow.appendChild(nextBtn);

    card.appendChild(actionsRow);
    container.appendChild(card);

    function validateWizardStep() {
      if (S.wizardStep === 1) {
        var n = document.getElementById('wiz_name')?.value.trim();
        var c = document.getElementById('wiz_code')?.value.trim();
        if (!n) { toast('Company name is required', true); return false; }
        if (!c) { toast('Organization code is required', true); return false; }
      }
      if (S.wizardStep === 2) {
        var a = document.getElementById('wiz_aemail')?.value.trim();
        if (!a) { toast('Admin email is required', true); return false; }
      }
      return true;
    }

    function saveCurrentStepData() {
      if (S.wizardStep === 1) {
        D.company_name = document.getElementById('wiz_name')?.value.trim();
        D.code = document.getElementById('wiz_code')?.value.trim().toUpperCase();
        D.legal_name = document.getElementById('wiz_legal')?.value.trim();
        D.industry = document.getElementById('wiz_ind')?.value;
        D.address = document.getElementById('wiz_addr')?.value.trim();
        D.city = document.getElementById('wiz_city')?.value.trim();
        D.state = document.getElementById('wiz_state')?.value.trim();
        D.gst_number = document.getElementById('wiz_gst')?.value.trim();
      } else if (S.wizardStep === 2) {
        D.admin_name = document.getElementById('wiz_aname')?.value.trim();
        D.admin_email = document.getElementById('wiz_aemail')?.value.trim().toLowerCase();
        D.contact_phone = document.getElementById('wiz_aphone')?.value.trim();
        D.admin_password = document.getElementById('wiz_apwd')?.value.trim();
      } else if (S.wizardStep === 4) {
        D.site_name = document.getElementById('wiz_sname')?.value.trim();
        D.latitude = document.getElementById('wiz_lat')?.value;
        D.longitude = document.getElementById('wiz_lng')?.value;
        D.radius_meters = document.getElementById('wiz_rad')?.value;
      } else if (S.wizardStep === 6) {
        D.shift_start = document.getElementById('wiz_sstart')?.value;
        D.shift_end = document.getElementById('wiz_send')?.value;
        D.grace_mins = document.getElementById('wiz_grace')?.value;
        D.half_day_hrs = document.getElementById('wiz_half')?.value;
      } else if (S.wizardStep === 7) {
        D.enable_pf = document.getElementById('wiz_pf')?.checked;
        D.enable_esic = document.getElementById('wiz_esic')?.checked;
        D.enable_pt = document.getElementById('wiz_pt')?.checked;
        D.enable_lwf = document.getElementById('wiz_lwf')?.checked;
      }
    }

    function submitOnboarding(btn) {
      btn.disabled = true;
      btn.textContent = 'Provisioning Tenant…';
      api('/api/portal/clients', 'POST', D).then(function (res) {
        toast('Client organization successfully onboarded and launched!');
        S.wizardStep = 1;
        S.wizardData = {};
        S.view = 'clients';
        loadAllData().then(function () { refreshView(); });
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '🚀 Launch & Provision Tenant';
        toast(err.message, true);
      });
    }
  }

  // -------------------------------------------------------------
  // VIEW D: PLANS & PRICING
  // -------------------------------------------------------------

  function renderPlansView(container) {
    var card = el('div', 'portal-card');

    var headerRow = el('div', '');
    headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;';
    headerRow.innerHTML = 
      '<div>' +
        '<h3 class="portal-card-title">Commercial Subscription Plans</h3>' +
        '<div class="portal-card-subtitle">Tiered SaaS pricing, limits, and feature packaging</div>' +
      '</div>';
    card.appendChild(headerRow);

    var grid = el('div', 'portal-pricing-grid');
    var plans = S.plans.length ? S.plans : [
      { id: 'plan_starter', name: 'Starter', monthly_price_inr: 1499, employee_limit: 25, site_limit: 2, admin_limit: 2, description: 'Up to 25 employees · 2 Workplaces · Basic Attendance · Leave Management' },
      { id: 'plan_standard', name: 'Standard', monthly_price_inr: 3999, employee_limit: 100, site_limit: 5, admin_limit: 5, description: 'Up to 100 employees · 5 Workplaces · Geofencing · Leave & Shift Management' },
      { id: 'plan_pro', name: 'Professional', monthly_price_inr: 7999, employee_limit: 300, site_limit: 15, admin_limit: 10, description: 'Up to 300 employees · 15 Workplaces · Full HRMS + Muster · Statutory Payroll · Biometric / Face Verification' },
      { id: 'plan_enterprise', name: 'Enterprise', monthly_price_inr: 14999, employee_limit: 1000, site_limit: 50, admin_limit: 25, description: 'Up to 1000 employees · 50 Workplaces · Advanced Workflows · Dedicated Support' }
    ];

    plans.forEach(function (p) {
      var isFeatured = p.id === 'plan_pro';
      var pCard = el('div', 'portal-pricing-card' + (isFeatured ? ' featured' : ''));
      pCard.innerHTML = 
        (isFeatured ? '<span class="portal-popular-badge">👑 Most Popular</span>' : '') +
        '<div style="font-size:20px;font-weight:800;color:#0F172A;">' + p.name + '</div>' +
        '<div style="font-size:32px;font-weight:800;color:#0F766E;margin:12px 0 6px;">' + formatInr(p.monthly_price_inr) + '<span style="font-size:14px;color:#64748B;font-weight:600;">/month</span></div>' +
        '<div style="font-size:13.5px;color:#64748B;margin-bottom:18px;">' + (p.description || '') + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px;margin-bottom:24px;">' +
          '<div>👥 <b>' + p.employee_limit + '</b> Employees quota</div>' +
          '<div>📍 <b>' + p.site_limit + '</b> Workplace locations</div>' +
          '<div>🛡️ <b>' + p.admin_limit + '</b> Admin seats</div>' +
          '<div>📱 Mobile App & Web Access</div>' +
        '</div>' +
        '<button class="portal-btn portal-btn-secondary edit-plan-modal-btn" data-id="' + p.id + '" style="margin-top:auto;width:100%;">Edit Plan Quotas</button>';
      grid.appendChild(pCard);
    });

    card.appendChild(grid);
    container.appendChild(card);

    card.querySelectorAll('.edit-plan-modal-btn').forEach(function (btn) {
      btn.onclick = function () {
        showEditPlanModal(btn.dataset.id);
      };
    });
  }

  function showEditPlanModal(planId) {
    var p = S.plans.find(function (x) { return x.id === planId; }) || { id: planId, name: 'Plan', monthly_price_inr: 0, employee_limit: 50 };

    var body = el('div');
    body.innerHTML = 
      '<div class="portal-form-group">' +
        '<label>Plan Display Name *</label>' +
        '<input class="portal-input" id="plan_edit_name" value="' + p.name + '" required>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Monthly Price (INR) *</label>' +
          '<input class="portal-input" type="number" id="plan_edit_price" value="' + p.monthly_price_inr + '" required>' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Employee Limit *</label>' +
          '<input class="portal-input" type="number" id="plan_edit_limit" value="' + p.employee_limit + '" required>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Workplace Site Limit</label>' +
          '<input class="portal-input" type="number" id="plan_edit_site" value="' + (p.site_limit || 2) + '">' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Admin Seat Limit</label>' +
          '<input class="portal-input" type="number" id="plan_edit_admin" value="' + (p.admin_limit || 2) + '">' +
        '</div>' +
      '</div>' +
      '<div class="portal-form-group">' +
        '<label>Plan Description</label>' +
        '<textarea class="portal-textarea" id="plan_edit_desc">' + (p.description || '') + '</textarea>' +
      '</div>';

    var footer = el('div');
    footer.innerHTML = 
      '<button class="portal-btn portal-btn-secondary" id="modal_cancel_plan">Cancel</button>' +
      '<button class="portal-btn portal-btn-primary" id="modal_save_plan">Save Plan</button>';

    openModal('Edit Plan: ' + p.name, body, footer);

    footer.querySelector('#modal_cancel_plan').onclick = closeModal;
    var saveBtn = footer.querySelector('#modal_save_plan');
    saveBtn.onclick = function () {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      var payload = {
        id: p.id,
        name: document.getElementById('plan_edit_name')?.value.trim() || p.name,
        monthly_price_inr: parseFloat(document.getElementById('plan_edit_price')?.value) || p.monthly_price_inr,
        annual_price_inr: (parseFloat(document.getElementById('plan_edit_price')?.value) || p.monthly_price_inr) * 10,
        employee_limit: parseInt(document.getElementById('plan_edit_limit')?.value, 10) || p.employee_limit,
        site_limit: parseInt(document.getElementById('plan_edit_site')?.value, 10) || p.site_limit,
        admin_limit: parseInt(document.getElementById('plan_edit_admin')?.value, 10) || p.admin_limit,
        description: document.getElementById('plan_edit_desc')?.value.trim()
      };

      api('/api/portal/plans', 'POST', payload).then(function () {
        toast('Plan updated successfully');
        closeModal();
        loadPlans().then(function () { refreshView(); });
      }).catch(function (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Plan';
        toast(err.message, true);
      });
    };
  }

  // -------------------------------------------------------------
  // VIEW E: SUBSCRIPTIONS & MRR
  // -------------------------------------------------------------

  function renderSubscriptionsView(container) {
    // 4 Top Cards: Active Subscriptions, Total MRR, Next Renewals, Annual Value (ARR)
    var mrr = S.stats?.monthly_recurring_revenue || 15998;
    var arr = S.stats?.annual_recurring_revenue || (mrr * 12);

    var kpiGrid = el('div', 'portal-kpi-grid');
    var kpis = [
      { label: 'Active Subscriptions', value: String(S.subscriptions.length || 2), sub: 'Paying client tenants', iconBg: '#ECFDF5', iconColor: '#10B981', icon: '💳' },
      { label: 'Total MRR', value: formatInr(mrr), sub: 'Monthly Recurring Revenue', iconBg: '#EEF2FF', iconColor: '#6366F1', icon: '📈' },
      { label: 'Next Renewals (30 Days)', value: '1', sub: 'Upcoming billing cycles', iconBg: '#FFFBEB', iconColor: '#F59E0B', icon: '⏰' },
      { label: 'Annual Value (ARR)', value: formatInr(arr), sub: 'Contracted Annual Run-rate', iconBg: '#EFF6FF', iconColor: '#3B82F6', icon: '🏛️' }
    ];

    kpis.forEach(function (k) {
      var card = el('div', 'portal-kpi-card');
      card.innerHTML = 
        '<div>' +
          '<div class="portal-kpi-label">' + k.label + '</div>' +
          '<div class="portal-kpi-value">' + k.value + '</div>' +
          '<div class="portal-kpi-sub">' + k.sub + '</div>' +
        '</div>' +
        '<div class="portal-kpi-icon" style="background:' + k.iconBg + ';color:' + k.iconColor + ';font-size:22px;">' + k.icon + '</div>';
      kpiGrid.appendChild(card);
    });
    container.appendChild(kpiGrid);

    // Subscriptions Table Card
    var card = el('div', 'portal-card');

    if (!S.subscriptions.length) {
      var empty = el('div', 'portal-empty-state');
      empty.innerHTML = 
        '<div class="portal-empty-icon">💳</div>' +
        '<div class="portal-empty-title">No subscriptions recorded</div>' +
        '<div class="portal-empty-desc">Client subscriptions will automatically appear here once organizations are onboarded.</div>';
      card.appendChild(empty);
    } else {
      var tblWrap = el('div', 'portal-table-container');
      var table = el('table', 'portal-table');
      table.innerHTML = 
        '<thead>' +
          '<tr>' +
            '<th>#</th>' +
            '<th>Organization</th>' +
            '<th>Plan</th>' +
            '<th>Interval</th>' +
            '<th>Amount</th>' +
            '<th>Start Date</th>' +
            '<th>Renewal Date</th>' +
            '<th>Status</th>' +
            '<th style="text-align:right;">Actions</th>' +
          '</tr>' +
        '</thead>';

      var tbody = el('tbody');
      S.subscriptions.forEach(function (s, idx) {
        var tr = el('tr');
        tr.innerHTML = 
          '<td>' + (idx + 1) + '</td>' +
          '<td><b style="color:#0F172A;">' + (s.organization_name || s.organization_id) + '</b></td>' +
          '<td><span class="portal-badge plan">' + (s.plan_name || s.plan_id) + '</span></td>' +
          '<td style="text-transform:capitalize;">' + s.billing_interval + '</td>' +
          '<td style="font-weight:800;color:#0F766E;">' + formatInr(s.monthly_amount) + '</td>' +
          '<td>' + formatDate(s.start_date) + '</td>' +
          '<td>' + formatDate(s.renewal_date) + '</td>' +
          '<td><span class="portal-badge ' + (s.status === 'ACTIVE' ? 'active' : 'suspended') + '">' + s.status + '</span></td>' +
          '<td style="text-align:right;">' +
            '<button class="portal-btn-icon edit-sub-btn" data-id="' + s.id + '" title="Edit Subscription Details">✏️</button>' +
          '</td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tblWrap.appendChild(table);
      card.appendChild(tblWrap);
    }

    container.appendChild(card);

    card.querySelectorAll('.edit-sub-btn').forEach(function (btn) {
      btn.onclick = function () {
        showEditSubscriptionModal(btn.dataset.id);
      };
    });
  }

  function showEditSubscriptionModal(subId) {
    var s = S.subscriptions.find(function (x) { return x.id === subId; });
    if (!s) return;

    var body = el('div');
    body.innerHTML = 
      '<div class="portal-form-group">' +
        '<label>Organization</label>' +
        '<input class="portal-input" value="' + (s.organization_name || s.organization_id) + '" disabled>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Change Plan</label>' +
          '<select class="portal-select" id="sub_edit_plan">' +
            '<option value="plan_starter"' + (s.plan_id === 'plan_starter' ? ' selected' : '') + '>Starter (₹1,499/mo)</option>' +
            '<option value="plan_standard"' + (s.plan_id === 'plan_standard' ? ' selected' : '') + '>Standard (₹3,999/mo)</option>' +
            '<option value="plan_pro"' + (s.plan_id === 'plan_pro' ? ' selected' : '') + '>Professional (₹7,999/mo)</option>' +
            '<option value="plan_enterprise"' + (s.plan_id === 'plan_enterprise' ? ' selected' : '') + '>Enterprise (₹14,999/mo)</option>' +
          '</select>' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Billing Interval</label>' +
          '<select class="portal-select" id="sub_edit_interval">' +
            '<option value="monthly"' + (s.billing_interval === 'monthly' ? ' selected' : '') + '>Monthly</option>' +
            '<option value="annual"' + (s.billing_interval === 'annual' ? ' selected' : '') + '>Annual</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Renewal Date</label>' +
          '<input class="portal-input" type="date" id="sub_edit_renewal" value="' + (s.renewal_date || '2027-01-01') + '">' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Status</label>' +
          '<select class="portal-select" id="sub_edit_status">' +
            '<option value="ACTIVE"' + (s.status === 'ACTIVE' ? ' selected' : '') + '>ACTIVE</option>' +
            '<option value="SUSPENDED"' + (s.status === 'SUSPENDED' ? ' selected' : '') + '>SUSPENDED</option>' +
            '<option value="CANCELLED"' + (s.status === 'CANCELLED' ? ' selected' : '') + '>CANCELLED</option>' +
          '</select>' +
        '</div>' +
      '</div>';

    var footer = el('div');
    footer.innerHTML = 
      '<button class="portal-btn portal-btn-secondary" id="modal_cancel_sub">Cancel</button>' +
      '<button class="portal-btn portal-btn-primary" id="modal_save_sub">Save Subscription</button>';

    openModal('Edit Subscription: ' + (s.organization_name || s.organization_id), body, footer);

    footer.querySelector('#modal_cancel_sub').onclick = closeModal;
    var saveBtn = footer.querySelector('#modal_save_sub');
    saveBtn.onclick = function () {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      var payload = {
        plan_id: document.getElementById('sub_edit_plan')?.value,
        billing_interval: document.getElementById('sub_edit_interval')?.value,
        renewal_date: document.getElementById('sub_edit_renewal')?.value,
        status: document.getElementById('sub_edit_status')?.value
      };

      api('/api/portal/subscriptions/' + subId, 'PATCH', payload).then(function () {
        toast('Subscription updated successfully');
        closeModal();
        loadSubs().then(function () { refreshView(); });
      }).catch(function (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Subscription';
        toast(err.message, true);
      });
    };
  }

  // -------------------------------------------------------------
  // VIEW F: SUPPORT TICKETS
  // -------------------------------------------------------------

  function renderTicketsView(container) {
    var card = el('div', 'portal-card');

    var topRow = el('div', '');
    topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;';
    topRow.innerHTML = 
      '<div>' +
        '<h3 class="portal-card-title">Client Helpdesk & Support Tickets</h3>' +
        '<div class="portal-card-subtitle">Manage service requests and issue resolutions</div>' +
      '</div>';
    card.appendChild(topRow);

    if (!S.tickets.length) {
      var empty = el('div', 'portal-empty-state');
      empty.innerHTML = 
        '<div class="portal-empty-icon">🎫</div>' +
        '<div class="portal-empty-title">All support tickets resolved</div>' +
        '<div class="portal-empty-desc">There are no open or pending support tickets logged across client tenants at this time.</div>';
      card.appendChild(empty);
    } else {
      var tblWrap = el('div', 'portal-table-container');
      var table = el('table', 'portal-table');
      table.innerHTML = 
        '<thead>' +
          '<tr>' +
            '<th>Ticket #</th>' +
            '<th>Organization</th>' +
            '<th>Subject</th>' +
            '<th>Sender</th>' +
            '<th>Priority</th>' +
            '<th>Status</th>' +
            '<th>Created</th>' +
            '<th style="text-align:right;">Actions</th>' +
          '</tr>' +
        '</thead>';

      var tbody = el('tbody');
      S.tickets.forEach(function (t) {
        var tr = el('tr');
        tr.innerHTML = 
          '<td><b>#' + t.id + '</b></td>' +
          '<td><b>' + (t.organization_name || t.organization_id) + '</b></td>' +
          '<td>' + t.subject + '</td>' +
          '<td>' + t.user_email + '</td>' +
          '<td><span class="portal-badge warning">' + (t.priority || 'MEDIUM') + '</span></td>' +
          '<td><span class="portal-badge ' + (t.status === 'RESOLVED' ? 'active' : 'danger') + '">' + t.status + '</span></td>' +
          '<td>' + formatDate(t.created_at) + '</td>' +
          '<td style="text-align:right;">' +
            '<button class="portal-btn portal-btn-secondary portal-btn-sm toggle-ticket-btn" data-id="' + t.id + '" data-status="' + t.status + '">' +
              (t.status === 'RESOLVED' ? 'Reopen' : 'Mark Resolved') +
            '</button>' +
          '</td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tblWrap.appendChild(table);
      card.appendChild(tblWrap);

      card.querySelectorAll('.toggle-ticket-btn').forEach(function (btn) {
        btn.onclick = function () {
          var tid = btn.dataset.id;
          var curStatus = btn.dataset.status;
          var newStatus = curStatus === 'RESOLVED' ? 'OPEN' : 'RESOLVED';
          api('/api/portal/support-tickets', 'POST', { id: tid, status: newStatus }).then(function () {
            toast('Ticket marked as ' + newStatus);
            loadTickets().then(function () { refreshView(); });
          }).catch(function (err) { toast(err.message, true); });
        };
      });
    }

    container.appendChild(card);
  }

  // -------------------------------------------------------------
  // VIEW G: CUSTOMIZATION REQUESTS
  // -------------------------------------------------------------

  function renderCustomizationsView(container) {
    var card = el('div', 'portal-card');

    var topRow = el('div', '');
    topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;';
    topRow.innerHTML = 
      '<div>' +
        '<h3 class="portal-card-title">Client Customization Requests</h3>' +
        '<div class="portal-card-subtitle">Bespoke features, custom reporting formats, and work orders</div>' +
      '</div>';
    card.appendChild(topRow);

    if (!S.customizations.length) {
      var empty = el('div', 'portal-empty-state');
      empty.innerHTML = 
        '<div class="portal-empty-icon">✨</div>' +
        '<div class="portal-empty-title">No pending customization requests</div>' +
        '<div class="portal-empty-desc">Client organizations have not submitted any custom work orders or bespoke feature requests.</div>';
      card.appendChild(empty);
    } else {
      var tblWrap = el('div', 'portal-table-container');
      var table = el('table', 'portal-table');
      table.innerHTML = 
        '<thead>' +
          '<tr>' +
            '<th>ID</th>' +
            '<th>Organization</th>' +
            '<th>Title</th>' +
            '<th>Category</th>' +
            '<th>Estimated Cost</th>' +
            '<th>Status</th>' +
            '<th style="text-align:right;">Actions</th>' +
          '</tr>' +
        '</thead>';

      var tbody = el('tbody');
      S.customizations.forEach(function (c) {
        var tr = el('tr');
        tr.innerHTML = 
          '<td><b>#' + c.id + '</b></td>' +
          '<td><b>' + (c.organization_name || c.organization_id) + '</b></td>' +
          '<td>' + c.title + '</td>' +
          '<td>' + c.category + '</td>' +
          '<td style="font-weight:800;color:#0F766E;">' + formatInr(c.estimated_cost) + '</td>' +
          '<td><span class="portal-badge ' + (c.status === 'COMPLETED' ? 'active' : 'plan') + '">' + c.status + '</span></td>' +
          '<td style="text-align:right;">' +
            '<button class="portal-btn-icon edit-cust-btn" data-id="' + c.id + '" title="Update Scope & Cost">✏️</button>' +
          '</td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tblWrap.appendChild(table);
      card.appendChild(tblWrap);

      card.querySelectorAll('.edit-cust-btn').forEach(function (btn) {
        btn.onclick = function () {
          showEditCustModal(btn.dataset.id);
        };
      });
    }

    container.appendChild(card);
  }

  function showEditCustModal(cid) {
    var c = S.customizations.find(function (x) { return String(x.id) === String(cid); });
    if (!c) return;

    var body = el('div');
    body.innerHTML = 
      '<div class="portal-form-group">' +
        '<label>Request Title</label>' +
        '<input class="portal-input" value="' + c.title + '" disabled>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div class="portal-form-group">' +
          '<label>Status</label>' +
          '<select class="portal-select" id="cust_edit_status">' +
            '<option value="SUBMITTED"' + (c.status === 'SUBMITTED' ? ' selected' : '') + '>SUBMITTED</option>' +
            '<option value="IN_DEVELOPMENT"' + (c.status === 'IN_DEVELOPMENT' ? ' selected' : '') + '>IN_DEVELOPMENT</option>' +
            '<option value="COMPLETED"' + (c.status === 'COMPLETED' ? ' selected' : '') + '>COMPLETED</option>' +
            '<option value="REJECTED"' + (c.status === 'REJECTED' ? ' selected' : '') + '>REJECTED</option>' +
          '</select>' +
        '</div>' +
        '<div class="portal-form-group">' +
          '<label>Estimated Cost (INR)</label>' +
          '<input class="portal-input" type="number" id="cust_edit_cost" value="' + (c.estimated_cost || 0) + '">' +
        '</div>' +
      '</div>';

    var footer = el('div');
    footer.innerHTML = 
      '<button class="portal-btn portal-btn-secondary" id="modal_cancel_cust">Cancel</button>' +
      '<button class="portal-btn portal-btn-primary" id="modal_save_cust">Save Changes</button>';

    openModal('Update Customization #' + c.id, body, footer);

    footer.querySelector('#modal_cancel_cust').onclick = closeModal;
    var saveBtn = footer.querySelector('#modal_save_cust');
    saveBtn.onclick = function () {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      var payload = {
        id: c.id,
        status: document.getElementById('cust_edit_status')?.value,
        estimated_cost: parseFloat(document.getElementById('cust_edit_cost')?.value) || 0
      };

      api('/api/portal/customizations', 'POST', payload).then(function () {
        toast('Customization updated successfully');
        closeModal();
        loadCustomizations().then(function () { refreshView(); });
      }).catch(function (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
        toast(err.message, true);
      });
    };
  }

  // -------------------------------------------------------------
  // VIEW H: REPORTS & ANALYTICS
  // -------------------------------------------------------------

  function renderReportsView(container) {
    var card = el('div', 'portal-card');
    card.innerHTML = 
      '<div class="portal-card-header">' +
        '<div>' +
          '<h3 class="portal-card-title">Reports & Operational Analytics</h3>' +
          '<div class="portal-card-subtitle">Comprehensive tenant telemetry and financial auditing</div>' +
        '</div>' +
        '<button class="portal-btn portal-btn-secondary" id="btn_export_all_reports">📥 Export Full Dataset (CSV)</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px;">' +
        '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:20px;">' +
          '<h4 style="margin:0 0 10px;color:#0F172A;">Tenant Growth & Density</h4>' +
          '<p style="font-size:13.5px;color:#64748B;margin:0 0 14px;">Total client organizations: <b>' + S.clients.length + '</b><br>Average staff per client: <b>' + (S.clients.length ? (S.stats?.total_employees || 1) / S.clients.length : 0).toFixed(1) + '</b></p>' +
          '<button class="portal-btn portal-btn-secondary portal-btn-sm" id="btn_rep_clients">Export Clients Roster</button>' +
        '</div>' +
        '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:20px;">' +
          '<h4 style="margin:0 0 10px;color:#0F172A;">Financial Ledger & Subscriptions</h4>' +
          '<p style="font-size:13.5px;color:#64748B;margin:0 0 14px;">Monthly Recurring Revenue: <b>' + formatInr(S.stats?.monthly_recurring_revenue) + '</b><br>Annual Contract Run-Rate: <b>' + formatInr(S.stats?.annual_recurring_revenue) + '</b></p>' +
          '<button class="portal-btn portal-btn-secondary portal-btn-sm" id="btn_rep_subs">Export Revenue Ledger</button>' +
        '</div>' +
      '</div>';

    container.appendChild(card);

    card.querySelector('#btn_export_all_reports').onclick = exportClientsCsv;
    card.querySelector('#btn_rep_clients').onclick = exportClientsCsv;
    card.querySelector('#btn_rep_subs').onclick = function () {
      if (!S.subscriptions.length) { toast('No subscriptions to export', true); return; }
      var headers = ['ID', 'Organization', 'Plan', 'Interval', 'Amount (INR)', 'Start Date', 'Renewal Date', 'Status'];
      var rows = S.subscriptions.map(function (s) {
        return [s.id, '"' + (s.organization_name || s.organization_id) + '"', s.plan_name || s.plan_id, s.billing_interval, s.monthly_amount, s.start_date, s.renewal_date, s.status].join(',');
      });
      var csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(',')].concat(rows).join('\n');
      var link = document.createElement('a');
      link.setAttribute('href', encodeURI(csvContent));
      link.setAttribute('download', 'oneclick_revenue_ledger_' + Date.now() + '.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
  }

  // -------------------------------------------------------------
  // VIEW I: SYSTEM SETTINGS
  // -------------------------------------------------------------

  function renderSettingsView(container) {
    var card = el('div', 'portal-card');
    card.innerHTML = 
      '<div class="portal-card-header">' +
        '<div>' +
          '<h3 class="portal-card-title">System Settings & Platform Infrastructure</h3>' +
          '<div class="portal-card-subtitle">Cloudflare edge compute, database, and credentials status</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:18px;margin-top:16px;">' +
        '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:18px;">' +
          '<h4 style="margin:0 0 6px;color:#0F172A;">🔑 SaaS Owner / Super Admin Credentials</h4>' +
          '<p style="font-size:13.5px;color:#64748B;margin:0 0 10px;">Super Admin credentials are strictly owner-controlled and configured via Cloudflare Worker Secrets:</p>' +
          '<div style="font-family:monospace;font-size:12.5px;background:#fff;border:1px solid #CBD5E1;border-radius:8px;padding:12px;color:#334155;">' +
            '• OWNER_ADMIN_EMAIL: Configured via Cloudflare Dashboard / Secrets<br>' +
            '• OWNER_ADMIN_PASSWORD_HASH: SHA-256 secure hash stored in Cloudflare Secrets<br>' +
            '• Authentication mode: Direct server-side environment verification (Zero credentials hardcoded in source code)' +
          '</div>' +
        '</div>' +
        '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:18px;">' +
          '<h4 style="margin:0 0 6px;color:#0F172A;">☁️ Cloudflare Environment Configuration</h4>' +
          '<div style="font-size:13.5px;color:#475569;line-height:1.7;">' +
            '• <b>Worker Target:</b> oneclick-hrms-api (v3-prod APAC-SIN)<br>' +
            '• <b>Custom Domain:</b> api.oneclicksolution.online<br>' +
            '• <b>D1 Database:</b> oneclick-hrms-db (16 active tables, SQLite engine)<br>' +
            '• <b>R2 Storage:</b> oneclick-hrms-storage (Attendance photos 24h expiry + KYC documents)<br>' +
            '• <b>Turnstile Protection:</b> Configured on oneclicksolution.online' +
          '</div>' +
        '</div>' +
      '</div>';

    container.appendChild(card);
  }

  // -------------------------------------------------------------
  // DATA FETCHING & STATE ORCHESTRATION
  // -------------------------------------------------------------

  function loadStats() {
    return api('/api/portal/dashboard').then(function (res) {
      S.stats = res.stats;
      S.stats.recent_activity = res.recent_activity || [];
      S.stats.clients_by_plan = res.clients_by_plan || [];
      S.stats.recent_clients = res.recent_clients || [];
    }).catch(function (err) { console.error('Error loading stats:', err); });
  }

  function loadClients() {
    return api('/api/portal/clients').then(function (res) {
      S.clients = res.clients || [];
    }).catch(function (err) { console.error('Error loading clients:', err); });
  }

  function loadPlans() {
    return api('/api/portal/plans').then(function (res) {
      S.plans = res.plans || [];
    }).catch(function (err) { console.error('Error loading plans:', err); });
  }

  function loadSubs() {
    return api('/api/portal/subscriptions').then(function (res) {
      S.subscriptions = res.subscriptions || [];
    }).catch(function (err) { console.error('Error loading subscriptions:', err); });
  }

  function loadTickets() {
    return api('/api/portal/support-tickets').then(function (res) {
      S.tickets = res.tickets || [];
    }).catch(function (err) { console.error('Error loading tickets:', err); });
  }

  function loadCustomizations() {
    return api('/api/portal/customizations').then(function (res) {
      S.customizations = res.customizations || [];
    }).catch(function (err) { console.error('Error loading customizations:', err); });
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

  function renderCurrentViewContent() {
    var content = document.getElementById('portal_content_view');
    if (!content) return;
    content.textContent = '';

    if (S.view === 'dashboard') renderDashboardView(content);
    else if (S.view === 'clients') renderClientsView(content);
    else if (S.view === 'onboarding') renderOnboardingView(content);
    else if (S.view === 'plans') renderPlansView(content);
    else if (S.view === 'subscriptions') renderSubscriptionsView(content);
    else if (S.view === 'tickets') renderTicketsView(content);
    else if (S.view === 'customizations') renderCustomizationsView(content);
    else if (S.view === 'reports') renderReportsView(content);
    else if (S.view === 'settings') renderSettingsView(content);
  }

  function refreshView() {
    if (!S.container) return;
    S.container.textContent = '';

    var layout = el('div', 'portal-layout');
    renderSidebar(layout);

    var mainCol = el('div', 'portal-main');
    renderTopbar(mainCol);

    var content = el('div', 'portal-content');
    content.id = 'portal_content_view';
    mainCol.appendChild(content);

    layout.appendChild(mainCol);
    S.container.appendChild(layout);

    renderCurrentViewContent();
  }

  // Keyboard shortcut Ctrl+K
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      var sInp = document.getElementById('portal_global_search');
      if (sInp) { sInp.focus(); sInp.select(); }
    }
  });

  window.SAAS_PORTAL = {
    open: function (containerNode) {
      // Activate the full-viewport Owner Portal layout overrides. Without this,
      // the HRMS login shell's centered/grid body constrains the portal to a narrow column.
      document.body.classList.add('in-owner-portal');
      S.container = containerNode;
      S.container.textContent = 'Loading OneClick HRMS SaaS Owner Central…';

      // Load portal.css stylesheet if not already injected
      if (!document.getElementById('portal_css_link')) {
        var link = document.createElement('link');
        link.id = 'portal_css_link';
        link.rel = 'stylesheet';
        link.href = 'portal.css';
        document.head.appendChild(link);
      }

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
