/**
 * Shared Utilities Package
 * 
 * Entry point for shared utilities across the team management application
 */

const db = require('./db');
const emailService = require('./services/emailService');

module.exports = {
    db,
    emailService
};
