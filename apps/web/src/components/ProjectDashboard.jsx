import React, { useMemo, useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, Cell, LineChart, AreaChart, Area
} from 'recharts';

const API_BASE = 'http://localhost:4001';

const ProjectDashboard = ({ employees, allocations, projects }) => {
    const token = localStorage.getItem('vibe-token');
    const [financialStore, setFinancialStore] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAllFinancials = async () => {
            if (!token || projects.length === 0) {
                setLoading(false);
                return;
            }

            const store = {};
            try {
                await Promise.all(projects.map(async (project) => {
                    const [finRes, billRes, expRes] = await Promise.all([
                        fetch(`${API_BASE}/projects/${project.id}/financials`, { headers: { 'Authorization': `Bearer ${token}` } }),
                        fetch(`${API_BASE}/projects/${project.id}/billing-monthly`, { headers: { 'Authorization': `Bearer ${token}` } }),
                        fetch(`${API_BASE}/projects/${project.id}/expenses-monthly`, { headers: { 'Authorization': `Bearer ${token}` } })
                    ]);

                    if (finRes.ok && billRes.ok && expRes.ok) {
                        const summary = await finRes.json();
                        const billing = await billRes.json();
                        const expenses = await expRes.json();

                        store[project.id] = {
                            summary,
                            billing: billing.sort((a, b) => new Date(a.monthYear) - new Date(b.monthYear)),
                            expenses: expenses.sort((a, b) => new Date(a.monthYear) - new Date(b.monthYear))
                        };
                    }
                }));
                setFinancialStore(store);
            } catch (error) {
                console.error('Error fetching financial data:', error);
            } finally {
                setLoading(false);
            }
        };

        // Initial fetch
        fetchAllFinancials();

        // Polling interval (2 seconds)
        const interval = setInterval(() => {
            fetchAllFinancials();
        }, 2000);

        return () => clearInterval(interval);
    }, [projects, token]);

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
                    const allocStart = new Date(a.startDate);
                    const allocEnd = new Date(a.endDate);

                    // Refined fallback logic: iterate through months
                    const current = new Date(allocStart.getFullYear(), allocStart.getMonth(), 1);
                    const endRange = new Date(allocEnd.getFullYear(), allocEnd.getMonth(), 1);

                    while (current <= endRange) {
                        const mStart = new Date(current.getFullYear(), current.getMonth(), 1);
                        const mEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

                        const overlapStart = allocStart > mStart ? allocStart : mStart;
                        const overlapEnd = allocEnd < mEnd ? allocEnd : mEnd;

                        const overlapDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
                        if (overlapDays > 0) {
                            const daysInMonth = mEnd.getDate();
                            const utilization = (a.percentage / 100) * (overlapDays / daysInMonth);
                            const B = proj.average_working_hours || 160;

                            const monthlyIncome = utilization * (emp.billableRate * 8) * (B / 8);
                            const monthlyExpense = utilization * (emp.expenseRate * 8) * (B / 8);

                            projectIncome += monthlyIncome;
                            projectExpense += monthlyExpense;

                            if (mStart <= currentMonthEnd && mEnd >= currentMonthStart) {
                                projectBurnRate += monthlyExpense;
                            }

                            // Baseline logic
                            if (originalEnd) {
                                const bOverlapEnd = allocEnd < originalEnd ? (overlapEnd < originalEnd ? overlapEnd : originalEnd) : (overlapEnd < originalEnd ? overlapEnd : originalEnd);
                                // Simpler baseline: if the month is before or on originalEnd, count it
                                if (mEnd <= originalEnd) {
                                    baselineIncome += monthlyIncome;
                                    baselineExpense += monthlyExpense;
                                } else if (mStart < originalEnd) {
                                    // Partial month overlap with originalEnd
                                    const bOverlapEndPart = originalEnd < overlapEnd ? originalEnd : overlapEnd;
                                    const bOverlapDays = Math.round((bOverlapEndPart - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
                                    if (bOverlapDays > 0) {
                                        const bUtil = (a.percentage / 100) * (bOverlapDays / daysInMonth);
                                        baselineIncome += bUtil * (emp.billableRate * 8) * (B / 8);
                                        baselineExpense += bUtil * (emp.expenseRate * 8) * (B / 8);
                                    }
                                }
                            }
                        }
                        current.setMonth(current.getMonth() + 1);
                    }
                }
            });

            if (!originalEnd) {
                baselineIncome = projectIncome;
                baselineExpense = projectExpense;
            }

            const profit = projectIncome - projectExpense;
            const marginPct = projectIncome > 0 ? (profit / projectIncome) * 100 : 0;

            // Profit Trend: Reflect cost overrun as a reduction in expected performance
            const costVariance = projectExpense - baselineExpense;
            const profitTrend = -costVariance;

            // Margin Trend: Actual Margin vs Ideal Margin (if we had stayed on baseline expense)
            const targetMarginPct = projectIncome > 0 ? ((projectIncome - baselineExpense) / projectIncome * 100) : 0;
            const marginTrend = marginPct - targetMarginPct;

            const backendData = financialStore[proj.id];
            const plannedBudget = proj.planned_budget || (backendData?.summary?.plannedBudget) || 0;

            // Use backend data if available, otherwise fallback to frontend calculation
            const billingTotal = backendData?.summary ? parseFloat(backendData.summary.totalProjectedBilling) : projectIncome;
            const expenseTotal = backendData?.summary ? parseFloat(backendData.summary.totalProjectedExpense) : projectExpense;
            const variance = backendData?.summary ? parseFloat(backendData.summary.budgetVariance) : (plannedBudget - projectExpense);

            return {
                id: proj.id,
                name: proj.name,
                income: Math.round(billingTotal),
                expense: Math.round(expenseTotal),
                profit: Math.round(billingTotal - expenseTotal),
                marginPct: billingTotal > 0 ? Math.round(((billingTotal - expenseTotal) / billingTotal) * 100) : 0,
                plannedBudget: Math.round(plannedBudget),
                variance: Math.round(variance),
                burnRate: Math.round(projectBurnRate),
                profitTrend: Math.round(profitTrend),
                marginTrend: Math.round(marginTrend),
                // Data for Budget Utilization Chart
                utilization: [
                    { name: 'Used', value: Math.round(expenseTotal), fill: expenseTotal > plannedBudget ? 'var(--danger)' : '#6366f1' },
                    { name: 'Remaining', value: Math.max(0, Math.round(plannedBudget - expenseTotal)), fill: '#e2e8f0' }
                ],
                // Data for Cumulative Trend
                history: backendData ? backendData.billing.map((b) => {
                    const monthExp = backendData.expenses.find(e => {
                        const bD = new Date(b.monthYear);
                        const eD = new Date(e.monthYear);
                        return bD.getMonth() === eD.getMonth() && bD.getFullYear() === eD.getFullYear();
                    });

                    return {
                        month: new Date(b.monthYear).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                        billing: parseFloat(b.projectedBilling),
                        expense: parseFloat(monthExp?.projectedExpense || 0),
                        cumBilling: parseFloat(b.cumulativeBilling),
                        cumExpense: parseFloat(monthExp?.cumulativeExpense || 0)
                    };
                }) : []
            };
        }).filter(p => p.income > 0 || p.expense > 0 || p.plannedBudget > 0).sort((a, b) => b.income - a.income);


        // 2. [NEW] Monthly Profitability Analysis (Current Month)
        const monthlyMetrics = projects.map(proj => {
            const backendData = financialStore[proj.id];

            // Current month string from the hardcoded range (2026-04-01)
            const currentMonthStr = '2026-04-01T00:00:00.000Z'; // This should match backend ISO string for comparison

            // Try to find current month data in backend response
            const currentMonthBilling = backendData?.billing?.find(b => {
                const bDate = new Date(b.monthYear);
                return bDate.getFullYear() === 2026 && bDate.getMonth() === 3; // April
            });
            const currentMonthExpense = backendData?.expenses?.find(e => {
                const eDate = new Date(e.monthYear);
                return eDate.getFullYear() === 2026 && eDate.getMonth() === 3; // April
            });

            if (currentMonthBilling || currentMonthExpense) {
                return {
                    name: proj.name,
                    income: Math.round(parseFloat(currentMonthBilling?.projectedBilling || 0)),
                    expense: Math.round(parseFloat(currentMonthExpense?.projectedExpense || 0)),
                    profit: Math.round(parseFloat(currentMonthBilling?.projectedBilling || 0) - parseFloat(currentMonthExpense?.projectedExpense || 0))
                };
            }

            // Fallback to minimal frontend calculation only if backend data is absolutely missing
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
                    // Refined logic fallback: utilization * daily * multiplier
                    const aStart = new Date(a.startDate);
                    const aEnd = new Date(a.endDate);
                    const overlapStart = aStart > currentMonthStart ? aStart : currentMonthStart;
                    const overlapEnd = aEnd < currentMonthEnd ? aEnd : currentMonthEnd;
                    const overlapDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
                    const daysInMonth = 30; // April
                    const utilization = (a.percentage / 100) * (overlapDays / daysInMonth);
                    const B = proj.average_working_hours || 160;

                    income += utilization * (emp.billableRate * 8) * (B / 8);
                    expense += utilization * (emp.expenseRate * 8) * (B / 8);
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
            const backendData = financialStore[proj.id];
            const originalEnd = proj.original_end_date ? new Date(proj.original_end_date) : null;
            const currentEnd = proj.end_date ? new Date(proj.end_date) : null;

            // Use backend data for current cost if available, otherwise use our refined frontend fallback
            const m = projectMetrics.find(metric => metric.id === proj.id);
            const currentExpense = backendData?.summary ? parseFloat(backendData.summary.totalProjectedExpense) : (m?.expense || 0);
            const plannedBudget = proj.planned_budget || (backendData?.summary?.plannedBudget) || 0;

            // Recalculate baseline cost for variance analysis (still using original end date logic)
            let baselineExpense = 0;
            const projectAllocations = allocations.filter(a => a.projectId === proj.id);

            projectAllocations.forEach(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                if (emp && originalEnd) {
                    const allocStart = new Date(a.startDate);
                    const allocEnd = new Date(a.endDate);
                    const cappedEnd = allocEnd < originalEnd ? allocEnd : originalEnd;

                    if (cappedEnd >= allocStart) {
                        // Use refined logic for baseline calculation consistency
                        const current = new Date(allocStart.getFullYear(), allocStart.getMonth(), 1);
                        const end = new Date(cappedEnd.getFullYear(), cappedEnd.getMonth(), 1);

                        while (current <= end) {
                            const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
                            const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

                            const overlapStart = allocStart > monthStart ? allocStart : monthStart;
                            const overlapEnd = cappedEnd < monthEnd ? cappedEnd : monthEnd;

                            const overlapDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
                            const daysInMonth = monthEnd.getDate();
                            const utilization = (a.percentage / 100) * (overlapDays / daysInMonth);
                            const B = proj.average_working_hours || 160;

                            baselineExpense += utilization * (emp.expenseRate * 8) * (B / 8);
                            current.setMonth(current.getMonth() + 1);
                        }
                    }
                }
            });

            const scheduleVarianceDays = (currentEnd && originalEnd) ?
                Math.round((currentEnd - originalEnd) / (1000 * 60 * 60 * 24)) : 0;

            // Total Cost Variance = Current Actual Projections - Baseline (what it should have cost until original end date)
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

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: 'var(--muted-fg)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="spinner" style={{ marginBottom: '1rem' }}></div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Analyzing Financial Data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-view" style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="chart-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', margin: 0, color: 'var(--col-primary)' }}>
                        📈 Project Portfolio Intelligence
                    </h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ padding: '0.4rem 0.8rem', background: '#e0e7ff', color: '#4338ca', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800 }}>
                            ACTIVE PROJECTS: {analytics.projectMetrics.length}
                        </div>
                    </div>
                </div>

                {/* Section 1: Financial Health Overlays */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    {analytics.projectMetrics.slice(0, 4).map(p => (
                        <div key={p.id} className="card" style={{ padding: '1.25rem', border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>{p.name}</span>
                                <span style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', background: p.variance >= 0 ? '#dcfce7' : '#fee2e2', color: p.variance >= 0 ? '#166534' : '#991b1b', borderRadius: '4px', fontWeight: 800 }}>
                                    {p.variance >= 0 ? 'ON BUDGET' : 'OVER BUDGET'}
                                </span>
                            </div>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--fg)' }}>${Math.abs(p.variance).toLocaleString()}</div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>{p.variance >= 0 ? 'REMAINING SURPLUS' : 'ESTIMATED DEFICIT'}</div>
                            </div>
                            <div style={{ height: '4px', width: '100%', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${Math.min(100, (p.expense / p.plannedBudget) * 100)}%`,
                                    background: p.expense > p.plannedBudget ? '#ef4444' : '#6366f1',
                                    transition: 'width 1s ease-out'
                                }}></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>
                                <span>USED: ${p.expense.toLocaleString()}</span>
                                <span>BUDGET: ${p.plannedBudget.toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
                    {/* Column 1: Lifetime Projections Chart */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                            <span style={{ marginRight: '0.5rem' }}>📅</span> Lifetime Cash Flow Projections
                        </h3>
                        {analytics.projectMetrics.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No projection data available.</p>
                        ) : (
                            <div style={{ height: '350px', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border)' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={analytics.projectMetrics[0].history}>
                                        <defs>
                                            <linearGradient id="colorBilling" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} tickFormatter={(val) => val >= 1000 ? `$${val / 1000}k` : `$${val}`} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', padding: '12px' }}
                                            formatter={(val) => [`$${parseFloat(val).toLocaleString()}`, '']}
                                        />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '11px', fontWeight: 700 }} />
                                        <Area type="monotone" dataKey="cumBilling" name="Cumulative Billing ($)" stroke="#6366f1" fillOpacity={1} fill="url(#colorBilling)" strokeWidth={3} />
                                        <Line type="monotone" dataKey="cumExpense" name="Cumulative Expense ($)" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                                        <Bar dataKey="billing" name="Monthly Billing ($)" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} opacity={0.3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Column 2: Budget Utilization Doughnut Charts */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                            <span style={{ marginRight: '0.5rem' }}>🥧</span> Budget Utilization
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflowY: 'auto', maxHeight: '350px' }}>
                            {analytics.projectMetrics.map(p => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <div style={{ width: '60px', height: '60px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={p.utilization} layout="vertical">
                                                <XAxis type="number" hide />
                                                <YAxis dataKey="name" type="category" hide />
                                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>{p.name}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                                            {Math.round((p.expense / (p.plannedBudget || 1)) * 100)}% Consumed
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 900 }}>${p.expense.toLocaleString()}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>of ${p.plannedBudget.toLocaleString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

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
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} tickFormatter={(val) => val >= 1000 ? `$${val / 1000}k` : `$${val}`} />
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
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} tickFormatter={(val) => val >= 1000 ? `$${val / 1000}k` : `$${val}`} />
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
