const { db } = require('@team-mgmt/shared');

class AnalyticsService {

    /**
     * Get monthly utilization trend for a given date range
     * @param {string} startDate - YYYY-MM-DD
     * @param {string} endDate - YYYY-MM-DD
     */
    async getUtilizationTrend(startDate, endDate) {
        // Query daily_metrics table
        // We aggregate to monthly average from the daily snapshots
        const result = await db.queryCore(`
            SELECT 
                TO_CHAR(date, 'Mon') as name,
                TO_CHAR(date, 'Month YYYY') as "fullMonth",
                EXTRACT(YEAR FROM date) as year,
                EXTRACT(MONTH FROM date) as month_num,
                ROUND(AVG(CASE WHEN total_count > 0 THEN (billable_count::FLOAT / total_count::FLOAT) * 100 ELSE 0 END)) as utilization,
                ROUND(AVG(billable_count)) as "billableAvg",
                ROUND(AVG(total_count)) as headcount
            FROM analytics.daily_metrics
            WHERE date >= $1 AND date <= $2
            GROUP BY 1, 2, 3, 4
            ORDER BY year, month_num
        `, [startDate, endDate]);

        if (result.rows.length === 0) {
            // New Implementation: If no history, show current month projection
            // We use today's key stats to project for the current month.
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const currentStats = await this.getKeyStats(todayStr);

            if (currentStats.totalEmployees > 0) {
                return [{
                    name: today.toLocaleString('default', { month: 'short' }),
                    fullMonth: today.toLocaleString('default', { month: 'long', year: 'numeric' }),
                    year: today.getFullYear(),
                    utilization: Math.round((currentStats.billableEmployees / currentStats.totalEmployees) * 100),
                    totalLoad: 0,
                    headcount: currentStats.totalEmployees
                }];
            }
            return [];
        }

        return result.rows.map(row => ({
            name: row.name,
            fullMonth: row.fullMonth,
            year: parseInt(row.year),
            utilization: parseInt(row.utilization) || 0,
            totalLoad: 0, // Not tracking percentage load in this simple model yet
            headcount: parseInt(row.headcount) || 0
        }));
    }

    /**
     * Get current bench statistics (employees with 0 allocation in date range)
     * @param {string} date - Reference date (default: today)
     */
    async getBenchStats(date = new Date().toISOString().split('T')[0]) {
        // Find employees who have NO overlapping allocation for the given date
        const result = await db.queryCore(`
            SELECT e.id, e.first_name, e.last_name, e.primary_skills, e.email
            FROM core.employees e
            WHERE NOT EXISTS (
                SELECT 1 FROM core.allocations a 
                WHERE a.employee_id = e.id 
                AND a.start_date <= $1 AND a.end_date >= $1
            )
        `, [date]);

        const employees = result.rows.map(e => ({
            ...e,
            primarySkills: e.primary_skills || []
        }));

        // Group by primary skill
        const skillGroups = {};
        employees.forEach(emp => {
            const skill = emp.primarySkills[0] || 'Unspecified';
            if (!skillGroups[skill]) {
                skillGroups[skill] = { skill, count: 0, employees: [] };
            }
            skillGroups[skill].count++;
            skillGroups[skill].employees.push(emp);
        });

        return {
            totalBench: employees.length,
            employees,
            chartData: Object.values(skillGroups).sort((a, b) => b.count - a.count)
        };
    }

    /**
     * Get over-allocation risks (>100% allocation)
     * @param {string} date - Reference date
     */
    async getRiskRadar(date = new Date().toISOString().split('T')[0]) {
        // Sum allocation per employee for the given date
        const result = await db.queryCore(`
            SELECT 
                e.id, 
                e.first_name, 
                e.last_name, 
                e.primary_skills,
                SUM(a.percentage) as total_load
            FROM core.employees e
            JOIN core.allocations a ON e.id = a.employee_id
            WHERE a.start_date <= $1 AND a.end_date >= $1
            GROUP BY e.id
            HAVING SUM(a.percentage) > 100
        `, [date]);

        return result.rows.map(row => ({
            id: row.id,
            firstName: row.first_name,
            lastName: row.last_name,
            primarySkills: row.primary_skills || [],
            totalLoad: parseInt(row.total_load)
        }));
    }

    /**
     * Get employees rolling off soon (available in next 30 days)
     */
    async getRollingOffSoon() {
        const today = new Date().toISOString().split('T')[0];
        const future = new Date();
        future.setDate(future.getDate() + 30);
        const thirtyDaysLater = future.toISOString().split('T')[0];

        // Logic: 
        // 1. Employee is currently allocated (allocation exists covering TODAY)
        // 2. But their Max End Date of current allocations is <= 30 Days from now
        // 3. AND they don't have a future allocation starting after that.

        // Simpler approach for now:
        // Get employees with allocations ending in window, and check max end date.

        const result = await db.queryCore(`
            WITH CurrentAllocations AS (
                SELECT employee_id, MAX(end_date) as max_end
                FROM core.allocations
                WHERE start_date <= $1 AND end_date >= $1
                GROUP BY employee_id
            ),
            FutureAllocations AS (
                SELECT employee_id, MIN(start_date) as next_start
                FROM core.allocations
                WHERE start_date > $1
                GROUP BY employee_id
            )
            SELECT 
                e.id, e.first_name, e.last_name, e.primary_skills,
                ca.max_end as available_from
            FROM core.employees e
            JOIN CurrentAllocations ca ON e.id = ca.employee_id
            LEFT JOIN FutureAllocations fa ON e.id = fa.employee_id
            WHERE ca.max_end <= $2
            AND (fa.next_start IS NULL OR fa.next_start > ca.max_end)
        `, [today, thirtyDaysLater]);

        return result.rows.map(row => ({
            id: row.id,
            firstName: row.first_name,
            lastName: row.last_name,
            primarySkills: row.primary_skills || [],
            availableFrom: new Date(row.available_from).toISOString().split('T')[0]
        }));
    }

