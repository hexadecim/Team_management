/**
 * Project Repository - PostgreSQL Implementation
 * 
 * Manages projects in the core.projects table
 */

const { db } = require('@team-mgmt/shared');

class ProjectRepository {
    /**
     * Get all projects
     * @returns {Promise<Array>} Array of project objects
     */
    async getAll() {
        const result = await db.queryCore(
            'SELECT id, name, start_date, end_date, original_end_date, planned_budget, average_working_hours FROM core.projects ORDER BY name'
        );
        return result.rows;
    }

    async getById(id) {
        const result = await db.queryCore(
            'SELECT id, name, start_date, end_date, original_end_date, planned_budget, average_working_hours FROM core.projects WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    async create(project) {
        const { name, start_date, end_date, planned_budget, average_working_hours } = project;
        const result = await db.queryCore(
            `INSERT INTO core.projects (name, start_date, end_date, original_end_date, planned_budget, average_working_hours) 
             VALUES ($1, $2, $3, $3, $4, $5) 
             RETURNING id, name, start_date, end_date, original_end_date, planned_budget, average_working_hours`,
            [name, start_date, end_date, planned_budget || null, average_working_hours || 160]
        );
        return result.rows[0];
    }

    async update(id, project, username = 'system', changeReason = null) {
        const { name, end_date, planned_budget, average_working_hours, type } = project;

        try {
            // Begin transaction
            await db.queryCore('BEGIN');

            // Set session variables for trigger to capture using set_config
            // set_config(setting_name, new_value, is_local)
            // is_local = true means the setting only applies to the current transaction
            if (username) {
                await db.queryCore(`SELECT set_config('app.current_user', $1, true)`, [username]);
            }
            if (changeReason) {
                await db.queryCore(`SELECT set_config('app.change_reason', $1, true)`, [changeReason]);
            }

            // Perform the update
            const result = await db.queryCore(
                `UPDATE core.projects 
                 SET name = COALESCE($1, name), 
                     end_date = COALESCE($2, end_date),
                     planned_budget = COALESCE($3, planned_budget),
                     average_working_hours = COALESCE($4, average_working_hours)
                 WHERE id = $5 
                 RETURNING id, name, start_date, end_date, original_end_date, planned_budget, average_working_hours`,
                [name, end_date, planned_budget, average_working_hours, id]
            );

            // Commit transaction
            await db.queryCore('COMMIT');

            return result.rows[0];
        } catch (error) {
            // Rollback on error
            await db.queryCore('ROLLBACK');
            throw error;
        }
    }

    /**
     * Get date change history for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Array>} Array of history records
     */
    async getDateHistory(projectId) {
        const result = await db.queryCore(
            `SELECT id, project_id, field_changed, old_value, new_value, 
                    changed_by, changed_at, reason
             FROM core.project_date_history
             WHERE project_id = $1
             ORDER BY changed_at DESC`,
            [projectId]
        );
        return result.rows;
    }

    /**
     * Get deviation analytics for all projects
     * @returns {Promise<Object>} Analytics summary
     */
    async getDeviationAnalytics() {
        const result = await db.queryCore(`
            SELECT 
                id, name, start_date, end_date, original_end_date,
                days_delayed, change_count, status
            FROM core.project_deviation_analytics
            ORDER BY days_delayed DESC
        `);

        const projects = result.rows;

        // Calculate summary statistics
        const summary = {
            total_projects: projects.length,
            projects_with_delays: projects.filter(p => p.days_delayed > 0).length,
            average_delay_days: projects.length > 0
                ? Math.round(projects.reduce((sum, p) => sum + p.days_delayed, 0) / projects.length)
                : 0,
            projects_at_risk: projects.filter(p => p.status === 'at_risk').length,
            projects_overdue: projects.filter(p => p.status === 'overdue').length,
            projects: projects
        };

        return summary;
    }

    /**
     * Delete a project
     * @param {string} id - Project ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     * @throws {Error} If project has active allocations
     */
    async delete(id) {
        console.log('[ProjectRepo] delete() called for ID:', id);
        // Check if project has any allocations
        const allocCheck = await db.queryCore(
            'SELECT COUNT(*) as count FROM core.allocations WHERE project_id = $1',
            [id]
        );

        const allocationCount = parseInt(allocCheck.rows[0].count);
        console.log('[ProjectRepo] Allocation count:', allocationCount);
        if (allocationCount > 0) {
            console.log('[ProjectRepo] Throwing error - project has allocations');
            throw new Error(`Cannot delete project: ${allocationCount} active allocation(s) exist. Please remove all allocations first.`);
        }

        console.log('[ProjectRepo] No allocations found, proceeding with deletion');
        const result = await db.queryCore('DELETE FROM core.projects WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
}

module.exports = new ProjectRepository();
