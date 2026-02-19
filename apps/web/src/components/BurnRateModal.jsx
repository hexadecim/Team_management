import React, { useState, useEffect } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { API_BASE } from '../config';

const BurnRateModal = ({ token, onClose, formatCurrency }) => {
    const [range, setRange] = useState('Annual');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
    }, [range]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Determine Fiscal Year
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth(); // 0-11

            // If Jan-Mar (0-2), we are in previous year's FY (e.g., Feb 2026 -> FY 2025-26)
            // If Apr-Dec (3-11), we are in current year's FY (e.g., Apr 2026 -> FY 2026-27)
            const startYear = currentMonth < 3 ? currentYear - 1 : currentYear;
            const endYear = startYear + 1;

            const startDate = `${startYear}-04-01`;
            const endDate = `${endYear}-03-31`;

            const res = await fetch(`${API_BASE}/analytics/financial/burn-trend?startDate=${startDate}&endDate=${endDate}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const rawData = await res.json(); // [{ name: '2025-04', burnRate: 100 }, ...]
                const processed = processData(rawData, range, startYear);
                setData(processed);
            } else {
                setError('Failed to load data');
            }
        } catch (err) {
            console.error(err);
            setError('Error loading data');
        } finally {
            setLoading(false);
        }
    };

    const processData = (rawData, viewType, startYear) => {
        // Initialize aggregation buckets
        // Map YYYY-MM to data
        const dataMap = {};
        rawData.forEach(item => {
            // Use the key returned from backend (YYYY-MM)
            if (item.key) {
                dataMap[item.key] = parseInt(item.burnRate, 10) || 0;
            }
        });

        const months = [
            { key: `${startYear}-04`, label: 'Apr' }, { key: `${startYear}-05`, label: 'May' }, { key: `${startYear}-06`, label: 'Jun' },
            { key: `${startYear}-07`, label: 'Jul' }, { key: `${startYear}-08`, label: 'Aug' }, { key: `${startYear}-09`, label: 'Sep' },
            { key: `${startYear}-10`, label: 'Oct' }, { key: `${startYear}-11`, label: 'Nov' }, { key: `${startYear}-12`, label: 'Dec' },
            { key: `${startYear + 1}-01`, label: 'Jan' }, { key: `${startYear + 1}-02`, label: 'Feb' }, { key: `${startYear + 1}-03`, label: 'Mar' }
        ];

        if (viewType === 'Annual') {
            // Return all 12 months
            return months.map(m => ({
                name: m.label,
                burnRate: dataMap[m.key] || 0
            }));
        }

        if (viewType === 'Quarterly') {
            return [
                { name: 'Q1', burnRate: (dataMap[months[0].key] || 0) + (dataMap[months[1].key] || 0) + (dataMap[months[2].key] || 0) },
                { name: 'Q2', burnRate: (dataMap[months[3].key] || 0) + (dataMap[months[4].key] || 0) + (dataMap[months[5].key] || 0) },
                { name: 'Q3', burnRate: (dataMap[months[6].key] || 0) + (dataMap[months[7].key] || 0) + (dataMap[months[8].key] || 0) },
                { name: 'Q4', burnRate: (dataMap[months[9].key] || 0) + (dataMap[months[10].key] || 0) + (dataMap[months[11].key] || 0) }
            ];
        }

        if (viewType === 'Half-Yearly') {
            const h1 = months.slice(0, 6).reduce((sum, m) => sum + (dataMap[m.key] || 0), 0);
            const h2 = months.slice(6, 12).reduce((sum, m) => sum + (dataMap[m.key] || 0), 0);
            return [
                { name: 'H1', burnRate: h1 },
                { name: 'H2', burnRate: h2 }
            ];
        }

        return [];
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000, backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'white', padding: '2rem', borderRadius: '12px',
                width: '800px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Bench Cost Burn Trend</h2>
                        <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                            Monthly cost of unallocated resources
                        </p>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b'
                    }}>&times;</button>
                </div>

                <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                    {['Quarterly', 'Half-Yearly', 'Annual'].map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                background: range === r ? '#ef4444' : 'white',
                                color: range === r ? 'white' : '#64748b',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                            }}
                        >
                            {r}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div style={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#64748b' }}>
                        Loading...
                    </div>
                ) : error ? (
                    <div style={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#ef4444' }}>
                        {error}
                    </div>
                ) : (
                    <div style={{ height: 400, width: '100%' }}>
                        <ResponsiveContainer>
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorBurn" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }} dy={10} />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }}
                                    tickFormatter={(value) => value >= 1000 ? `${formatCurrency(value / 1000)}k` : formatCurrency(value)}
                                />
                                <Tooltip
                                    cursor={{ stroke: '#ef4444', strokeWidth: 1, strokeDasharray: '3 3' }}
                                    formatter={(value) => formatCurrency(value)}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="burnRate"
                                    stackId="1"
                                    stroke="#ef4444"
                                    fill="url(#colorBurn)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BurnRateModal;
