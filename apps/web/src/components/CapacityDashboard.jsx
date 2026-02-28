import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell
} from 'recharts';
import { api } from '../utils/api';

const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

const CapacityDashboard = ({ token, formatCurrency }) => {
    const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6', '#f97316', '#64748b', '#0ea5e9', '#d946ef'];
    const BILLABLE_COLOR = '#6366f1';
    const BENCH_COLOR = '#ea580c';
    const BURN_COLOR = '#ef4444';
    const CURRENT_MONTH_INDEX = (() => {
        // Fiscal month index: Apr=0 ... Mar=11
        const m = new Date().getMonth(); // 0=Jan..11=Dec
        return (m - 3 + 12) % 12;
    })();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Data States
    const [trendData, setTrendData] = useState([]);
    const [burnTrendData, setBurnTrendData] = useState([]);
    const [employeeList, setEmployeeList] = useState([]);
    const [loadingList, setLoadingList] = useState(false);
    const [drillDownType, setDrillDownType] = useState(null); // 'billable', 'bench', or 'burn'
    const [capacityMix, setCapacityMix] = useState({ totalCapacity: 0, allocatedCapacity: 0, mix: [] });

    const [keyStats, setKeyStats] = useState({ totalEmployees: 0, billableEmployees: 0, benchEmployees: 0, benchBurn: 0 });

    useEffect(() => {
        fetchAllData();

        // Polling for real-time updates (every 2 seconds)
        const intervalId = setInterval(() => {
            fetchAllData(true); // pass silence flag
        }, 2000);

        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (drillDownType === 'billable') {
            fetchBillableList();
        } else if (drillDownType === 'bench') {
            fetchBenchList();
        } else {
            setEmployeeList([]);
        }
    }, [drillDownType]);

    const fetchBillableList = async () => {
        setLoadingList(true);
        try {
            const res = await api.get('/analytics/capacity/billable');
            if (res.ok) {
                const data = await res.json();
                setEmployeeList(data.employees || []);
            }
        } catch (err) {
            console.error('Fetch billable list error:', err);
        } finally {
            setLoadingList(false);
        }
    };

    const fetchBenchList = async () => {
        setLoadingList(true);
        try {
            const res = await api.get('/analytics/capacity/bench');
            if (res.ok) {
                const data = await res.json();
                setEmployeeList(data.employees || []);
            }
        } catch (err) {
            console.error('Fetch bench list error:', err);
        } finally {
            setLoadingList(false);
        }
    };

    const fetchAllData = async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            await Promise.all([
                fetchStats(),
                fetchTrend(),
                fetchMix(),
                fetchBurnTrend()
            ]);
        } catch (err) {
            console.error(err);
            setError('Failed to load dashboard data');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchStats = async () => {
        const res = await api.get('/analytics/capacity/stats');
        if (res.ok) setKeyStats(await res.json());
    };

    const fetchTrend = async () => {
        const { startDate, endDate, startYear } = getFiscalDates();
        const res = await api.get(`/analytics/capacity/trend?startDate=${startDate}&endDate=${endDate}`);

        if (res.ok) {
            const rawData = await res.json();
            const processed = processTrendData(rawData, startYear);
            setTrendData(processed);
        }
    };

    const fetchBurnTrend = async () => {
        const { startDate, endDate, startYear } = getFiscalDates();
        const res = await api.get(`/analytics/financial/burn-trend?startDate=${startDate}&endDate=${endDate}`);

        if (res.ok) {
            const rawData = await res.json();
            const processed = processBurnTrendData(rawData, startYear);
            setBurnTrendData(processed);
        }
    };

    const getFiscalDates = () => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const startYear = currentMonth < 3 ? currentYear - 1 : currentYear;
        const endYear = startYear + 1;
        return {
            startDate: `${startYear}-04-01`,
            endDate: `${endYear}-03-31`,
            startYear
        };
    };

    const processTrendData = (rawData, startYear) => {
        const monthMap = {};
        rawData.forEach(item => {
            const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
            monthMap[key] = {
                utilization: item.utilization || 0,
                billableCount: item.billableCount || 0,
                benchCount: item.benchCount || 0
            };
        });

        const months = getFiscalMonths(startYear);
        return months.map(m => ({
            name: m.label,
            utilization: monthMap[m.key]?.utilization || 0,
            billableCount: monthMap[m.key]?.billableCount || 0,
            benchCount: monthMap[m.key]?.benchCount || 0
        }));
    };

    const processBurnTrendData = (rawData, startYear) => {
        const monthMap = {};
        rawData.forEach(item => {
            if (item.key) monthMap[item.key] = item.burnRate || 0;
        });

        const months = getFiscalMonths(startYear);
        return months.map(m => ({
            name: m.label,
            burnRate: monthMap[m.key] || 0
        }));
    };

    const getFiscalMonths = (startYear) => [
        { key: `${startYear}-04`, label: 'Apr' }, { key: `${startYear}-05`, label: 'May' }, { key: `${startYear}-06`, label: 'Jun' },
        { key: `${startYear}-07`, label: 'Jul' }, { key: `${startYear}-08`, label: 'Aug' }, { key: `${startYear}-09`, label: 'Sep' },
        { key: `${startYear}-10`, label: 'Oct' }, { key: `${startYear}-11`, label: 'Nov' }, { key: `${startYear}-12`, label: 'Dec' },
        { key: `${startYear + 1}-01`, label: 'Jan' }, { key: `${startYear + 1}-02`, label: 'Feb' }, { key: `${startYear + 1}-03`, label: 'Mar' }
    ];

    const fetchMix = async () => {
        const res = await api.get('/analytics/capacity/mix');
        if (res.ok) setCapacityMix(await res.json());
    };



    if (loading && !trendData.length) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading capacity data...</div>;
    }

    if (error) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--col-danger)' }}>{error}</div>;
    }

    return (
        <div className="dashboard-view">
            <div className="dashboard-grid">
                <div className="metric-card">
                    <div className="metric-label">Total Employees</div>
                    <div className="metric-value">{keyStats.totalEmployees}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Total Headcount
                    </div>
                </div>
                <div className="metric-card" onClick={() => setDrillDownType('billable')} style={{ cursor: 'pointer' }}>
                    <div className="metric-label">Billable ({currentMonthName})</div>
                    <div className="metric-value" style={{ color: '#089466ff' }}>{keyStats.billableEmployees}</div>
                    <div style={{ fontSize: '0.7rem', color: '#089466ff', marginTop: '0.5rem' }}>
                        {keyStats.totalEmployees > 0 ? Math.round((keyStats.billableEmployees / keyStats.totalEmployees) * 100) : 0}% Average Utilization.
                    </div>
                </div>
                <div className="metric-card" onClick={() => setDrillDownType('bench')} style={{ cursor: 'pointer' }}>
                    <div className="metric-label">Bench ({currentMonthName})</div>
                    <div className="metric-value" style={{ color: '#f43444ff' }}>{keyStats.benchEmployees}</div>
                    <div style={{ fontSize: '0.7rem', color: '#f43444ff', marginTop: '0.5rem' }}>
                        Not Assigned to any Project
                    </div>
                </div>
                <div className="metric-card" onClick={() => setDrillDownType('burn')} style={{ cursor: 'pointer' }}>
                    <div className="metric-label">Bench Cost Burn</div>
                    <div className="metric-value" style={{ color: '#ef4444' }}>
                        {formatCurrency(keyStats.benchBurn || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        {currentMonthName} Unallocated Cost
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="chart-container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase' }}>Monthly Utilization Trend</h2>
                    </div>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} unit="%" />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                                <Line type="monotone" dataKey="utilization" stroke="#4447efff" strokeWidth={3} dot={{ r: 4, fill: '#4447efff', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-container">
                    <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2rem' }}>Capacity Mix</h2>
                    <div style={{ width: '100%', height: 250, position: 'relative' }}>
                        <ResponsiveContainer>
                            <BarChart layout="vertical" data={capacityMix.mix}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                                    {capacityMix.mix && capacityMix.mix.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.75rem', color: '#dcb7f8ff' }}>
                            Currently operating at <strong>{Math.round((capacityMix.allocatedCapacity / (capacityMix.totalCapacity || 1)) * 100)}%</strong> total capacity
                        </p>
                    </div>
                </div>
            </div>



            {drillDownType && (
                <div className="overlay open" onClick={() => setDrillDownType(null)}>
                    <div className="glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '860px', width: '92%', padding: '2rem', position: 'relative', borderRadius: '16px' }}>

                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg)' }}>
                                    {drillDownType === 'billable' ? 'Billable Headcount Trend' :
                                        drillDownType === 'bench' ? 'Bench Headcount Trend' :
                                            'Bench Cost Burn Trend'}
                                </h2>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#aacbf9ff' }}>
                                    Monthly breakdown for the current fiscal year · <strong style={{ color: drillDownType === 'billable' ? BILLABLE_COLOR : drillDownType === 'bench' ? BENCH_COLOR : BURN_COLOR }}>{currentMonthName}</strong> highlighted
                                </p>
                            </div>
                            <button onClick={() => setDrillDownType(null)} style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--fg)', borderRadius: '8px', padding: '0.4rem 0.9rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>✕ Close</button>
                        </div>

                        {/* Trend Bar Chart */}
                        <div style={{ width: '100%', height: 300, marginBottom: '2rem' }}>
                            <ResponsiveContainer>
                                <BarChart data={drillDownType === 'burn' ? burnTrendData : trendData} barCategoryGap="30%">
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border, #e2e8f0)" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} dy={8} />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fontWeight: 600, fill: '#64748b' }}
                                        tickFormatter={value => drillDownType === 'burn' ? (value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)) : String(value)}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                                        formatter={(value) => drillDownType === 'burn' ? [formatCurrency(value), 'Bench Burn'] : [value, drillDownType === 'billable' ? 'Billable' : 'Bench']}
                                        contentStyle={{ borderRadius: '10px', border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '12px', fontWeight: 600 }}
                                    />
                                    <Bar
                                        dataKey={drillDownType === 'billable' ? 'billableCount' : (drillDownType === 'bench' ? 'benchCount' : 'burnRate')}
                                        radius={[5, 5, 0, 0]}
                                        barSize={32}
                                    >
                                        {(drillDownType === 'burn' ? burnTrendData : trendData).map((entry, index) => {
                                            const isCurrentMonth = index === CURRENT_MONTH_INDEX;
                                            const baseColor = drillDownType === 'billable' ? BILLABLE_COLOR : drillDownType === 'bench' ? BENCH_COLOR : BURN_COLOR;
                                            return (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={isCurrentMonth ? baseColor : `${baseColor}99`}
                                                    stroke={isCurrentMonth ? '#fff' : 'none'}
                                                    strokeWidth={isCurrentMonth ? 1.5 : 0}
                                                />
                                            );
                                        })}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Employee List */}
                        {(drillDownType === 'billable' || drillDownType === 'bench') && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>
                                        {drillDownType === 'billable' ? 'Currently Allocated' : 'Currently on Bench'}
                                    </h3>
                                    {!loadingList && (
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, background: drillDownType === 'billable' ? '#ede9fe' : '#fef9c3', color: drillDownType === 'billable' ? '#6366f1' : '#854d0e', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>
                                            {employeeList.length} {drillDownType === 'billable' ? 'Billable' : 'Bench'}
                                        </span>
                                    )}
                                </div>

                                {loadingList ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                                        <div style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>⏳</div>
                                        Loading employees...
                                    </div>
                                ) : employeeList.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem', maxHeight: '260px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                        {employeeList.map((emp, i) => (
                                            <div key={emp.id} style={{
                                                padding: '0.9rem 1rem',
                                                borderRadius: '10px',
                                                background: 'var(--card-bg, #f8fafc)',
                                                border: '1px solid var(--border, #e2e8f0)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.4rem'
                                            }}>
                                                {/* Avatar + Name row */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                    <div style={{
                                                        width: 32, height: 32,
                                                        borderRadius: '50%',
                                                        background: CHART_COLORS[i % CHART_COLORS.length],
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 800,
                                                        flexShrink: 0
                                                    }}>
                                                        {emp.firstName?.[0]}{emp.lastName?.[0]}
                                                    </div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--fg)', lineHeight: 1.2 }}>
                                                        {emp.firstName} {emp.lastName}
                                                    </div>
                                                </div>

                                                {/* Project chip */}
                                                {emp.projectName && (
                                                    <div style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 600,
                                                        color: '#6366f1',
                                                        background: '#ede9fe',
                                                        padding: '0.15rem 0.5rem',
                                                        borderRadius: '20px',
                                                        maxWidth: '100%',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {emp.projectName}
                                                    </div>
                                                )}

                                                {/* Allocation % if available */}
                                                {emp.allocation !== undefined && emp.allocation > 0 && (
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                        <span style={{ fontWeight: 800, color: '#10b981' }}>{emp.allocation}%</span> allocated
                                                    </div>
                                                )}

                                                {/* Skills if no project */}
                                                {!emp.projectName && emp.primarySkills?.length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                        {emp.primarySkills.slice(0, 3).map(skill => (
                                                            <span key={skill} style={{ fontSize: '0.65rem', fontWeight: 600, background: '#f1f5f9', color: '#475569', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>{skill}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--muted, #f8fafc)', borderRadius: '12px', fontSize: '0.82rem', color: '#94a3b8', border: '1px dashed var(--border, #e2e8f0)' }}>
                                        No employees found for this category.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CapacityDashboard;
