/**
 * SMTP Configuration Repository
 * Handles CRUD operations for SMTP settings with password encryption
 */

const crypto = require('crypto');
const db = require('../db');

class SMTPConfigRepository {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        // Encryption key must be 32 bytes (256 bits)
        const key = process.env.SMTP_ENCRYPTION_KEY;
        if (!key || key.length !== 64) { // 32 bytes = 64 hex characters
            throw new Error('SMTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
        }
        this.key = Buffer.from(key, 'hex');
    }

    /**
     * Encrypt password using AES-256-CBC
     * @param {string} password - Plain text password
     * @returns {string} Encrypted password in format "IV:ENCRYPTED_DATA"
     */
    encrypt(password) {
        const iv = crypto.randomBytes(16); // 16 bytes IV for AES
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        let encrypted = cipher.update(password, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt password using AES-256-CBC
     * @param {string} encryptedPassword - Encrypted password in format "IV:ENCRYPTED_DATA"
     * @returns {string} Plain text password
     */
    decrypt(encryptedPassword) {
        const parts = encryptedPassword.split(':');
        if (parts.length !== 2) {
            throw new Error('Invalid encrypted password format');
        }
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Get SMTP configuration (singleton)
     * @returns {Object|null} SMTP configuration with decrypted password
     */
    async get() {
        try {
            const result = await db.queryIAM(`
                SELECT 
                    id,
                    smtp_host as "smtpHost",
                    smtp_port as "smtpPort",
                    smtp_secure as "smtpSecure",
                    smtp_username as "smtpUsername",
                    smtp_password_encrypted as "smtpPasswordEncrypted",
                    from_email as "fromEmail",
                    from_name as "fromName",
                    enabled,
                    created_at as "createdAt",
                    updated_at as "updatedAt",
                    updated_by as "updatedBy"
                FROM iam.smtp_config
                LIMIT 1
            `);

            if (result.rows.length === 0) {
                return null;
            }

            const config = result.rows[0];

            // Decrypt password
            if (config.smtpPasswordEncrypted) {
                config.smtpPassword = this.decrypt(config.smtpPasswordEncrypted);
                delete config.smtpPasswordEncrypted;
            }

            return config;
        } catch (error) {
            console.error('[SMTPConfigRepository] Error getting config:', error);
            throw error;
        }
    }

    /**
     * Get SMTP configuration without password (for API responses)
     * @returns {Object|null} SMTP configuration without password
     */
    async getWithoutPassword() {
        try {
            const result = await db.queryIAM(`
                SELECT 
                    id,
                    smtp_host as "smtpHost",
                    smtp_port as "smtpPort",
                    smtp_secure as "smtpSecure",
                    smtp_username as "smtpUsername",
                    from_email as "fromEmail",
                    from_name as "fromName",
                    enabled,
                    created_at as "createdAt",
                    updated_at as "updatedAt",
                    updated_by as "updatedBy"
                FROM iam.smtp_config
                LIMIT 1
            `);

            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('[SMTPConfigRepository] Error getting config:', error);
            throw error;
        }
    }

    /**
     * Create or update SMTP configuration (upsert)
     * @param {Object} config - SMTP configuration
     * @param {string} username - User making the change
     * @returns {Object} Created/updated configuration
     */
    async upsert(config, username) {
        try {
            // Encrypt password
            const encryptedPassword = this.encrypt(config.smtpPassword);

            const result = await db.queryIAM(`
                INSERT INTO iam.smtp_config (
                    smtp_host,
                    smtp_port,
                    smtp_secure,
                    smtp_username,
                    smtp_password_encrypted,
                    from_email,
                    from_name,
                    enabled,
                    updated_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT ((1))
                DO UPDATE SET
                    smtp_host = EXCLUDED.smtp_host,
                    smtp_port = EXCLUDED.smtp_port,
                    smtp_secure = EXCLUDED.smtp_secure,
                    smtp_username = EXCLUDED.smtp_username,
                    smtp_password_encrypted = EXCLUDED.smtp_password_encrypted,
                    from_email = EXCLUDED.from_email,
                    from_name = EXCLUDED.from_name,
                    enabled = EXCLUDED.enabled,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING 
                    id,
                    smtp_host as "smtpHost",
                    smtp_port as "smtpPort",
                    smtp_secure as "smtpSecure",
                    smtp_username as "smtpUsername",
                    from_email as "fromEmail",
                    from_name as "fromName",
                    enabled
            `, [
                config.smtpHost,
                config.smtpPort || 587,
                config.smtpSecure || false,
                config.smtpUsername,
                encryptedPassword,
                config.fromEmail,
                config.fromName || 'Aganya Core',
                config.enabled !== undefined ? config.enabled : true,
                username
            ]);

            return result.rows[0];
        } catch (error) {
            console.error('[SMTPConfigRepository] Error upserting config:', error);
            throw error;
        }
    }

    /**
     * Delete SMTP configuration
     * @returns {boolean} True if deleted
     */
    async delete() {
        try {
            const result = await db.queryIAM('DELETE FROM iam.smtp_config');
            return result.rowCount > 0;
        } catch (error) {
            console.error('[SMTPConfigRepository] Error deleting config:', error);
            throw error;
        }
    }
}

module.exports = SMTPConfigRepository;
