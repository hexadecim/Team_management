import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell
} from 'recharts';
import { API_BASE } from '../config';
import BurnRateModal from './BurnRateModal';

const CapacityDashboard = ({ token }) => {
    const [selectedSkill, setSelectedSkill] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Data States
    const [trendData, setTrendData] = useState([]);
    const [showBurnModal, setShowBurnModal] = useState(false);
    const [benchStats, setBenchStats] = useState({ totalBench: 0, employees: [], chartData: [] });
    const [risks, setRisks] = useState({ overAllocated: [], rollingOff: [] });
    const [capacityMix, setCapacityMix] = useState({ totalCapacity: 0, allocatedCapacity: 0, mix: [] });

    const [keyStats, setKeyStats] = useState({ totalEmployees: 0, billableEmployees: 0, benchEmployees: 0, benchBurn: 0 });

    const SKILL_COLORS = [
        '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#475569'
    ];

    useEffect(() => {
        fetchAllData();

        // Polling for real-time updates (every 2 seconds)
        const intervalId = setInterval(() => {
            fetchAllData(true); // pass silence flag
        }, 2000);

        return () => clearInterval(intervalId);
    }, []);

    const fetchAllData = async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            await Promise.all([
                fetchStats(),
                fetchTrend(),
                fetchBench(),
                fetchRisks(),
                fetchMix()
            ]);
        } catch (err) {
            console.error(err);
            setError('Failed to load dashboard data');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchStats = async () => {
        const res = await fetch(`${API_BASE}/analytics/capacity/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) setKeyStats(await res.json());
    };

    const fetchTrend = async () => {
        // 1. Determine Fiscal Year (Apr - Mar)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-11

        // If Jan-Mar (0-2), we are in previous year's FY (e.g., Feb 2026 -> FY 2025-26)
        // If Apr-Dec (3-11), we are in current year's FY (e.g., Apr 2026 -> FY 2026-27)
        const startYear = currentMonth < 3 ? currentYear - 1 : currentYear;
        const endYear = startYear + 1;

        const startDate = `${startYear}-04-01`;
        const endDate = `${endYear}-03-31`;

        const res = await fetch(`${API_BASE}/analytics/capacity/trend?startDate=${startDate}&endDate=${endDate}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const rawData = await res.json();
            const processed = processTrendData(rawData, startYear);
            setTrendData(processed);
        }
    };

    const processTrendData = (rawData, startYear) => {
        // Helper to map month string to index (April=0, ..., March=11)
        const monthMap = {};
        rawData.forEach(item => {

            // Construct key YYYY-MM (pad month)
            // We can infer month number from the data if available or date parsing
            // The backend service `getUtilizationTrend` returns `year` and `month` (added in our previous plan? No, let's check service)
            // AnalyticsService returns: name ("Apr"), fullMonth, year, utilization.
            // We need to map this to our buckets.

            // Let's iterate and find matches:
            const key = `${item.year}-${String(new Date(Date.parse(item.fullMonth)).getMonth() + 1).padStart(2, '0')}`;
            monthMap[key] = item.utilization || 0;
        });

        // Define the 12 buckets for the Fiscal Year
        const months = [
            { key: `${startYear}-04`, label: 'Apr' }, { key: `${startYear}-05`, label: 'May' }, { key: `${startYear}-06`, label: 'Jun' },
            { key: `${startYear}-07`, label: 'Jul' }, { key: `${startYear}-08`, label: 'Aug' }, { key: `${startYear}-09`, label: 'Sep' },
            { key: `${startYear}-10`, label: 'Oct' }, { key: `${startYear}-11`, label: 'Nov' }, { key: `${startYear}-12`, label: 'Dec' },
            { key: `${startYear + 1}-01`, label: 'Jan' }, { key: `${startYear + 1}-02`, label: 'Feb' }, { key: `${startYear + 1}-03`, label: 'Mar' }
        ];

        return months.map(m => ({
            name: m.label,
            utilization: monthMap[m.key] || 0
        }));
    };

    const fetchBench = async () => {
        const res = await fetch(`${API_BASE}/analytics/capacity/bench`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) setBenchStats(await res.json());
    };

    const fetchRisks = async () => {
        const res = await fetch(`${API_BASE}/analytics/capacity/risks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) setRisks(await res.json());
    };

    const fetchMix = async () => {
        const res = await fetch(`${API_BASE}/analytics/capacity/mix`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) setCapacityMix(await res.json());
    };

    const handleBarClick = (data) => {
        if (data && data.activeLabel) {
            setSelectedSkill(selectedSkill === data.activeLabel ? null : data.activeLabel);
        } else if (data && data.skill) {
            setSelectedSkill(selectedSkill === data.skill ? null : data.skill);
        }
    };

    const selectedSkillEmployees = useMemo(() => {
        if (!selectedSkill) return [];
        return benchStats.chartData.find(d => d.skill === selectedSkill)?.employees || [];
    }, [selectedSkill, benchStats]);

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
                <div className="metric-card">
                    <div className="metric-label">Billable (Allocated)</div>
                    <div className="metric-value" style={{ color: '#6366f1' }}>{keyStats.billableEmployees}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        {keyStats.totalEmployees > 0 ? Math.round((keyStats.billableEmployees / keyStats.totalEmployees) * 100) : 0}% Utilization
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Bench (Unassigned)</div>
                    <div className="metric-value" style={{ color: '#eab308' }}>{keyStats.benchEmployees}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        No Active Project
                    </div>
                </div>
                <div className="metric-card" onClick={() => setShowBurnModal(true)} style={{ cursor: 'pointer' }}>
                    <div className="metric-label">Bench Cost Burn</div>
                    <div className="metric-value" style={{ color: '#ef4444' }}>
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(keyStats.benchBurn || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Monthly Unallocated Cost
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
                                <Line type="monotone" dataKey="utilization" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
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
                        <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Currently operating at <strong>{Math.round((capacityMix.allocatedCapacity / (capacityMix.totalCapacity || 1)) * 100)}%</strong> total capacity
                        </p>
                    </div>
                </div>
            </div>

            <div className="chart-container" style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2rem' }}>Bench Distribution by Skill</h2>
                {benchStats.chartData.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No employees on bench for current month.</p>
                ) : (
                    <>
                        <div style={{ width: '100%', height: 250 }}>
                            <ResponsiveContainer>
                                <BarChart data={benchStats.chartData} onClick={handleBarClick}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="skill" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} dy={10} interval={0} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} allowDecimals={false} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={50}>
                                        {benchStats.chartData.map((entry, index) => (
                                            <Cell key={`cell-bench-${index}`} fill={SKILL_COLORS[index % SKILL_COLORS.length]} fillOpacity={selectedSkill === entry.skill ? 1 : 0.7} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {selectedSkill && (
                            <div className="bench-section" style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>
                                        Employees with <span style={{ color: SKILL_COLORS[benchStats.chartData.findIndex(d => d.skill === selectedSkill) % SKILL_COLORS.length] }}>{selectedSkill}</span> skill
                                    </h3>
                                    <button onClick={() => setSelectedSkill(null)} style={{ background: 'none', border: 'none', color: 'var(--col-primary)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}>&times; Close List</button>
                                </div>
                                <div className="bench-grid">
                                    {selectedSkillEmployees.map(emp => (
                                        <div key={emp.id} className="bench-card">
                                            <div className="bench-info">
                                                <h4>{emp.firstName} {emp.lastName}</h4>
                                                <p>{emp.primarySkills.join(', ')}</p>
                                            </div>
                                            <div className="status-badge" style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fee2e2' }}>Available</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="chart-container">
                    <h2 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1.5rem', color: 'var(--col-danger)' }}>
                        ⚠️ Risk Radar: Over-allocated
                    </h2>
                    {risks.overAllocated.length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No over-allocation risks detected.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {risks.overAllocated.map(emp => (
                                <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#fff1f2', borderRadius: '8px', border: '1px solid #ffe4e6' }}>
                                    <div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{emp.firstName} {emp.lastName}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#e11d48' }}>{emp.primarySkills?.[0]}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#e11d48' }}>{emp.totalLoad}%</div>
                                        <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700 }}>Total Loading</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="chart-container">
                    <h2 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#f59e0b' }}>
                        🔮 Foresight: Rolling Off Soon
                    </h2>
                    {risks.rollingOff.length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No employees rolling off in the next 30 days.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {risks.rollingOff.map(emp => (
                                <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                                    <div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{emp.firstName} {emp.lastName}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#d97706' }}>{emp.primarySkills?.[0]}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#d97706' }}>{emp.availableFrom}</div>
                                        <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700 }}>Available From</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showBurnModal && <BurnRateModal token={token} onClose={() => setShowBurnModal(false)} />}
        </div>
    );
};

export default CapacityDashboard;
