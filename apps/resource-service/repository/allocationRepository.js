const { v4: uuidv4 } = require('uuid');

class AllocationRepository {
    constructor() {
        this.allocations = [];
    }

    getAll() {
        return this.allocations;
    }

    getByEmployeeId(employeeId) {
        return this.allocations.filter(a => a.employeeId === employeeId);
    }

    create(data) {
        const id = uuidv4();
        const allocation = {
            id,
            employeeId: data.employeeId,
            projectId: data.projectId,
            projectName: data.projectName,
            startDate: data.startDate, // YYYY-MM-DD
            endDate: data.endDate,     // YYYY-MM-DD
            percentage: parseInt(data.percentage) || 0
        };
        this.allocations.push(allocation);
        return allocation;
    }

    update(id, data) {
        const index = this.allocations.findIndex(a => a.id === id);
        if (index === -1) return null;
        this.allocations[index] = { ...this.allocations[index], ...data };
        return this.allocations[index];
    }

    delete(id) {
        const initialLength = this.allocations.length;
        this.allocations = this.allocations.filter(a => a.id !== id);
        return this.allocations.length < initialLength;
    }
}

module.exports = new AllocationRepository();
