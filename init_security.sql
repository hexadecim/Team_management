-- Zero Trust Security Schema Extensions
-- This file adds security-related tables for audit logging, session management, and token management

-- ============================================
-- IAM Schema Extensions
-- ============================================

-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS iam.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL REFERENCES iam.users(username) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    device_info JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_username ON iam.refresh_tokens(username);
CREATE INDEX idx_refresh_tokens_expires ON iam.refresh_tokens(expires_at) WHERE NOT revoked;

-- Audit Log Table
CREATE TABLE IF NOT EXISTS iam.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path TEXT,
    status_code INTEGER,
    details JSONB,
    severity VARCHAR(20) DEFAULT 'INFO'
);

CREATE INDEX idx_audit_log_timestamp ON iam.audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_username ON iam.audit_log(username);
CREATE INDEX idx_audit_log_action ON iam.audit_log(action);
CREATE INDEX idx_audit_log_severity ON iam.audit_log(severity);

-- Active Sessions Table
CREATE TABLE IF NOT EXISTS iam.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL REFERENCES iam.users(username) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_sessions_username ON iam.sessions(username);
CREATE INDEX idx_sessions_active ON iam.sessions(is_active, expires_at);

-- Failed Login Attempts (for rate limiting and anomaly detection)
CREATE TABLE IF NOT EXISTS iam.failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255),
    ip_address INET NOT NULL,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    reason VARCHAR(100)
);

CREATE INDEX idx_failed_login_ip ON iam.failed_login_attempts(ip_address, attempted_at);
CREATE INDEX idx_failed_login_username ON iam.failed_login_attempts(username, attempted_at);

-- ============================================
-- Audit Trigger Functions
-- ============================================

-- Function to log employee modifications
CREATE OR REPLACE FUNCTION iam.log_employee_modification()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO iam.audit_log (
        username,
        action,
        resource_type,
        resource_id,
        details,
        severity
    ) VALUES (
        current_user,
        TG_OP,
        'employee',
        COALESCE(NEW.id::TEXT, OLD.id::TEXT),
        jsonb_build_object(
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        ),
        'INFO'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to log project modifications
CREATE OR REPLACE FUNCTION iam.log_project_modification()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO iam.audit_log (
        username,
        action,
        resource_type,
        resource_id,
        details,
        severity
    ) VALUES (
        current_user,
        TG_OP,
        'project',
        COALESCE(NEW.id::TEXT, OLD.id::TEXT),
        jsonb_build_object(
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        ),
        'INFO'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to log allocation modifications
CREATE OR REPLACE FUNCTION iam.log_allocation_modification()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO iam.audit_log (
        username,
        action,
        resource_type,
        resource_id,
        details,
        severity
    ) VALUES (
        current_user,
        TG_OP,
        'allocation',
        COALESCE(NEW.id::TEXT, OLD.id::TEXT),
        jsonb_build_object(
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        ),
        'WARNING'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Attach Audit Triggers
-- ============================================

DROP TRIGGER IF EXISTS trg_audit_employee ON core.employees;
CREATE TRIGGER trg_audit_employee
    AFTER INSERT OR UPDATE OR DELETE ON core.employees
    FOR EACH ROW EXECUTE FUNCTION iam.log_employee_modification();

DROP TRIGGER IF EXISTS trg_audit_project ON core.projects;
CREATE TRIGGER trg_audit_project
    AFTER INSERT OR UPDATE OR DELETE ON core.projects
    FOR EACH ROW EXECUTE FUNCTION iam.log_project_modification();

DROP TRIGGER IF EXISTS trg_audit_allocation ON core.allocations;
CREATE TRIGGER trg_audit_allocation
    AFTER INSERT OR UPDATE OR DELETE ON core.allocations
    FOR EACH ROW EXECUTE FUNCTION iam.log_allocation_modification();

-- ============================================
-- Cleanup Functions
-- ============================================

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION iam.cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM iam.refresh_tokens
    WHERE expires_at < CURRENT_TIMESTAMP
    OR (revoked = TRUE AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '30 days');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old audit logs (keep 90 days)
CREATE OR REPLACE FUNCTION iam.cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM iam.audit_log
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days'
    AND severity NOT IN ('CRITICAL', 'ERROR');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up inactive sessions
CREATE OR REPLACE FUNCTION iam.cleanup_inactive_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    UPDATE iam.sessions
    SET is_active = FALSE
    WHERE (expires_at < CURRENT_TIMESTAMP OR last_activity_at < CURRENT_TIMESTAMP - INTERVAL '1 hour')
    AND is_active = TRUE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Security Views
-- ============================================

-- View for recent security events
CREATE OR REPLACE VIEW iam.recent_security_events AS
SELECT 
    timestamp,
    username,
    action,
    resource_type,
    ip_address,
    severity,
    details
FROM iam.audit_log
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- View for active sessions
CREATE OR REPLACE VIEW iam.active_user_sessions AS
SELECT 
    s.username,
    s.ip_address,
    s.created_at,
    s.last_activity_at,
    s.expires_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.last_activity_at)) as idle_seconds
FROM iam.sessions s
WHERE s.is_active = TRUE
AND s.expires_at > CURRENT_TIMESTAMP;

-- View for suspicious activity
CREATE OR REPLACE VIEW iam.suspicious_activity AS
SELECT 
    username,
    ip_address,
    COUNT(*) as failed_attempts,
    MAX(attempted_at) as last_attempt
FROM iam.failed_login_attempts
WHERE attempted_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY username, ip_address
HAVING COUNT(*) >= 5;

COMMENT ON TABLE iam.refresh_tokens IS 'Stores refresh tokens for JWT token renewal';
COMMENT ON TABLE iam.audit_log IS 'Comprehensive audit trail for all system operations';
COMMENT ON TABLE iam.sessions IS 'Active user sessions for session management';
COMMENT ON TABLE iam.failed_login_attempts IS 'Failed login attempts for security monitoring';
