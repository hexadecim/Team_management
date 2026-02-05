const axios = require('axios');

const API_BASE = 'http://localhost:4001';

const personas = [
    {
        name: 'Admin',
        role: 'Admin',
        permissions: { dashboard: 'rw', employee_list: 'rw', allocation: 'rw', administration: 'rw' },
        tests: [
            { module: 'employees', method: 'get', expected: 200 },
            { module: 'employees', method: 'post', data: { firstName: 'Test', lastName: 'Admin', primarySkills: ['Admin'] }, expected: 201 },
            { module: 'projects', method: 'get', expected: 200 },
            { module: 'projects', method: 'post', data: { name: 'Admin Project' }, expected: 201 }
        ]
    },
    {
        name: 'ReadOnly',
        role: 'ReadOnly',
        permissions: { dashboard: 'r', employee_list: 'r', allocation: 'r', administration: 'none' },
        tests: [
            { module: 'employees', method: 'get', expected: 200 },
            { module: 'employees', method: 'post', data: { firstName: 'Test', lastName: 'Read', primarySkills: ['Read'] }, expected: 403 },
            { module: 'projects', method: 'get', expected: 200 },
            { module: 'projects', method: 'post', data: { name: 'Read Project' }, expected: 403 }
        ]
    },
    {
        name: 'HR',
        role: 'HR',
        permissions: { employee_list: 'rw', administration: 'none', dashboard: 'r' },
        tests: [
            { module: 'employees', method: 'get', expected: 200 },
            { module: 'employees', method: 'post', data: { firstName: 'Test', lastName: 'HR', primarySkills: ['HR'] }, expected: 201 },
            { module: 'projects', method: 'get', expected: 200 }, // No permission check on GET /projects in index.js?
            { module: 'projects', method: 'post', data: { name: 'HR Project' }, expected: 403 }
        ]
    },
    {
        name: 'ProjectManager',
        role: 'ProjectManager',
        permissions: { administration: 'rw', employee_list: 'r', dashboard: 'r' },
        tests: [
            { module: 'employees', method: 'get', expected: 200 },
            { module: 'employees', method: 'post', data: { firstName: 'Test', lastName: 'PM', primarySkills: ['PM'] }, expected: 403 },
            { module: 'projects', method: 'post', data: { name: 'PM Project' }, expected: 201 }
        ]
    },
    {
        name: 'Analytics',
        role: 'Analytics',
        permissions: { dashboard: 'r', employee_list: 'none', administration: 'none' },
        tests: [
            { module: 'analytics/project-deviations', method: 'get', expected: 200 },
            { module: 'employees', method: 'get', expected: 403 },
            { module: 'projects', method: 'post', data: { name: 'Analytics Project' }, expected: 403 }
        ]
    }
];

async function runTests() {
    try {
        console.log('--- PERSONA BASED RBAC TESTING ---');

        // 1. Login as Admin to setup roles and users
        const loginRes = await axios.post(`${API_BASE}/auth/login`, { username: 'admin', password: 'admin' });
        const adminToken = loginRes.data.accessToken;
        const adminHeaders = { Authorization: `Bearer ${adminToken}` };

        for (const persona of personas) {
            console.log(`\nTesting Persona: ${persona.name}`);

            // Cleanup and Create Role
            try {
                const roles = await axios.get(`${API_BASE}/roles`, { headers: adminHeaders });
                const existingRole = roles.data.find(r => r.name === persona.role);
                if (existingRole) {
                    await axios.delete(`${API_BASE}/roles/${existingRole.id}`, { headers: adminHeaders });
                }
            } catch (e) { }

            const roleRes = await axios.post(`${API_BASE}/roles`, {
                name: persona.role,
                permissions: persona.permissions
            }, { headers: adminHeaders });
            const roleId = roleRes.data.id;

            // Cleanup and Create User
            const username = `test_${persona.name.toLowerCase()}`;
            const password = 'password123';
            try {
                await axios.delete(`${API_BASE}/users/${username}`, { headers: adminHeaders });
            } catch (e) { }

            await axios.post(`${API_BASE}/users`, {
                username,
                password,
                roles: [persona.role]
            }, { headers: adminHeaders });

            // 2. Login as Persona
            const personaLoginRes = await axios.post(`${API_BASE}/auth/login`, { username, password });
            const token = personaLoginRes.data.accessToken;
            const headers = { Authorization: `Bearer ${token}` };

            // 3. Execution Tests
            for (const test of persona.tests) {
                try {
                    let res;
                    if (test.method === 'get') {
                        res = await axios.get(`${API_BASE}/${test.module}`, { headers });
                    } else if (test.method === 'post') {
                        res = await axios.post(`${API_BASE}/${test.module}`, test.data, { headers });
                    }

                    if (res.status === test.expected) {
                        console.log(`  [PASS] ${test.method.toUpperCase()} /${test.module} returned ${res.status}`);
                    } else {
                        console.log(`  [FAIL] ${test.method.toUpperCase()} /${test.module} returned ${res.status}, expected ${test.expected}`);
                    }
                } catch (err) {
                    const status = err.response ? err.response.status : 'ERR';
                    if (status === test.expected) {
                        console.log(`  [PASS] ${test.method.toUpperCase()} /${test.module} returned ${status}`);
                    } else {
                        console.log(`  [FAIL] ${test.method.toUpperCase()} /${test.module} returned ${status}, expected ${test.expected}`);
                        if (err.response) console.log('    Response:', JSON.stringify(err.response.data));
                    }
                }
            }
        }

        console.log('\n--- TESTING COMPLETE ---');
    } catch (err) {
        console.error('TESTING FAILED:', err.message);
        if (err.response) console.error('Response data:', err.response.data);
    }
}

runTests();
