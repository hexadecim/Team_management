/**
 * Database Connection Pool
 * 
 * Centralized PostgreSQL connection pool for the WAF framework.
 * Provides schema-aware query helpers for iam and core schemas.
 */

const { Pool, types } = require('pg');
// Set DATE (OID 1082) to return as string instead of Date object to avoid timezone shifts
types.setTypeParser(1082, val => val);
const config = require('./config');

// Create connection pool
const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: config.pool.max,
    min: config.pool.min,
    idleTimeoutMillis: config.pool.idleTimeoutMillis,
    connectionTimeoutMillis: config.pool.connectionTimeoutMillis,
});

// Handle pool errors
pool.on('error', (err, client) => {
    console.error('[DB Pool] Unexpected error on idle client', err);
});

// Log pool connection
pool.on('connect', () => {
    console.log('[DB Pool] New client connected');
});

/**
 * Execute a query on the database
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('[DB Query]', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('[DB Query Error]', { text, error: error.message });
        throw error;
    }
}

/**
 * Execute a query on the IAM schema
 * Automatically prefixes table names with 'iam.'
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
async function queryIAM(text, params) {
    return query(text, params);
}

/**
 * Execute a query on the Core schema
 * Automatically prefixes table names with 'core.'
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
async function queryCore(text, params) {
    return query(text, params);
}

/**
 * Get a client from the pool for transactions
 * Remember to call client.release() when done
 * @returns {Promise} Database client
 */
async function getClient() {
    const client = await pool.connect();
    const originalQuery = client.query.bind(client);

    // Add query logging to client
    client.query = async (text, params) => {
        const start = Date.now();
        try {
            const res = await originalQuery(text, params);
            const duration = Date.now() - start;
            console.log('[DB Client Query]', { text, duration, rows: res.rowCount });
            return res;
        } catch (error) {
            console.error('[DB Client Query Error]', { text, error: error.message });
            throw error;
        }
    };

    return client;
}

/**
 * Close the connection pool
 * Should be called when shutting down the application
 */
async function close() {
    await pool.end();
    console.log('[DB Pool] Connection pool closed');
}

/**
 * Get permission matrix for a user by joining user_roles with iam.roles
 * @param {string} username - Username
 * @returns {Promise<Object>} Combined permission matrix
 */
async function getPermissions(username) {
    const queryText = `
        SELECT r.permissions 
        FROM iam.roles r
        JOIN iam.user_roles ur ON r.id = ur.role_id
        WHERE ur.username = $1
    `;
    const result = await query(queryText, [username]);

    const combinedClaims = {};
    result.rows.forEach(row => {
        if (row.permissions) {
            Object.entries(row.permissions).forEach(([module, perm]) => {
                const current = combinedClaims[module];
                // 'rw' > 'r' > 'none'
                if (perm === 'rw') combinedClaims[module] = 'rw';
                else if (perm === 'r' && current !== 'rw') combinedClaims[module] = 'r';
                else if (!combinedClaims[module]) combinedClaims[module] = 'none';
            });
        }
    });
    return combinedClaims;
}

module.exports = {
    query,
    queryIAM,
    queryCore,
    getClient,
    close,
    getPermissions,
    pool
};
