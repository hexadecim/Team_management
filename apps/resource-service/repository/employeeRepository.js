const { v4: uuidv4 } = require('uuid');

class EmployeeRepository {
    constructor() {
        this.employees = {};
    }

    getAll() {
        return Object.values(this.employees);
    }

    getById(id) {
        return this.employees[id];
    }

    create(data) {
        const id = uuidv4();
        const employee = {
            id,
            ...data,
            allocation: parseInt(data.allocation) || 0,
            primarySkills: Array.isArray(data.primarySkills) ? data.primarySkills : [],
            secondarySkills: Array.isArray(data.secondarySkills) ? data.secondarySkills : []
        };
        this.employees[id] = employee;
        return employee;
    }

    update(id, data) {
        if (!this.employees[id]) return null;
        this.employees[id] = {
            ...this.employees[id],
            ...data,
            allocation: parseInt(data.allocation) || this.employees[id].allocation,
            primarySkills: data.primarySkills || this.employees[id].primarySkills,
            secondarySkills: data.secondarySkills || this.employees[id].secondarySkills
        };
        return this.employees[id];
    }

    delete(id) {
        if (!this.employees[id]) return false;
        delete this.employees[id];
        return true;
    }

    search(query) {
        const q = query.toLowerCase();
        return this.getAll().filter(emp => {
            return (
                emp.firstName.toLowerCase().includes(q) ||
                emp.lastName.toLowerCase().includes(q) ||
                emp.projectName.toLowerCase().includes(q) ||
                emp.primarySkills.some(s => s.toLowerCase().includes(q)) ||
                emp.secondarySkills.some(s => s.toLowerCase().includes(q))
            );
        });
    }
}

module.exports = new EmployeeRepository();
