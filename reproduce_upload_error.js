const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:4001';
let token = '';

async function runReproduction() {
    try {
        console.log('--- Starting Bulk Upload Reproduction ---');

        // 1. Login
        console.log('Logging in...');
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin' })
        });
        const loginData = await loginRes.json();
        token = loginData.accessToken;
        console.log('Logged in.');

        // 2. Prepare File Upload
        const filePath = '/Users/sanjayrana/AILearning/Team_management/test_employees_junk.csv';
        const fileContent = fs.readFileSync(filePath);

        // I need to use form-data or equivalent
        // Since I'm in node, I'll use a manual boundary or a library if available.
        // But fetch in latest node supports FormData.
        const formData = new FormData();
        const blob = new Blob([fileContent], { type: 'text/csv' });
        formData.append('file', blob, 'test_employees_valid.csv');

        console.log('Uploading file...');
        const uploadRes = await fetch(`${API_BASE}/employees/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const status = uploadRes.status;
        const data = await uploadRes.json();

        console.log(`Status: ${status}`);
        console.log('Response:', JSON.stringify(data, null, 2));

        if (status === 201) {
            console.log('SUCCESS: Upload worked fine with valid CSV.');
        } else {
            console.log('FAILURE: Upload failed as expected / reproduced.');
        }

    } catch (err) {
        console.error('Reproduction failed:', err.message);
    }
}

runReproduction();
