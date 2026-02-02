# Zero Trust Security Framework

## Overview

This application implements a comprehensive Zero Trust security framework following the principle: **"Never trust, always verify"**. This document outlines the security features, configuration, and best practices.

## Security Features Implemented

### 1. Identity & Access Management

#### Environment-Based Secrets
- **JWT Secret**: Cryptographically secure random string stored in `.env`
- **No hardcoded secrets**: All sensitive configuration in environment variables
- **Configuration**: See `.env.example` for required variables

#### Password Security
- **Bcrypt hashing**: All passwords hashed with bcrypt (10 rounds by default)
- **No plaintext storage**: Passwords never stored in plaintext
- **Secure comparison**: Timing-safe password comparison

#### Token Management
- **Short-lived access tokens**: 15 minutes (configurable)
- **Long-lived refresh tokens**: 7 days (configurable)
- **Token refresh endpoint**: `/auth/refresh` for seamless token renewal
- **Secure token storage**: Refresh tokens hashed in database

#### Session Management
- **Active session tracking**: All user sessions tracked in database
- **Session timeout**: Configurable timeout (default: 60 minutes)
- **Session invalidation**: Logout properly invalidates sessions

---

### 2. Network Security

#### CORS (Cross-Origin Resource Sharing)
- **Strict whitelist**: Only configured origins allowed
- **No wildcards**: Explicit origin validation
- **Credentials support**: Secure cookie/auth header handling
- **Configuration**: Set `ALLOWED_ORIGINS` in `.env`

```javascript
// Example: ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

#### Rate Limiting
- **Global rate limit**: 100 requests per 15 minutes per IP
- **Auth rate limit**: 5 login attempts per 15 minutes
- **Automatic blocking**: Suspicious IPs temporarily blocked
- **Audit logging**: All rate limit violations logged

#### Security Headers (Helmet)
- **Content Security Policy (CSP)**: Prevents XSS attacks
- **HTTP Strict Transport Security (HSTS)**: Forces HTTPS
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME sniffing
- **XSS Filter**: Additional XSS protection

#### Request Validation
- **Input sanitization**: All inputs validated and sanitized
- **SQL injection prevention**: Parameterized queries only
- **XSS prevention**: HTML/script tag detection and blocking
- **Request size limits**: 1MB maximum request body

---

### 3. Audit Logging & Monitoring

#### Comprehensive Audit Trail
- **All requests logged**: Every API call recorded with user context
- **Authentication events**: Login/logout/token refresh tracked
- **Permission checks**: Authorization decisions logged
- **Data modifications**: All CRUD operations audited
- **Security events**: Suspicious activity flagged

#### Audit Log Schema
```sql
iam.audit_log
  - timestamp
  - username
  - action
  - resource_type
  - ip_address
  - user_agent
  - details (JSONB)
  - severity (INFO/WARNING/CRITICAL)
```

#### Security Monitoring
- **SQL injection detection**: Pattern matching for SQL injection attempts
- **XSS detection**: Script tag and JavaScript protocol detection
- **Privilege escalation detection**: Unauthorized access attempts logged
- **Failed login tracking**: Brute force attack detection
- **Anomaly detection**: Unusual access patterns flagged

---

### 4. Database Security

#### Schema Isolation
- **IAM schema**: Identity and access management tables
- **Core schema**: Business logic tables
- **Separation of concerns**: Security data isolated from business data

#### Audit Triggers
- **Automatic logging**: Database triggers log all data modifications
- **Employee changes**: CREATE/UPDATE/DELETE logged
- **Project changes**: CREATE/UPDATE/DELETE logged
- **Allocation changes**: CREATE/UPDATE/DELETE logged with WARNING severity

#### Security Views
- **Recent security events**: Last 24 hours of security-related activity
- **Active sessions**: Currently active user sessions
- **Suspicious activity**: Failed login attempts and anomalies

#### Cleanup Functions
- **Expired token cleanup**: Removes old refresh tokens
- **Audit log rotation**: Keeps 90 days of logs (except CRITICAL/ERROR)
- **Session cleanup**: Deactivates expired sessions

---

## Configuration

### Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# JWT Configuration
JWT_SECRET=<generate-secure-random-string>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=team_management
DB_USER=sanjayrana
DB_PASSWORD=

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
BCRYPT_ROUNDS=10
SESSION_TIMEOUT_MINUTES=60

# Logging
LOG_LEVEL=info
```

### Generate Secure JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## API Changes

### Authentication Endpoints

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}

Response:
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "a1b2c3d4...",
  "expiresIn": "15m",
  "claims": { ... }
}
```

#### Token Refresh
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4..."
}

Response:
{
  "accessToken": "eyJhbGc...",
  "expiresIn": "15m"
}
```

#### Logout
```http
POST /auth/logout
Authorization: Bearer <accessToken>

Response:
{
  "message": "Logged out successfully"
}
```

### Protected Endpoints

All protected endpoints require the `Authorization` header:

```http
GET /employees
Authorization: Bearer <accessToken>
```

