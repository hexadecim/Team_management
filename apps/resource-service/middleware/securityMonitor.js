/**
 * Security Monitor Middleware
 * Monitors for security threats and anomalies
 */

const AuditLogger = require('./auditLogger');

class SecurityMonitor {
    /**
     * Middleware to detect and block suspicious requests
     */
    static suspiciousActivityDetector() {
        return async (req, res, next) => {
            try {
                // Check for SQL injection patterns
                const sqlInjectionPatterns = [
                    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
                    /(UNION.*SELECT)/i,
                    /(OR\s+1\s*=\s*1)/i,
                    /(--|\#|\/\*)/
                ];

                const requestString = JSON.stringify({
                    query: req.query,
                    body: req.body,
                    params: req.params
                });

                for (const pattern of sqlInjectionPatterns) {
                    if (pattern.test(requestString)) {
                        await AuditLogger.logSecurityEvent(
                            req.user?.username || 'anonymous',
                            'SQL_INJECTION_ATTEMPT',
                            'CRITICAL',
                            {
                                path: req.path,
                                method: req.method,
                                ip: req.ip,
                                pattern: pattern.toString()
                            }
                        );

                        return res.status(400).json({ error: 'Invalid request' });
                    }
                }

                // Check for XSS patterns
                const xssPatterns = [
                    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                    /javascript:/gi,
                    /on\w+\s*=/gi
                ];

                for (const pattern of xssPatterns) {
                    if (pattern.test(requestString)) {
                        await AuditLogger.logSecurityEvent(
                            req.user?.username || 'anonymous',
                            'XSS_ATTEMPT',
                            'CRITICAL',
                            {
                                path: req.path,
                                method: req.method,
                                ip: req.ip
                            }
                        );

                        return res.status(400).json({ error: 'Invalid request' });
                    }
                }

                next();
            } catch (error) {
                console.error('[SecurityMonitor] Error in suspicious activity detector:', error);
                next();
            }
        };
    }

    /**
     * Monitor for privilege escalation attempts
     */
    static privilegeEscalationDetector() {
        return async (req, res, next) => {
            try {
                const username = req.user?.username;
                const claims = req.user?.claims || {};

                // Check if user is trying to access admin endpoints without proper permissions
                const adminPaths = ['/roles', '/users'];
                const isAdminPath = adminPaths.some(path => req.path.startsWith(path));

                if (isAdminPath && claims.administration !== 'rw') {
                    await AuditLogger.logSecurityEvent(
                        username,
                        'PRIVILEGE_ESCALATION_ATTEMPT',
                        'CRITICAL',
                        {
                            path: req.path,
                            method: req.method,
                            currentPermissions: claims
                        }
                    );
                }

                next();
            } catch (error) {
                console.error('[SecurityMonitor] Error in privilege escalation detector:', error);
                next();
            }
        };
    }

    /**
     * Rate limit checker for failed logins
     */
    static async checkLoginRateLimit(username, ipAddress) {
        try {
            const isSuspicious = await AuditLogger.checkSuspiciousActivity(username, ipAddress);
            return isSuspicious;
        } catch (error) {
            console.error('[SecurityMonitor] Error checking login rate limit:', error);
            return false;
        }
    }
}

module.exports = SecurityMonitor;
