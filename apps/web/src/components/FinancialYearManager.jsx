import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

const FinancialYearManager = ({ token, addToast, onFYChange }) => {
    const [years, setYears] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', startDate: '', endDate: '' });

    useEffect(() => {
        fetchYears();
    }, []);

    const fetchYears = async () => {
        try {
            const res = await fetch(`${API_BASE}/financial-years`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setYears(data);
                if (onFYChange) onFYChange(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSetCurrent = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/financial-years/${id}/current`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                addToast('Current financial year updated', 'success');
                fetchYears();
            } else {
                addToast('Failed to update current year', 'error');
            }
        } catch (err) {
            addToast('Error updating current year', 'error');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE}/financial-years`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                addToast('Financial year added successfully', 'success');
                setShowForm(false);
                setFormData({ name: '', startDate: '', endDate: '' });
                fetchYears();
            } else {
                const err = await res.json();
                addToast(err.error || 'Failed to add year', 'error');
            }
        } catch (err) {
            addToast('Error adding financial year', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this financial year?')) return;
        try {
            const res = await fetch(`${API_BASE}/financial-years/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                addToast('Financial year deleted', 'success');
                fetchYears();
            } else {
                addToast('Failed to delete year', 'error');
            }
        } catch (err) {
            addToast('Error deleting year', 'error');
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

    return (
        <div className="fy-manager">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>Manage Financial Years</h3>
                <button
                    className="action-btn"
                    onClick={() => setShowForm(!showForm)}
                    style={{ fontSize: '0.85rem' }}
                >
                    {showForm ? 'Cancel' : '+ Add Future FY'}
                </button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '2rem', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>FY Name</label>
                            <input
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. FY 2026-27"
                                style={{ padding: '0.4rem' }}
                            />
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>Start Date</label>
                            <input
                                type="date"
                                required
                                value={formData.startDate}
                                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                style={{ padding: '0.4rem' }}
                            />
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>End Date</label>
                            <input
                                type="date"
                                required
                                value={formData.endDate}
                                onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                style={{ padding: '0.4rem' }}
                            />
                        </div>
                        <button type="submit" className="action-btn" disabled={isSaving} style={{ padding: '0.5rem 1.5rem' }}>
                            {isSaving ? 'Saving...' : 'Save FY'}
                        </button>
                    </form>
                </div>
            )}

            <div className="fy-list" style={{ display: 'grid', gap: '0.75rem' }}>
                {years.map(fy => (
                    <div key={fy.id} className="card" style={{
                        padding: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: fy.isCurrent ? '2px solid #6366f1' : '1px solid #e2e8f0',
                        background: fy.isCurrent ? '#f5f7ff' : 'white'
                    }}>
                        <div>
                            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {fy.name}
                                {fy.isCurrent && (
                                    <span style={{
                                        fontSize: '0.65rem',
                                        background: '#6366f1',
                                        color: 'white',
                                        padding: '0.1rem 0.4rem',
                                        borderRadius: '10px',
                                        textTransform: 'uppercase'
                                    }}>Current</span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                                {new Date(fy.startDate).toLocaleDateString()} to {new Date(fy.endDate).toLocaleDateString()}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {!fy.isCurrent && (
                                <button
                                    onClick={() => handleSetCurrent(fy.id)}
                                    className="action-btn"
                                    style={{ background: 'transparent', color: '#6366f1', border: '1px solid #6366f1', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                >
                                    Set as Current
                                </button>
                            )}
                            <button
                                onClick={() => handleDelete(fy.id)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', padding: '0.3rem' }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FinancialYearManager;
