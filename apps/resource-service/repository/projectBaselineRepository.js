/**
 * Project Baseline Repository
 * 
 * Data access layer for project financial baselines
 */

const { db } = require('@team-mgmt/shared');

class ProjectBaselineRepository {
    /**
     * Get active baseline for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Object>} Active baseline object
     */
    async getActiveBaseline(projectId) {
        const result = await db.queryCore(
            `SELECT 
                id,
                project_id as "projectId",
                version,
                baseline_billing as "baselineBilling",
                baseline_expense as "baselineExpense",
                baseline_profit as "baselineProfit",
                baseline_margin_pct as "baselineMarginPct",
                baseline_end_date as "baselineEndDate",
                is_active as "isActive",
                created_at as "createdAt"
             FROM core.project_baselines
             WHERE project_id = $1 AND is_active = true
             LIMIT 1`,
            [projectId]
        );
        return result.rows[0] || null;
    }

    /**
     * Create a new baseline for a project
     * @param {string} projectId - Project ID
     * @param {Object} baseline - Baseline data
     * @returns {Promise<Object>} Created baseline
     */
    async createBaseline(projectId, baseline) {
        // Deactivate current active baseline first
        await db.queryCore(
            'UPDATE core.project_baselines SET is_active = false WHERE project_id = $1 AND is_active = true',
            [projectId]
        );

        // Get latest version number
        const versionResult = await db.queryCore(
            'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM core.project_baselines WHERE project_id = $1',
            [projectId]
        );
        const nextVersion = versionResult.rows[0].next_version;

        const result = await db.queryCore(
            `INSERT INTO core.project_baselines 
                (project_id, version, baseline_billing, baseline_expense, 
                 baseline_profit, baseline_margin_pct, baseline_end_date, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)
             RETURNING 
                id,
                project_id as "projectId",
                version,
                baseline_billing as "baselineBilling",
                baseline_expense as "baselineExpense",
                baseline_profit as "baselineProfit",
                baseline_margin_pct as "baselineMarginPct",
                baseline_end_date as "baselineEndDate",
                is_active as "isActive",
                created_at as "createdAt"`,
            [
                projectId,
                nextVersion,
                baseline.baselineBilling || 0,
                baseline.baselineExpense || 0,
                baseline.baselineProfit || 0,
                baseline.baselineMarginPct || 0,
                baseline.baselineEndDate || null
            ]
        );
        return result.rows[0];
    }

    /**
     * Get all baseline history for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Array>} Array of baseline records
     */
    async getHistory(projectId) {
        const result = await db.queryCore(
            `SELECT 
                id,
                project_id as "projectId",
                version,
                baseline_billing as "baselineBilling",
                baseline_expense as "baselineExpense",
                baseline_profit as "baselineProfit",
                baseline_margin_pct as "baselineMarginPct",
                baseline_end_date as "baselineEndDate",
                is_active as "isActive",
                created_at as "createdAt"
             FROM core.project_baselines
             WHERE project_id = $1
             ORDER BY version DESC`,
            [projectId]
        );
        return result.rows;
    }

    /**
     * Get all active baselines
     * @returns {Promise<Array>} Array of active baseline records
     */
    async getAllActiveBaselines() {
        const result = await db.queryCore(
            `SELECT 
                id,
                project_id as "projectId",
                version,
                baseline_billing as "baselineBilling",
                baseline_expense as "baselineExpense",
                baseline_profit as "baselineProfit",
                baseline_margin_pct as "baselineMarginPct",
                baseline_end_date as "baselineEndDate",
                is_active as "isActive",
                created_at as "createdAt"
             FROM core.project_baselines
             WHERE is_active = true`
        );
        return result.rows;
    }

    /**
     * Get all baselines (history) for all projects
     * @returns {Promise<Array>} Array of all baseline records
     */
    async getAllBaselines() {
        const result = await db.queryCore(
            `SELECT 
                id,
                project_id as "projectId",
                version,
                baseline_billing as "baselineBilling",
                baseline_expense as "baselineExpense",
                baseline_profit as "baselineProfit",
                baseline_margin_pct as "baselineMarginPct",
                baseline_end_date as "baselineEndDate",
                is_active as "isActive",
                created_at as "createdAt"
             FROM core.project_baselines
             ORDER BY project_id, version ASC`
        );
        return result.rows;
    }
}

module.exports = new ProjectBaselineRepository();
