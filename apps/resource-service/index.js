const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const employeeRepo = require('./repository/employeeRepository');
const projectRepo = require('./repository/projectRepository');
const allocationRepo = require('./repository/allocationRepository');

const resources = {};

app.get('/resources', (req, res) => {
    res.send(Object.values(resources));
});

app.post('/resources', async (req, res) => {
    const id = uuidv4();
    const { name, type, status } = req.body;

    const resource = { id, name, type, status: status || 'available' };
    resources[id] = resource;

    // Emit event to bus
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

/* Employee Module Endpoints */

app.get('/employees', (req, res) => {
    const { q } = req.query;
    if (q) {
        return res.send(employeeRepo.search(q));
    }
    res.send(employeeRepo.getAll());
});

app.post('/employees', (req, res) => {
    const employee = employeeRepo.create(req.body);
    res.status(201).send(employee);
});

app.put('/employees/:id', (req, res) => {
    const employee = employeeRepo.update(req.params.id, req.body);
    if (!employee) return res.status(404).send({ error: 'Not found' });
    res.send(employee);
});

app.delete('/employees/:id', (req, res) => {
    const deleted = employeeRepo.delete(req.params.id);
    if (!deleted) return res.status(404).send({ error: 'Not found' });
    res.status(204).send();
});

/* Project Endpoints */
app.get('/projects', (req, res) => {
    res.send(projectRepo.getAll());
});

/* Allocation Endpoints */
app.get('/allocations', (req, res) => {
    res.send(allocationRepo.getAll());
});

app.post('/allocations', (req, res) => {
    const { employeeId, percentage, startDate, endDate } = req.body;
    const newPerc = parseInt(percentage);
    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);

    const existing = allocationRepo.getByEmployeeId(employeeId);
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

    for (let i = 0; i < 12; i++) {
        const year = i < 9 ? 2026 : 2027;
        const monthIndex = (i + 3) % 12;
        const monthStart = new Date(year, monthIndex, 1);
        const monthEnd = new Date(year, monthIndex + 1, 0);

        // If new allocation overlaps with this month
        if (newStart <= monthEnd && newEnd >= monthStart) {
            const currentTotalOnMonth = existing.reduce((sum, a) => {
                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                if (aStart <= monthEnd && aEnd >= monthStart) {
                    return sum + a.percentage;
                }
                return sum;
            }, 0);

            if (currentTotalOnMonth + newPerc > 100) {
                return res.status(400).send({
                    error: 'Capacity Exceeded',
                    month: months[i],
                    total: currentTotalOnMonth + newPerc
                });
            }
        }
    }

    const allocation = allocationRepo.create(req.body);
    res.status(201).send(allocation);
});

app.put('/allocations/:id', (req, res) => {
    const allocation = allocationRepo.update(req.params.id, req.body);
    if (!allocation) return res.status(404).send({ error: 'Not found' });
    res.send(allocation);
});

app.delete('/allocations/:id', (req, res) => {
    const deleted = allocationRepo.delete(req.params.id);
    if (!deleted) return res.status(404).send({ error: 'Not found' });
    res.status(204).send();
});

const PORT = 4001;
app.listen(PORT, () => {
    console.log(`[Resource Service] Listening on port ${PORT}`);
});
