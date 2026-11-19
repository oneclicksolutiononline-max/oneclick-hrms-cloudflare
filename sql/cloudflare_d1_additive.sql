-- Cloudflare D1 Additive Schema Migration (Non-destructive)
-- Target: oneclick-hrms-db

-- 1. Default Roles (if not exists)
INSERT OR IGNORE INTO roles (id, name, description) VALUES
  ('role_super', 'super', 'Super Administrator with full ERP permissions'),
  ('role_admin', 'admin', 'HR Administrator with site management permissions'),
  ('role_user', 'user', 'HR User with standard data entry permissions'),
  ('role_self', 'self', 'Employee Self-Service (My HR)');

-- 2. Default Organization (if not exists)
INSERT OR IGNORE INTO organizations (id, name, code) VALUES
  ('org_oneclick_01', 'OneClick Solution', 'HO');

-- 3. Default Departments (if not exists)
INSERT OR IGNORE INTO departments (id, organization_id, name, code, status) VALUES
  ('dept_hr', 'org_oneclick_01', 'Human Resources', 'HR', 'ACTIVE'),
  ('dept_eng', 'org_oneclick_01', 'Engineering & Construction', 'ENG', 'ACTIVE'),
  ('dept_ops', 'org_oneclick_01', 'Site Operations', 'OPS', 'ACTIVE'),
  ('dept_admin', 'org_oneclick_01', 'Administration', 'ADMIN', 'ACTIVE');

-- 4. Default Designations (if not exists)
INSERT OR IGNORE INTO designations (id, organization_id, department_id, name, code, status) VALUES
  ('desig_hr_mgr', 'org_oneclick_01', 'dept_hr', 'HR Manager', 'HRM', 'ACTIVE'),
  ('desig_site_eng', 'org_oneclick_01', 'dept_eng', 'Site Engineer', 'SE', 'ACTIVE'),
  ('desig_supervisor', 'org_oneclick_01', 'dept_ops', 'Site Supervisor', 'SS', 'ACTIVE'),
  ('desig_operator', 'org_oneclick_01', 'dept_ops', 'Machine Operator', 'MO', 'ACTIVE'),
  ('desig_driver', 'org_oneclick_01', 'dept_ops', 'Driver', 'DRV', 'ACTIVE');

-- 5. Sessions Table (for Web & Mobile stateful session tracking)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  site TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- 6. Work Places & Geofences
CREATE TABLE IF NOT EXISTS work_places (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  polygon_json TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_work_places_site ON work_places (site);

-- 7. Attendance Punches Table
CREATE TABLE IF NOT EXISTS attendance_punches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  site TEXT NOT NULL,
  punch_time TEXT NOT NULL,
  punch_type TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  work_place_id TEXT,
  selfie_key TEXT,
  status TEXT NOT NULL DEFAULT 'VALID',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_punches_emp_time ON attendance_punches (employee_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_punches_site_date ON attendance_punches (site, punch_time);

-- 8. Employee Documents Table
CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_docs_employee ON employee_documents (employee_id);

-- 9. Immutable Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT,
  site TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);

-- 10. Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  site TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests (employee_id);
