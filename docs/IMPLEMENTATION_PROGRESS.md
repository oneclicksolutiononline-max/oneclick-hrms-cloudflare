# ONECLICK HRMS — Commercial Multi-Tenant SaaS Implementation Tracker

**Last Updated:** 2026-11-19  
**Platform URL:** [https://api.oneclicksolution.online/](https://api.oneclicksolution.online/)  
**GitHub Repository:** [oneclicksolutiononline-max/oneclick-hrms-cloudflare](https://github.com/oneclicksolutiononline-max/oneclick-hrms-cloudflare)  
**Production Git Commit:** `404ad8b` (Branch: `main`)

---

## 1. Executive Summary

The transformation of the HRMS codebase into **ONECLICK HRMS**—a commercial, multi-tenant B2B SaaS platform for multiple client organizations—has reached active production status on Cloudflare.

The platform is operational with complete tenant isolation, Layer A SaaS Owner Central, Layer B Client HRMS, and an 8-Step Client Onboarding Wizard.

---

## 2. Infrastructure & Cloudflare Topology

| Component | Identifier / Detail | Status |
| :--- | :--- | :--- |
| **Edge Compute** | Cloudflare Worker: `oneclick-hrms-api` | 🟢 Active (v3-prod APAC-SIN) |
| **Custom Domain** | `api.oneclicksolution.online` | 🟢 Live & SSL Verified |
| **D1 Database** | `oneclick-hrms-db` (`10b0c631-0def-4d00-9cac-04b67bb2de28`) | 🟢 Healthy (16 SQLite tables) |
| **R2 Storage** | `oneclick-hrms-storage` | 🟢 Healthy (Selfie 24h retention + Docs) |
| **Bot Mitigation** | Cloudflare Turnstile (`0x4AAAAAAGI0FYGmcdAtJbnA`) | 🟢 Integrated |
| **Static Frontends** | Cloudflare Worker Assets (36 files) | 🟢 Deployed & Cached |

---

## 3. Implemented SaaS Architecture (Three-Layer Model)

### Layer A: SaaS Owner Portal (`/portal` / Super Admin Central)
- **Executive Dashboard:** Live telemetry showing total client organizations, active paying tenants, total employees across all tenants, and real-time Monthly Recurring Revenue (MRR in ₹).
- **Client Organization Directory:** Interactive table of all onboarded organizations with contact details, plan type, employee counts, status (`ACTIVE` / `SUSPENDED`), and quick actions.
- **8-Step Client Onboarding Wizard:**
  - *Step 1:* Company profile (legal name, brand name, code/slug, GSTIN, address)
  - *Step 2:* Primary administrator (name, email, mobile, initial password)
  - *Step 3:* SaaS commercial plan selection (Starter, Standard, Pro, Enterprise)
  - *Step 4:* Primary workplace & geofence (lat/lng, boundary radius in meters)
  - *Step 5:* Master data template seeding (standard departments & designations)
  - *Step 6:* Attendance & shift policies (timings, grace minutes, half-day thresholds)
  - *Step 7:* Statutory payroll settings (PF, ESIC, PT, LWF configuration)
  - *Step 8:* Instant transactional provisioning via D1 batch execution.
- **Commercial Plans & Pricing:** Tiered catalog (Starter ₹1,499, Standard ₹3,999, Pro ₹7,999, Enterprise ₹14,999) with real-time editing of limits and fees.
- **Subscriptions & Billing Ledger:** Live subscription tracking with renewal dates and billing intervals.
- **Support & Helpdesk Desk:** Ticket tracking and resolution workflows (`saas_support_tickets`).
- **Customizations Desk:** Tracking of billable feature requests and work orders (`saas_customizations`).
- **Tenant Context Switching:** Instant workspace impersonation/inspection for Super Admin across any onboarded organization.

### Layer B: Client HR Admin Portal
- Fully tenant-isolated HRMS portal for company HR Administrators and Staff Users.
- All database queries strictly bound to `session.organization_id`.
- Core Modules Preserved:
  - Employee Master & Directory (Search, filters, category tagging)
  - Employee Full Profiles & KYC Document repository
  - Geofenced Workplaces & Attendance Rules
  - Daily Attendance Dashboard & Facial Punch Verification
  - Muster & Verification Sheets
  - Leave Applications & Approvals
  - Statutory Payroll & Rule Book (PF, ESIC, PT, LWF, CTC structuring)

### Layer C: Employee Self-Service
- Attendance Punch with GPS coordinates, accuracy, and selfie capture.
- 24-Hour Attendance Photo Retention Policy:
  - File key: `attendance/<employee_id>/latest.jpg`
  - Replaces previous photo on new punch; auto-expires in R2 after 24h while preserving D1 attendance timestamps.

---

## 4. Live Verification & Automated Testing Matrix

| Test Case | Method | Expected | Result |
| :--- | :--- | :--- | :--- |
| **Health Check** | `GET /api/health` | 200, D1: true, R2: true | 🟢 PASS |
| **Superadmin Sign-In** | `POST /api/login` (`superadmin@...`) | 200, role: `super` | 🟢 PASS |
| **Session Profile** | `GET /api/me` | 200, portal: `saas_owner` | 🟢 PASS |
| **SaaS Owner Dashboard** | `GET /api/portal/dashboard` | 200, real D1 counters & MRR | 🟢 PASS |
| **Commercial Plans API** | `GET /api/portal/plans` | 200, 4 plans returned | 🟢 PASS |
| **Onboarding Wizard** | `POST /api/portal/clients` | 201, tenant + admin created | 🟢 PASS (`ZENITH`) |
| **Live MRR Update** | `GET /api/portal/dashboard` | 200, MRR increased to ₹15,998 | 🟢 PASS |
| **New Tenant Admin Login** | `POST /api/login` (`admin@zenith...`) | 200, isolated workspace | 🟢 PASS |
| **Existing Tenant Admin** | `POST /api/login` (`admin@oneclick...`) | 200, existing workspace intact | 🟢 PASS |
| **Universal Branding** | Static Assets Audit | 0 references to legacy brands | 🟢 PASS |

---

## 5. Active Database Credentials & Tenants (Internal Reference)

- **SaaS Owner / Superadmin:**
  - Login: `superadmin@oneclicksolution.online`
  - Password: `Super@12345`
  - Access: Full Layer A SaaS Owner Central + Global Tenant Switcher
- **Primary Client Admin (Tenant 1 - OneClick Demo):**
  - Login: `admin@oneclicksolution.online`
  - Password: `Admin@12345`
  - Access: Client HRMS Portal (Organization: `org_oneclick_01`)
- **New Onboarded Client Admin (Tenant 2 - Zenith Solutions):**
  - Login: `admin@zenithsolutions.in`
  - Password: `Zenith@12345`
  - Access: Client HRMS Portal (Organization: `ZENITH`)
