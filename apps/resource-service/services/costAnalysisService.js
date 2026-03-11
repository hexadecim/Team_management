const { db: pool } = require('@team-mgmt/shared');

/**
 * Service to handle Cost Analysis and Profit Margin reporting
 */
class CostAnalysisService {
    /**
     * Calculates project margin and overrun metrics for all projects
     */
    async calculateAllProjectMargins() {
        const client = await pool.getClient();
        try {
            // Get all projects with their allocations and employee rates
            const projectsQuery = `
                SELECT 
                    p.id as project_id, 
                    p.start_date, 
                    p.end_date, 
                    p.original_end_date,
                    p.planned_budget,
                    p.average_working_hours
                FROM core.projects p
            `;
            const projectsRes = await client.query(projectsQuery);

            for (const project of projectsRes.rows) {
                await this.calculateProjectMargin(project.project_id, client);
            }
        } finally {
            client.release();
        }
    }

    /**
     * Calculates margin metrics for a specific project
     */
    async calculateProjectMargin(projectId, dbClient = null) {
        const client = dbClient || await pool.getClient();
        try {
            // 1. Fetch project and allocation details
            const projectQuery = `
                SELECT id, start_date, end_date, original_end_date, planned_budget, average_working_hours
                FROM core.projects WHERE id = $1
            `;
            const projectRes = await client.query(projectQuery, [projectId]);
            const project = projectRes.rows[0];
            if (!project) return;

            const allocationsQuery = `
                SELECT 
                    a.percentage, 
                    a.start_date as alloc_start, 
                    a.end_date as alloc_end,
                    e.billable_rate,
                    e.expense_rate
                FROM core.allocations a
                JOIN core.employees e ON a.employee_id = e.id
                WHERE a.project_id = $1
            `;
            const allocationsRes = await client.query(allocationsQuery, [projectId]);
            const allocations = allocationsRes.rows;

            // 2. Logic for Financials
            let totalRevenue = 0;
            let totalCost = 0;
            // Use average_working_hours/20 if available, otherwise default to 8
            let hourlyWorkday = project.average_working_hours ? (parseFloat(project.average_working_hours) / 20) : 8;

            const projectStart = new Date(project.start_date);
            const projectEnd = new Date(project.end_date);



            // Iterate through each allocation to calculate revenue and cost contributions
            allocations.forEach(alloc => {
                const allocStart = new Date(alloc.alloc_start);
                const allocEnd = new Date(alloc.alloc_end);

                // Find overlap between project duration and allocation duration
                const start = new Date(Math.max(projectStart, allocStart));
                const end = new Date(Math.min(projectEnd, allocEnd));



                if (start <= end) {
                    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                    const allocationFactor = alloc.percentage / 100;

                    const dailyRev = allocationFactor * parseFloat(alloc.billable_rate || 0) * hourlyWorkday;
                    const dailyCost = allocationFactor * parseFloat(alloc.expense_rate || 0) * hourlyWorkday;



                    totalRevenue += dailyRev * days;
                    totalCost += dailyCost * days;
                }
            });

            // 3. Logic for Overrun
            let overrunCost = 0;
            let daysExtended = 0;
            const originalEnd = project.original_end_date ? new Date(project.original_end_date) : null;
            const currentDate = new Date();

            if (originalEnd && (currentDate > originalEnd || projectEnd > originalEnd)) {
                // If it's currently beyond original date OR planned end is beyond original date
                const effectiveEnd = projectEnd > originalEnd ? projectEnd : currentDate;
                const diffTime = Math.abs(effectiveEnd - originalEnd);
                daysExtended = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // Overrun is the cost incurred after the original end date
                // Calculate daily cost at the end of project
                let dailyCostAtEnd = 0;
                allocations.forEach(alloc => {
                    const allocEnd = new Date(alloc.alloc_end);
                    if (allocEnd >= originalEnd) {
                        const allocationFactor = alloc.percentage / 100;
                        dailyCostAtEnd += allocationFactor * parseFloat(alloc.expense_rate || 0) * hourlyWorkday;
                    }
                });
                overrunCost = dailyCostAtEnd * daysExtended;
            }

            // 4. Net Margin Calculation
            const netMargin = totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : 0;

            // 5. Upsert into margin report
            await client.query(`
                INSERT INTO analytics.project_margin_report 
                (project_id, total_revenue, total_cost, overrun_cost, net_margin, days_extended, last_updated)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (project_id) DO UPDATE SET
                    total_revenue = EXCLUDED.total_revenue,
                    total_cost = EXCLUDED.total_cost,
                    overrun_cost = EXCLUDED.overrun_cost,
                    net_margin = EXCLUDED.net_margin,
                    days_extended = EXCLUDED.days_extended,
                    last_updated = NOW()
            `, [projectId, totalRevenue, totalCost, overrunCost, netMargin, daysExtended]);

            // 6. Record for trend if not already recorded today
            await client.query(`
                INSERT INTO analytics.project_margin_history (project_id, recorded_date, revenue, cost, margin)
                VALUES ($1, CURRENT_DATE, $2, $3, $4)
                ON CONFLICT (project_id, recorded_date) DO UPDATE SET
                    revenue = EXCLUDED.revenue,
                    cost = EXCLUDED.cost,
                    margin = EXCLUDED.margin
            `, [projectId, totalRevenue, totalCost, netMargin]);

            return { totalRevenue, totalCost, overrunCost, netMargin, daysExtended };
        } catch (error) {
            console.error('[CostAnalysisService] Error:', error);
            throw error;
        } finally {
            if (!dbClient) client.release();
        }
    }

