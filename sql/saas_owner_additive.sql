-- ONECLICK HRMS - Layer A: SaaS Owner Portal Schema Migrations
-- Additive & Non-destructive migration for oneclick-hrms-db

-- 1. Extend organizations table with SaaS tenant attributes
ALTER TABLE organizations ADD COLUMN legal_name TEXT;
ALTER TABLE organizations ADD COLUMN contact_person TEXT;
ALTER TABLE organizations ADD COLUMN contact_email TEXT;
ALTER TABLE organizations ADD COLUMN contact_phone TEXT;
ALTER TABLE organizations ADD COLUMN industry TEXT;
ALTER TABLE organizations ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE organizations ADD COLUMN address TEXT;
ALTER TABLE organizations ADD COLUMN city TEXT;
ALTER TABLE organizations ADD COLUMN state TEXT;
ALTER TABLE organizations ADD COLUMN gst_number TEXT;
ALTER TABLE organizations ADD COLUMN logo_url TEXT;

-- 2. SaaS Subscription Plans Table
CREATE TABLE IF NOT EXISTS saas_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price_inr REAL NOT NULL DEFAULT 0,
  annual_price_inr REAL NOT NULL DEFAULT 0,
  employee_limit INTEGER NOT NULL DEFAULT 50,
  site_limit INTEGER NOT NULL DEFAULT 2,
  admin_limit INTEGER NOT NULL DEFAULT 2,
  features_json TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial SaaS Plans
INSERT OR IGNORE INTO saas_plans (id, name, description, monthly_price_inr, annual_price_inr, employee_limit, site_limit, admin_limit, features_json) VALUES
  ('plan_starter', 'Starter', 'For small teams up to 25 employees with basic attendance and leaves', 1499, 14990, 25, 2, 2, '["core_hr","attendance","leaves","reports"]'),
  ('plan_standard', 'Standard', 'For growing companies up to 100 employees with geofence and muster', 3999, 39990, 100, 5, 5, '["core_hr","attendance","geofencing","leaves","muster","payroll","reports"]'),
  ('plan_pro', 'Professional', 'Full HRMS with statutory payroll, PF/ESIC, biometric verification, and mobile app', 7999, 79990, 300, 15, 10, '["core_hr","attendance","geofencing","face_verification","shifts","leaves","muster","payroll","statutory_compliance","advances","reports","whatsapp"]'),
  ('plan_enterprise', 'Enterprise', 'Unlimited scale with multi-site tenancy, custom workflows, API access, and dedicated support', 14999, 149990, 1000, 50, 25, '["all_modules","custom_integrations","dedicated_support","priority_sla"]');

-- 3. Tenant Subscriptions Table
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  start_date TEXT NOT NULL,
  renewal_date TEXT NOT NULL,
  trial_ends_at TEXT,
  monthly_amount REAL NOT NULL DEFAULT 0,
  employee_limit_override INTEGER,
  site_limit_override INTEGER,
  admin_limit_override INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (plan_id) REFERENCES saas_plans(id)
);
CREATE INDEX IF NOT EXISTS idx_subs_org ON saas_subscriptions (organization_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON saas_subscriptions (status);

-- Seed initial subscription for seed tenant
INSERT OR IGNORE INTO saas_subscriptions (
  id, organization_id, plan_id, status, billing_interval, start_date, renewal_date, monthly_amount
) VALUES (
  'sub_seed_01', 'org_oneclick_01', 'plan_pro', 'ACTIVE', 'monthly', '2026-01-01', '2027-01-01', 7999
);

-- 4. SaaS Customization Requests Table
CREATE TABLE IF NOT EXISTS saas_customizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'FEATURE',
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  estimated_cost REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- 5. SaaS Support Tickets Table
CREATE TABLE IF NOT EXISTS saas_support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
