# ONECLICK HRMS — TARGET SAAS ARCHITECTURE DOCUMENT

**Platform Brand:** ONECLICK HRMS  
**Architectural Model:** Multi-Tenant B2B Cloud HRMS Platform  
**Target Infrastructure:** Cloudflare Edge Workers + D1 SQLite + R2 Storage + Turnstile + Flutter Mobile  
**Document Status:** Architecture Blueprint (v1.0)

---

## 1. High-Level Architectural Layers

The ONECLICK HRMS platform is structured into three cleanly decoupled experience layers, powered by a unified, tenant-aware Cloudflare Worker API.

```
                           ┌────────────────────────────┐
                           │      Cloudflare Edge       │
                           │ api.oneclicksolution.online │
                           └─────────────┬──────────────┘
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   ▼                     ▼                     ▼
        ┌─────────────────────┐┌───────────────────┐┌─────────────────────┐
        │       LAYER A       ││      LAYER B      ││       LAYER C       │
        │   SaaS Owner Portal ││  Client HR Portal ││  Employee / Manager │
        │  (Platform Manager) ││ (Company Tenant)  ││    (Self-Service)   │
        └──────────┬──────────┘└─────────┬─────────┘└──────────┬──────────┘
                   │                     │                     │
                   └─────────────────────┼─────────────────────┘
                                         ▼
                           ┌────────────────────────────┐
                           │   Tenant Context & Auth    │
                           │   Middleware (Worker V8)   │
                           └─────────────┬──────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
        ┌─────────────────────┐                     ┌─────────────────────┐
        │    Cloudflare D1    │                     │    Cloudflare R2    │
        │  SQLite Relational  │                     │  Encrypted Storage  │
        │  (oneclick-hrms-db) │                     │(oneclick-hrms-store)│
        └─────────────────────┘                     └─────────────────────┘
```

---

## 2. Layer A: SaaS Platform Owner Portal

This layer is strictly reserved for the OneClick HRMS platform owner (`role = 'super'`).

### Core Responsibilities:
1. **Tenant Provisioning & Onboarding:** Create new client accounts (`organizations`), set domain/subdomain, choose plan, allocate seat quotas (employees, sites, admins).
2. **Subscription & Plan Engine:** Manage subscription tiers (Starter, Standard, Professional, Enterprise), pricing intervals, trial durations, renewal dates, and status (`trial`, `active`, `suspended`, `expired`).
3. **Module & Feature Gating:** Control which modules (Payroll, Geofencing, Face Attendance, WhatsApp Notifications, AI) are enabled per client tenant.
4. **Client Administrative Controls:** Reset primary administrator credentials, view last login, audit usage, manage support tickets, and track client customization requests.
5. **System Telemetry & Billing Metrics:** Aggregated metrics (Total tenants, active employees across tenants, monthly recurring revenue, D1 storage usage, R2 storage usage).

---

## 3. Layer B: Client HR Admin Portal

This layer is the operational interface used by individual client companies (`role = 'admin'` or `'user'`).

### Core Responsibilities:
1. **Client Identity & Dynamic White-Labeling:** Displays the client company's legal name, logo, custom color accents, and branch/site locations.
2. **Workforce Management:** Employee Master directory, onboarding workflows, KYC documents, reporting hierarchy, and transfers.
3. **Time & Attendance:** Daily live muster, shifts, auto-checkout rules, geofenced work places (polygon/polyline/radius), device binding, and attendance corrections.
4. **Leave Management:** Paid/Comp-off balances, two-tier approval chains, holiday calendars, and leave ledger.
5. **Statutory Payroll:** Salary structures, PF/ESIC/PT/LWF/TDS statutory deductions, advances, monthly draft-to-lock payroll runs, and PDF payslips.
6. **Reports & Exports:** 25 role-filtered reports exported to CSV/Excel.

---

## 4. Layer C: Employee & Manager Portal (Web & Flutter Mobile)

This layer is the self-service interface for employees and managers (`role = 'self'`).

### Core Responsibilities:
1. **Employee Self-Service:** Daily punch IN/OUT with GPS geofence and camera selfie, punch history, leave applications, view leave balances, download salary slips, view company policies.
2. **Manager Self-Service:** View team attendance in real time, review and approve/reject leave requests, approve attendance regularization requests.

---

## 5. Multi-Tenant Data Isolation Architecture

To guarantee 100% data isolation between client companies:

### Isolation Invariants:
1. **Database Level:**
   - Every tenant-owned table (`employees`, `departments`, `designations`, `work_places`, `attendance_punches`, `employee_documents`, `leave_requests`, `audit_logs`) MUST contain an `organization_id TEXT NOT NULL` column.
   - All indexes on tenant tables must be composite indexes beginning with `organization_id` (e.g. `CREATE INDEX idx_emp_org_code ON employees (organization_id, employee_code)`).
2. **Application Middleware Level:**
   - Client requests are authenticated by session token (`sessions` table).
   - The session directly provides the verified `organization_id` and `role`.
   - **Rule:** The API handler extracts `organization_id` ONLY from the validated session, NEVER from client-supplied request parameters (unless role is `super` performing a deliberate owner action).
3. **Storage Level (Cloudflare R2):**
   - Object keys are structured hierarchically with tenant prefixes:
     - Documents: `tenants/<organization_id>/documents/<employee_id>/<filename>`
     - Attendance Selfies: `tenants/<organization_id>/attendance/<employee_id>/latest.jpg`
   - File download endpoint validates that `session.organization_id` matches the path prefix before streaming bytes.

---

## 6. Authentication, Sessions & RBAC

| Role Code | Role Name | Allowed Portal Layer | Permissions |
| :--- | :--- | :--- | :--- |
| `super` | SaaS Platform Owner | **Layer A** (SaaS Owner Portal) + Layer B (Tenant View) | Global cross-tenant management, client onboarding, plan billing, feature toggles. |
| `admin` | Client Company Owner / HR Admin | **Layer B** (Client HR Portal) | Full tenant-scoped management: employees, masters, payroll, approvals, work places. |
| `user` | Client HR User / Staff | **Layer B** (Client HR Portal) | Tenant-scoped data entry and view permissions as granted by HR Admin. |
| `self` | Employee / Team Manager | **Layer C** (Self-Service) | Personal attendance punch, leaves, payslips; Manager team approvals. |

Session tokens are 256-bit cryptographic strings stored in D1 with 24-hour expiration, delivered via HttpOnly/Secure cookies for web clients and `Authorization: Bearer <token>` for mobile Flutter clients.
