const axios = require('axios');

const API_BASE = 'http://localhost:4001';

async function runVerify() {
    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_BASE}/auth/login`, { username: 'admin', password: 'admin' });
        const token = loginRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };
        console.log('Logged in.');

        // 2. Create
        console.log('Creating project...');
        const createRes = await axios.post(`${API_BASE}/projects`, { name: 'Node Verify Project' }, { headers });
        const projectId = createRes.data.id;
        console.log('Created project ID:', projectId);

        // 3. Verify Active
        console.log('Verifying active...');
        let listRes = await axios.get(`${API_BASE}/projects`, { headers });
        let project = listRes.data.find(p => p.id === projectId);
        if (!project || (project.status && project.status !== 'active')) throw new Error('Failed to create active project');
        console.log('Project is active.');

        // 4. Deactivate
        console.log('Deactivating...');
        await axios.put(`${API_BASE}/projects/${projectId}`, { name: 'Node Verify Project', status: 'inactive' }, { headers });

        // 5. Verify Inactive
        console.log('Verifying inactive...');
        listRes = await axios.get(`${API_BASE}/projects`, { headers });
        project = listRes.data.find(p => p.id === projectId);
        if (project.status !== 'inactive') throw new Error('Failed to deactivate project');
        console.log('Project is inactive.');

        // 6. Project is inactive, check if it's filtered for allocations?
        // Wait, current check is frontend only. Backend endpoint /allocations doesn't filter, the UI does.
        // So I can't check that simply here without simulating UI logic or adding a backend filtered endpoint.
        // But the user asked to fix the "Deactivation & Delete" in Project Master first.

        // 7. Delete
        console.log('Deleting...');
        await axios.delete(`${API_BASE}/projects/${projectId}`, { headers });

        // 8. Verify Deletion
        console.log('Verifying deletion...');
        listRes = await axios.get(`${API_BASE}/projects`, { headers });
        project = listRes.data.find(p => p.id === projectId);
        if (project) throw new Error('Failed to delete project');
        console.log('Project deleted successfully.');

        console.log('VERIFICATION PASSED');
    } catch (err) {
        console.error('VERIFICATION FAILED:', err.message);
        if (err.response) console.error('Response data:', err.response.data);
    }
}

runVerify();
