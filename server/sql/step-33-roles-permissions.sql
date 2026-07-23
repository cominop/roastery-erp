-- Step 33: DB tables — roles, user_roles, table_permissions, field_permissions, row_filters
-- Target: shared schema in polyaccess database
--
-- Creates the permissions framework for role-based access control (RBAC):
--   1. shared.roles            — role definitions (scoped per company)
--   2. shared.user_roles       — many-to-many user-to-role assignments
--   3. shared.table_permissions  — CRUD permissions per table per role
--   4. shared.field_permissions  — read/write permissions per field per role
--   5. shared.row_filters        — row-level access filters per table per role
--
-- Seed data: default system roles for FCC (company_id=1)

BEGIN;

-- ============================================================
-- 1. ROLES — named permission sets
-- ============================================================

CREATE TABLE IF NOT EXISTS shared.roles (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    company_id      INTEGER NOT NULL REFERENCES public.companies(id),
    is_system       BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, name)
);

COMMENT ON TABLE shared.roles IS 'Named role definitions for RBAC';
COMMENT ON COLUMN shared.roles.is_system IS 'System-protected roles cannot be deleted via UI';
COMMENT ON COLUMN shared.roles.is_active IS 'Soft-disable a role without removing assignments';

-- ============================================================
-- 2. USER ROLES — which users have which roles
-- ============================================================

CREATE TABLE IF NOT EXISTS shared.user_roles (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    role_id         INTEGER NOT NULL REFERENCES shared.roles(id) ON DELETE CASCADE,
    company_id      INTEGER NOT NULL REFERENCES public.companies(id),
    assigned_by     INTEGER,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, role_id, company_id)
);

COMMENT ON TABLE shared.user_roles IS 'Many-to-many: employees → roles';
COMMENT ON COLUMN shared.user_roles.user_id IS 'References db_fcc_erp.employees(employeeid)';
COMMENT ON COLUMN shared.user_roles.assigned_by IS 'employeeid of the admin who granted this role';
COMMENT ON COLUMN shared.user_roles.expires_at IS 'Optional expiry for temporary role assignments';

-- ============================================================
-- 3. TABLE PERMISSIONS — CRUD gates per table
-- ============================================================

CREATE TABLE IF NOT EXISTS shared.table_permissions (
    id              SERIAL PRIMARY KEY,
    role_id         INTEGER NOT NULL REFERENCES shared.roles(id) ON DELETE CASCADE,
    table_name      VARCHAR(255) NOT NULL,
    company_id      INTEGER NOT NULL REFERENCES public.companies(id),
    can_select      BOOLEAN NOT NULL DEFAULT true,
    can_insert      BOOLEAN NOT NULL DEFAULT false,
    can_update      BOOLEAN NOT NULL DEFAULT false,
    can_delete      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(role_id, table_name, company_id)
);

COMMENT ON TABLE shared.table_permissions IS 'CRUD-level access per role per table';
COMMENT ON COLUMN shared.table_permissions.table_name IS 'Table name in db_fcc_erp schema or a pg_tables entry';

-- ============================================================
-- 4. FIELD PERMISSIONS — read/write per column
-- ============================================================

CREATE TABLE IF NOT EXISTS shared.field_permissions (
    id              SERIAL PRIMARY KEY,
    role_id         INTEGER NOT NULL REFERENCES shared.roles(id) ON DELETE CASCADE,
    table_name      VARCHAR(255) NOT NULL,
    field_name      VARCHAR(255) NOT NULL,
    company_id      INTEGER NOT NULL REFERENCES public.companies(id),
    can_read        BOOLEAN NOT NULL DEFAULT true,
    can_write       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(role_id, table_name, field_name, company_id)
);

COMMENT ON TABLE shared.field_permissions IS 'Column-level read/write access per role per table';

-- ============================================================
-- 5. ROW FILTERS — row-level access predicates
-- ============================================================

CREATE TABLE IF NOT EXISTS shared.row_filters (
    id              SERIAL PRIMARY KEY,
    role_id         INTEGER NOT NULL REFERENCES shared.roles(id) ON DELETE CASCADE,
    table_name      VARCHAR(255) NOT NULL,
    company_id      INTEGER NOT NULL REFERENCES public.companies(id),
    filter_condition JSONB NOT NULL,
    filter_sql      TEXT,
    description     TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE shared.row_filters IS 'Row-level filtering — structured condition applied to data queries';
COMMENT ON COLUMN shared.row_filters.filter_condition IS 'Structured filter expression (same format as front-end filter panel JSON)';
COMMENT ON COLUMN shared.row_filters.filter_sql IS 'Pre-compiled SQL WHERE fragment for faster query application';

-- ============================================================
-- Indexes for query performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id   ON shared.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id   ON shared.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_compound  ON shared.user_roles(company_id, user_id, role_id);

CREATE INDEX IF NOT EXISTS idx_tbl_perm_role_id     ON shared.table_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_tbl_perm_table_name  ON shared.table_permissions(table_name);
CREATE INDEX IF NOT EXISTS idx_tbl_perm_compound    ON shared.table_permissions(role_id, table_name, company_id);

CREATE INDEX IF NOT EXISTS idx_fld_perm_role_id     ON shared.field_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_fld_perm_table_name  ON shared.field_permissions(table_name);
CREATE INDEX IF NOT EXISTS idx_fld_perm_compound    ON shared.field_permissions(role_id, table_name, company_id);

CREATE INDEX IF NOT EXISTS idx_row_filter_role_id   ON shared.row_filters(role_id);
CREATE INDEX IF NOT EXISTS idx_row_filter_table_name ON shared.row_filters(table_name);
CREATE INDEX IF NOT EXISTS idx_row_filter_compound  ON shared.row_filters(role_id, table_name, company_id, enabled);

-- ============================================================
-- Seed: default system roles for FCC
-- ============================================================

INSERT INTO shared.roles (name, description, company_id, is_system) VALUES
    ('admin',       'Full system access — all tables CRUD, all fields, all rows',                                     1, true),
    ('manager',     'Read/write access to operational tables, limited admin tables',                                   1, true),
    ('data-entry',  'Insert/update access to transaction and catalog tables, no delete',                               1, true),
    ('read-only',   'View-only access to all non-sensitive tables',                                                    1, true),
    ('reports',     'Read-only access to report and summary tables',                                                   1, true)
ON CONFLICT (company_id, name) DO NOTHING;

COMMIT;
