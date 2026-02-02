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
                e.primary_skills as "primarySkills", 
                e.secondary_skills as "secondarySkills", 
                e.current_project as "currentProject",
                COALESCE(
                    STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name),
                    'Unassigned'
                ) as "projectName",
                COALESCE(
                    ROUND(
                        e.total_allocation_sum::numeric / 
                        NULLIF(
                            (SELECT COUNT(DISTINCT DATE_TRUNC('month', start_date))
                             FROM core.allocations
                             WHERE employee_id = e.id), 
                            0
                        )
                    )::integer,
                    e.total_allocation_sum
                ) as "allocation"
            FROM core.employees e
            LEFT JOIN core.allocations a ON e.id = a.employee_id AND a.end_date >= CURRENT_DATE
            LEFT JOIN core.projects p ON a.project_id = p.id
            GROUP BY e.id, e.first_name, e.last_name, e.primary_skills, e.secondary_skills, e.current_project, e.total_allocation_sum
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
                e.primary_skills as "primarySkills", 
                e.secondary_skills as "secondarySkills", 
                e.current_project as "currentProject",
                COALESCE(
                    STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name),
                    'Unassigned'
                ) as "projectName",
                COALESCE(
                    ROUND(
                        e.total_allocation_sum::numeric / 
                        NULLIF(
                            (SELECT COUNT(DISTINCT DATE_TRUNC('month', start_date))
                             FROM core.allocations
                             WHERE employee_id = e.id), 
                            0
                        )
                    )::integer,
                    e.total_allocation_sum
                ) as "allocation"
            FROM core.employees e
            LEFT JOIN core.allocations a ON e.id = a.employee_id AND a.end_date >= CURRENT_DATE
            LEFT JOIN core.projects p ON a.project_id = p.id
            WHERE e.id = $1
            GROUP BY e.id, e.first_name, e.last_name, e.primary_skills, e.secondary_skills, e.current_project, e.total_allocation_sum
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
                (first_name, last_name, primary_skills, secondary_skills, current_project, total_allocation_sum)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING 
                id, 
                first_name as "firstName", 
                last_name as "lastName", 
                primary_skills as "primarySkills", 
                secondary_skills as "secondarySkills", 
                current_project as "currentProject",
                total_allocation_sum as "allocation"
        `, [
            data.firstName,
            data.lastName,
            Array.isArray(data.primarySkills) ? data.primarySkills : [],
            Array.isArray(data.secondarySkills) ? data.secondarySkills : [],
            data.currentProject || data.projectName || null,
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
                primary_skills = $3,
                secondary_skills = $4,
                current_project = $5
            WHERE id = $6
            RETURNING 
                id, 
                first_name as "firstName", 
                last_name as "lastName", 
                primary_skills as "primarySkills", 
                secondary_skills as "secondarySkills", 
                current_project as "currentProject",
                COALESCE(
                    ROUND(
                        total_allocation_sum::numeric / 
                        NULLIF(
                            (SELECT COUNT(DISTINCT DATE_TRUNC('month', start_date))
                             FROM core.allocations
                             WHERE employee_id = $6), 
                            0
                        )
                    )::integer,
                    total_allocation_sum
                ) as "allocation"
        `, [
            data.firstName !== undefined ? data.firstName : existing.firstName,
            data.lastName !== undefined ? data.lastName : existing.lastName,
            data.primarySkills !== undefined ? data.primarySkills : existing.primarySkills,
            data.secondarySkills !== undefined ? data.secondarySkills : existing.secondarySkills,
            data.currentProject !== undefined ? data.currentProject : (data.projectName !== undefined ? data.projectName : existing.currentProject),
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
        console.log('[EmployeeRepo] delete() called for ID:', id);
        // Check if employee has any allocations
        const allocCheck = await db.queryCore(
            'SELECT COUNT(*) as count FROM core.allocations WHERE employee_id = $1',
            [id]
        );

        const allocationCount = parseInt(allocCheck.rows[0].count);
        console.log('[EmployeeRepo] Allocation count:', allocationCount);
        if (allocationCount > 0) {
            console.log('[EmployeeRepo] Throwing error - employee has allocations');
            throw new Error(`Cannot delete employee: ${allocationCount} active allocation(s) exist. Please remove all allocations first.`);
        }

        console.log('[EmployeeRepo] No allocations found, proceeding with deletion');
        const result = await db.queryCore('DELETE FROM core.employees WHERE id = $1', [id]);
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
                e.primary_skills as "primarySkills", 
                e.secondary_skills as "secondarySkills", 
                e.current_project as "currentProject",
                COALESCE(
                    STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name),
                    'Unassigned'
                ) as "projectName",
                COALESCE(
                    ROUND(
                        e.total_allocation_sum::numeric / 
                        NULLIF(
                            (SELECT COUNT(DISTINCT DATE_TRUNC('month', start_date))
                             FROM core.allocations
                             WHERE employee_id = e.id), 
                            0
                        )
                    )::integer,
                    e.total_allocation_sum
                ) as "allocation"
            FROM core.employees e
            LEFT JOIN core.allocations a ON e.id = a.employee_id AND a.end_date >= CURRENT_DATE
            LEFT JOIN core.projects p ON a.project_id = p.id
            WHERE 
                LOWER(e.first_name) LIKE $1 OR
                LOWER(e.last_name) LIKE $1 OR
                LOWER(e.current_project) LIKE $1 OR
                EXISTS (
                    SELECT 1 FROM unnest(e.primary_skills) skill 
                    WHERE LOWER(skill) LIKE $1
                ) OR
                EXISTS (
                    SELECT 1 FROM unnest(e.secondary_skills) skill 
                    WHERE LOWER(skill) LIKE $1
                )
            GROUP BY e.id, e.first_name, e.last_name, e.primary_skills, e.secondary_skills, e.current_project, e.total_allocation_sum
            ORDER BY e.last_name, e.first_name
        `, [searchPattern]);
        return result.rows;
    }
}

module.exports = new EmployeeRepository();
