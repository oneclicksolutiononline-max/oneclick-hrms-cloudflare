# ONECLICK HRMS — MASTER AUDIT DOCUMENT

**Platform Brand:** ONECLICK HRMS  
**Architectural Model:** Multi-Tenant B2B SaaS Platform  
**Target Infrastructure:** Cloudflare Workers + D1 (SQLite) + R2 Storage + Turnstile + Flutter Mobile  
**Audit Date:** November 19, 2026  
**Auditor:** Senior SaaS Architect & Cloudflare Security Engineer

---

## 1. Executive Summary

The existing application is a highly comprehensive, enterprise-grade HRMS codebase comprising **187 files, 11 API endpoints, 61 business logic modules, 22 database migrations, and 48 automated test suites**. It was recently deployed to Cloudflare Workers (`oneclick-hrms-api`) backed by Cloudflare D1 (`oneclick-hrms-db`) and Cloudflare R2 (`oneclick-hrms-storage`).

While technically advanced in core HR features (complex statutory payroll, muster rules, geofencing, document workflows, and audit trails), the system historically operated as a single-enterprise system (`rcl-hr`) tailored to Rachana Construction Limited / Sketchline. 

To transform this into **ONECLICK HRMS**—a commercial, multi-tenant B2B SaaS platform sold to multiple client companies—the architecture must be refactored across three distinct experience layers:
* **Layer A:** SaaS Platform Owner Portal (Client provisioning, plans, subscriptions, module entitlement, feature flags, global monitoring).
* **Layer B:** Client HR Admin Portal (Multi-site, tenant-isolated HRMS, employee master, muster, payroll, compliance).
* **Layer C:** Employee & Manager Portal (Mobile/Web Self-Service, attendance punch, leaves, payslips, team approvals).

---

## 2. Infrastructure & Cloudflare Deployment Status

| Component | Target Name / ID | Current Live Status | Verification Details |
| :--- | :--- | :--- | :--- |
| **Worker API** | `oneclick-hrms-api` | **LIVE & HEALTHY** | Deployed at `https://api.oneclicksolution.online/api/health` with sub-10ms response time. |
| **D1 Database** | `oneclick-hrms-db` (`10b0c631-0def-4d00-9cac-04b67bb2de28`) | **LIVE & ACTIVE** | 12 active production tables (`organizations`, `departments`, `designations`, `roles`, `users`, `employees`, `sessions`, `work_places`, `attendance_punches`, `employee_documents`, `audit_logs`, `leave_requests`). |
| **R2 Storage** | `oneclick-hrms-storage` | **LIVE & BOUND** | Bound as `env.HRMS_FILES`. Live Put/Get/Delete verified. 24-hour attendance photo rotation policy active. |
| **Security** | Cloudflare Turnstile | **CONFIGURED** | Site Key and Secret Key configured for bot protection on sign-in. |
| **Custom Domain** | `api.oneclicksolution.online` | **ROUTED & ACTIVE** | Custom domain mapped directly to worker. Edge SSL/TLS active. |
| **Web Assets** | Workers Static Assets (`public/`) | **LIVE AT EDGE** | Vanilla SPA serving HTML/CSS/JS with zero build pipeline lag. |

---

## 3. Database Schema Audit & Entity Analysis

### Existing D1 Schema:
1. `organizations`: Core tenant entity (`id`, `name`, `code`, `created_at`). Currently holds seed tenant `org_oneclick_01`.
2. `roles`: Platform & tenant roles (`id`, `name`, `description`). Values: `super`, `admin`, `user`, `self`.
3. `departments`: Tenant-bound department master (`id`, `organization_id`, `name`, `code`, `status`).
4. `designations`: Tenant-bound designation master (`id`, `organization_id`, `department_id`, `name`, `code`, `status`).
5. `users`: Authentication identities (`id`, `organization_id`, `employee_id`, `email`, `mobile`, `password_hash`, `role_id`, `status`, `last_login_at`).
6. `employees`: Core workforce records (`id`, `organization_id`, `employee_code`, `first_name`, `last_name`, `full_name`, `mobile`, `email`, `department_id`, `designation_id`, `employee_category`, `joining_date`, `employment_status`, `profile_photo_key`).
7. `sessions`: Stateful session tracking (`id`, `user_id`, `email`, `name`, `role`, `organization_id`, `site`, `expires_at`).
8. `work_places`: Geofence definitions (`id`, `organization_id`, `site`, `name`, `latitude`, `longitude`, `radius_meters`, `polygon_json`, `status`).
9. `attendance_punches`: Real-time punch ledger (`id`, `employee_id`, `organization_id`, `site`, `punch_time`, `punch_type`, `latitude`, `longitude`, `accuracy`, `selfie_key`, `status`).
10. `employee_documents`: KYC attachments metadata (`id`, `employee_id`, `organization_id`, `document_type`, `file_name`, `file_key`, `file_size`, `status`).
11. `audit_logs`: Immutable security trail (`id`, `organization_id`, `site`, `user_email`, `action`, `target`, `details_json`).
12. `leave_requests`: Leave workflows (`id`, `employee_id`, `organization_id`, `site`, `leave_type`, `from_date`, `to_date`, `days`, `status`).

### Missing SaaS Tables (To be added via safe additive migrations):
* `saas_plans`: Subscription tiers (Starter, Standard, Professional, Enterprise) with quotas.
* `saas_subscriptions`: Tenant subscription state (Status: `trial`, `active`, `suspended`, `expired`).
* `saas_modules`: Catalog of platform modules with plan-level and tenant-level enablement.
* `saas_feature_flags`: Fine-grained tenant capability toggles (e.g. `gps_punch`, `whatsapp_notify`, `face_match`).
* `saas_customizations`: Tenant custom feature requests and status pipeline.
* `saas_support_tickets`: Multi-tenant ticket desk.

---

## 4. Branding & Identity Audit

### Unwanted Legacy Single-Company Branding Identified:
* Title and branding strings in `public/index.html`: "HR – Sketchline", "Rachana Construction Limited", "RCL ERP".
* Static logo references: `https://i.ibb.co/CpSfBqXX/RCL-LOGO-PDF.png`, `rcl-mark.png`.
* Legacy prefix: `RCL001` hardcoded as default prefix instead of tenant-configurable prefix (e.g. `{ORG_CODE}001`).
* Company-specific references in `docs/` and `CLAUDE.md`.

### Remediation Requirements:
* Establish universal **ONECLICK HRMS** platform brand across all public screens, metadata, titles, and documentation.
* Provide dynamic white-labeling: When a client logs in, display **their company logo, company name, and color accents** in Layer B (Client HR).
* Layer A (Owner Portal) uses pure **ONECLICK HRMS Owner** branding.

---

## 5. Security & Multi-Tenant Isolation Audit

1. **Authentication:** Currently supports SHA-256 password hash + Turnstile bot protection + 24-hour D1-backed sessions. Must upgrade to PBKDF2/Web Crypto salt-based hashing for multi-tenant enterprise compliance.
2. **Tenant Isolation:** In `worker/index.js`, every query must strictly filter by `organization_id` derived directly from `session.organization_id`. Frontend-supplied tenant IDs must never be trusted without cryptographic verification.
3. **Role Routing:** A user with role `super` must route to Layer A (SaaS Owner Portal). Users with `admin`/`user` route to Layer B (Client HRMS). Users with `self` route to Layer C (Employee Self-Service).
4. **Attendance Selfie Policy:** Strictly verified in R2 storage handler: latest selfie per employee stored at `attendance/<emp_id>/latest.jpg`, overwriting prior photo, expiring after 24 hours, while attendance punch row in D1 remains permanent.
