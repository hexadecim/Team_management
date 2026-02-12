/**
 * Financial Calculation Service
 * 
 * Independent service for all project financial calculations
 * Designed for scalability and separation of concerns
 */

const projectRepository = require('../repository/projectRepository');
const allocationRepository = require('../repository/allocationRepository');
const employeeRepository = require('../repository/employeeRepository');
const projectFinancialsRepository = require('../repository/projectFinancialsRepository');
const projectBaselineRepository = require('../repository/projectBaselineRepository');

class FinancialCalculationService {
    /**
     * Calculate all financial metrics for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Object>} Complete financial summary
     */
    async calculateProjectFinancials(projectId) {
        const project = await projectRepository.getById(projectId);
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }

        // Get all allocations for this project
        const allAllocations = await allocationRepository.getAll();
        const projectAllocations = allAllocations.filter(a => a.projectId === projectId);

        // Get all employees for rate lookups
        const employees = await employeeRepository.getAll();
        const employeeMap = new Map(employees.map(e => [e.id, e]));

        // Get project dates and working hours
        const startDate = project.start_date ? new Date(project.start_date) : null;
        const endDate = project.end_date ? new Date(project.end_date) : null;
        const workingHours = project.average_working_hours || 160;
        const plannedBudget = project.planned_budget || 0;

        if (!startDate || !endDate) {
            // Project has no dates, return zero metrics
            return this._createEmptyFinancials(projectId, plannedBudget);
        }

        // Calculate monthly billing and expenses
        const monthsRange = this._generateMonthRange(startDate, endDate);
        const A = monthsRange.length; // Total Months
        const B = workingHours; // Average Working Hours

        const monthlyData = this._calculateMonthlyData(
            projectAllocations,
            employeeMap,
            monthsRange,
            B
        );

        // Calculate totals
        const totalProjectedBilling = monthlyData.reduce((sum, m) => sum + m.billing, 0);
        const totalProjectedExpense = monthlyData.reduce((sum, m) => sum + m.expense, 0);
        const totalProjectedProfit = totalProjectedBilling - totalProjectedExpense;
        const budgetVariance = plannedBudget - totalProjectedExpense;

        console.log(`[Financials] Project ${projectId}: A=${A}, B=${B}, Allocations=${projectAllocations.length}, Total Expense=${totalProjectedExpense}`);

        // Save summary to database
        const financialSummary = await projectFinancialsRepository.upsertProjectFinancials(projectId, {
            plannedBudget,
            totalProjectedBilling,
            totalProjectedExpense,
            totalProjectedProfit,
            budgetVariance
        });

        // Save monthly billing data
        await this._saveMonthlyBilling(projectId, monthlyData);

        // Save monthly expense data
        await this._saveMonthlyExpenses(projectId, monthlyData);

        // Check for active baseline
        const activeBaseline = await projectBaselineRepository.getActiveBaseline(projectId);

