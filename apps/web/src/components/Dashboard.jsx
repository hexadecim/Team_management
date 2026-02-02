import React, { useState, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';

const Dashboard = ({ employees, allocations }) => {
    const [range, setRange] = useState('Quarterly'); // Quarterly, Half-Yearly, Annual
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

    const chartData = useMemo(() => {
        return months.map((m, idx) => {
            const monthIndex = idx; // 0=Apr
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

    const stats = useMemo(() => {
        const currentMonthIdx = 0; // Apr (start of fiscal)
        const year = 2026;
        const actualMonth = 3; // Apr
        const monthStart = new Date(year, actualMonth, 1);
        const monthEnd = new Date(year, actualMonth + 1, 0);

        const bench = employees.filter(emp => {
            const empAlloc = allocations.filter(a => {
                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                return a.employeeId === emp.id && aStart <= monthEnd && aEnd >= monthStart;
            });
            const total = empAlloc.reduce((sum, a) => sum + a.percentage, 0);
            return total === 0;
        });

        const totalAllocAllMonths = chartData.reduce((sum, d) => sum + d.utilization, 0);
        const avgYearlyUtil = Math.round(totalAllocAllMonths / 12);

        return {
            headcount: employees.length,
            avgUtil: chartData[0]?.utilization || 0,
            yearlyAvg: avgYearlyUtil,
            bench: bench
        };
    }, [employees, allocations, chartData]);

    return (
        <div className="dashboard-view">
            <div className="dashboard-grid">
                <div className="metric-card">
                    <div className="metric-label">Avg Allocation (Apr)</div>
                    <div className="metric-value">{stats.avgUtil}%</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Headcount</div>
                    <div className="metric-value">{stats.headcount}</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Yearly Average</div>
                    <div className="metric-value">{stats.yearlyAvg}%</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">On Bench</div>
                    <div className="metric-value">{stats.bench.length}</div>
                </div>
            </div>

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

                <div style={{ width: '100%', height: 350 }}>
                    <ResponsiveContainer>
                        <BarChart data={filteredData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                                unit="%"
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }}
                            />
                            <Bar dataKey="utilization" fill="#000" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bench-section">
                <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase' }}>Bench Report (0% Allocated in Apr)</h2>
                {stats.bench.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No employees on bench for current month.</p>
                ) : (
                    <div className="bench-grid">
                        {stats.bench.map(emp => (
                            <div key={emp.id} className="bench-card">
                                <div className="bench-info">
                                    <h4>{emp.firstName} {emp.lastName}</h4>
                                    <p>{emp.primarySkills.join(', ')}</p>
                                </div>
                                <div className="status-badge" style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fee2e2' }}>Available</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
