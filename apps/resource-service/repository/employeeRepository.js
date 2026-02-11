/**
 * Employee Repository - PostgreSQL Implementation
 * 
 * Manages employees in the core.employees table
 */

const { db } = require('@team-mgmt/shared');
const { v4: uuidv4 } = require('uuid');

console.log('=== EMPLOYEE REPOSITORY MODULE LOADED - VERSION WITH GUARDRAILS ===');

class EmployeeRepository {
    /**
     * Get all employees
     * @returns {Promise<Array>} Array of employee objects
     */
    async getAll() {
        const result = await db.queryCore(`
            SELECT 
                e.id, 
                e.first_name as "firstName", 
                e.last_name as "lastName", 
                e.email,
                e.primary_skills as "primarySkills", 
                e.secondary_skills as "secondarySkills", 
                e.current_project as "currentProject",
                e.billable_rate as "billableRate",
                e.expense_rate as "expenseRate",
                COALESCE(
                    STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name),
                    'Unassigned'
                ) as "projectName",
                e.total_allocation_sum as "allocation"
            FROM core.employees e
            LEFT JOIN core.allocations a ON e.id = a.employee_id AND a.end_date >= CURRENT_DATE
            LEFT JOIN core.projects p ON a.project_id = p.id
            GROUP BY e.id, e.first_name, e.last_name, e.email, e.primary_skills, e.secondary_skills, e.current_project, e.billable_rate, e.expense_rate, e.total_allocation_sum
            ORDER BY e.last_name, e.first_name
        `);
        return result.rows;
    }

    /**
     * Get an employee by ID
     * @param {string} id - Employee ID (UUID)
     * @returns {Promise<Object|null>} Employee object or null if not found
     */
    async getById(id) {
        const result = await db.queryCore(`
            SELECT 
                e.id, 
                e.first_name as "firstName", 
                e.last_name as "lastName", 
                e.email,
                e.primary_skills as "primarySkills", 
                e.secondary_skills as "secondarySkills", 
                e.current_project as "currentProject",
                e.billable_rate as "billableRate",
                e.expense_rate as "expenseRate",
                COALESCE(
                    STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name),
                    'Unassigned'
                ) as "projectName",
                e.total_allocation_sum as "allocation"
            FROM core.employees e
            LEFT JOIN core.allocations a ON e.id = a.employee_id AND a.end_date >= CURRENT_DATE
            LEFT JOIN core.projects p ON a.project_id = p.id
            WHERE e.id = $1
            GROUP BY e.id, e.first_name, e.last_name, e.email, e.primary_skills, e.secondary_skills, e.current_project, e.billable_rate, e.expense_rate, e.total_allocation_sum
        `, [id]);
        return result.rows[0] || null;
    }

    /**
     * Create a new employee
     * @param {Object} data - Employee data
     * @returns {Promise<Object>} Created employee object
     */
    async create(data) {
        const result = await db.queryCore(`
            INSERT INTO core.employees 
                (first_name, last_name, email, primary_skills, secondary_skills, current_project, billable_rate, expense_rate, total_allocation_sum)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING 
                id, 
                first_name as "firstName", 
                last_name as "lastName", 
                email,
                primary_skills as "primarySkills", 
                secondary_skills as "secondarySkills", 
                current_project as "currentProject",
                billable_rate as "billableRate",
                expense_rate as "expenseRate",
                total_allocation_sum as "allocation"
        `, [
            data.firstName,
            data.lastName,
            data.email || null,
            Array.isArray(data.primarySkills) ? data.primarySkills : [],
            Array.isArray(data.secondarySkills) ? data.secondarySkills : [],
            data.currentProject || data.projectName || null,
            parseFloat(data.billableRate) || 0,
            parseFloat(data.expenseRate) || 0,
            parseInt(data.allocation) || 0
        ]);
        return result.rows[0];
    }

