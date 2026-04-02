-- Create Schemas
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS core;

-- IAM Schema
CREATE TABLE iam.roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB NOT NULL
);

CREATE TABLE iam.users (
    username VARCHAR(50) PRIMARY KEY,
    password VARCHAR(100) NOT NULL,
    role_names TEXT[],
    assigned_project_id UUID
);

CREATE TABLE iam.user_roles (
    username VARCHAR(50) REFERENCES iam.users(username) ON DELETE CASCADE,
    role_id INTEGER REFERENCES iam.roles(id) ON DELETE CASCADE,
    PRIMARY KEY (username, role_id)
);

CREATE TABLE iam.user_projects (
    username VARCHAR(50) REFERENCES iam.users(username) ON DELETE CASCADE,
    project_id UUID,
    PRIMARY KEY (username, project_id)
);

CREATE TABLE iam.sessions (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) REFERENCES iam.users(username) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE iam.audit_log (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path TEXT,
    status_code INTEGER,
    details JSONB,
    severity VARCHAR(20) DEFAULT 'INFO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE iam.failed_login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    reason TEXT,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE iam.smtp_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    smtp_host TEXT NOT NULL,
    smtp_port INTEGER DEFAULT 587,
    smtp_secure BOOLEAN DEFAULT FALSE,
    smtp_username TEXT,
    smtp_password_encrypted TEXT,
    from_email TEXT,
    from_name TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
);

-- Core Schema
CREATE TABLE core.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL
);

CREATE TABLE core.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    primary_skills TEXT[],
    secondary_skills TEXT[],
    current_project VARCHAR(100),
    billable_rate DECIMAL DEFAULT 0,
    expense_rate DECIMAL DEFAULT 0,
    total_allocation_sum INTEGER DEFAULT 0
);

CREATE TABLE core.allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES core.employees(id) ON DELETE CASCADE,
    project_id UUID REFERENCES core.projects(id) ON DELETE CASCADE,
    percentage INTEGER NOT NULL,
    month_year DATE,
    start_date DATE,
    end_date DATE
);

-- Trigger Function for Allocation Limit Check
CREATE OR REPLACE FUNCTION check_allocation_limit() RETURNS TRIGGER AS $$
DECLARE
    month_date DATE;
    month_sum INTEGER;
BEGIN
    IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date are required' USING ERRCODE = 'data_exception';
    END IF;

    FOR month_date IN 
        SELECT generate_series(DATE_TRUNC('month', NEW.start_date), DATE_TRUNC('month', NEW.end_date), '1 month'::interval)::DATE
    LOOP
        SELECT COALESCE(SUM(percentage), 0) INTO month_sum
        FROM core.allocations
        WHERE employee_id = NEW.employee_id
          AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND start_date <= (month_date + INTERVAL '1 month - 1 day')::DATE
          AND end_date >= month_date;

        IF (month_sum + NEW.percentage) > 100 THEN
            RAISE EXCEPTION 'Total allocation cannot exceed 100%% for month %', TO_CHAR(month_date, 'YYYY-MM')
            USING ERRCODE = 'data_exception';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_allocation_limit BEFORE INSERT OR UPDATE ON core.allocations FOR EACH ROW EXECUTE FUNCTION check_allocation_limit();

-- Trigger Function for Allocation Sum
CREATE OR REPLACE FUNCTION update_allocation_sum() RETURNS TRIGGER AS $$
DECLARE
    affected_employee_id UUID;
BEGIN
    affected_employee_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.employee_id ELSE NEW.employee_id END;
    UPDATE core.employees SET total_allocation_sum = (SELECT COALESCE(SUM(percentage), 0) FROM core.allocations WHERE employee_id = affected_employee_id) WHERE id = affected_employee_id;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_allocation_sum AFTER INSERT OR UPDATE OR DELETE ON core.allocations FOR EACH ROW EXECUTE FUNCTION update_allocation_sum();

-- Seed Data (Hashed for bcrypt: 'admin' and 'emp')
INSERT INTO iam.roles (name, permissions) VALUES
('Admin', '{"dashboard": "rw", "employee_list": "rw", "allocation": "rw", "administration": "rw"}'),
('Employee', '{"dashboard": "r", "employee_list": "r", "allocation": "r", "administration": "none"}');

INSERT INTO iam.users (username, password, role_names) VALUES
('admin', '$2b$10$FAc39B0u9XId8gCcOI3yzekhYTzqeedtz9uyle.mzd4q/auQNV9Hu', ARRAY['Admin']),
('employee', '$2b$10$FAc39B0u9XId8gCcOI3yzekhYTzqeedtz9uyle.mzd4q/auQNV9Hu', ARRAY['Employee']);

INSERT INTO iam.user_roles (username, role_id) VALUES ('admin', 1), ('employee', 2);

INSERT INTO core.projects (id, name) VALUES 
('00000000-0000-4000-a000-000000000001', 'Project Phoenix'), 
('00000000-0000-4000-a000-000000000002', 'Project Vibe'), 
('00000000-0000-4000-a000-000000000003', 'Internal Tools');

-- Dashboard Analytics Materialized View
CREATE MATERIALIZED VIEW core.dashboard_analytics_summary AS
SELECT 
    (SELECT COALESCE(AVG(total_allocation_sum), 0) FROM core.employees) as avg_utilization,
    (SELECT COUNT(*) FROM core.employees WHERE total_allocation_sum = 0) as bench_count,
    (SELECT JSON_AGG(monthly) FROM (
        SELECT TO_CHAR(COALESCE(month_year, start_date), 'YYYY-MM') as month, SUM(percentage) as total_percentage, COUNT(DISTINCT employee_id) as assigned_employees FROM core.allocations GROUP BY 1 ORDER BY 1
    ) monthly) as monthly_utilization;

CREATE OR REPLACE FUNCTION refresh_analytics_summary() RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW core.dashboard_analytics_summary;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_analytics_summary AFTER INSERT OR UPDATE OR DELETE ON core.allocations FOR EACH STATEMENT EXECUTE FUNCTION refresh_analytics_summary();
REFRESH MATERIALIZED VIEW core.dashboard_analytics_summary;
