import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, Cell, LineChart, AreaChart, Area
} from 'recharts';
import { API_BASE } from '../config';

const ProjectDashboard = ({ employees = [], allocations = [], projects = [], addToast }) => {
    const token = localStorage.getItem('vibe-token');
    const [financialStore, setFinancialStore] = useState({});
    const [loading, setLoading] = useState(true);
    const [baseliningProjectId, setBaseliningProjectId] = useState(null);
    const [activeProjectId, setActiveProjectId] = useState('summary');

    const fetchAllFinancials = useCallback(async (silent = false) => {
        if (!token || !Array.isArray(projects) || projects.length === 0) {
            setLoading(false);
            return;
        }

        // Only show full loading spinner on the very first load
        if (!silent && Object.keys(financialStore).length === 0) {
            setLoading(true);
        }

        try {
            // Use bulk endpoint to get all project data in one go
            const res = await fetch(`${API_BASE}/projects/financials/bulk`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const bulkData = await res.json();

                // Sanitize and sort historical data for charting
                Object.keys(bulkData).forEach(pid => {
                    const p = bulkData[pid];
                    if (Array.isArray(p.billing)) p.billing.sort((a, b) => new Date(a.monthYear) - new Date(b.monthYear));
                    if (Array.isArray(p.expenses)) p.expenses.sort((a, b) => new Date(a.monthYear) - new Date(b.monthYear));
                });

                setFinancialStore(bulkData);
            } else if (res.status === 429) {
                console.warn('Rate limited in ProjectDashboard, skipping this poll.');
            }
        } catch (error) {
            console.error('Error fetching bulk financial data:', error);
        } finally {
            setLoading(false);
        }
        // Removed financialStore from dependencies to break the infinite update loop
    }, [token, projects]);

    useEffect(() => {
        // Initial fetch
        fetchAllFinancials();

        // Polling interval (60 seconds)
        const interval = setInterval(() => {
            fetchAllFinancials(true);
        }, 60000);

        return () => clearInterval(interval);
    }, [token, fetchAllFinancials]); // Corrected dependencies

    const captureBaseline = async (projectId) => {
        setBaseliningProjectId(projectId);
        try {
            const res = await fetch(`${API_BASE}/projects/${projectId}/baseline`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                if (addToast) addToast('Baseline captured successfully', 'success');
                await fetchAllFinancials(true);
            } else {
                const err = await res.json();
                if (addToast) addToast(err.error || 'Failed to capture baseline', 'error');
            }
        } catch (error) {
            console.error('Error capturing baseline:', error);
            if (addToast) addToast('Error capturing baseline', 'error');
        } finally {
            setBaseliningProjectId(null);
        }
    };

    const analytics = useMemo(() => {
        if (!Array.isArray(projects)) return { projectMetrics: [], monthlyMetrics: [], varianceMetrics: [], aggregatedHistory: [] };

        // 1. Lifetime Project Profitability Analysis
        const projectMetrics = projects.map(proj => {
            const backendData = financialStore[proj.id];

            const billingTotal = backendData?.summary ? parseFloat(backendData.summary.totalProjectedBilling) : 0;
            const expenseTotal = backendData?.summary ? parseFloat(backendData.summary.totalProjectedExpense) : 0;
            const plannedBudget = backendData?.summary ? parseFloat(backendData.summary.plannedBudget) : (proj.planned_budget || 0);
            const variance = backendData?.summary ? parseFloat(backendData.summary.budgetVariance) : (plannedBudget - expenseTotal);
            const profit = billingTotal - expenseTotal;
            const currentMargin = billingTotal > 0 ? (profit / billingTotal) * 100 : 0;

            const activeBaseline = backendData?.activeBaseline;
            const profitTrend = activeBaseline ? (profit - parseFloat(activeBaseline.baselineProfit)) : 0;
            const marginTrend = activeBaseline ? (currentMargin - parseFloat(activeBaseline.baselineMarginPct)) : 0;

            const currentMonthData = backendData?.billing?.find(b => {
                const bDate = new Date(b.monthYear);
                return bDate.getFullYear() === 2026 && bDate.getMonth() === 3;
            });
            const projectBurnRate = currentMonthData ? parseFloat(backendData.expenses?.find(e => e.monthYear === currentMonthData.monthYear)?.projectedExpense || 0) : 0;

            return {
                id: proj.id,
                name: proj.name,
                income: Math.round(billingTotal),
                expense: Math.round(expenseTotal),
                profit: Math.round(profit),
                marginPct: Math.round(currentMargin),
                plannedBudget: Math.round(plannedBudget),
                variance: Math.round(variance),
                burnRate: Math.round(projectBurnRate),
                profitTrend: Math.round(profitTrend),
                marginTrend: Math.round(marginTrend),
                hasBaseline: !!activeBaseline,
                baselineTrend: (backendData?.baselineHistory || []).map(bh => ({
                    version: `v${bh.version}`,
                    profit: parseFloat(bh.baselineProfit),
                    margin: parseFloat(bh.baselineMarginPct)
                })),
                history: backendData?.billing ? backendData.billing.map((b) => {
                    const monthExp = backendData.expenses?.find(e => e.monthYear === b.monthYear);
                    return {
                        month: new Date(b.monthYear).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                        billing: parseFloat(b.projectedBilling),
                        expense: parseFloat(monthExp?.projectedExpense || 0),
                        cumBilling: parseFloat(b.cumulativeBilling),
                        cumExpense: parseFloat(monthExp?.cumulativeExpense || 0)
                    };
                }) : []
            };
        }).filter(p => p.income > 0 || p.expense > 0 || p.plannedBudget > 0);

        // 2. Monthly Profitability Analysis
        const monthlyMetrics = projects.map(proj => {
            const backendData = financialStore[proj.id];
            const currentMonthBilling = backendData?.billing?.find(b => {
                const d = new Date(b.monthYear);
                return d.getFullYear() === 2026 && d.getMonth() === 3;
            });
            const currentMonthExpense = backendData?.expenses?.find(e => {
                const d = new Date(e.monthYear);
                return d.getFullYear() === 2026 && d.getMonth() === 3;
            });

            return {
                name: proj.name,
                income: Math.round(parseFloat(currentMonthBilling?.projectedBilling || 0)),
                expense: Math.round(parseFloat(currentMonthExpense?.projectedExpense || 0)),
                profit: Math.round(parseFloat(currentMonthBilling?.projectedBilling || 0) - parseFloat(currentMonthExpense?.projectedExpense || 0))
            };
        }).filter(p => p.income > 0 || p.expense > 0);

        // 3. Variance Analysis
        const varianceMetrics = projects.map(proj => {
            const backendData = financialStore[proj.id];
            const originalEnd = proj.original_end_date ? new Date(proj.original_end_date) : null;
            const currentEnd = proj.end_date ? new Date(proj.end_date) : null;
            const scheduleVarianceDays = (currentEnd && originalEnd) ? Math.round((currentEnd - originalEnd) / (86400000)) : 0;

            const currentExpense = backendData?.summary ? parseFloat(backendData.summary.totalProjectedExpense) : 0;
            const activeBaseline = backendData?.activeBaseline;

            const costBaseline = activeBaseline ? parseFloat(activeBaseline.baselineExpense) : (proj.planned_budget || 0);
            const costVariance = currentExpense - costBaseline;

            return {
                name: proj.name,
                scheduleVariance: scheduleVarianceDays,
                costVariance: Math.round(costVariance),
                baselineCost: Math.round(costBaseline),
                currentCost: Math.round(currentExpense),
                baselineInfo: activeBaseline ? `v${activeBaseline.version} from ${new Date(activeBaseline.createdAt).toLocaleDateString()}` : 'Budget',
                trend: [
                    { name: 'Baseline', value: costBaseline },
                    { name: 'Current', value: currentExpense }
                ]
            };
        }).filter(p => p.currentCost > 0 || p.scheduleVariance !== 0);

        // 4. Aggregated Summary
        const allMonths = new Set();
        projects.forEach(proj => {
            financialStore[proj.id]?.billing?.forEach(b => allMonths.add(b.monthYear));
        });

        const sortedMonths = Array.from(allMonths).sort((a, b) => new Date(a) - new Date(b));
        const aggregatedHistory = sortedMonths.map(month => {
            let monthBilling = 0, monthExpense = 0, totalCumBilling = 0, totalCumExpense = 0;
            projects.forEach(proj => {
                const data = financialStore[proj.id];
                const b = data?.billing?.find(bi => bi.monthYear === month);
                const e = data?.expenses?.find(ei => ei.monthYear === month);
                if (b) { monthBilling += parseFloat(b.projectedBilling); totalCumBilling += parseFloat(b.cumulativeBilling); }
                if (e) { monthExpense += parseFloat(e.projectedExpense); totalCumExpense += parseFloat(e.cumulativeExpense); }
            });
            return {
                month: new Date(month).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                billing: monthBilling, expense: monthExpense, cumBilling: totalCumBilling, cumExpense: totalCumExpense
            };
        });

        return { projectMetrics, monthlyMetrics, varianceMetrics, aggregatedHistory };
    }, [projects, financialStore]);

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

                <div style={{ marginBottom: '2.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
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
                                        {metrics.profitTrend >= 0 ? '↑' : '↓'} ${Math.abs(metrics.profitTrend).toLocaleString()}
                                    </span>
                                </div>
                                {metrics.baselineTrend.length > 1 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '70px', height: '35px', marginLeft: '0.5rem' }}>
                                        <span style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px', textAlign: 'center' }}>Base Trend</span>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={metrics.baselineTrend} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                                                <defs>
                                                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <Area
                                                    type="monotone"
                                                    dataKey="profit"
                                                    stroke="#6366f1"
                                                    fill="url(#colorProfit)"
                                                    strokeWidth={1.5}
                                                    dot={(props) => {
                                                        const { cx, cy, stroke, payload, index } = props;
                                                        // Example: Show + on all points, or maybe just deviations.
                                                        // For now, simple + marker on all points.
                                                        return (
                                                            <svg key={`dot-${index}`} x={cx - 3} y={cy - 3} width={6} height={6} fill="none" viewBox="0 0 6 6">
                                                                <path d="M3 0V6M0 3H6" stroke={stroke} strokeWidth="1.5" />
                                                            </svg>
                                                        );
                                                    }}
                                                    isAnimationActive={false}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                                <div style={{ marginLeft: 'auto' }}>
                                    <button
                                        onClick={() => captureBaseline(metrics.id)}
                                        disabled={baseliningProjectId === metrics.id}
                                        className="baseline-btn"
                                        style={{
                                            padding: '0.4rem 0.6rem',
                                            background: baseliningProjectId === metrics.id ? 'var(--muted)' : '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.6rem',
                                            fontWeight: 800,
                                            color: baseliningProjectId === metrics.id ? 'var(--muted-fg)' : '#64748b',
                                            cursor: baseliningProjectId === metrics.id ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.3rem'
                                        }}
                                        title="Lock current projections as the baseline"
                                    >
                                        {baseliningProjectId === metrics.id ? (
                                            <>
                                                <div className="spinner-sm"></div>
                                                BASELINING...
                                            </>
                                        ) : (metrics.hasBaseline ? 'REBASELINE' : 'SET AS BASELINE')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    {analytics.projectMetrics.slice(0, 4).map(p => (
                        <div key={p.id} className="card" style={{ padding: '1rem 1.25rem', border: '1px solid var(--border)', background: 'var(--card-bg)', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{p.name}</span>
                                    <span style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: p.variance >= 0 ? '#dcfce7' : '#fee2e2', color: p.variance >= 0 ? '#166534' : '#991b1b', borderRadius: '4px', fontWeight: 800 }}>
                                        {p.variance >= 0 ? 'ON BUDGET' : 'OVER BUDGET'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
                                    <div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--fg)', letterSpacing: '-0.025em' }}>${Math.abs(p.variance).toLocaleString()}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800 }}>{p.variance >= 0 ? 'REMAINING SURPLUS' : 'ESTIMATED DEFICIT'}</div>
                                    </div>
                                    <div style={{ width: '130px', height: '65px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={p.history} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                                <XAxis dataKey="month" hide={false} axisLine={false} tickLine={false} tick={{ fontSize: 7, fontWeight: 700, fill: '#94a3b8' }} dy={5} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '9px', padding: '4px 8px' }}
                                                    labelStyle={{ fontWeight: 800, color: '#1e293b' }}
                                                    itemStyle={{ padding: 0 }}
                                                    formatter={(val) => [`$${Math.round(val).toLocaleString()}`, '']}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="expense"
                                                    stroke="#ef4444"
                                                    fill="#fee2e2"
                                                    strokeWidth={1.5}
                                                    dot={false}
                                                    isAnimationActive={true}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div style={{ height: '5px', width: '100%', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${Math.min(100, (p.expense / p.plannedBudget) * 100)}%`,
                                        background: p.expense > p.plannedBudget ? '#ef4444' : '#6366f1',
                                        transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}></div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                                    <span>USED: ${p.expense.toLocaleString()}</span>
                                    <span>BUDGET: ${p.plannedBudget.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', marginBottom: '2.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', margin: 0, color: '#64748b', display: 'flex', alignItems: 'center' }}>
                            <span style={{ marginRight: '0.5rem' }}>📅</span> Lifetime Cash Flow Projections: {activeProjectId === 'summary' ? 'Portfolio Overview' : analytics.projectMetrics.find(p => p.id === activeProjectId)?.name}
                        </h3>
                        <div style={{ display: 'flex', gap: '0.4rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '8px' }}>
                            <button
                                onClick={() => setActiveProjectId('summary')}
                                style={{
                                    padding: '0.3rem 0.6rem',
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                    border: 'none',
                                    background: activeProjectId === 'summary' ? '#fff' : 'transparent',
                                    color: activeProjectId === 'summary' ? '#4338ca' : '#64748b',
                                    borderRadius: '6px',
                                    boxShadow: activeProjectId === 'summary' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                SUMMARY
                            </button>
                            {analytics.projectMetrics.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setActiveProjectId(p.id)}
                                    style={{
                                        padding: '0.3rem 0.6rem',
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        border: 'none',
                                        background: activeProjectId === p.id ? '#fff' : 'transparent',
                                        color: activeProjectId === p.id ? '#4338ca' : '#64748b',
                                        borderRadius: '6px',
                                        boxShadow: activeProjectId === p.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    {analytics.projectMetrics.length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No projection data available.</p>
                    ) : (
                        <div style={{ height: '350px', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border)' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={activeProjectId === 'summary' ? analytics.aggregatedHistory : analytics.projectMetrics.find(p => p.id === activeProjectId)?.history}>
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
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
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
                                                    {v.baselineInfo}: ${v.baselineCost.toLocaleString()} → Now: ${v.currentCost.toLocaleString()}
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
        </div>
    );
};

export default ProjectDashboard;
