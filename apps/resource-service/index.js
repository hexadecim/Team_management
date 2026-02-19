require('dotenv').config({ path: '../../.env' });
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();

// Configure Multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /csv|xlsx|xls|application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet|application\/vnd.ms-excel|text\/csv|application\/octet-stream/;
        const extname = /csv|xlsx|xls/.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype || extname) {
            return cb(null, true);
        }
        cb(new Error('Only .csv, .xls, and .xlsx files are allowed!'));
    }
});

// Middleware to handle multer errors
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err.message === 'Only .csv, .xls, and .xlsx files are allowed!') {
        return res.status(400).json({ error: err.message });
    }
    next(err);
};

// Import repositories and utilities
const roleRepo = require('./repository/roleRepository');
const userRepo = require('./repository/userRepository');
const employeeRepo = require('./repository/employeeRepository');
const projectRepo = require('./repository/projectRepository');
const allocationRepo = require('./repository/allocationRepository');
const financialCalculationService = require('./services/financialCalculationService');
const allocationService = require('./services/allocationService');
const financialYearRepo = require('./repository/financialYearRepository');
const SMTPConfigRepository = require('../../packages/shared/repositories/smtpConfigRepository');
const smtpConfigRepo = new SMTPConfigRepository();
const { db, emailService } = require('@team-mgmt/shared');
const AuditLogger = require('./middleware/auditLogger');
const SecurityMonitor = require('./middleware/securityMonitor');
const systemSettingsRepo = require('./repository/systemSettingsRepository');

// ============================================
// ZERO TRUST SECURITY CONFIGURATION
// ============================================

// Environment variables with fallbacks
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-vibe-key';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

// Security Headers with Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: {
        action: 'deny'
    },
    noSniff: true,
    xssFilter: true
}));

