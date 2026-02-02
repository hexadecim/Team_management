/**
 * Allocation Repository - PostgreSQL Implementation
 * 
 * Manages allocations in the core.allocations table
 * Note: The database trigger automatically updates employee total_allocation_sum
 */

const { db } = require('@team-mgmt/shared');
const { v4: uuidv4 } = require('uuid');

class AllocationRepository {
    /**
     * Get all allocations
     * @returns {Promise<Array>} Array of allocation objects
     */
    async getAll() {
        const result = await db.queryCore(`
            SELECT 
                a.id,
                a.employee_id as "employeeId",
                a.project_id as "projectId",
                p.name as "projectName",
                a.percentage,
                a.start_date as "startDate",
                a.end_date as "endDate",
                a.month_year as "monthYear"
            FROM core.allocations a
            LEFT JOIN core.projects p ON a.project_id = p.id
            ORDER BY a.start_date DESC
        `);
        return result.rows;
    }

    /**
     * Get allocations by employee ID
     * @param {string} employeeId - Employee ID (UUID)
     * @returns {Promise<Array>} Array of allocation objects for the employee
     */
    async getByEmployeeId(employeeId) {
        const result = await db.queryCore(`
            SELECT 
                a.id,
                a.employee_id as "employeeId",
                a.project_id as "projectId",
                p.name as "projectName",
                a.percentage,
                a.start_date as "startDate",
                a.end_date as "endDate",
                a.month_year as "monthYear"
            FROM core.allocations a
            LEFT JOIN core.projects p ON a.project_id = p.id
            WHERE a.employee_id = $1
            ORDER BY a.start_date DESC
        `, [employeeId]);
        return result.rows;
    }

    /**
     * Create a new allocation
     * @param {Object} data - Allocation data
     * @returns {Promise<Object>} Created allocation object
     * Note: The trigger will automatically update the employee's total_allocation_sum
     */
    async create(data) {
        const result = await db.queryCore(`
            INSERT INTO core.allocations 
                (employee_id, project_id, percentage, start_date, end_date, month_year)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING 
                id,
                employee_id as "employeeId",
                project_id as "projectId",
                percentage,
                start_date as "startDate",
                end_date as "endDate",
                month_year as "monthYear"
        `, [
            data.employeeId,
            data.projectId,
            parseInt(data.percentage) || 0,
            data.startDate,
            data.endDate,
            data.monthYear || null
        ]);

        // Fetch project name for response
        const allocation = result.rows[0];
        const projectResult = await db.queryCore(
            'SELECT name FROM core.projects WHERE id = $1',
            [allocation.projectId]
        );
        allocation.projectName = projectResult.rows[0]?.name || null;

        return allocation;
    }

    /**
     * Update an allocation
     * @param {string} id - Allocation ID
     * @param {Object} data - Updated allocation data
     * @returns {Promise<Object|null>} Updated allocation object or null if not found
     * Note: The trigger will automatically update the employee's total_allocation_sum
     */
    async update(id, data) {
        const result = await db.queryCore(`
            UPDATE core.allocations 
            SET 
                employee_id = COALESCE($1, employee_id),
                project_id = COALESCE($2, project_id),
                percentage = COALESCE($3, percentage),
                start_date = COALESCE($4, start_date),
                end_date = COALESCE($5, end_date),
                month_year = COALESCE($6, month_year)
            WHERE id = $7
            RETURNING 
                id,
                employee_id as "employeeId",
                project_id as "projectId",
                percentage,
                start_date as "startDate",
                end_date as "endDate",
                month_year as "monthYear"
        `, [
            data.employeeId || null,
            data.projectId || null,
            data.percentage !== undefined ? parseInt(data.percentage) : null,
            data.startDate || null,
            data.endDate || null,
            data.monthYear || null,
            id
        ]);

        if (!result.rows[0]) return null;

        // Fetch project name for response
        const allocation = result.rows[0];
        const projectResult = await db.queryCore(
            'SELECT name FROM core.projects WHERE id = $1',
            [allocation.projectId]
        );
        allocation.projectName = projectResult.rows[0]?.name || null;

        return allocation;
    }

    /**
     * Delete an allocation
     * @param {string} id - Allocation ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     * Note: The trigger will automatically update the employee's total_allocation_sum
     */
    async delete(id) {
        const result = await db.queryCore('DELETE FROM core.allocations WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
}

module.exports = new AllocationRepository();
