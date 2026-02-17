const db = require('../packages/shared/db');

async function fixRates() {
    console.log('Updating 0 expense rates to 50...');
    try {
        const res = await db.queryCore(`
            UPDATE core.employees 
            SET expense_rate = 50 
            WHERE expense_rate = 0 OR expense_rate IS NULL
        `);
        console.log(`Updated ${res.rowCount} employees.`);
    } catch (error) {
        console.error('Update failed:', error);
    } finally {
        process.exit(0);
    }
}

fixRates();
