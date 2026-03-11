import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, Cell
} from 'recharts';
import { api } from '../utils/api';

const CostAnalysisDashboard = ({ formatCurrency }) => {
    const [reportData, setReportData] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [trendData, setTrendData] = useState([]);
    const [breakdownData, setBreakdownData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = async () => {
        try {
            const res = await api.get('/analytics/cost/margin-report');
            if (res.ok) {
                const data = await res.json();
                setReportData(data);
                if (data.length > 0 && !selectedProject) {
                    handleProjectSelect(data[0]);
                }
            }
        } catch (err) {
            console.error('Failed to fetch margin report', err);
        } finally {
            setLoading(false);
        }
    };

    const handleProjectSelect = async (project) => {
        setSelectedProject(project);
        try {
            // Fetch trend and breakdown in parallel
            const [trendRes, breakdownRes] = await Promise.all([
                api.get(`/analytics/cost/margin-trend/${project.project_id}`),
                api.get(`/analytics/cost/margin-breakdown/${project.project_id}`)
            ]);

            if (trendRes.ok) setTrendData(await trendRes.json());
            if (breakdownRes.ok) setBreakdownData(await breakdownRes.json());

        } catch (err) {
            console.error('Failed to fetch project details', err);
        }
    };

    const getMarginColor = (margin) => {
        const val = parseFloat(margin);
        if (val >= 0.25) return '#10b981'; // Good (Green)
        if (val >= 0.10) return '#f59e0b'; // Okay (Amber)
        return '#ef4444'; // Poor (Red)
    };

    if (loading) return <div className="loading">Loading Cost Analysis...</div>;

    return (
        <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.5s ease-out' }}>
            <div className="header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>Cost Analysis</h1>
                    <p style={{ opacity: 0.7, margin: '0.2rem 0 0 0' }}>Real-Time Project Margin & Timeline Report</p>
                </div>
                <button className="glass-effect action-btn" onClick={fetchReport} style={{ padding: '0.6rem 1.2rem', borderRadius: '12px' }}>
                    Refresh Data
                </button>
            </div>

            {/* Performance Overview Table */}
            <div className="card glass-effect" style={{ padding: '1.5rem', borderRadius: '24px', overflow: 'hidden' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1.2rem', fontSize: '1.1rem' }}>Project Viability Overview</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table className="analysis-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', opacity: 0.6, fontSize: '0.85rem' }}>
                                <th style={{ padding: '0.5rem 1rem' }}>Project Name</th>
                                <th>Revenue</th>
                                <th>Cost</th>
                                <th>Margin</th>
                                <th>Overrun</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportData.map(proj => (
                                <tr
                                    key={proj.project_id}
                                    onClick={() => handleProjectSelect(proj)}
                                    className={`table-row-hover ${selectedProject?.project_id === proj.project_id ? 'active-row' : ''}`}
                                    style={{
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: selectedProject?.project_id === proj.project_id ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        borderRadius: '12px'
                                    }}
                                >
                                    <td style={{ padding: '1rem', borderRadius: '12px 0 0 12px' }}>
                                        <div style={{ fontWeight: 700 }}>{proj.project_name}</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>End: {new Date(proj.end_date).toLocaleDateString()}</div>
                                    </td>
                                    <td>{formatCurrency(proj.total_revenue)}</td>
                                    <td>{formatCurrency(proj.total_cost)}</td>
                                    <td>
                                        <span style={{
                                            color: getMarginColor(proj.net_margin),
                                            fontWeight: 800,
                                            fontSize: '1rem'
                                        }}>
                                            {(proj.net_margin * 100).toFixed(1)}%
                                        </span>
                                    </td>
                                    <td>
                                        {parseFloat(proj.overrun_cost) > 0 ? (
                                            <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>
                                                +{formatCurrency(proj.overrun_cost)}
                                                <div style={{ fontSize: '0.7rem' }}>({proj.days_extended} days)</div>
                                            </span>
                                        ) : (
                                            <span style={{ opacity: 0.3 }}>—</span>
                                        )}
                                    </td>
                                    <td style={{ borderRadius: '0 12px 12px 0' }}>
                                        <div className={`status-badge ${parseFloat(proj.net_margin) > 0.15 ? 'success' : 'warning'}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem' }}>
                                            {parseFloat(proj.net_margin) > 0.15 ? 'HEALTHY' : 'AT RISK'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                <div className="card glass-effect" style={{ padding: '1.5rem', borderRadius: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Financial Drill-Down: {selectedProject?.project_name}</h3>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                            Showing {breakdownData.length} allocation segments
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table className="breakdown-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', opacity: 0.6 }}>
                                    <th style={{ padding: '0.8rem' }}>Resource</th>
                                    <th>Period</th>
                                    <th>Days</th>
                                    <th>Alloc %</th>
                                    <th>Daily Rev/Cost</th>
                                    <th>Total Revenue</th>
                                    <th>Total Cost</th>
                                    <th>Margin</th>
                                </tr>
                            </thead>
                            <tbody>
                                {breakdownData.length > 0 ? (
                                    breakdownData.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.8rem', fontWeight: 600 }}>{item.employee_name}</td>
                                            <td>
                                                <div style={{ fontSize: '0.75rem' }}>
                                                    {new Date(item.start_date).toLocaleDateString()} - {new Date(item.end_date).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td>{item.days}d</td>
                                            <td>{item.percentage}%</td>
                                            <td>
                                                <div style={{ color: '#6366f1' }}>R: {formatCurrency(item.total_revenue / item.days)}</div>
                                                <div style={{ color: '#ef4444' }}>C: {formatCurrency(item.total_cost / item.days)}</div>
                                            </td>
                                            <td style={{ fontWeight: 700, color: '#6366f1' }}>{formatCurrency(item.total_revenue)}</td>
                                            <td style={{ fontWeight: 700, color: '#ef4444' }}>{formatCurrency(item.total_cost)}</td>
                                            <td>
                                                <span style={{ color: getMarginColor(item.margin), fontWeight: 800 }}>
                                                    {(item.margin * 100).toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
                                            {selectedProject ? 'No allocation data found for this project' : 'Select a project to view details'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {breakdownData.length > 0 && (
                                <tfoot>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)', fontWeight: 800 }}>
                                        <td colSpan="5" style={{ padding: '1rem', textAlign: 'right' }}>PROJECT TOTALS:</td>
                                        <td style={{ color: '#6366f1' }}>{formatCurrency(breakdownData.reduce((sum, item) => sum + item.total_revenue, 0))}</td>
                                        <td style={{ color: '#ef4444' }}>{formatCurrency(breakdownData.reduce((sum, item) => sum + item.total_cost, 0))}</td>
                                        <td>
                                            {(() => {
                                                const rev = breakdownData.reduce((sum, item) => sum + item.total_revenue, 0);
                                                const cost = breakdownData.reduce((sum, item) => sum + item.total_cost, 0);
                                                const margin = rev > 0 ? (rev - cost) / rev : 0;
                                                return (
                                                    <span style={{ color: getMarginColor(margin) }}>
                                                        {(margin * 100).toFixed(1)}%
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
                {/* Trend Analysis */}
                <div className="card glass-effect" style={{ padding: '1.5rem', borderRadius: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Margin Trend: {selectedProject?.project_name}</h3>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', opacity: 0.7 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: 8, height: 8, background: '#6366f1', borderRadius: '50%' }}></div> Revenue
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: 8, height: 8, background: '#ef4444', borderRadius: '50%' }}></div> Cost
                            </span>
                        </div>
                    </div>

                    <div style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                                <XAxis
                                    dataKey="recorded_date"
                                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    stroke="rgba(255,255,255,0.5)"
                                    fontSize={10}
                                />
                                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} />
                                <Tooltip
                                    contentStyle={{ background: 'rgba(30, 41, 59, 0.9)', border: 'none', borderRadius: '12px', color: '#fff' }}
                                    formatter={(value) => formatCurrency(value)}
                                />
                                <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#1e293b' }} />
                                <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#1e293b' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Project Specific Details */}
                <div className="card glass-effect" style={{ padding: '1.5rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Deep Dive</h3>

                    {selectedProject ? (
                        <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
                                    <span style={{ opacity: 0.6 }}>Total Planned Budget</span>
                                    <span style={{ fontWeight: 700 }}>{formatCurrency(selectedProject.planned_budget)}</span>
                                </div>
                                <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
                                    <span style={{ opacity: 0.6 }}>Current Projected Revenue</span>
                                    <span style={{ fontWeight: 700, color: '#6366f1' }}>{formatCurrency(selectedProject.total_revenue)}</span>
                                </div>
                                <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
                                    <span style={{ opacity: 0.6 }}>Total Cost to Date</span>
                                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{formatCurrency(selectedProject.total_cost)}</span>
                                </div>
                                <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
                                    <span style={{ opacity: 0.6 }}>Net Profitability</span>
                                    <span style={{ fontWeight: 700 }}>{formatCurrency(selectedProject.total_revenue - selectedProject.total_cost)}</span>
                                </div>
                            </div>

                            <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '16px' }}>
                                <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>TIMELINE INTEGRITY</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }}>
                                        <div style={{
                                            height: '100%',
                                            width: selectedProject.original_end_date ? '100%' : '50%',
                                            background: selectedProject.days_extended > 0 ? '#ef4444' : '#10b981',
                                            borderRadius: '3px'
                                        }}></div>
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                                        {selectedProject.days_extended > 0 ? `Overrun: ${selectedProject.days_extended}d` : 'On Track'}
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>Select a project to view details</div>
                    )}
                </div>
            </div>

            <style>{`
                .active-row {
                    box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
                    transform: scale(1.005);
                    z-index: 10;
                }
                .table-row-hover:hover {
                    background: rgba(255,255,255,0.05) !important;
                }
                .status-badge {
                    display: inline-block;
                    border-radius: 6px;
                    font-weight: 700;
                }
                .status-badge.success {
                    background: rgba(16, 185, 129, 0.1);
                    color: #10b981;
                }
                .status-badge.warning {
                    background: rgba(245, 158, 11, 0.1);
                    color: #f59e0b;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default CostAnalysisDashboard;
