import React, { useState, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell
} from 'recharts';

const CapacityDashboard = ({ employees, allocations }) => {
    const [range, setRange] = useState('Quarterly'); // Quarterly, Half-Yearly, Annual
    const [selectedSkill, setSelectedSkill] = useState(null);
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

    const SKILL_COLORS = [
        '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#475569'
    ];

    const chartData = useMemo(() => {
        return months.map((m, idx) => {
            const monthIndex = idx;
            const year = monthIndex < 9 ? 2026 : 2027;
            const actualMonth = (monthIndex + 3) % 12;

            const monthStart = new Date(year, actualMonth, 1);
            const monthEnd = new Date(year, actualMonth + 1, 0);

            const totalAllocation = allocations.reduce((sum, a) => {
                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                if (aStart <= monthEnd && aEnd >= monthStart) {
                    return sum + a.percentage;
                }
                return sum;
            }, 0);

            const avg = employees.length > 0 ? (totalAllocation / employees.length) : 0;

            return {
                name: m,
                fullMonth: `${m} ${year}`,
                utilization: Math.round(avg),
                totalLoad: totalAllocation
            };
        });
    }, [employees, allocations]);

    const filteredData = useMemo(() => {
        if (range === 'Quarterly') return chartData.slice(0, 3);
        if (range === 'Half-Yearly') return chartData.slice(0, 6);
        return chartData;
    }, [chartData, range]);

    const analytics = useMemo(() => {
        const today = new Date('2026-04-01');
        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        const currentMonthStart = new Date(2026, 3, 1);
        const currentMonthEnd = new Date(2026, 4, 0);

        const bench = employees.filter(emp => {
            const empAlloc = allocations.filter(a => {
                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                return a.employeeId === emp.id && aStart <= currentMonthEnd && aEnd >= currentMonthStart;
            });
            const total = empAlloc.reduce((sum, a) => sum + a.percentage, 0);
            return total === 0;
        });

        const skillGroups = {};
        bench.forEach(emp => {
            const primarySkill = emp.primarySkills?.[0] || 'Unspecified';
            if (!skillGroups[primarySkill]) {
                skillGroups[primarySkill] = { skill: primarySkill, count: 0, employees: [] };
            }
            skillGroups[primarySkill].count++;
            skillGroups[primarySkill].employees.push(emp);
        });
        const benchChartData = Object.values(skillGroups).sort((a, b) => b.count - a.count);

        const upcomingAvailable = employees.filter(emp => {
            const currentAllocations = allocations.filter(a => {
                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                return a.employeeId === emp.id && aStart <= currentMonthEnd && aEnd >= currentMonthStart;
            });

            if (currentAllocations.length === 0) return false;

            const latestEnd = new Date(Math.max(...currentAllocations.map(a => new Date(a.endDate))));
            return latestEnd <= thirtyDaysFromNow;
        }).map(emp => {
            const empAlloc = allocations.filter(a => a.employeeId === emp.id && new Date(a.startDate) <= currentMonthEnd && new Date(a.endDate) >= currentMonthStart);
            const latestEnd = new Date(Math.max(...empAlloc.map(a => new Date(a.endDate))));
            return { ...emp, availableFrom: latestEnd.toISOString().split('T')[0] };
        });

        const overAllocated = employees.map(emp => {
            const currentAlloc = allocations.filter(a => {
                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                return a.employeeId === emp.id && aStart <= currentMonthEnd && aEnd >= currentMonthStart;
            });
            const total = currentAlloc.reduce((sum, a) => sum + a.percentage, 0);
            return { ...emp, totalLoad: total };
        }).filter(emp => emp.totalLoad > 100);

        const totalCapacity = employees.length * 100;
        const allocatedCapacity = allocations.reduce((sum, a) => {
            const aStart = new Date(a.startDate);
            const aEnd = new Date(a.endDate);
            if (aStart <= currentMonthEnd && aEnd >= currentMonthStart) {
                return sum + a.percentage;
            }
            return sum;
        }, 0);

        const billableVsBench = [
            { name: 'Billable (Allocated)', value: allocatedCapacity, color: '#6366f1' },
            { name: 'Non-Billable (Bench)', value: Math.max(0, totalCapacity - allocatedCapacity), color: '#e2e8f0' }
        ];

        return {
            headcount: employees.length,
            avgUtil: chartData[0]?.utilization || 0,
            bench: bench,
            benchChartData,
            upcomingAvailable,
            overAllocated,
            billableVsBench,
            totalCapacity,
            allocatedCapacity
        };
    }, [employees, allocations, chartData]);

    const handleBarClick = (data) => {
        if (data && data.activeLabel) {
            setSelectedSkill(selectedSkill === data.activeLabel ? null : data.activeLabel);
        } else if (data && data.skill) {
            setSelectedSkill(selectedSkill === data.skill ? null : data.skill);
        }
    };

    const selectedSkillEmployees = useMemo(() => {
        if (!selectedSkill) return [];
        return analytics.benchChartData.find(d => d.skill === selectedSkill)?.employees || [];
    }, [selectedSkill, analytics.benchChartData]);

    return (
        <div className="dashboard-view">
            <div className="dashboard-grid">
                <div className="metric-card">
                    <div className="metric-label">Avg Allocation (Apr)</div>
                    <div className="metric-value">{analytics.avgUtil}%</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        {analytics.allocatedCapacity} / {analytics.totalCapacity} total units
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Current Bench</div>
                    <div className="metric-value">{analytics.bench.length}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        {Math.round((analytics.bench.length / analytics.headcount) * 100)}% of workforce
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">At Risk (Over-allocated)</div>
                    <div className="metric-value" style={{ color: analytics.overAllocated.length > 0 ? 'var(--col-danger)' : 'inherit' }}>
                        {analytics.overAllocated.length}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Load exceeding 100% capacity
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Pipeline (Soon to Bench)</div>
                    <div className="metric-value" style={{ color: '#f59e0b' }}>{analytics.upcomingAvailable.length}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Becoming available in 30 days
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="chart-container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase' }}>Utilization Trend</h2>
                        <div className="toggle-group">
                            {['Quarterly', 'Half-Yearly', 'Annual'].map(r => (
                                <button
                                    key={r}
                                    className={`toggle-btn ${range === r ? 'active' : ''}`}
                                    onClick={() => setRange(r)}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <LineChart data={filteredData}>
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
                            <BarChart layout="vertical" data={analytics.billableVsBench}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                                    {analytics.billableVsBench.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Currently operating at <strong>{analytics.avgUtil}%</strong> total capacity
                        </p>
                    </div>
                </div>
            </div>

            <div className="chart-container" style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2rem' }}>Bench Distribution by Skill</h2>
                {analytics.benchChartData.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No employees on bench for current month.</p>
                ) : (
                    <>
                        <div style={{ width: '100%', height: 250 }}>
                            <ResponsiveContainer>
                                <BarChart data={analytics.benchChartData} onClick={handleBarClick}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="skill" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} dy={10} interval={0} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} allowDecimals={false} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={50}>
                                        {analytics.benchChartData.map((entry, index) => (
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
                                        Employees with <span style={{ color: SKILL_COLORS[analytics.benchChartData.findIndex(d => d.skill === selectedSkill) % SKILL_COLORS.length] }}>{selectedSkill}</span> skill
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
                    {analytics.overAllocated.length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No over-allocation risks detected.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {analytics.overAllocated.map(emp => (
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
                    {analytics.upcomingAvailable.length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No employees rolling off in the next 30 days.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {analytics.upcomingAvailable.map(emp => (
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
        </div>
    );
};

export default CapacityDashboard;
