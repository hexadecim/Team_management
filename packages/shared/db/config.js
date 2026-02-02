/**
 * Database Configuration
 * 
 * Centralized configuration for PostgreSQL connection.
 * Supports environment variable overrides for flexibility.
 */

module.exports = {
    // Database connection settings
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'team_mgmt',

    // Connection pool settings
    pool: {
        max: parseInt(process.env.DB_POOL_MAX || '20'),           // Maximum number of connections
        min: parseInt(process.env.DB_POOL_MIN || '2'),            // Minimum number of connections
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),  // 30 seconds
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000'), // 5 seconds
    }
};
