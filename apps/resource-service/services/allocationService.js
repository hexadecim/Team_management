/**
 * Allocation Service
 * 
 * Handles complex business logic for employee allocations,
 * including date range splitting and validation.
 */

const allocationRepo = require('../repository/allocationRepository');
const projectRepo = require('../repository/projectRepository');
const financialCalculationService = require('./financialCalculationService');

class AllocationService {
    /**
     * Update an allocation with automatic splitting logic
     * If the new range is a sub-segment of the old range, the surrounding periods
     * are preserved as new allocation records.
     * 
     * @param {string} id - Original allocation ID
     * @param {Object} data - New allocation data (percentage, startDate, endDate, etc.)
     * @returns {Promise<Object>} The updated allocation record
     */
    async updateAllocation(id, data) {
        console.log(`[AllocationService] Updating allocation ${id}`, data);
        const old = await allocationRepo.getById(id);
        if (!old) throw new Error('Allocation not found');

        // Dates are now strings from DB (YYYY-MM-DD)
        const oldStartStr = old.startDate;
        const oldEndStr = old.endDate;
        const newStartStr = data.startDate;
        const newEndStr = data.endDate;

        console.log(`[AllocationService] Ranges: Old(${oldStartStr} - ${oldEndStr}) New(${newStartStr} - ${newEndStr})`);

        // Helper to add/subtract days from YYYY-MM-DD
        const shiftDate = (dateStr, days) => {
            const d = new Date(dateStr + 'T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + days);
            return d.toISOString().split('T')[0];
        };

        // 1. Create prefix if new range starts later than old range
        if (newStartStr > oldStartStr) {
            const prefixEnd = shiftDate(newStartStr, -1);
            console.log(`[AllocationService] Creating prefix: ${oldStartStr} to ${prefixEnd}`);
            await allocationRepo.create({
                employeeId: old.employeeId,
                projectId: old.projectId,
                percentage: old.percentage,
                startDate: oldStartStr,
                endDate: prefixEnd,
                monthYear: old.monthYear
            });
        }

        // 2. Create suffix if new range ends earlier than old range
        if (newEndStr < oldEndStr) {
            const suffixStart = shiftDate(newEndStr, 1);
            console.log(`[AllocationService] Creating suffix: ${suffixStart} to ${oldEndStr}`);
            await allocationRepo.create({
                employeeId: old.employeeId,
                projectId: old.projectId,
                percentage: old.percentage,
                startDate: suffixStart,
                endDate: oldEndStr,
                monthYear: old.monthYear
            });
        }

        // 3. Update the original record to the new segment
        const updated = await allocationRepo.update(id, data);
        console.log(`[AllocationService] Original record updated.`);

        // 4. Trigger financial recalculation (handled by index.js usually, but good to keep in mind)
        // We handle recalculation in the route to avoid circular dependencies or redundant calls

        return updated;
    }
}

module.exports = new AllocationService();
