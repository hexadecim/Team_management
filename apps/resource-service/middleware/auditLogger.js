/**
 * Audit Logger Middleware
 * Logs all API requests and security events to the database
 */

const { db } = require('@team-mgmt/shared');

class AuditLogger {
    /**
     * Middleware to log all HTTP requests
     */
    static requestLogger() {
        return async (req, res, next) => {
            const startTime = Date.now();

            // Capture response
            const originalSend = res.send;
            res.send = function (data) {
                res.send = originalSend;

                // Log after response is sent
                setImmediate(() => {
                    AuditLogger.logRequest(req, res, Date.now() - startTime).catch(err => {
                        console.error('[AuditLogger] Failed to log request:', err);
                    });
                });

                return res.send(data);
            };

            next();
        };
    }

    /**
     * Log HTTP request to audit log
     */
    static async logRequest(req, res, duration) {
        try {
            const username = req.user?.username || null;
            const action = `${req.method} ${req.path}`;

            await db.queryIAM(`
                INSERT INTO iam.audit_log (
                    username,
                    action,
                    resource_type,
                    ip_address,
                    user_agent,
                    request_method,
                    request_path,
                    status_code,
                    details,
                    severity
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                username,
                action,
                'http_request',
                req.ip || req.connection.remoteAddress,
                req.get('user-agent'),
                req.method,
                req.path,
                res.statusCode,
                JSON.stringify({
                    duration_ms: duration,
                    query: req.query,
                    params: req.params
                }),
                res.statusCode >= 400 ? 'WARNING' : 'INFO'
            ]);
        } catch (error) {
            console.error('[AuditLogger] Error logging request:', error);
        }
    }

    /**
     * Log authentication events
     */
    static async logAuth(username, action, success, details = {}) {
        try {
            await db.queryIAM(`
                INSERT INTO iam.audit_log (
                    username,
                    action,
                    resource_type,
                    details,
                    severity
                ) VALUES ($1, $2, $3, $4, $5)
            `, [
                username,
                action,
                'authentication',
                JSON.stringify({ success, ...details }),
                success ? 'INFO' : 'WARNING'
            ]);
        } catch (error) {
            console.error('[AuditLogger] Error logging auth event:', error);
        }
    }

    /**
     * Log failed login attempt
     */
    static async logFailedLogin(username, ipAddress, userAgent, reason) {
        try {
            await db.queryIAM(`
                INSERT INTO iam.failed_login_attempts (
                    username,
                    ip_address,
                    user_agent,
                    reason
                ) VALUES ($1, $2, $3, $4)
            `, [username, ipAddress, userAgent, reason]);

            await AuditLogger.logAuth(username, 'LOGIN_FAILED', false, { reason, ipAddress });
        } catch (error) {
            console.error('[AuditLogger] Error logging failed login:', error);
        }
    }

    /**
     * Log security event
     */
    static async logSecurityEvent(username, action, severity, details) {
        try {
            await db.queryIAM(`
                INSERT INTO iam.audit_log (
                    username,
                    action,
                    resource_type,
                    details,
                    severity
                ) VALUES ($1, $2, $3, $4, $5)
            `, [
                username,
                action,
                'security',
                JSON.stringify(details),
                severity
            ]);
        } catch (error) {
            console.error('[AuditLogger] Error logging security event:', error);
        }
    }

    /**
     * Check for suspicious activity
     */
    static async checkSuspiciousActivity(username, ipAddress) {
        try {
            const result = await db.queryIAM(`
                SELECT COUNT(*) as count
                FROM iam.failed_login_attempts
                WHERE (username = $1 OR ip_address = $2)
                AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            `, [username, ipAddress]);

            const failedAttempts = parseInt(result.rows[0].count);

            if (failedAttempts >= 5) {
                await AuditLogger.logSecurityEvent(
                    username,
                    'SUSPICIOUS_ACTIVITY_DETECTED',
                    'CRITICAL',
                    { failedAttempts, ipAddress, timeWindow: '15 minutes' }
                );
                return true;
            }

            return false;
        } catch (error) {
            console.error('[AuditLogger] Error checking suspicious activity:', error);
            return false;
        }
    }
}

module.exports = AuditLogger;