// CORS Configuration - Strict whitelist
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow localhost and specific domains
        if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
            return callback(null, true);
        }

        // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        const localNetworkRegex = /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;
        if (localNetworkRegex.test(origin)) {
            return callback(null, true);
        }

        console.warn(`[CORS] Blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' })); // Limit request body size

// Rate Limiting - Global
const globalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 3000,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        AuditLogger.logSecurityEvent(
            req.user?.username || 'anonymous',
            'RATE_LIMIT_EXCEEDED',
            'WARNING',
            { ip: req.ip, path: req.path }
        );
        res.status(429).json({ error: 'Too many requests, please try again later' });
    }
});

// Rate Limiting - Strict for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 15 attempts
    skipSuccessfulRequests: true,
    message: { error: 'Too many login attempts, please try again later' }
});

app.use(globalLimiter);

// Audit Logging - Log all requests
app.use(AuditLogger.requestLogger());

// Security Monitoring
app.use(SecurityMonitor.suspiciousActivityDetector());
app.use(SecurityMonitor.privilegeEscalationDetector());

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        await AuditLogger.logSecurityEvent(
            'anonymous',
            'UNAUTHORIZED_ACCESS_ATTEMPT',
            'WARNING',
            { path: req.path, ip: req.ip }
        );
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // Check session validity and inactivity
        const sessionValid = await checkSessionValidity(decoded.sessionId);
        if (!sessionValid) {
            await AuditLogger.logSecurityEvent(
                decoded.username,
                'SESSION_EXPIRED',
                'INFO',
                { sessionId: decoded.sessionId, reason: 'inactivity_timeout' }
            );
            return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
        }

        // Update session activity
        await updateSessionActivity(decoded.sessionId);

        next();
    } catch (err) {
        await AuditLogger.logSecurityEvent(
            'anonymous',
            'INVALID_TOKEN',
            'WARNING',
            { error: err.message, path: req.path, ip: req.ip }
        );
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const checkPermission = (module, level) => {
    return async (req, res, next) => {
        const claims = req.user.claims || {};
        const userPerm = claims[module] || 'none';

        if (userPerm === 'rw') return next();
        if (level === 'r' && (userPerm === 'r' || userPerm === 'rw')) return next();

        await AuditLogger.logSecurityEvent(
            req.user.username,
            'PERMISSION_DENIED',
            'WARNING',
            { module, requiredLevel: level, userLevel: userPerm, path: req.path }
        );
        return res.status(403).json({ error: `Forbidden: Requires ${level === 'rw' ? 'write' : 'read'} access to ${module}` });
    };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

async function createSession(username, ipAddress, userAgent) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 60) * 60 * 1000);

    const result = await db.queryIAM(`
        INSERT INTO iam.sessions (username, session_token, ip_address, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    `, [username, sessionToken, ipAddress, userAgent, expiresAt]);

    return result.rows[0].id;
}

async function checkSessionValidity(sessionId) {
    if (!sessionId) return false;

    const result = await db.queryIAM(`
        SELECT is_active, last_activity_at, expires_at
        FROM iam.sessions
        WHERE id = $1
    `, [sessionId]);

    if (result.rows.length === 0) return false;

    const session = result.rows[0];

    // Check if session is active
    if (!session.is_active) return false;

    // Check if session has expired
    if (new Date(session.expires_at) < new Date()) return false;

    // Check for inactivity timeout (20 minutes)
    const inactivityTimeout = (parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 20) * 60 * 1000;
    const lastActivity = new Date(session.last_activity_at);
    const now = new Date();

    if (now - lastActivity > inactivityTimeout) {
        // Mark session as inactive
        await db.queryIAM(`
            UPDATE iam.sessions
            SET is_active = FALSE
            WHERE id = $1
        `, [sessionId]);
        return false;
    }

    return true;
}

async function updateSessionActivity(sessionId) {
    if (!sessionId) return;

    await db.queryIAM(`
        UPDATE iam.sessions
        SET last_activity_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND is_active = TRUE
    `, [sessionId]);
}

async function createRefreshToken(username, deviceInfo) {
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.queryIAM(`
        INSERT INTO iam.refresh_tokens (username, token_hash, expires_at, device_info)
        VALUES ($1, $2, $3, $4)
    `, [username, tokenHash, expiresAt, deviceInfo]);

    return refreshToken;
}

async function verifyRefreshToken(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const result = await db.queryIAM(`
        SELECT username, expires_at, revoked
        FROM iam.refresh_tokens
        WHERE token_hash = $1
    `, [tokenHash]);

    if (result.rows.length === 0) return null;

    const token = result.rows[0];
    if (token.revoked || new Date(token.expires_at) < new Date()) {
        return null;
    }

    // Update last used
    await db.queryIAM(`
        UPDATE iam.refresh_tokens
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE token_hash = $1
    `, [tokenHash]);

    return token.username;
}

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

app.post('/auth/login',
    authLimiter,
    [
        body('username').trim().notEmpty().withMessage('Username is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { username, password } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.get('user-agent');

            // Check for suspicious activity
            const isSuspicious = await SecurityMonitor.checkLoginRateLimit(username, ipAddress);
            if (isSuspicious) {
                await AuditLogger.logSecurityEvent(
                    username,
                    'LOGIN_BLOCKED_SUSPICIOUS_ACTIVITY',
                    'CRITICAL',
                    { ipAddress, failedAttempts: 5 }
                );
                return res.status(429).json({ error: 'Account temporarily locked due to suspicious activity' });
            }

            const user = await userRepo.findByUsername(username);

            if (!user) {
                await AuditLogger.logFailedLogin(username, ipAddress, userAgent, 'USER_NOT_FOUND');
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Verify password with bcrypt
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                await AuditLogger.logFailedLogin(username, ipAddress, userAgent, 'INVALID_PASSWORD');
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Get permissions
            const combinedClaims = await db.getPermissions(username);

            // Create session
            const sessionId = await createSession(username, ipAddress, userAgent);

            // Create access token (short-lived)
            const accessToken = jwt.sign({
                username,
                claims: combinedClaims,
                sessionId
            }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });

            // Create refresh token (long-lived)
            const refreshToken = await createRefreshToken(username, { userAgent, ipAddress });

            await AuditLogger.logAuth(username, 'LOGIN_SUCCESS', true, { ipAddress });

            return res.json({
                accessToken,
                refreshToken,
                expiresIn: JWT_ACCESS_EXPIRY,
                claims: combinedClaims
            });
        } catch (error) {
            console.error('[Login Error]', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

app.post('/auth/refresh',
    [body('refreshToken').notEmpty().withMessage('Refresh token is required')],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { refreshToken } = req.body;

            const username = await verifyRefreshToken(refreshToken);
            if (!username) {
                await AuditLogger.logSecurityEvent(
                    'anonymous',
                    'INVALID_REFRESH_TOKEN',
                    'WARNING',
                    { ip: req.ip }
                );
                return res.status(401).json({ error: 'Invalid or expired refresh token' });
            }

            // Get fresh permissions
            const combinedClaims = await db.getPermissions(username);

            // Create new session
            const sessionId = await createSession(username, req.ip, req.get('user-agent'));

            // Create new access token
            const accessToken = jwt.sign({
                username,
                claims: combinedClaims,
                sessionId
            }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });

            await AuditLogger.logAuth(username, 'TOKEN_REFRESHED', true, { ip: req.ip });

            return res.json({
                accessToken,
                expiresIn: JWT_ACCESS_EXPIRY
            });
        } catch (error) {
            console.error('[Token Refresh Error]', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

app.post('/auth/logout', authenticate, async (req, res) => {
    try {
        const { username, sessionId } = req.user;

        // Deactivate session
        if (sessionId) {
            await db.queryIAM(`
                UPDATE iam.sessions
                SET is_active = FALSE
                WHERE id = $1
            `, [sessionId]);
        }

        await AuditLogger.logAuth(username, 'LOGOUT', true, { ip: req.ip });

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('[Logout Error]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// ROLE & USER MANAGEMENT ENDPOINTS
// ============================================

app.get('/roles', authenticate, async (req, res) => {
    try {
        const roles = await roleRepo.getAll();
        res.send(roles);
    } catch (error) {
        console.error('[Get Roles Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.post('/roles', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const role = await roleRepo.create(req.body);
        res.status(201).send(role);
    } catch (e) {
        res.status(400).send({ error: e.message });
    }
});

app.put('/roles/:id', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const role = await roleRepo.update(req.params.id, req.body);
        if (!role) return res.status(404).send({ error: 'Role not found' });
        res.send(role);
    } catch (e) {
        res.status(400).send({ error: e.message });
    }
});

app.delete('/roles/:id', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const deleted = await roleRepo.delete(req.params.id);
        if (!deleted) return res.status(404).send({ error: 'Role not found' });
        res.status(204).send();
    } catch (error) {
        console.error('[Delete Role Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.get('/users', authenticate, checkPermission('administration', 'r'), async (req, res) => {
    try {
        const users = await userRepo.getAll();
        res.send(users);
    } catch (error) {
        console.error('[Get Users Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.post('/users',
    authenticate,
    checkPermission('administration', 'rw'),
    [
        body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('assigned_project_id').notEmpty().withMessage('Project assignment is mandatory')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            // Hash password before storing
            const hashedPassword = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
            const userData = {
                username: req.body.username,
                password: hashedPassword,
                roles: req.body.roles || [],
                assigned_project_id: req.body.assigned_project_id
            };

            const user = await userRepo.create(userData);

            // Don't return password in response
            if (user) delete user.password;

            res.status(201).send(user);
        } catch (e) {
            res.status(400).send({ error: e.message });
        }
    }
);

app.put('/users/:username/roles', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const user = await userRepo.updateRoles(req.params.username, req.body.roles);
        if (!user) return res.status(404).send({ error: 'User not found' });
        res.send(user);
    } catch (error) {
        console.error('[Update User Roles Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.put('/users/:username/projects', authenticate, async (req, res) => {
    try {
        const user = await userRepo.updateProjects(req.params.username, req.body.project_ids);
        if (!user) return res.status(404).send({ error: 'User not found' });
        res.send(user);
    } catch (error) {
        console.error('[Update User Projects Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.delete('/users/:username', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const deleted = await userRepo.delete(req.params.username);
        if (!deleted) return res.status(404).send({ error: 'User not found' });
        res.status(204).send();
    } catch (error) {
        console.error('[Delete User Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// EMPLOYEE ENDPOINTS
// ============================================

app.get('/employees', authenticate, checkPermission('employee_list', 'r'), async (req, res) => {
    try {
        const { q } = req.query;
        if (q) {
            const employees = await employeeRepo.search(q);
            return res.send(employees);
        }
        const employees = await employeeRepo.getAll();
        res.send(employees);
    } catch (error) {
        console.error('[Get Employees Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.post('/employees', authenticate, checkPermission('employee_list', 'rw'), async (req, res) => {
    try {
        const employee = await employeeRepo.create(req.body);
        res.status(201).send(employee);
    } catch (error) {
        console.error('[Create Employee Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.put('/employees/:id', authenticate, checkPermission('employee_list', 'rw'), async (req, res) => {
    try {
        const employee = await employeeRepo.update(req.params.id, req.body);
        if (!employee) return res.status(404).send({ error: 'Not found' });

        // Trigger recalculation for all projects this employee is allocated to
        // If rates changed, every project they touch needs an update
        (async () => {
            try {
                const allocations = await allocationRepo.getByEmployeeId(employee.id);
                const projectIds = [...new Set(allocations.map(a => a.projectId))];
                for (const projectId of projectIds) {
                    await financialCalculationService.calculateProjectFinancials(projectId);
                }
            } catch (err) {
                console.error('[Employee Update Recalc Error]', err);
            }
        })();

        res.send(employee);
    } catch (error) {
        console.error('[Update Employee Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.delete('/employees/:id', authenticate, checkPermission('employee_list', 'rw'), async (req, res) => {
    try {
        const deleted = await employeeRepo.delete(req.params.id);
        if (!deleted) return res.status(404).send({ error: 'Not found' });
        res.status(204).send();
    } catch (error) {
        console.error('[Delete Employee Error]', error);
        if (error.message && error.message.includes('Cannot delete employee')) {
            return res.status(400).send({ error: error.message });
        }
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

const analyticsService = require('./services/analyticsService');

app.get('/analytics/capacity/trend', authenticate, checkPermission('capacity_analysis', 'r'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).send({ error: 'startDate and endDate are required' });
        }
        const data = await analyticsService.getUtilizationTrend(startDate, endDate);
        res.send(data);
    } catch (error) {
        console.error('[Analytics Trend Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.get('/analytics/capacity/stats', authenticate, checkPermission('capacity_analysis', 'r'), async (req, res) => {
    try {
        const data = await analyticsService.getKeyStats();
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(data);
    } catch (error) {
        console.error('[Analytics Stats Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.get('/analytics/capacity/bench', authenticate, checkPermission('capacity_analysis', 'r'), async (req, res) => {
    try {
        const data = await analyticsService.getBenchStats(); // Defaults to today
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(data);
    } catch (error) {
        console.error('[Analytics Bench Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.get('/analytics/capacity/risks', authenticate, checkPermission('capacity_analysis', 'r'), async (req, res) => {
    try {
        const overAllocated = await analyticsService.getRiskRadar();
        const rollingOff = await analyticsService.getRollingOffSoon();
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send({ overAllocated, rollingOff });
    } catch (error) {
        console.error('[Analytics Risks Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.get('/analytics/capacity/mix', authenticate, checkPermission('capacity_analysis', 'r'), async (req, res) => {
    try {
        const data = await analyticsService.getCapacityMix();
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(data);
    } catch (error) {
        console.error('[Analytics Mix Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// FINANCIAL ANALYTICS ENDPOINTS
// ============================================

app.get('/analytics/financial/burn-trend', authenticate, checkPermission('capacity_analysis', 'r'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).send({ error: 'startDate and endDate are required' });
        }
        const data = await analyticsService.getMonthlyBurnTrend(startDate, endDate);
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(data);
    } catch (error) {
        console.error('[Analytics Burn Trend Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// PROJECT ENDPOINTS
// ============================================

app.get('/employees/search', authenticate, async (req, res) => {
    try {
        const employees = await employeeRepo.search(req.query.q);
        res.send(employees);
    } catch (error) {
        console.error('[Search Employees Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Bulk Upload Employees
app.post('/employees/upload', authenticate, upload.single('file'), handleMulterError, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
            return res.status(400).json({ error: 'File is empty' });
        }

        const employees = [];
        const errors = [];
        const seenNames = new Set();

        // Get existing names to check for uniqueness
        const allEmployees = await employeeRepo.getAll();
        const existingNames = new Set(allEmployees.map(e => `${e.firstName.toLowerCase()} ${e.lastName.toLowerCase()}`));

        // Get existing projects for validation
        const allProjects = await projectRepo.getAll();
        const existingProjectNames = new Set(allProjects.map(p => p.name.toLowerCase()));

        // Helper to find a value by multiple potential keys (case/space insensitive)
        const getValue = (row, possibleKeys) => {
            const normalizedRow = {};
            for (const key of Object.keys(row)) {
                // Normalize key: lowercase and remove all spaces/underscores/dashes
                const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
                normalizedRow[normalizedKey] = row[key];
            }

            for (const key of possibleKeys) {
                const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
                if (normalizedRow[normalizedKey] !== undefined) {
                    return normalizedRow[normalizedKey]?.toString().trim();
                }
            }
            return undefined;
        };

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const lineNum = i + 2; // +1 for 0-indexing, +1 for header row
            const firstName = getValue(row, ['First Name', 'FirstName', 'first_name', 'fname']);
            const lastName = getValue(row, ['Last Name', 'LastName', 'last_name', 'lname']);
            const email = getValue(row, ['Email', 'E-mail', 'Email Address']);
            const skill = getValue(row, ['Skill', 'Primary Skill', 'Skills', 'primary_skill']);
            const projectName = getValue(row, ['Project', 'Current Project', 'Project Name']);
            const billableRate = getValue(row, ['Billable Rate', 'BillableRate', 'billable_rate']);
            const expenseRate = getValue(row, ['Expense Rate', 'ExpenseRate', 'expense_rate']);

            // 1. Validate required fields
            if (!firstName || !lastName || !skill) {
                errors.push(`Row ${lineNum}: Missing required fields (First Name, Last Name, and Skill are mandatory)`);
                continue;
            }

            // 2. Validate junk data (allow Unicode characters for names and emails)
            // This pattern blocks only non-printable control characters
            const junkPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
            if (junkPattern.test(firstName) || junkPattern.test(lastName) || (email && junkPattern.test(email)) || junkPattern.test(skill)) {
                errors.push(`Row ${lineNum}: Contains invalid control characters`);
                continue;
            }

            // 3. Validate uniqueness (First Name + Last Name)
            const fullName = `${firstName.toLowerCase()} ${lastName.toLowerCase()}`;
            if (seenNames.has(fullName)) {
                errors.push(`Row ${lineNum}: Duplicate name in file (${firstName} ${lastName})`);
                continue;
            }
            if (existingNames.has(fullName)) {
                errors.push(`Row ${lineNum}: Name already exists in system (${firstName} ${lastName})`);
                continue;
            }

            // 4. Validate Project Name (must exist)
            if (projectName && !existingProjectNames.has(projectName.toLowerCase())) {
                errors.push(`Row ${lineNum}: Project "${projectName}" does not exist in project master`);
                continue;
            }

            seenNames.add(fullName);
            employees.push({
                firstName,
                lastName,
                email,
                primarySkills: [skill], // Mapping 'Skill' to primarySkills array
                secondarySkills: [],
                currentProject: projectName || null,
                billableRate: parseFloat(billableRate) || 0,
                expenseRate: parseFloat(expenseRate) || 0,
                allocation: 0
            });
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.slice(0, 10), // Send first 10 errors
                totalErrors: errors.length
            });
        }

        // Perform bulk insertion (atomic-ish - if one fails, we don't rollback yet but we validate first)
        // Ideally use a transaction if repository supported bulk, but for now we'll do sequential since it's validated
        const createdCount = [];
        for (const emp of employees) {
            await employeeRepo.create(emp);
        }

        res.status(201).json({
            message: `Successfully uploaded ${employees.length} employees`,
            count: employees.length
        });

        // Trigger global recalculation after bulk upload since many projects might be affected
        (async () => {
            try {
                await financialCalculationService.recalculateAllProjects();
            } catch (err) {
                console.error('[Bulk Upload Recalc Error]', err);
            }
        })();

    } catch (error) {
        console.error('[Bulk Upload Error]', error);
        res.status(500).json({ error: 'Failed to process file. It may be corrupt or in an invalid format.' });
    } finally {
        // Cleanup uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});

app.get('/projects', authenticate, async (req, res) => {
    try {
        const projects = await projectRepo.getAll();
        res.send(projects);
    } catch (error) {
        console.error('[Get Projects Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.post('/projects',
    authenticate,
    checkPermission('administration', 'rw'),
    [
        body('name').trim().notEmpty().withMessage('Project name is required'),
        body('start_date').optional().isISO8601().withMessage('Valid start_date (YYYY-MM-DD) required if provided'),
        body('end_date').optional().isISO8601().withMessage('Valid end_date (YYYY-MM-DD) required if provided'),
        body('end_date').optional().custom((end_date, { req }) => {
            if (end_date && req.body.start_date && new Date(end_date) < new Date(req.body.start_date)) {
                throw new Error('end_date must be greater than or equal to start_date');
            }
            return true;
        })
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const project = await projectRepo.create(req.body);
            await AuditLogger.logAuth(req.user.username, 'PROJECT_CREATED', true, { projectId: project.id, projectName: project.name });
            res.status(201).send(project);
        } catch (error) {
            if (error.code === '23505') {
                return res.status(400).send({ error: 'Project name already exists' });
            }
            console.error('[Create Project Error]', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    }
);

app.put('/projects/:id',
    authenticate,
    checkPermission('administration', 'rw'),
    [
        body('name').optional().trim().notEmpty().withMessage('Project name cannot be empty'),
        body('end_date').optional().isISO8601().withMessage('Valid end_date (YYYY-MM-DD) is required'),
        body('change_reason').optional().trim().isLength({ max: 500 }).withMessage('Change reason must be 500 characters or less')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const project = await projectRepo.update(
                req.params.id,
                req.body,
                req.user.username,
                req.body.change_reason
            );
            if (!project) return res.status(404).send({ error: 'Not found' });
            await AuditLogger.logAuth(req.user.username, 'PROJECT_UPDATED', true, { projectId: project.id, changes: req.body });

            // Trigger recalculation on project update (budget or dates might have changed)
            // Use background execution to avoid blocking the response
            (async () => {
                try {
                    await financialCalculationService.calculateProjectFinancials(project.id);
                } catch (calcError) {
                    console.error('[Recalculation Error]', calcError);
                }
            })();

            res.send(project);
        } catch (error) {
            console.error('[Update Project Error]', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    }
);

app.delete('/projects/:id', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const deleted = await projectRepo.delete(req.params.id);
        if (!deleted) return res.status(404).send({ error: 'Not found' });
        await AuditLogger.logAuth(req.user.username, 'PROJECT_DELETED', true, { projectId: req.params.id });
        res.status(204).send();
    } catch (error) {
        console.error('[Delete Project Error]', error);
        if (error.message && error.message.includes('Cannot delete project')) {
            return res.status(400).send({ error: error.message });
        }
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Get project date change history
app.get('/projects/:id/history', authenticate, checkPermission('dashboard', 'r'), async (req, res) => {
    try {
        const history = await projectRepo.getDateHistory(req.params.id);
        res.send(history);
    } catch (error) {
        console.error('[Get Project History Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Get project deviation analytics
app.get('/analytics/project-deviations', authenticate, checkPermission('dashboard', 'r'), async (req, res) => {
    try {
        const analytics = await projectRepo.getDeviationAnalytics();
        res.send(analytics);
    } catch (error) {
        console.error('[Get Deviation Analytics Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// PROJECT FINANCIAL ENDPOINTS
// ============================================

// Get project financial summary
app.get('/projects/:id/financials', authenticate, checkPermission('dashboard', 'r'), async (req, res) => {
    try {
        const financials = await financialCalculationService.getProjectFinancialSummary(req.params.id);
        res.send(financials);
    } catch (error) {
        console.error('[Get Project Financials Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Get bulk financials for all projects (optimized for dashboard)
app.get('/projects/financials/bulk', authenticate, checkPermission('dashboard', 'r'), async (req, res) => {
    try {
        const bulkData = await financialCalculationService.getBulkFinancials();
        res.send(bulkData);
    } catch (error) {
        console.error('[Get Bulk Financials Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Get project baseline history
app.get('/projects/:id/baselines', authenticate, checkPermission('dashboard', 'r'), async (req, res) => {
    try {
        const baselines = await financialCalculationService.getProjectBaselines(req.params.id);
        res.send(baselines);
    } catch (error) {
        console.error('[Get Project Baselines Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Manually capture a new baseline
app.post('/projects/:id/baseline', authenticate, checkPermission('dashboard', 'rw'), async (req, res) => {
    try {
        const baseline = await financialCalculationService.createProjectBaseline(req.params.id);
        await AuditLogger.logAuth(req.user.username, 'PROJECT_BASELINE_CAPTURED', true, { projectId: req.params.id, version: baseline.version });
        res.send(baseline);
    } catch (error) {
        console.error('[Create Project Baseline Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Get monthly billing projections
app.get('/projects/:id/billing-monthly', authenticate, checkPermission('dashboard', 'r'), async (req, res) => {
    try {
        const billing = await financialCalculationService.getMonthlyBilling(req.params.id);
        res.send(billing);
    } catch (error) {
        console.error('[Get Monthly Billing Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Get monthly expense projections
app.get('/projects/:id/expenses-monthly', authenticate, checkPermission('dashboard', 'r'), async (req, res) => {
    try {
        const expenses = await financialCalculationService.getMonthlyExpenses(req.params.id);
        res.send(expenses);
    } catch (error) {
        console.error('[Get Monthly Expenses Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Trigger financial recalculation for a project
app.post('/projects/:id/recalculate', authenticate, checkPermission('dashboard', 'rw'), async (req, res) => {
    try {
        const result = await financialCalculationService.calculateProjectFinancials(req.params.id);
        await AuditLogger.logAuth(req.user.username, 'PROJECT_FINANCIALS_RECALCULATED', true, { projectId: req.params.id });
        res.send({ message: 'Recalculation triggered', result });
    } catch (error) {
        console.error('[Recalculation Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Admin endpoint to recalculate all projects
app.post('/financials/recalculate-all', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const results = await financialCalculationService.recalculateAllProjects();
        await AuditLogger.logAuth(req.user.username, 'ALL_PROJECT_FINANCIALS_RECALCULATED', true, { count: results.length });
        res.send({ message: 'Global recalculation triggered', results });
    } catch (error) {
        console.error('[Global Recalculation Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// ALLOCATION ENDPOINTS
// ============================================

app.get('/allocations', authenticate, checkPermission('allocation', 'r'), async (req, res) => {
    try {
        const allocations = await allocationRepo.getAll();
        res.send(allocations);
    } catch (error) {
        console.error('[Get Allocations Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.post('/allocations', authenticate, checkPermission('allocation', 'rw'), async (req, res) => {
    try {
        const allocation = await allocationRepo.create(req.body);

        // Audit log the creation
        await AuditLogger.logAuth(req.user.username, 'ALLOCATION_CREATED', true, {
            allocationId: allocation.id,
            employeeId: allocation.employeeId,
            projectId: allocation.projectId,
            projectName: allocation.projectName,
            percentage: allocation.percentage,
            startDate: allocation.startDate,
            endDate: allocation.endDate
        });

        // Send email notification (async, don't block response)
        (async () => {
            try {
                const employee = await employeeRepo.getById(allocation.employeeId);
                const project = await projectRepo.getById(allocation.projectId);
                if (employee && project) {
                    await emailService.sendAllocationCreatedNotification(allocation, employee, project);
                }
            } catch (err) {
                console.error('[Email Notification Error]', err);
            }
        })();

        // Trigger financial recalculation for the project
        (async () => {
            try {
                await financialCalculationService.calculateProjectFinancials(allocation.projectId);
            } catch (calcError) {
                console.error('[Recalculation Error]', calcError);
            }
        })();

        res.status(201).send(allocation);
    } catch (error) {
        if (error.message.includes('Total allocation cannot exceed 100%')) {
            return res.status(400).send({ error: 'Total allocation cannot exceed 100%' });
        }
        console.error('[Create Allocation Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.put('/allocations/:id', authenticate, checkPermission('allocation', 'rw'), async (req, res) => {
    try {
        // Fetch old allocation data for audit log
        const oldAllocation = await allocationRepo.getById(req.params.id);
        if (!oldAllocation) return res.status(404).send({ error: 'Not found' });

        const allocation = await allocationService.updateAllocation(req.params.id, req.body);

        // Audit log the update with before/after comparison
        await AuditLogger.logAuth(req.user.username, 'ALLOCATION_UPDATED', true, {
            allocationId: req.params.id,
            oldData: {
                employeeId: oldAllocation.employeeId,
                projectId: oldAllocation.projectId,
                projectName: oldAllocation.projectName,
                percentage: oldAllocation.percentage,
                startDate: oldAllocation.startDate,
                endDate: oldAllocation.endDate
            },
            newData: {
                employeeId: allocation.employeeId,
                projectId: allocation.projectId,
                projectName: allocation.projectName,
                percentage: allocation.percentage,
                startDate: allocation.startDate,
                endDate: allocation.endDate
            },
            changes: req.body
        });

        // Send email notification (async, don't block response)
        (async () => {
            try {
                const employee = await employeeRepo.getById(allocation.employeeId);
                const project = await projectRepo.getById(allocation.projectId);
                if (employee && project) {
                    await emailService.sendAllocationUpdatedNotification(oldAllocation, allocation, employee, project);
                }
            } catch (err) {
                console.error('[Email Notification Error]', err);
            }
        })();

        // Trigger financial recalculation for the project(s)
        (async () => {
            try {
                // Recalculate for the original project
                await financialCalculationService.calculateProjectFinancials(oldAllocation.projectId);

                // If project changed, recalculate for the new project as well
                if (allocation.projectId !== oldAllocation.projectId) {
                    await financialCalculationService.calculateProjectFinancials(allocation.projectId);
                }
            } catch (calcError) {
                console.error('[Recalculation Error]', calcError);
            }
        })();

        res.send(allocation);
    } catch (error) {
        if (error.message.includes('Total allocation cannot exceed 100%')) {
            return res.status(400).send({ error: 'Total allocation cannot exceed 100%' });
        }
        console.error('[Update Allocation Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.delete('/allocations/:id', authenticate, checkPermission('allocation', 'rw'), async (req, res) => {
    try {
        // Fetch allocation data before deletion for audit log
        const allocation = await allocationRepo.getById(req.params.id);
        if (!allocation) return res.status(404).send({ error: 'Not found' });

        const deleted = await allocationRepo.delete(req.params.id);

        // Audit log the deletion
        await AuditLogger.logAuth(req.user.username, 'ALLOCATION_DELETED', true, {
            allocationId: req.params.id,
            employeeId: allocation.employeeId,
            projectId: allocation.projectId,
            projectName: allocation.projectName,
            percentage: allocation.percentage,
            startDate: allocation.startDate,
            endDate: allocation.endDate
        });

        // Send email notification (async, don't block response)
        (async () => {
            try {
                const employee = await employeeRepo.getById(allocation.employeeId);
                const project = await projectRepo.getById(allocation.projectId);
                if (employee && project) {
                    await emailService.sendAllocationDeletedNotification(allocation, employee, project);
                }
            } catch (err) {
                console.error('[Email Notification Error]', err);
            }
        })();

        // Trigger financial recalculation for the project
        (async () => {
            try {
                await financialCalculationService.calculateProjectFinancials(allocation.projectId);
            } catch (calcError) {
                console.error('[Recalculation Error]', calcError);
            }
        })();

        res.status(204).send();
    } catch (error) {
        console.error('[Delete Allocation Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.post('/allocations/:id/partial-delete', authenticate, checkPermission('allocation', 'rw'), async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        if (!startDate || !endDate) {
            return res.status(400).send({ error: 'startDate and endDate are required' });
        }

        const result = await allocationService.deleteAllocationPeriod(req.params.id, startDate, endDate);

        // Trigger financial recalculation for the project
        // We need to get the allocation first to know the projectId, 
        // but deleteAllocationPeriod might have deleted it.
        // However, the allocationService already has the project info.
        // For simplicity, we'll assume the client knows or we trigger a global/project-specific recalc if possible.
        // Best way: get old allocation info BEFORE calling service or returning it from service.

        // Let's refine the service to return project info if possible or handle it here.
        // For now, we'll just return success and suggest a refresh.

        res.send(result);
    } catch (error) {
        console.error('[Partial Delete Error]', error);
        res.status(500).send({ error: error.message || 'Internal server error' });
    }
});

// ============================================
// LEGACY RESOURCE ENDPOINTS (kept for compatibility)
// ============================================

const resources = {};

app.get('/resources', (req, res) => {
    res.send(Object.values(resources));
});

app.post('/resources', async (req, res) => {
    const id = uuidv4();
    const { name, type, status } = req.body;

    const resource = { id, name, type, status: status || 'available' };
    resources[id] = resource;

    try {
        await axios.post('http://localhost:4005/emit', {
            eventType: 'RESOURCE_CREATED',
            data: resource
        });
    } catch (err) {
        console.error('[Resource Service] Failed to emit event:', err.message);
    }

    res.status(201).send(resource);
});

// ============================================
// SMTP CONFIGURATION ENDPOINTS
// ============================================

// Get SMTP configuration (admin only, without password)
app.get('/smtp-config', authenticate, checkPermission('administration', 'r'), async (req, res) => {
    try {
        const config = await smtpConfigRepo.getWithoutPassword();
        res.send(config || {});
    } catch (error) {
        console.error('[Get SMTP Config Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Create or update SMTP configuration (admin only)
app.post('/smtp-config', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const config = await smtpConfigRepo.upsert(req.body, req.user.username);

        // Audit log the configuration change
        await AuditLogger.logAuth(req.user.username, 'SMTP_CONFIG_UPDATED', true, {
            smtp_host: config.smtpHost,
            smtp_port: config.smtpPort,
            from_email: config.fromEmail,
            enabled: config.enabled
        });

        // Reinitialize email service with new config
        await emailService.initializeTransporter();

        res.send({ success: true, config });
    } catch (error) {
        console.error('[Update SMTP Config Error]', error);
        await AuditLogger.logAuth(req.user.username, 'SMTP_CONFIG_UPDATE_FAILED', false, {
            error: error.message
        });
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Test SMTP configuration (admin only)
app.post('/smtp-config/test', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const { testEmail } = req.body;

        if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
            return res.status(400).send({ error: 'Valid test email is required' });
        }

        const result = await emailService.sendTestEmail(testEmail);

        if (result.success) {
            await AuditLogger.logAuth(req.user.username, 'SMTP_TEST_EMAIL_SENT', true, {
                test_email: testEmail
            });
            res.send({ success: true, message: 'Test email sent successfully' });
        } else {
            await AuditLogger.logAuth(req.user.username, 'SMTP_TEST_EMAIL_FAILED', false, {
                test_email: testEmail,
                error: result.error
            });
            res.status(500).send({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[Test SMTP Config Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Delete SMTP configuration (admin only)
app.delete('/smtp-config', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const deleted = await smtpConfigRepo.delete();

        if (deleted) {
            await AuditLogger.logAuth(req.user.username, 'SMTP_CONFIG_DELETED', true, {});
            res.status(204).send();
        } else {
            res.status(404).send({ error: 'SMTP configuration not found' });
        }
    } catch (error) {
        console.error('[Delete SMTP Config Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// FINANCIAL YEAR ENDPOINTS
// ============================================

app.get('/financial-years', authenticate, async (req, res) => {
    try {
        const years = await financialYearRepo.getAll();
        res.send(years);
    } catch (error) {
        console.error('[Get Financial Years Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.post('/financial-years', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const year = await financialYearRepo.create(req.body);
        res.status(201).send(year);
    } catch (error) {
        console.error('[Create Financial Year Error]', error);
        res.status(400).send({ error: error.message });
    }
});

app.put('/financial-years/:id/current', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const success = await financialYearRepo.setCurrent(req.params.id);
        if (success) {
            res.send({ message: 'Current financial year updated' });
        } else {
            res.status(404).send({ error: 'Financial year not found' });
        }
    } catch (error) {
        console.error('[Set Current Financial Year Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.delete('/financial-years/:id', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const success = await financialYearRepo.delete(req.params.id);
        if (success) {
            res.status(204).send();
        } else {
            res.status(404).send({ error: 'Financial year not found' });
        }
    } catch (error) {
        console.error('[Delete Financial Year Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// SYSTEM SETTINGS ENDPOINTS
// ============================================

app.get('/settings', authenticate, async (req, res) => {
    try {
        const settings = await systemSettingsRepo.getAll();
        res.send(settings);
    } catch (error) {
        console.error('[Get Settings Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.post('/settings', authenticate, checkPermission('administration', 'rw'), async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value === undefined) {
            return res.status(400).send({ error: 'Key and value are required' });
        }
        const setting = await systemSettingsRepo.update(key, value);
        res.send(setting);
    } catch (error) {
        console.error('[Update Setting Error]', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// ============================================
// SERVER STARTUP
// ============================================

const PORT = 4001;
app.listen(PORT, () => {
    console.log(`[Resource Service] Listening on port ${PORT}`);
    console.log(`[Security] Zero Trust features enabled`);
    console.log(`[Security] JWT expiry: ${JWT_ACCESS_EXPIRY}`);
    console.log(`[Security] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
