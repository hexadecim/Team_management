import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, Cell, LineChart
} from 'recharts';

const ProjectDashboard = ({ employees, allocations, projects }) => {
    const currentMonthStart = new Date(2026, 3, 1);
    const currentMonthEnd = new Date(2026, 4, 0);

    const analytics = useMemo(() => {
        // 1. Lifetime Project Profitability Analysis
        const projectMetrics = projects.map(proj => {
            const projectAllocations = allocations.filter(a => a.projectId === proj.id);
            const originalEnd = proj.original_end_date ? new Date(proj.original_end_date) : null;

            let projectIncome = 0;
            let projectExpense = 0;
            let projectBurnRate = 0;
            let baselineIncome = 0;
            let baselineExpense = 0;

            projectAllocations.forEach(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                if (emp) {
                    const start = new Date(a.startDate);
                    const end = new Date(a.endDate);

                    const monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
                    const durationMonths = Math.max(0, monthDiff);

                    const monthlyIncome = (emp.billableRate * a.percentage) / 100;
                    const monthlyExpense = (emp.expenseRate * a.percentage) / 100;

                    projectIncome += monthlyIncome * durationMonths;
                    projectExpense += monthlyExpense * durationMonths;

                    if (start <= currentMonthEnd && end >= currentMonthStart) {
                        projectBurnRate += monthlyExpense;
                    }

                    // Baseline duration capped at original end date
                    if (originalEnd) {
                        const cappedEnd = end < originalEnd ? end : originalEnd;
                        if (cappedEnd >= start) {
                            const baselineMonths = Math.max(0, (cappedEnd.getFullYear() - start.getFullYear()) * 12 + (cappedEnd.getMonth() - start.getMonth()) + 1);
                            baselineIncome += monthlyIncome * baselineMonths;
                            baselineExpense += monthlyExpense * baselineMonths;
                        }
                    } else {
                        baselineIncome = projectIncome;
                        baselineExpense = projectExpense;
                    }
                }
            });

            const profit = projectIncome - projectExpense;
            const marginPct = projectIncome > 0 ? (profit / projectIncome) * 100 : 0;

            // Profit Trend: Reflect cost overrun as a reduction in expected performance
            const costVariance = projectExpense - baselineExpense;
            const profitTrend = -costVariance;

            // Margin Trend: Actual Margin vs Ideal Margin (if we had stayed on baseline expense)
            const targetMarginPct = projectIncome > 0 ? ((projectIncome - baselineExpense) / projectIncome * 100) : 0;
            const marginTrend = marginPct - targetMarginPct;

            return {
                id: proj.id,
                name: proj.name,
                income: Math.round(projectIncome),
                expense: Math.round(projectExpense),
                profit: Math.round(profit),
                marginPct: Math.round(marginPct),
                burnRate: Math.round(projectBurnRate),
                profitTrend: Math.round(profitTrend),
                marginTrend: Math.round(marginTrend)
            };
        }).filter(p => p.income > 0 || p.expense > 0).sort((a, b) => b.income - a.income);

        // 2. [NEW] Monthly Profitability Analysis (Current Month)
        const monthlyMetrics = projects.map(proj => {
            const projectAllocations = allocations.filter(a => {
                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                return a.projectId === proj.id && aStart <= currentMonthEnd && aEnd >= currentMonthStart;
            });

            let income = 0;
            let expense = 0;

            projectAllocations.forEach(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                if (emp) {
                    income += (emp.billableRate * a.percentage) / 100;
                    expense += (emp.expenseRate * a.percentage) / 100;
                }
            });

            return {
                name: proj.name,
                income: Math.round(income),
                expense: Math.round(expense),
                profit: Math.round(income - expense)
            };
        }).filter(p => p.income > 0 || p.expense > 0).sort((a, b) => b.income - a.income);

        // 3. Variance Analysis (Schedule & Cost)
        const varianceMetrics = projects.map(proj => {
            const projectAllocations = allocations.filter(a => a.projectId === proj.id);
            const originalEnd = proj.original_end_date ? new Date(proj.original_end_date) : null;
            const currentEnd = proj.end_date ? new Date(proj.end_date) : null;

            let baselineIncome = 0;
            let currentIncome = 0;
            let baselineExpense = 0;
            let currentExpense = 0;

            projectAllocations.forEach(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                if (emp) {
                    const allocStart = new Date(a.startDate);
                    const allocEnd = new Date(a.endDate);

                    // Duration for current allocation
                    const currentMonths = Math.max(0, (allocEnd.getFullYear() - allocStart.getFullYear()) * 12 + (allocEnd.getMonth() - allocStart.getMonth()) + 1);
                    currentIncome += ((emp.billableRate * a.percentage) / 100) * currentMonths;
                    currentExpense += ((emp.expenseRate * a.percentage) / 100) * currentMonths;

                    // Duration capped at original end date for baseline
                    if (originalEnd) {
                        const cappedEnd = allocEnd < originalEnd ? allocEnd : originalEnd;
                        if (cappedEnd >= allocStart) {
                            const baselineMonths = Math.max(0, (cappedEnd.getFullYear() - allocStart.getFullYear()) * 12 + (cappedEnd.getMonth() - allocStart.getMonth()) + 1);
                            baselineIncome += ((emp.billableRate * a.percentage) / 100) * baselineMonths;
                            baselineExpense += ((emp.expenseRate * a.percentage) / 100) * baselineMonths;
                        }
                    } else {
                        baselineIncome = currentIncome;
                        baselineExpense = currentExpense;
                    }
                }
            });

            const scheduleVarianceDays = (currentEnd && originalEnd) ?
                Math.round((currentEnd - originalEnd) / (1000 * 60 * 60 * 24)) : 0;

            const costVariance = currentExpense - baselineExpense;

            return {
                name: proj.name,
                scheduleVariance: scheduleVarianceDays,
                costVariance: Math.round(costVariance),
                baselineCost: Math.round(baselineExpense),
                currentCost: Math.round(currentExpense),
                // Data for trend line
                trend: [
                    { name: 'Baseline', value: baselineExpense, label: 'Baseline' },
                    { name: 'Current', value: currentExpense, label: 'Current' }
                ]
            };
        }).filter(p => p.currentCost > 0 || p.scheduleVariance !== 0);

        return {
            projectMetrics,
            monthlyMetrics,
            varianceMetrics
        };
    }, [employees, allocations, projects]);

    return (
        <div className="dashboard-view">
            <div className="chart-container">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2.5rem', textAlign: 'center', color: 'var(--col-primary)' }}>
                    📈 Financial Performance Analysis
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>

                    {/* Column 1: Monthly Analysis */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#64748b' }}>
                            📊 Monthly Profitability (Apr 2026)
                        </h3>
                        {analytics.monthlyMetrics.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No active project allocations.</p>
                        ) : (
                            <div style={{ flex: 1, minHeight: '220px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.monthlyMetrics} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '10px' }} />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 700 }} />
                                        <Bar dataKey="income" name="Income ($)" fill="#6366f1" radius={[2, 2, 0, 0]} barSize={20} />
                                        <Bar dataKey="expense" name="Expense ($)" fill="#94a3b8" radius={[2, 2, 0, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Column 2: Lifetime Analysis */}
                    <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#64748b' }}>
                            💰 Lifetime Profitability (Cumulative)
                        </h3>
                        {analytics.projectMetrics.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No financial record detected.</p>
                        ) : (
                            <div style={{ flex: 1, minHeight: '220px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={analytics.projectMetrics} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '10px' }} />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 700 }} />
                                        <Bar dataKey="income" name="Income ($)" fill="#10b981" radius={[2, 2, 0, 0]} barSize={20} />
                                        <Bar dataKey="expense" name="Expense ($)" fill="#ef4444" radius={[2, 2, 0, 0]} barSize={20} />
                                        <Line type="monotone" dataKey="burnRate" hide name="Burnrate ($)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Column 3: Variance Report */}
                    <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#64748b' }}>
                            ⚠️ Variance Analysis (Baseline vs Actual)
                        </h3>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {analytics.varianceMetrics.length === 0 ? (
                                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No variance data available.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {analytics.varianceMetrics.map(v => (
                                        <div key={v.name} style={{ padding: '0.75rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{v.name}</span>
                                                <span style={{ fontSize: '0.7rem', color: v.scheduleVariance <= 0 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                                                    {v.scheduleVariance > 0 ? `+${v.scheduleVariance}d delay` : v.scheduleVariance < 0 ? `${v.scheduleVariance}d ahead` : 'On Schedule'}
                                                </span>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '0.5rem', alignItems: 'center' }}>
                                                <div style={{ fontSize: '0.7rem' }}>
                                                    Cost Variance: <span style={{ fontWeight: 800, color: v.costVariance <= 0 ? '#10b981' : '#ef4444' }}>${v.costVariance.toLocaleString()}</span>
                                                    <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '2px' }}>
                                                        Base: ${v.baselineCost.toLocaleString()} → Now: ${v.currentCost.toLocaleString()}
                                                    </div>
                                                </div>
                                                <div style={{ height: '40px' }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={v.trend}>
                                                            <Line type="monotone" dataKey="value" stroke={v.costVariance <= 0 ? '#10b981' : '#ef4444'} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                                                            <Tooltip contentStyle={{ display: 'none' }} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Performance Summary Grid moved to full width below or removed if it fits above? User asked for Variance report. Let's keep summary but maybe as a horizontal set of chips or a smaller section. */}
                <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1rem', color: '#64748b' }}>
                        📋 Key Performance Metrics
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        {analytics.projectMetrics.map(metrics => (
                            <div key={metrics.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--fg)' }}>{metrics.name}</span>
                                    <span style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Performance</span>
                                </div>
                                <div style={{ width: '1px', height: '20px', background: 'var(--border)' }}></div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                                        Margin: <span style={{ color: metrics.marginPct > 10 ? '#10b981' : '#ef4444' }}>{metrics.marginPct}%</span>
                                    </span>
                                    <span style={{ fontSize: '0.6rem', color: metrics.marginTrend >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                        {metrics.marginTrend >= 0 ? '↑' : '↓'} {Math.abs(metrics.marginTrend)}% vs base
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                                        Profit: ${metrics.profit.toLocaleString()}
                                    </span>
                                    <span style={{ fontSize: '0.6rem', color: metrics.profitTrend >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                        {metrics.profitTrend >= 0 ? '↑' : '↓'} ${Math.abs(metrics.profitTrend).toLocaleString()} vs base
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectDashboard;
