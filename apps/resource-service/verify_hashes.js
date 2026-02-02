const bcrypt = require('bcrypt');
const { db } = require('@team-mgmt/shared');
require('dotenv').config({ path: '../../.env' });

async function verify() {
    try {
        const res = await db.queryIAM('SELECT username, password FROM iam.users WHERE username IN ($1, $2)', ['admin', 'employee']);

        for (const user of res.rows) {
            const expected = user.username === 'admin' ? 'admin' : 'emp';
            const match = await bcrypt.compare(expected, user.password);
            console.log(`User: ${user.username}, Password: ${expected}, Match: ${match}`);
        }
    } catch (err) {
        console.error('Verification failed:', err);
    }
}

verify();