        return {
            ...financialSummary,
            activeBaseline,
            monthlyData
        };
    }

    /**
     * Calculate monthly billing and expense data
     * @private
     */
    _calculateMonthlyData(allocations, employeeMap, months, B) {
        const monthlyMap = new Map();

        // Generate all months in project range
        months.forEach(month => {
            monthlyMap.set(month, { billing: 0, expense: 0 });
        });

        // Calculate for each allocation
        allocations.forEach(allocation => {
            const employee = employeeMap.get(allocation.employeeId);
            if (!employee) return;

            const allocStart = new Date(allocation.startDate);
            const allocEnd = new Date(allocation.endDate);
            const hourlyBillableRate = parseFloat(employee.billableRate) || 0;
            const hourlyExpenseRate = parseFloat(employee.expenseRate) || 0;
            const allocationPct = parseFloat(allocation.percentage) || 0;

            // User-defined conversion logic
            const dailyBillableRate = hourlyBillableRate * 8;
            const dailyExpenseRate = hourlyExpenseRate * 8;
            const monthlyMultiplier = B / 8; // Number of working days in a month (e.g., 20)

            // Calculate for each month this allocation covers
            months.forEach(monthStr => {
                const monthDate = new Date(monthStr);
                const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

                // Check if allocation overlaps with this month
                if (allocStart <= monthEnd && allocEnd >= monthDate) {
                    const data = monthlyMap.get(monthStr);

                    // Proportional calculation based on days in month
                    const overlapStart = allocStart > monthDate ? allocStart : monthDate;
                    const overlapEnd = allocEnd < monthEnd ? allocEnd : monthEnd;

                    const daysInMonth = monthEnd.getDate();
                    const overlapDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;

                    // util_i = (allocation% / 100) * (overlapDays / daysInMonth)
                    const utilization = (allocationPct / 100) * (overlapDays / daysInMonth);

                    // Monthly Projection = util_i * daily_rate * monthly_multiplier
                    const monthlyBillingPart = utilization * dailyBillableRate * monthlyMultiplier;
                    const monthlyExpensePart = utilization * dailyExpenseRate * monthlyMultiplier;

                    data.billing += monthlyBillingPart;
                    data.expense += monthlyExpensePart;
                }
            });
        });

        // Convert to array with cumulative values
        const result = [];
        let cumulativeBilling = 0;
        let cumulativeExpense = 0;

        months.forEach(monthStr => {
            const data = monthlyMap.get(monthStr);
            cumulativeBilling += data.billing;
            cumulativeExpense += data.expense;

            result.push({
                monthYear: monthStr,
                billing: Math.round(data.billing * 100) / 100,
                expense: Math.round(data.expense * 100) / 100,
                cumulativeBilling: Math.round(cumulativeBilling * 100) / 100,
                cumulativeExpense: Math.round(cumulativeExpense * 100) / 100
            });
        });

        return result;
    }

    /**
     * Generate array of month strings (YYYY-MM-01) between start and end dates
     * @private
     */
    _generateMonthRange(startDate, endDate) {
        const months = [];
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        while (current <= end) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            months.push(`${year}-${month}-01`);
            current.setMonth(current.getMonth() + 1);
        }

        return months;
    }

    /**
     * Save monthly billing data to database
     * @private
     */
    async _saveMonthlyBilling(projectId, monthlyData) {
        // Clear existing data
        await projectFinancialsRepository.deleteMonthlyBilling(projectId);

        // Insert new data
        for (const month of monthlyData) {
            await projectFinancialsRepository.upsertMonthlyBilling(projectId, month.monthYear, {
                projectedBilling: month.billing,
                cumulativeBilling: month.cumulativeBilling
            });
        }
    }

    /**
     * Save monthly expense data to database
     * @private
     */
    async _saveMonthlyExpenses(projectId, monthlyData) {
        // Clear existing data
        await projectFinancialsRepository.deleteMonthlyExpenses(projectId);

        // Insert new data
        for (const month of monthlyData) {
            await projectFinancialsRepository.upsertMonthlyExpenses(projectId, month.monthYear, {
                projectedExpense: month.expense,
                cumulativeExpense: month.cumulativeExpense
            });
        }
    }

    /**
     * Create empty financials object
     * @private
     */
    _createEmptyFinancials(projectId, plannedBudget) {
        return {
            projectId,
            plannedBudget,
            totalProjectedBilling: 0,
            totalProjectedExpense: 0,
            totalProjectedProfit: 0,
            budgetVariance: plannedBudget,
            monthlyData: []
        };
    }

    /**
     * Get project financial summary (from database)
     * @param {string} projectId - Project ID
     * @returns {Promise<Object>} Financial summary
     */
    async getProjectFinancialSummary(projectId) {
        let financials = await projectFinancialsRepository.getProjectFinancials(projectId);
        const activeBaseline = await projectBaselineRepository.getActiveBaseline(projectId);

        // If no record exists, or if the record exists but metrics are zero (likely initialized but not calculated)
        // we trigger a calculation to ensure fresh data.
        if (!financials || (parseFloat(financials.totalProjectedBilling) === 0 && parseFloat(financials.totalProjectedExpense) === 0)) {
            console.log(`[Financials] No data or zero data for project ${projectId}. Triggering calculation.`);
            return await this.calculateProjectFinancials(projectId);
        }

        return {
            ...financials,
            activeBaseline
        };
    }

    /**
     * Get monthly billing projections (from database)
     * @param {string} projectId - Project ID
     * @returns {Promise<Array>} Monthly billing data
     */
    async getMonthlyBilling(projectId) {
        return await projectFinancialsRepository.getMonthlyBilling(projectId);
    }

    /**
     * Get monthly expense projections (from database)
     * @param {string} projectId - Project ID
     * @returns {Promise<Array>} Monthly expense data
     */
    async getMonthlyExpenses(projectId) {
        return await projectFinancialsRepository.getMonthlyExpenses(projectId);
    }

    /**
     * Recalculate financials for all projects
     * @returns {Promise<Array>} Array of calculation results
     */
    async recalculateAllProjects() {
        const projects = await projectRepository.getAll();
        const results = [];

        for (const project of projects) {
            try {
                const result = await this.calculateProjectFinancials(project.id);
                results.push({ projectId: project.id, success: true, result });
            } catch (error) {
                results.push({ projectId: project.id, success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * Get baseline history for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Array>} Baseline history
     */
    async getProjectBaselines(projectId) {
        return await projectBaselineRepository.getHistory(projectId);
    }

    /**
     * Manually capture a new baseline for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Object>} New baseline
     */
    async createProjectBaseline(projectId) {
        const project = await projectRepository.getById(projectId);
        if (!project) throw new Error(`Project not found: ${projectId}`);

        const financials = await this.calculateProjectFinancials(projectId);

        return await projectBaselineRepository.createBaseline(projectId, {
            baselineBilling: financials.totalProjectedBilling,
            baselineExpense: financials.totalProjectedExpense,
            baselineProfit: financials.totalProjectedProfit,
            baselineMarginPct: financials.totalProjectedBilling > 0 ? (financials.totalProjectedProfit / financials.totalProjectedBilling) * 100 : 0,
            baselineEndDate: project.end_date
        });
    }

    /**
     * Get bulk financials for all projects (optimized for dashboard)
     * @returns {Promise<Object>} Object with data grouped by projectId
     */
    async getBulkFinancials() {
        const [summaries, billings, expenses, baselines, allBaselineHistory] = await Promise.all([
            projectFinancialsRepository.getAllProjectFinancials(),
            projectFinancialsRepository.getAllMonthlyBilling(),
            projectFinancialsRepository.getAllMonthlyExpenses(),
            projectBaselineRepository.getAllActiveBaselines(),
            projectBaselineRepository.getAllBaselines()
        ]);

        const bulkStore = {};

        // Helper to initialize entry
        const ensureEntry = (pid) => {
            if (!bulkStore[pid]) {
                bulkStore[pid] = { summary: null, billing: [], expenses: [], activeBaseline: null, baselineHistory: [] };
            }
        };

        // Group summaries
        summaries.forEach(s => {
            ensureEntry(s.projectId);
            bulkStore[s.projectId].summary = s;
        });

        // Group billings
        billings.forEach(b => {
            ensureEntry(b.projectId);
            bulkStore[b.projectId].billing.push(b);
        });

        // Group expenses
        expenses.forEach(e => {
            ensureEntry(e.projectId);
            bulkStore[e.projectId].expenses.push(e);
        });

        // Group baselines
        baselines.forEach(base => {
            ensureEntry(base.projectId);
            bulkStore[base.projectId].activeBaseline = base;
        });

        // Group baseline history
        allBaselineHistory.forEach(bh => {
            ensureEntry(bh.projectId);
            bulkStore[bh.projectId].baselineHistory.push(bh);
        });

        return bulkStore;
    }
}

module.exports = new FinancialCalculationService();
