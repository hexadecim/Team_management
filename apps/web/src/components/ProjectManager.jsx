import React, { useState } from 'react';

import { API_BASE } from '../config';

function ProjectManager({ token, projects, onProjectCreated, addToast }) {
    const [projectName, setProjectName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [plannedBudget, setPlannedBudget] = useState('');
    const [averageWorkingHours, setAverageWorkingHours] = useState('160');
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }
    const [editModal, setEditModal] = useState(null); // { id, name, currentEndDate }
    const [newEndDate, setNewEndDate] = useState('');
    const [changeReason, setChangeReason] = useState('');
    const [historyModal, setHistoryModal] = useState(null); // { id, name, history }

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Only validate if both dates are provided
        if ((startDate || endDate) && (!startDate || !endDate)) {
            addToast('Please provide both start and end dates, or leave both empty', 'error');
            return;
        }

        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
            addToast('End date must be after start date', 'error');
            return;
        }

        const payload = {
            name: projectName,
            ...(startDate && { start_date: startDate }),
            ...(endDate && { end_date: endDate }),
            ...(plannedBudget && { planned_budget: parseFloat(plannedBudget) }),
            average_working_hours: parseInt(averageWorkingHours) || 160
        };

        try {
            const res = await fetch(`${API_BASE}/projects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                addToast('Project created successfully', 'success');
                setProjectName('');
                setStartDate('');
                setEndDate('');
                setPlannedBudget('');
                setAverageWorkingHours('160');
                onProjectCreated();
            } else {
                const err = await res.json();
                addToast(err.error || 'Failed to create project', 'error');
            }
        } catch (err) {
            addToast('Error creating project', 'error');
        }
    };

    const handleEditClick = (project) => {
        setEditModal({
            id: project.id,
            name: project.name,
            currentEndDate: project.end_date
        });
        setNewEndDate(project.end_date || '');
        setChangeReason('');
    };

    const handleEditSubmit = async () => {
        if (!newEndDate) {
            addToast('Please provide an end date', 'error');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/projects/${editModal.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: editModal.name,
                    end_date: newEndDate,
                    change_reason: changeReason || undefined
                })
            });

            if (res.ok) {
                addToast('Project updated successfully', 'success');
                setEditModal(null);
                setNewEndDate('');
                setChangeReason('');
                onProjectCreated();
            } else {
                const err = await res.json();
                addToast(err.error || 'Failed to update project', 'error');
            }
        } catch (err) {
            addToast('Error updating project', 'error');
        }
    };

    const handleHistoryClick = async (project) => {
        try {
            const res = await fetch(`${API_BASE}/projects/${project.id}/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const history = await res.json();
                setHistoryModal({ id: project.id, name: project.name, history });
            } else {
                addToast('Failed to load history', 'error');
            }
        } catch (err) {
            addToast('Error loading history', 'error');
        }
    };

    const handleDeleteClick = (id, name) => {
        setDeleteConfirm({ id, name });
    };

    const handleDeleteConfirm = async () => {
        if (!deleteConfirm) return;

        const { id, name } = deleteConfirm;

        try {
            const res = await fetch(`${API_BASE}/projects/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                addToast('Project deleted successfully', 'success');
                onProjectCreated();
            } else {
                const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                addToast(errorData.error || 'Failed to delete project', 'error');
            }
        } catch (err) {
            addToast('Error deleting project', 'error');
        } finally {
            setDeleteConfirm(null);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const calculateDeviation = (endDate, originalEndDate) => {
        if (!endDate || !originalEndDate) return null;
        const diff = Math.floor((new Date(endDate) - new Date(originalEndDate)) / (1000 * 60 * 60 * 24));
        if (diff === 0) return null;
        return diff > 0 ? `+${diff}d` : `${diff}d`;
    };

    return (
        <div>
            <div className="card" style={{ marginBottom: '2.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'white', padding: '2rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--col-primary)', margin: 0 }}>
                        🏗️ New Project Initiation
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.4rem', fontWeight: 600 }}>
                        Define project parameters and financial baselines to start tracking performance.
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ color: '#475569', fontWeight: 800 }}>Project Identity</label>
                            <input
                                required
                                type="text"
                                placeholder="Enter project name..."
                                value={projectName}
                                onChange={e => setProjectName(e.target.value)}
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.8rem 1rem' }}
                            />
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ color: '#475569', fontWeight: 800 }}>Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.8rem 1rem' }}
                            />
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ color: '#475569', fontWeight: 800 }}>End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.8rem 1rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', alignItems: 'flex-end' }}>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ color: '#475569', fontWeight: 800 }}>Investment Budget ($)</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                value={plannedBudget}
                                onChange={e => setPlannedBudget(e.target.value)}
                                min="0"
                                step="0.01"
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.8rem 1rem' }}
                            />
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ color: '#475569', fontWeight: 800 }}>Monthly Utilization (Hrs)</label>
                            <input
                                type="number"
                                placeholder="160"
                                value={averageWorkingHours}
                                onChange={e => setAverageWorkingHours(e.target.value)}
                                min="1"
                                step="1"
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.8rem 1rem' }}
                            />
                        </div>
                        <button type="submit" className="action-btn" style={{ height: '48px', margin: 0, borderRadius: '8px', background: 'var(--col-primary)', color: 'white', fontWeight: 900 }}>
                            🚀 Initialize Project
                        </button>
                    </div>
                </form>
            </div>

            <div className="card" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>
                        📁 Project Inventory
                    </h3>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', background: '#e2e8f0', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                        {projects.length} TOTAL
                    </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Project Name</th>
                                <th>Start Date</th>
                                <th className="nowrap">End Date</th>
                                <th className="text-center">Deviation</th>
                                <th className="text-right">Budget ($)</th>
                                <th className="text-center">Hours/Mo</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projects.map(p => {
                                const dev = calculateDeviation(p.end_date, p.original_end_date);
                                return (
                                    <tr key={p.id}>
                                        <td style={{ fontWeight: 700, color: 'var(--col-primary)' }}>{p.name}</td>
                                        <td className="nowrap">{formatDate(p.start_date)}</td>
                                        <td className="nowrap">{formatDate(p.end_date)}</td>
                                        <td className="text-center">
                                            {(() => {
                                                if (!dev) return <span style={{ opacity: 0.3 }}>-</span>;
                                                const isPositive = dev.startsWith('+');
                                                return (
                                                    <span style={{
                                                        color: isPositive ? '#ef4444' : '#10b981',
                                                        fontWeight: 800,
                                                        fontSize: '0.75rem',
                                                        background: isPositive ? '#fee2e2' : '#dcfce7',
                                                        padding: '0.2rem 0.4rem',
                                                        borderRadius: '4px'
                                                    }}>
                                                        {dev}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="text-right" style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                                            {p.planned_budget ? `$${parseFloat(p.planned_budget).toLocaleString()}` : <span style={{ opacity: 0.3 }}>-</span>}
                                        </td>
                                        <td className="text-center" style={{ fontWeight: 600 }}>{p.average_working_hours || '160'}</td>
                                        <td className="text-right">
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="action-chip history"
                                                    onClick={() => handleHistoryClick(p)}
                                                    title="View Change History"
                                                >
                                                    📜
                                                </button>
                                                <button
                                                    className="action-chip edit"
                                                    onClick={() => handleEditClick(p)}
                                                    title="Edit Project"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="action-chip delete"
                                                    onClick={() => handleDeleteClick(p.id, p.name)}
                                                    title="Delete Project"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {projects.length === 0 && (
                        <div style={{ padding: '3rem', textAlign: 'center' }}>
                            <p style={{ opacity: 0.5, fontSize: '0.9rem', fontWeight: 600 }}>No projects found in the system.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit End Date Modal */}
            <div className={`overlay ${editModal ? 'open' : ''}`} onClick={() => setEditModal(null)}>
                <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', margin: 'auto', padding: '2rem' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '1rem' }}>Update End Date</h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
                        Project: <strong>{editModal?.name}</strong>
                    </p>
                    <div className="input-group">
                        <label>Current End Date: {formatDate(editModal?.currentEndDate)}</label>
                        <label style={{ marginTop: '1rem' }}>New End Date</label>
                        <input
                            type="date"
                            value={newEndDate}
                            onChange={e => setNewEndDate(e.target.value)}
                        />
                    </div>
                    <div className="input-group" style={{ marginTop: '1rem' }}>
                        <label>Reason for Change (Optional)</label>
                        <textarea
                            value={changeReason}
                            onChange={e => setChangeReason(e.target.value)}
                            placeholder="e.g., Scope expansion, resource constraints..."
                            rows="3"
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                        <button className="action-btn" style={{ flex: 1, background: 'var(--muted)', color: 'var(--fg)' }} onClick={() => setEditModal(null)}>Cancel</button>
                        <button className="action-btn" style={{ flex: 1 }} onClick={handleEditSubmit}>Update</button>
                    </div>
                </div>
            </div>

            {/* History Modal */}
            <div className={`overlay ${historyModal ? 'open' : ''}`} onClick={() => setHistoryModal(null)}>
                <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', margin: 'auto', padding: '2rem' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '1rem' }}>Date Change History</h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
                        Project: <strong>{historyModal?.name}</strong>
                    </p>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {historyModal?.history && historyModal.history.length > 0 ? (
                            historyModal.history.map((h, idx) => (
                                <div key={h.id} style={{
                                    padding: '1rem',
                                    borderLeft: '3px solid var(--col-info)',
                                    marginBottom: '1rem',
                                    background: 'var(--muted)',
                                    borderRadius: '4px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <strong style={{ textTransform: 'capitalize' }}>{h.field_changed.replace('_', ' ')}</strong>
                                        <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                                            {new Date(h.changed_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.9rem' }}>
                                        <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{formatDate(h.old_value)}</span>
                                        {' → '}
                                        <span style={{ fontWeight: 'bold' }}>{formatDate(h.new_value)}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                        Changed by: <strong>{h.changed_by}</strong>
                                    </div>
                                    {h.reason && (
                                        <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                            Reason: {h.reason}
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p style={{ textAlign: 'center', opacity: 0.5 }}>No date changes recorded</p>
                        )}
                    </div>
                    <button className="action-btn" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setHistoryModal(null)}>Close</button>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            <div className={`overlay ${deleteConfirm ? 'open' : ''}`} onClick={() => setDeleteConfirm(null)}>
                <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', margin: 'auto', textAlign: 'center', padding: '2rem' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1rem' }}>Confirm Deletion</h2>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '2rem' }}>
                        Are you sure you want to delete project <strong>"{deleteConfirm?.name}"</strong>? This will affect existing allocations.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="action-btn" style={{ flex: 1, background: 'var(--muted)', color: 'var(--fg)' }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                        <button className="action-btn" style={{ flex: 1, background: '#ef4444' }} onClick={handleDeleteConfirm}>Delete</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ProjectManager;

