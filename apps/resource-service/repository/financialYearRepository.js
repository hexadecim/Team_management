/**
 * Financial Year Repository - PostgreSQL Implementation
 * 
 * Manages financial years in the core.financial_years table
 */

const { db } = require('@team-mgmt/shared');

class FinancialYearRepository {
    /**
     * Get all financial years
     * @returns {Promise<Array>} Array of FY objects
     */
    async getAll() {
        const result = await db.queryCore(`
            SELECT 
                id, 
                name, 
                start_date as "startDate", 
                end_date as "endDate", 
                is_current as "isCurrent"
            FROM core.financial_years
            ORDER BY start_date DESC
        `);
        return result.rows;
    }

    /**
     * Get current financial year
     * @returns {Promise<Object|null>} Current FY object or null
     */
    async getCurrent() {
        const result = await db.queryCore(`
            SELECT 
                id, 
                name, 
                start_date as "startDate", 
                end_date as "endDate", 
                is_current as "isCurrent"
            FROM core.financial_years
            WHERE is_current = TRUE
            LIMIT 1
        `);
        return result.rows[0] || null;
    }

    /**
     * Create a new financial year
     * @param {Object} data - FY data
     * @returns {Promise<Object>} Created FY object
     */
    async create(data) {
        const result = await db.queryCore(`
            INSERT INTO core.financial_years (name, start_date, end_date, is_current)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, start_date as "startDate", end_date as "endDate", is_current as "isCurrent"
        `, [
            data.name,
            data.startDate,
            data.endDate,
            data.isCurrent || false
        ]);
        return result.rows[0];
    }

    /**
     * Set a specific FY as current (and unset others)
     * @param {string} id - FY ID
     * @returns {Promise<boolean>} True if updated
     */
    async setCurrent(id) {
        // Run in transaction to ensure only one is current
        await db.queryCore('BEGIN');
        try {
            await db.queryCore('UPDATE core.financial_years SET is_current = FALSE');
            const result = await db.queryCore(
                'UPDATE core.financial_years SET is_current = TRUE WHERE id = $1',
                [id]
            );
            await db.queryCore('COMMIT');
            return result.rowCount > 0;
        } catch (e) {
            await db.queryCore('ROLLBACK');
            throw e;
        }
    }

    /**
     * Delete a financial year
     * @param {string} id - FY ID
     * @returns {Promise<boolean>} True if deleted
     */
    async delete(id) {
        const result = await db.queryCore('DELETE FROM core.financial_years WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
}

module.exports = new FinancialYearRepository();
