import React, { useState } from 'react';

const API_BASE = 'http://localhost:4001';

function ProjectManager({ token, projects, onProjectCreated, addToast }) {
    const [projectName, setProjectName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
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

        try {
            const res = await fetch(`${API_BASE}/projects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: projectName,
                    ...(startDate && { start_date: startDate }),
                    ...(endDate && { end_date: endDate })
                })
            });

            if (res.ok) {
                addToast('Project created successfully', 'success');
                setProjectName('');
                setStartDate('');
                setEndDate('');
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
            <div className="control-bar" style={{ marginBottom: '2rem' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', width: '100%', flexWrap: 'wrap' }}>
                    <div className="input-group" style={{ flex: '2', minWidth: '200px', marginBottom: 0 }}>
                        <input
                            required
                            type="text"
                            placeholder="Project Name..."
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                        />
                    </div>
                    <div className="input-group" style={{ flex: '1', minWidth: '150px', marginBottom: 0 }}>
                        <input
                            type="date"
                            placeholder="Start Date (Optional)"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="input-group" style={{ flex: '1', minWidth: '150px', marginBottom: 0 }}>
                        <input
                            type="date"
                            placeholder="End Date (Optional)"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="action-btn">+ Create Project</button>
                </form>
            </div>

            <div className="card">
                <h3>Project Inventory</h3>
                <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
                    <table style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Project Name</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Deviation</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projects.map(p => {
                                const deviation = calculateDeviation(p.end_date, p.original_end_date);
                                return (
                                    <tr key={p.id}>
                                        <td><strong>{p.name}</strong></td>
                                        <td>{formatDate(p.start_date)}</td>
                                        <td>{formatDate(p.end_date)}</td>
                                        <td>
                                            {deviation && (
                                                <span className="chip" style={{
                                                    background: deviation.startsWith('+') ? 'var(--col-warning)' : 'var(--col-success)',
                                                    fontSize: '0.75rem'
                                                }}>
                                                    {deviation}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                {p.end_date && (
                                                    <button
                                                        className="action-btn"
                                                        onClick={() => handleEditClick(p)}
                                                        style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem', background: 'var(--col-info)' }}
                                                    >
                                                        Edit Date
                                                    </button>
                                                )}
                                                <button
                                                    className="action-btn"
                                                    onClick={() => handleHistoryClick(p)}
                                                    style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem', background: 'var(--muted)', color: 'var(--fg)' }}
                                                >
                                                    History
                                                </button>
                                                <button
                                                    className="action-btn"
                                                    onClick={() => handleDeleteClick(p.id, p.name)}
                                                    style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem', background: 'var(--col-danger)' }}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {projects.length === 0 && <p style={{ opacity: 0.5, textAlign: 'center', marginTop: '1rem' }}>No projects found.</p>}
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