    async getMarginReport() {
        const res = await pool.query(`
            SELECT 
                r.*, 
                p.name as project_name,
                p.start_date,
                p.end_date,
                p.original_end_date,
                p.planned_budget
            FROM analytics.project_margin_report r
            JOIN core.projects p ON r.project_id = p.id
            ORDER BY r.net_margin DESC
        `);
        return res.rows;
    }

    async getMarginTrend(projectId) {
        const res = await pool.query(`
            SELECT recorded_date, revenue, cost, margin
            FROM analytics.project_margin_history
            WHERE project_id = $1
            ORDER BY recorded_date ASC
            LIMIT 30
        `, [projectId]);
        return res.rows;
    }

    async getProjectMarginBreakdown(projectId) {
        const client = await pool.getClient();
        try {
            const projectQuery = `
                SELECT id, name, start_date, end_date, average_working_hours
                FROM core.projects WHERE id = $1
            `;
            const projectRes = await client.query(projectQuery, [projectId]);
            const project = projectRes.rows[0];
            if (!project) return [];

            const allocationsQuery = `
                SELECT 
                    e.first_name || ' ' || e.last_name as employee_name,
                    a.percentage, 
                    a.start_date as alloc_start, 
                    a.end_date as alloc_end,
                    e.billable_rate,
                    e.expense_rate
                FROM core.allocations a
                JOIN core.employees e ON a.employee_id = e.id
                WHERE a.project_id = $1
                ORDER BY e.last_name, a.start_date
            `;
            const allocationsRes = await client.query(allocationsQuery, [projectId]);

            let hourlyWorkday = project.average_working_hours ? (parseFloat(project.average_working_hours) / 20) : 8;
            const projectStart = new Date(project.start_date);
            const projectEnd = new Date(project.end_date);

            return allocationsRes.rows.map(alloc => {
                const allocStart = new Date(alloc.alloc_start);
                const allocEnd = new Date(alloc.alloc_end);
                const start = new Date(Math.max(projectStart, allocStart));
                const end = new Date(Math.min(projectEnd, allocEnd));

                let days = 0;
                let revenue = 0;
                let cost = 0;

                if (start <= end) {
                    days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                    const factor = alloc.percentage / 100;
                    const dailyRev = factor * parseFloat(alloc.billable_rate || 0) * hourlyWorkday;
                    const dailyCost = factor * parseFloat(alloc.expense_rate || 0) * hourlyWorkday;
                    revenue = dailyRev * days;
                    cost = dailyCost * days;
                }

                return {
                    employee_name: alloc.employee_name,
                    percentage: alloc.percentage,
                    start_date: start.toISOString().split('T')[0],
                    end_date: end.toISOString().split('T')[0],
                    days,
                    hourly_workday: hourlyWorkday,
                    billable_rate: alloc.billable_rate,
                    expense_rate: alloc.expense_rate,
                    total_revenue: revenue,
                    total_cost: cost,
                    margin: revenue > 0 ? (revenue - cost) / revenue : 0
                };
            });
        } finally {
            client.release();
        }
    }
}

module.exports = new CostAnalysisService();
