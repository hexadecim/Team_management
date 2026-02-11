-- Run these commands in your psql session to create the smtp_config table
-- Copy and paste this entire block into psql

-- Create SMTP configuration table in iam schema
CREATE TABLE IF NOT EXISTS iam.smtp_config (
    id SERIAL PRIMARY KEY,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_secure BOOLEAN DEFAULT false,
    smtp_username VARCHAR(255) NOT NULL,
    smtp_password_encrypted TEXT NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) DEFAULT 'Aganya Core',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    CONSTRAINT valid_port CHECK (smtp_port > 0 AND smtp_port <= 65535),
    CONSTRAINT valid_email CHECK (from_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Only one SMTP config allowed (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_smtp_config_singleton ON iam.smtp_config ((1));

-- Add comment
COMMENT ON TABLE iam.smtp_config IS 'SMTP configuration for email notifications (passwords encrypted with AES-256)';
COMMENT ON COLUMN iam.smtp_config.smtp_password_encrypted IS 'Encrypted password format: IV:ENCRYPTED_DATA';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON iam.smtp_config TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE iam.smtp_config_id_seq TO PUBLIC;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION iam.update_smtp_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_smtp_config_timestamp
    BEFORE UPDATE ON iam.smtp_config
    FOR EACH ROW
    EXECUTE FUNCTION iam.update_smtp_config_timestamp();

-- Verify the table was created
\d iam.smtp_config
