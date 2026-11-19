-- Default Initial Admin Seed
INSERT OR IGNORE INTO employees (
  id, organization_id, employee_code, first_name, last_name, full_name,
  mobile, email, department_id, designation_id, employee_category,
  employment_type, joining_date, work_location, employment_status
) VALUES (
  'emp_admin_01', 'org_oneclick_01', 'RCL001', 'Admin', 'User', 'Admin User',
  '9876543210', 'admin@oneclicksolution.online', 'dept_hr', 'desig_hr_mgr', 'Staff',
  'Permanent', '2026-01-01', 'Head Office', 'ACTIVE'
);

INSERT OR IGNORE INTO users (
  id, organization_id, employee_id, email, mobile, password_hash, role_id, status
) VALUES (
  'user_admin_01', 'org_oneclick_01', 'emp_admin_01', 'admin@oneclicksolution.online', '9876543210',
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  'role_admin', 'ACTIVE'
);