    /**
     * Update an employee
     * @param {string} id - Employee ID
     * @param {Object} data - Updated employee data
     * @returns {Promise<Object|null>} Updated employee object or null if not found
     */
    async update(id, data) {
        const existing = await this.getById(id);
        if (!existing) return null;

        const result = await db.queryCore(`
            UPDATE core.employees 
            SET 
                first_name = $1,
                last_name = $2,
                email = $3,
                primary_skills = $4,
                secondary_skills = $5,
                current_project = $6,
                billable_rate = $7,
                expense_rate = $8
            WHERE id = $9
            RETURNING 
                id, 
                first_name as "firstName", 
                last_name as "lastName", 
                email,
                primary_skills as "primarySkills", 
                secondary_skills as "secondarySkills", 
                current_project as "currentProject",
                billable_rate as "billableRate",
                expense_rate as "expenseRate",
                total_allocation_sum as "allocation"
        `, [
            data.firstName !== undefined ? data.firstName : existing.firstName,
            data.lastName !== undefined ? data.lastName : existing.lastName,
            data.email !== undefined ? data.email : existing.email,
            data.primarySkills !== undefined ? data.primarySkills : existing.primarySkills,
            data.secondarySkills !== undefined ? data.secondarySkills : existing.secondarySkills,
            data.currentProject !== undefined ? data.currentProject : (data.projectName !== undefined ? data.projectName : existing.currentProject),
            data.billableRate !== undefined ? parseFloat(data.billableRate) : existing.billableRate,
            data.expenseRate !== undefined ? parseFloat(data.expenseRate) : existing.expenseRate,
            id
        ]);
        return result.rows[0];
    }

    /**
     * Delete an employee
     * @param {string} id - Employee ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     * @throws {Error} If employee has active allocations
     */
    async delete(id) {
        console.log('[EmployeeRepo] delete() called for ID:', id, 'Type:', typeof id);

        // Check if employee has any allocations
        const queryText = 'SELECT COUNT(*) as count FROM core.allocations WHERE employee_id = $1::uuid';
        console.log('[EmployeeRepo] Running check query:', queryText, 'with ID:', id);

        const allocCheck = await db.queryCore(queryText, [id]);

        const allocationCount = parseInt(allocCheck.rows[0].count);
        console.log('[EmployeeRepo] Result rows:', allocCheck.rows);
        console.log('[EmployeeRepo] Allocation count found:', allocationCount);

        if (allocationCount > 0) {
            console.log('[EmployeeRepo] Blocking deletion - active allocations exist');
            throw new Error(`Cannot delete employee: ${allocationCount} active allocation(s) exist. Please remove all allocations first.`);
        }

        console.log('[EmployeeRepo] No allocations found in DB check, proceeding with deletion for ID:', id);
        const result = await db.queryCore('DELETE FROM core.employees WHERE id = $1::uuid', [id]);
        console.log('[EmployeeRepo] Delete result rowCount:', result.rowCount);
        return result.rowCount > 0;
    }

    /**
     * Search employees by query
     * @param {string} query - Search query
     * @returns {Promise<Array>} Array of matching employee objects
     */
    async search(query) {
        const searchPattern = `%${query.toLowerCase()}%`;
        const result = await db.queryCore(`
            SELECT 
                e.id, 
                e.first_name as "firstName", 
                e.last_name as "lastName", 
                e.email,
                e.primary_skills as "primarySkills", 
                e.secondary_skills as "secondarySkills", 
                e.current_project as "currentProject",
                e.billable_rate as "billableRate",
                e.expense_rate as "expenseRate",
                COALESCE(
                    STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name),
                    'Unassigned'
                ) as "projectName",
                e.total_allocation_sum as "allocation"
            FROM core.employees e
            LEFT JOIN core.allocations a ON e.id = a.employee_id AND a.end_date >= CURRENT_DATE
            LEFT JOIN core.projects p ON a.project_id = p.id
            WHERE 
                LOWER(e.first_name) LIKE $1 OR
                LOWER(e.last_name) LIKE $1 OR
                LOWER(e.email) LIKE $1 OR
                LOWER(e.current_project) LIKE $1 OR
                EXISTS (
                    SELECT 1 FROM unnest(e.primary_skills) skill 
                    WHERE LOWER(skill) LIKE $1
                ) OR
                EXISTS (
                    SELECT 1 FROM unnest(e.secondary_skills) skill 
                    WHERE LOWER(skill) LIKE $1
                )
            GROUP BY e.id, e.first_name, e.last_name, e.email, e.primary_skills, e.secondary_skills, e.current_project, e.billable_rate, e.expense_rate, e.total_allocation_sum
            ORDER BY e.last_name, e.first_name
        `, [searchPattern]);
        return result.rows;
    }
}

module.exports = new EmployeeRepository();
