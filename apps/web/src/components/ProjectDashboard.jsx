import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, Cell
} from 'recharts';

const ProjectDashboard = ({ employees, allocations, projects }) => {
    const currentMonthStart = new Date(2026, 3, 1);
    const currentMonthEnd = new Date(2026, 4, 0);

    const analytics = useMemo(() => {
        // 1. Lifetime Project Profitability Analysis
        const projectMetrics = projects.map(proj => {
            const projectAllocations = allocations.filter(a => a.projectId === proj.id);

            let projectIncome = 0;
            let projectExpense = 0;
            let projectBurnRate = 0;

            projectAllocations.forEach(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                if (emp) {
                    const start = new Date(a.startDate);
                    const end = new Date(a.endDate);

                    const monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
                    const durationMonths = Math.max(0, monthDiff);

                    projectIncome += ((emp.billableRate * a.percentage) / 100) * durationMonths;
                    const monthlyExpense = (emp.expenseRate * a.percentage) / 100;
                    projectExpense += monthlyExpense * durationMonths;

                    if (start <= currentMonthEnd && end >= currentMonthStart) {
                        projectBurnRate += monthlyExpense;
                    }
                }
            });

            const profit = projectIncome - projectExpense;
            const marginPct = projectIncome > 0 ? (profit / projectIncome) * 100 : 0;

            return {
                id: proj.id,
                name: proj.name,
                income: Math.round(projectIncome),
                expense: Math.round(projectExpense),
                profit: Math.round(profit),
                marginPct: Math.round(marginPct),
                burnRate: Math.round(projectBurnRate)
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

        return {
            projectMetrics,
            monthlyMetrics
        };
    }, [employees, allocations, projects]);

    return (
        <div className="dashboard-view">
            <div className="chart-container">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2.5rem', textAlign: 'center', color: 'var(--col-primary)' }}>
                    📈 Financial Performance Analysis
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', minHeight: '380px' }}>

                    {/* Column 1: Monthly Analysis */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#64748b' }}>
                            📊 Monthly Profitability (Apr 2026)
                        </h3>
                        {analytics.monthlyMetrics.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No active project allocations.</p>
                        ) : (
                            <div style={{ flex: 1, minHeight: '250px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.monthlyMetrics} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '10px' }} />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 700 }} />
                                        <Bar dataKey="income" name="Income ($)" fill="#6366f1" radius={[2, 2, 0, 0]} barSize={25} />
                                        <Bar dataKey="expense" name="Expense ($)" fill="#94a3b8" radius={[2, 2, 0, 0]} barSize={25} />
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
                            <div style={{ flex: 1, minHeight: '250px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={analytics.projectMetrics} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '10px' }} />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 700 }} />
                                        <Bar dataKey="income" name="Income ($)" fill="#10b981" radius={[2, 2, 0, 0]} barSize={25} />
                                        <Bar dataKey="expense" name="Expense ($)" fill="#ef4444" radius={[2, 2, 0, 0]} barSize={25} />
                                        <Line type="monotone" dataKey="burnRate" hide name="Burnrate ($)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Column 3: Summary Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#64748b' }}>
                            📋 Performance Summary
                        </h3>
                        <div style={{ flex: 1, overflowY: 'auto', pr: '0.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {analytics.projectMetrics.map(metrics => (
                                    <div key={metrics.id} style={{ padding: '0.75rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{metrics.name}</span>
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontWeight: 800,
                                                background: metrics.marginPct > 30 ? '#dcfce7' : metrics.marginPct > 10 ? '#fef3c7' : '#fee2e2',
                                                color: metrics.marginPct > 30 ? '#166534' : metrics.marginPct > 10 ? '#92400e' : '#991b1b',
                                            }}>
                                                {metrics.marginPct}%
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                Profit: <span style={{ fontWeight: 700, color: metrics.profit >= 0 ? '#10b981' : '#ef4444' }}>${metrics.profit.toLocaleString()}</span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'right' }}>
                                                Burn: <span style={{ fontWeight: 700, color: '#f59e0b' }}>${metrics.burnRate.toLocaleString()}/mo</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ProjectDashboard;