    /**
     * Get Key Stats (Headcount, Billable Count, Bench Count)
     * @param {string} date - Reference date
     */
    async getKeyStats(date = new Date().toISOString().split('T')[0]) {
        try {
            console.log('[AnalyticsService] getKeyStats called for date:', date);
            // Use pre-computed daily_metrics AND daily_financials
            // Get the latest record on or before the requested date
            const result = await db.queryCore(`
                SELECT 
                    m.total_count as "totalEmployees", 
                    m.billable_count as "billableEmployees", 
                    m.bench_count as "benchEmployees",
                    f.total_burn_amount as "benchBurn",
                    m.date
                FROM analytics.daily_metrics m
                LEFT JOIN analytics.daily_financials f ON m.date = f.date
                WHERE m.date <= $1
                ORDER BY m.date DESC
                LIMIT 1
            `, [date]);

            if (result.rowCount === 0) {
                // No history at all? Return zeros.
                return {
                    totalEmployees: 0,
                    billableEmployees: 0,
                    benchEmployees: 0,
                    benchBurn: 0,
                    date
                };
            }

            const row = result.rows[0];
            return {
                totalEmployees: parseInt(row.totalEmployees),
                billableEmployees: parseInt(row.billableEmployees),
                benchEmployees: parseInt(row.benchEmployees),
                benchBurn: parseFloat(row.benchBurn) || 0,
                date: new Date(row.date).toISOString().split('T')[0]
            };
        } catch (error) {
            console.error('[AnalyticsService] getKeyStats Error:', error);
            throw error;
        }
    }

    /**
     * Get Monthly Burn Trend
     * @param {string} startDate 
     * @param {string} endDate 
     */
    async getMonthlyBurnTrend(startDate, endDate) {
        // Aggregate daily burn to monthly average (or sum? User asked for monthly burn rate)
        // Usually, burn rate is expressed as "Monthly Rate".
        // Since our daily table stores "Daily Snapshot of Monthly Burn Rate", 
        // the average of these snapshots for the month is the best representation of that month's burn rate.

        const result = await db.queryCore(`
            SELECT 
                TO_CHAR(date, 'Mon') as name,
                TO_CHAR(date, 'Month YYYY') as "fullMonth",
                EXTRACT(YEAR FROM date) as year,
                EXTRACT(MONTH FROM date) as month_num,
                ROUND(AVG(total_burn_amount)) as "burnRate"
            FROM analytics.daily_financials
            WHERE date >= $1 AND date <= $2
            GROUP BY 1, 2, 3, 4
            ORDER BY year, month_num
        `, [startDate, endDate]);

        // If no data, return empty or fallback to current projection?
        // Let's stick to returning what we have. API consumer handles empty states.
        return result.rows.map(row => ({
            name: row.name,
            fullMonth: row.fullMonth,
            year: parseInt(row.year),
            month: parseInt(row.month_num),
            key: `${row.year}-${String(row.month_num).padStart(2, '0')}`,
            burnRate: parseFloat(row.burnRate) || 0
        }));
    }

    /**
     * Get Capacity Mix (Billable vs Bench) units for a date
     */
    async getCapacityMix(date = new Date().toISOString().split('T')[0]) {
        const result = await db.queryCore(`
            SELECT 
                total_count,
                billable_count,
                bench_count
            FROM analytics.daily_metrics
            WHERE date <= $1
            ORDER BY date DESC
            LIMIT 1
        `, [date]);

        let row = result.rows[0];
        if (!row) {
            // Fallback if absolutely no data exists
            row = { total_count: 0, billable_count: 0, bench_count: 0 };
        }

        // Convert counts to "Capacity Units" (assuming 1 Employee = 100 Units)
        // to maintain compatibility with the chart which expects capacity values
        const totalCapacity = (parseInt(row.total_count) || 0) * 100;
        const billableCapacity = (parseInt(row.billable_count) || 0) * 100;
        const benchCapacity = (parseInt(row.bench_count) || 0) * 100;

        return {
            totalCapacity,
            allocatedCapacity: billableCapacity, // In simple model, allocated = billable
            benchCapacity,
            headcount: parseInt(row.total_count) || 0,
            mix: [
                { name: 'Billable (Allocated)', value: billableCapacity, color: '#6366f1' },
                { name: 'Bench (Unassigned)', value: benchCapacity, color: '#eab308' }
            ]
        };
    }
}

module.exports = new AnalyticsService();
