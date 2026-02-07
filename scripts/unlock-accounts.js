/**
 * Script to unlock all user accounts by clearing failed login attempts
 * Run from: apps/resource-service directory
 */

const { db } = require('../../packages/shared');

async function unlockAccounts() {
    try {
        console.log('Clearing failed login attempts...');

        const result = await db.queryIAM('TRUNCATE TABLE iam.failed_login_attempts');

        console.log('✅ Successfully cleared all failed login attempts');
        console.log('All user accounts are now unlocked');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error unlocking accounts:', error);
        process.exit(1);
    }
}

unlockAccounts();
