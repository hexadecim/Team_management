/**
 * Project Financials Repository
 * 
 * Data access layer for project financial calculation tables
 */

const { db } = require('@team-mgmt/shared');

class ProjectFinancialsRepository {
    /**
     * Get or create project financials record
     * @param {string} projectId - Project ID
     * @returns {Promise<Object>} Project financials object
     */
    async getProjectFinancials(projectId) {
        const result = await db.queryCore(
            `SELECT 
                project_id as "projectId",
                planned_budget as "plannedBudget",
                total_projected_billing as "totalProjectedBilling",
                total_projected_expense as "totalProjectedExpense",
                total_projected_profit as "totalProjectedProfit",
                budget_variance as "budgetVariance",
                last_calculated_at as "lastCalculatedAt"
             FROM core.project_financials
             WHERE project_id = $1`,
            [projectId]
        );
        return result.rows[0] || null;
    }

    /**
     * Upsert project financials summary
     * @param {string} projectId - Project ID
     * @param {Object} financials - Financial data
     * @returns {Promise<Object>} Updated financials
     */
    async upsertProjectFinancials(projectId, financials) {
        const result = await db.queryCore(
            `INSERT INTO core.project_financials 
                (project_id, planned_budget, total_projected_billing, total_projected_expense, 
                 total_projected_profit, budget_variance, last_calculated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (project_id) 
             DO UPDATE SET
                planned_budget = EXCLUDED.planned_budget,
                total_projected_billing = EXCLUDED.total_projected_billing,
                total_projected_expense = EXCLUDED.total_projected_expense,
                total_projected_profit = EXCLUDED.total_projected_profit,
                budget_variance = EXCLUDED.budget_variance,
                last_calculated_at = NOW()
             RETURNING 
                project_id as "projectId",
                planned_budget as "plannedBudget",
                total_projected_billing as "totalProjectedBilling",
                total_projected_expense as "totalProjectedExpense",
                total_projected_profit as "totalProjectedProfit",
                budget_variance as "budgetVariance",
                last_calculated_at as "lastCalculatedAt"`,
            [
                projectId,
                financials.plannedBudget || 0,
                financials.totalProjectedBilling || 0,
                financials.totalProjectedExpense || 0,
                financials.totalProjectedProfit || 0,
                financials.budgetVariance || 0
            ]
        );
        return result.rows[0];
    }

    /**
     * Get monthly billing projections for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Array>} Array of monthly billing records
     */
    async getMonthlyBilling(projectId) {
        const result = await db.queryCore(
            `SELECT 
                id,
                project_id as "projectId",
                month_year as "monthYear",
                projected_billing as "projectedBilling",
                cumulative_billing as "cumulativeBilling"
             FROM core.project_billing_monthly
             WHERE project_id = $1
             ORDER BY month_year ASC`,
            [projectId]
        );
        return result.rows;
    }

    /**
     * Upsert monthly billing data
     * @param {string} projectId - Project ID
     * @param {string} monthYear - Month year (YYYY-MM-DD format, first day of month)
     * @param {Object} billing - Billing data
     * @returns {Promise<Object>} Updated billing record
     */
    async upsertMonthlyBilling(projectId, monthYear, billing) {
        const result = await db.queryCore(
            `INSERT INTO core.project_billing_monthly 
                (project_id, month_year, projected_billing, cumulative_billing)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (project_id, month_year)
             DO UPDATE SET
                projected_billing = EXCLUDED.projected_billing,
                cumulative_billing = EXCLUDED.cumulative_billing
             RETURNING 
                id,
                project_id as "projectId",
                month_year as "monthYear",
                projected_billing as "projectedBilling",
                cumulative_billing as "cumulativeBilling"`,
            [projectId, monthYear, billing.projectedBilling || 0, billing.cumulativeBilling || 0]
        );
        return result.rows[0];
    }

    /**
     * Delete all monthly billing records for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<number>} Number of deleted records
     */
    async deleteMonthlyBilling(projectId) {
        const result = await db.queryCore(
            'DELETE FROM core.project_billing_monthly WHERE project_id = $1',
            [projectId]
        );
        return result.rowCount;
    }

    /**
     * Get monthly expense projections for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Array>} Array of monthly expense records
     */
    async getMonthlyExpenses(projectId) {
        const result = await db.queryCore(
            `SELECT 
                id,
                project_id as "projectId",
                month_year as "monthYear",
                projected_expense as "projectedExpense",
                cumulative_expense as "cumulativeExpense"
             FROM core.project_expenses_monthly
             WHERE project_id = $1
             ORDER BY month_year ASC`,
            [projectId]
        );
        return result.rows;
    }

    /**
     * Upsert monthly expense data
     * @param {string} projectId - Project ID
     * @param {string} monthYear - Month year (YYYY-MM-DD format, first day of month)
     * @param {Object} expense - Expense data
     * @returns {Promise<Object>} Updated expense record
     */
    async upsertMonthlyExpenses(projectId, monthYear, expense) {
        const result = await db.queryCore(
            `INSERT INTO core.project_expenses_monthly 
                (project_id, month_year, projected_expense, cumulative_expense)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (project_id, month_year)
             DO UPDATE SET
                projected_expense = EXCLUDED.projected_expense,
                cumulative_expense = EXCLUDED.cumulative_expense
             RETURNING 
                id,
                project_id as "projectId",
                month_year as "monthYear",
                projected_expense as "projectedExpense",
                cumulative_expense as "cumulativeExpense"`,
            [projectId, monthYear, expense.projectedExpense || 0, expense.cumulativeExpense || 0]
        );
        return result.rows[0];
    }

    /**
     * Delete all monthly expense records for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<number>} Number of deleted records
     */
    async deleteMonthlyExpenses(projectId) {
        const result = await db.queryCore(
            'DELETE FROM core.project_expenses_monthly WHERE project_id = $1',
            [projectId]
        );
        return result.rowCount;
    }
}

module.exports = new ProjectFinancialsRepository();