---

## Security Best Practices

### For Developers

1. **Never commit `.env` file**: Use `.env.example` as template
2. **Rotate JWT secret regularly**: Update `JWT_SECRET` periodically
3. **Use HTTPS in production**: Never use HTTP for sensitive data
4. **Monitor audit logs**: Regularly review security events
5. **Keep dependencies updated**: Run `npm audit` regularly
6. **Validate all inputs**: Never trust client data
7. **Use parameterized queries**: Prevent SQL injection
8. **Implement proper error handling**: Don't leak sensitive information

### For Administrators

1. **Review audit logs daily**: Check for suspicious activity
2. **Monitor failed login attempts**: Investigate patterns
3. **Rotate passwords regularly**: Enforce password policies
4. **Backup database regularly**: Include audit logs
5. **Test security regularly**: Perform penetration testing
6. **Keep software updated**: Apply security patches promptly
7. **Limit access**: Follow principle of least privilege
8. **Use strong passwords**: Minimum 12 characters, mixed case, numbers, symbols

---

## Database Maintenance

### Apply Security Schema

```bash
./apply-security.sh
```

This script:
1. Creates security tables (audit_log, sessions, refresh_tokens, etc.)
2. Adds audit triggers
3. Migrates existing passwords to bcrypt hashes

### Manual Schema Application

```bash
psql -U sanjayrana -d team_management -f init_security.sql
psql -U sanjayrana -d team_management -f migrate_passwords.sql
```

### Cleanup Old Data

```sql
-- Clean up expired tokens
SELECT iam.cleanup_expired_tokens();

-- Clean up old audit logs (keeps 90 days)
SELECT iam.cleanup_old_audit_logs();

-- Clean up inactive sessions
SELECT iam.cleanup_inactive_sessions();
```

---

## Monitoring & Alerts

### Security Metrics to Monitor

1. **Failed login attempts**: Spike indicates brute force attack
2. **Rate limit violations**: Unusual traffic patterns
3. **Permission denials**: Potential privilege escalation attempts
4. **SQL injection attempts**: Security threat
5. **XSS attempts**: Security threat
6. **Invalid tokens**: Potential token theft or replay attacks

### Query Security Events

```sql
-- Recent security events
SELECT * FROM iam.recent_security_events;

-- Suspicious activity
SELECT * FROM iam.suspicious_activity;

-- Active sessions
SELECT * FROM iam.active_user_sessions;

-- Failed logins by IP
SELECT ip_address, COUNT(*) as attempts
FROM iam.failed_login_attempts
WHERE attempted_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY ip_address
ORDER BY attempts DESC;
```

---

## Troubleshooting

### Common Issues

#### CORS Errors
- **Symptom**: "Not allowed by CORS" error
- **Solution**: Add frontend origin to `ALLOWED_ORIGINS` in `.env`

#### Rate Limit Exceeded
- **Symptom**: 429 Too Many Requests
- **Solution**: Wait 15 minutes or adjust `RATE_LIMIT_MAX_REQUESTS`

#### Invalid Token
- **Symptom**: 401 Unauthorized
- **Solution**: Token expired, use refresh token to get new access token

#### Login Blocked
- **Symptom**: "Account temporarily locked"
- **Solution**: Wait 15 minutes or clear failed login attempts

```sql
DELETE FROM iam.failed_login_attempts WHERE username = 'your_username';
```

---

## Security Incident Response

### If Security Breach Suspected

1. **Immediately revoke all tokens**:
```sql
UPDATE iam.refresh_tokens SET revoked = TRUE, revoked_at = CURRENT_TIMESTAMP;
UPDATE iam.sessions SET is_active = FALSE;
```

2. **Review audit logs**:
```sql
SELECT * FROM iam.audit_log 
WHERE severity IN ('CRITICAL', 'WARNING')
ORDER BY timestamp DESC;
```

3. **Identify compromised accounts**:
```sql
SELECT DISTINCT username FROM iam.audit_log
WHERE action LIKE '%SUSPICIOUS%' OR action LIKE '%FAILED%';
```

4. **Force password reset** for affected users

5. **Rotate JWT secret** in `.env` and restart services

6. **Notify affected users**

---

## Compliance & Standards

This implementation follows:
- **OWASP Top 10**: Protection against common vulnerabilities
- **NIST Zero Trust Architecture**: Never trust, always verify
- **CIS Controls**: Security best practices
- **GDPR**: Audit logging for data access

---

## Future Enhancements

### Phase 2 (Planned)
- Multi-factor authentication (MFA)
- IP whitelisting/blacklisting
- Geolocation-based access control
- Advanced anomaly detection with ML
- Real-time security dashboards

### Phase 3 (Planned)
- Service-to-service authentication
- API gateway integration
- Certificate-based authentication
- Hardware security module (HSM) integration

---

## Support & Contact

For security issues or questions:
- Review audit logs first
- Check this documentation
- Contact system administrator
- Report security vulnerabilities privately

**Remember**: Security is everyone's responsibility!
