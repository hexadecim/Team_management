import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:4001';

const INITIAL_FORM = {
    firstName: '',
    lastName: '',
    email: '',
    primarySkills: '',
    secondarySkills: '',
    currentProject: '',
    billableRate: 0,
    expenseRate: 0,
    allocation: 0
};

function EmployeeManager({ token, canEdit, addToast, fetchAllocations, employees: allEmployees, projects, onRefresh }) {
    const [search, setSearch] = useState('');
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [formData, setFormData] = useState(INITIAL_FORM);
    const [editingId, setEditingId] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Filter employees based on search
    const employees = allEmployees.filter(emp => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            emp.firstName.toLowerCase().includes(q) ||
            emp.lastName.toLowerCase().includes(q) ||
            (emp.email && emp.email.toLowerCase().includes(q)) ||
            (emp.primarySkills && emp.primarySkills.some(s => s.toLowerCase().includes(q))) ||
            (emp.projectName && emp.projectName.toLowerCase().includes(q))
        );
    });

    const handleOpenPanel = (employee = null) => {
        if (employee) {
            setEditingId(employee.id);
            setFormData({
                ...employee,
                email: employee.email || '',
                currentProject: employee.currentProject || '',
                billableRate: employee.billableRate || 0,
                expenseRate: employee.expenseRate || 0,
                primarySkills: employee.primarySkills ? employee.primarySkills.join(', ') : '',
                secondarySkills: employee.secondarySkills ? employee.secondarySkills.join(', ') : ''
            });
        } else {
            setEditingId(null);
            setFormData(INITIAL_FORM);
        }
        setIsPanelOpen(true);
    };

    const handleSubmitEmployee = async (e) => {
        e.preventDefault();
        const payload = {
            ...formData,
            primarySkills: formData.primarySkills.split(',').map(s => s.trim()).filter(Boolean),
            secondarySkills: formData.secondarySkills.split(',').map(s => s.trim()).filter(Boolean),
        };
        try {
            const method = editingId ? 'PUT' : 'POST';
            const url = editingId ? `${API_BASE}/employees/${editingId}` : `${API_BASE}/employees`;
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json();
                addToast(err.error || 'Failed to save employee', 'error');
                return;
            }
            setIsPanelOpen(false);
            addToast(editingId ? 'Employee updated' : 'Employee created', 'success');
            if (onRefresh) onRefresh();
        } catch (err) { addToast('Error saving employee', 'error'); }
    };

    const handleDeleteEmployee = async () => {
        if (!deleteConfirm) return;
        const { id } = deleteConfirm;

        try {
            const res = await fetch(`${API_BASE}/employees/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                addToast('Employee removed');
                if (onRefresh) await onRefresh();
                if (fetchAllocations) await fetchAllocations();
            } else {
                const err = await res.json();
                addToast(err.error || 'Error removing employee', 'error');
            }
        } catch (err) {
            addToast('Error removing employee', 'error');
        } finally {
            setDeleteConfirm(null);
        }
    };

    const handleBulkUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_BASE}/employees/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await res.json();

            if (res.ok) {
                addToast(data.message, 'success');
                if (onRefresh) onRefresh();
            } else {
                if (data.details) {
                    const errorMsg = `Upload failed:\n${data.details.join('\n')}${data.totalErrors > 10 ? `\n...and ${data.totalErrors - 10} more` : ''}`;
                    alert(errorMsg);
                } else {
                    addToast(data.error || 'Failed to upload employees', 'error');
                }
            }
        } catch (err) {
            addToast('Error during bulk upload', 'error');
        } finally {
            e.target.value = null;
        }
    };

    return (
        <>
            <div className="control-bar" style={{ marginBottom: '1rem' }}>
                <div className="search-field">
                    <input type="text" placeholder="Search by name, email, or skill..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {canEdit('employee_list') && (
                        <>
                            <input
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                id="bulk-upload-input"
                                style={{ display: 'none' }}
                                onChange={handleBulkUpload}
                            />
                            <button
                                className="action-btn"
                                style={{ background: 'var(--card-bg)', color: 'var(--fg)', border: '1px solid var(--border)' }}
                                onClick={() => document.getElementById('bulk-upload-input').click()}
                            >
                                📤 Bulk Upload
                            </button>
                            <button className="action-btn" onClick={() => handleOpenPanel()}>+ Add Employee</button>
                        </>
                    )}
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Projects</th>
                            <th>Billable / Expense</th>
                            <th>Skills</th>
                            <th>Allocation</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map(emp => (
                            <tr key={emp.id}>
                                <td>
                                    <div><strong>{emp.firstName} {emp.lastName}</strong></div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{emp.email || '-'}</div>
                                </td>
                                <td>
                                    <div className="chip-container">
                                        {emp.projectName?.split(', ').map(p => (
                                            <span key={p} className="chip project">{p}</span>
                                        ))}
                                    </div>
                                    {emp.currentProject && emp.currentProject !== emp.projectName && (
                                        <div style={{ fontSize: '0.7rem', marginTop: '0.2rem', color: 'var(--col-primary)' }}>
                                            Master: {emp.currentProject}
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <div style={{ fontSize: '0.85rem' }}>
                                        <span style={{ color: 'var(--col-success)', fontWeight: 700 }}>${emp.billableRate}</span>
                                        <span style={{ margin: '0 0.3rem', opacity: 0.3 }}>/</span>
                                        <span style={{ color: 'var(--col-danger)', fontWeight: 700 }}>${emp.expenseRate}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="chip-container">
                                        {emp.primarySkills?.map(s => <span key={s} className="chip primary">{s}</span>)}
                                        {emp.secondarySkills?.map(s => <span key={s} className="chip">{s}</span>)}
                                    </div>
                                </td>
                                <td><strong>{emp.allocation}%</strong></td>
                                <td>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {canEdit('employee_list') && (
                                            <>
                                                <button className="action-btn" style={{ padding: '0.4rem 0.8rem' }} onClick={() => handleOpenPanel(emp)}>Edit</button>
                                                <button className="action-btn" style={{ padding: '0.4rem 0.8rem', background: '#ef4444' }} onClick={() => setDeleteConfirm({ id: emp.id, name: `${emp.firstName} ${emp.lastName}` })}>Remove</button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Employee Panel */}
            <div className={`overlay ${isPanelOpen ? 'open' : ''}`} onClick={() => setIsPanelOpen(false)}>
                <div className="slide-over" onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ margin: 0 }}>{editingId ? 'Edit Employee' : 'Add Employee'}</h2>
                        <button onClick={() => setIsPanelOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--fg)' }}>&times;</button>
                    </div>
                    <form onSubmit={handleSubmitEmployee}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label>First Name</label>
                                <input required value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Last Name</label>
                                <input required value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
                            </div>
                        </div>
                        <div className="input-group">
                            <label>Email Address</label>
                            <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="employee@company.com" />
                        </div>

                        <div className="input-group">
                            <label>Designated Project (Master)</label>
                            <select
                                value={formData.currentProject}
                                onChange={e => setFormData({ ...formData, currentProject: e.target.value })}
                            >
                                <option value="">No specific project assigned</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.name}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label>Billable Rate ($/hr)</label>
                                <input type="number" step="0.01" value={formData.billableRate} onChange={e => setFormData({ ...formData, billableRate: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Expense Rate ($/hr)</label>
                                <input type="number" step="0.01" value={formData.expenseRate} onChange={e => setFormData({ ...formData, expenseRate: e.target.value })} />
                            </div>
                        </div>

                        <div className="input-group">
                            <label>Primary Skills (comma separated)</label>
                            <input value={formData.primarySkills} onChange={e => setFormData({ ...formData, primarySkills: e.target.value })} placeholder="e.g. React, Java, AWS" />
                        </div>
                        <div className="input-group">
                            <label>Secondary Skills (comma separated)</label>
                            <input value={formData.secondarySkills} onChange={e => setFormData({ ...formData, secondarySkills: e.target.value })} placeholder="e.g. Figma, SQL, Docker" />
                        </div>
                        <button type="submit" className="action-btn" style={{ width: '100%', marginTop: '2rem' }}>Save Employee</button>
                    </form>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            <div className={`overlay ${deleteConfirm ? 'open' : ''}`} onClick={() => setDeleteConfirm(null)}>
                <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', margin: 'auto', textAlign: 'center', padding: '2rem' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1rem' }}>Confirm Deletion</h2>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '2rem' }}>
                        Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
                    </p>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="action-btn" style={{ flex: 1, background: 'var(--muted)', color: 'var(--fg)' }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                        <button className="action-btn" style={{ flex: 1, background: '#ef4444' }} onClick={handleDeleteEmployee}>Delete</button>
                    </div>
                </div>
            </div>
        </>
    );
}

export default EmployeeManager;
