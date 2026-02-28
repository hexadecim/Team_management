import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

function RoleManager({ token, addToast }) {
    const [roles, setRoles] = useState([]);
    const [newRole, setNewRole] = useState({
        name: '',
        permissions: {
            capacity_analysis: 'none',
            project_analysis: 'none',
            employee_list: 'none',
            allocation: 'none',
            administration: 'none'
        }
    });
    const [editingRole, setEditingRole] = useState(null); // { id, name, permissions }

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const res = await api.get('/roles');
            if (res.ok) {
                setRoles(await res.json());
            } else {
                console.error('Fetch roles failed', res.status);
            }
        } catch (err) { console.error(err); }
    };

    const handlePermChange = (roleState, setRoleState, module, value) => {
        setRoleState(prev => ({
            ...prev,
            permissions: { ...prev.permissions, [module]: value }
        }));
    };

    const handleCreateRole = async (e) => {
        e.preventDefault();
        const permissions = {};
        Object.entries(newRole.permissions).forEach(([key, val]) => {
            if (val !== 'none') permissions[key] = val;
        });

        try {
            const res = await api.post('/roles', { name: newRole.name, permissions });
            if (res.ok) {
                setNewRole({
                    name: '',
                    permissions: {
                        capacity_analysis: 'none',
                        project_analysis: 'none',
                        employee_list: 'none',
                        allocation: 'none',
                        administration: 'none'
                    }
                });
                fetchRoles();
                addToast('Role created successfully', 'success');
            } else {
                const error = await res.json();
                addToast(error.error || 'Failed to create role', 'error');
            }
        } catch (err) {
            console.error(err);
            addToast('Error creating role', 'error');
        }
    };

    const handleUpdateRole = async (e) => {
        e.preventDefault();
        const permissions = {};
        Object.entries(editingRole.permissions).forEach(([key, val]) => {
            if (val !== 'none') permissions[key] = val;
        });

        try {
            const res = await api.put(`/roles/${editingRole.id}`, { name: editingRole.name, permissions });
            if (res.ok) {
                setEditingRole(null);
                fetchRoles();
                addToast('Role updated successfully', 'success');
            } else {
                const error = await res.json();
                addToast(error.error || 'Failed to update role', 'error');
            }
        } catch (err) {
            console.error(err);
            addToast('Error updating role', 'error');
        }
    };

    const handleDeleteRole = async (id, name) => {
        if (name === 'Admin') {
            addToast("Cannot delete primary Admin role", 'error');
            return;
        }
        if (!window.confirm(`Are you sure you want to delete the "${name}" role? This might affect users assigned to this role.`)) return;

        try {
            const res = await api.delete(`/roles/${id}`);
            if (res.ok) {
                addToast('Role deleted successfully', 'success');
                fetchRoles();
            } else {
                const error = await res.json();
                addToast(error.error || 'Failed to delete role', 'error');
            }
        } catch (err) {
            console.error(err);
            addToast('Error deleting role', 'error');
        }
    };

    const startEditing = (role) => {
        const fullPerms = {
            capacity_analysis: 'none',
            project_analysis: 'none',
            employee_list: 'none',
            allocation: 'none',
            administration: 'none',
            ...role.permissions
        };
        setEditingRole({ ...role, permissions: fullPerms });
    };

    return (
        <div className="card" style={{ background: 'transparent', border: 'none', padding: 0 }}>
            <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
                <div style={{ flex: 1.5 }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Existing System Roles</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Role Name</th>
                                <th>Permissions</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.isArray(roles) && roles.map(r => (
                                <tr key={r.id}>
                                    <td><strong>{r.name}</strong></td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                            {r.permissions && Object.entries(r.permissions).map(([k, v]) => (
                                                <span key={k} className="chip project" style={{ fontSize: '0.65rem', textTransform: 'capitalize' }}>
                                                    {k.replace('_', ' ')}: {v}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => startEditing(r)}
                                                className="action-btn"
                                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'var(--muted)', color: 'var(--fg)' }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteRole(r.id, r.name)}
                                                className="action-btn"
                                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'var(--col-danger)' }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ flex: 1, borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                    {editingRole ? (
                        <>
                            <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Edit Role: {editingRole.name}</h3>
                            <form onSubmit={handleUpdateRole}>
                                <div className="input-group">
                                    <label>Role Name</label>
                                    <input value={editingRole.name} onChange={e => setEditingRole({ ...editingRole, name: e.target.value })} required className="glass-effect" style={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)', padding: '0.75rem', fontWeight: 600 }} />
                                </div>
                                {['capacity_analysis', 'project_analysis', 'employee_list', 'allocation', 'administration'].map(mod => (
                                    <div key={mod} className="input-group">
                                        <label style={{ textTransform: 'capitalize' }}>{mod.replace(/_/g, ' ')} Access</label>
                                        <select value={editingRole.permissions[mod]} onChange={e => handlePermChange(editingRole, setEditingRole, mod, e.target.value)}>
                                            <option value="none">None</option>
                                            <option value="r">Read Only</option>
                                            <option value="rw">Read-Write</option>
                                        </select>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button type="submit" className="glass-effect" style={{ flex: 1, padding: '0.8rem', background: 'var(--col-primary)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 900, fontSize: '0.85rem' }}>Update Role</button>
                                    <button type="button" onClick={() => setEditingRole(null)} className="glass-effect" style={{ flex: 1, padding: '0.8rem', background: 'var(--muted)', color: 'var(--fg)', border: 'none', borderRadius: '10px', fontWeight: 900, fontSize: '0.85rem' }}>Cancel</button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <>
                            <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Create New Role</h3>
                            <form onSubmit={handleCreateRole}>
                                <div className="input-group">
                                    <label>Role Name</label>
                                    <input
                                        value={newRole.name}
                                        onChange={e => setNewRole({ ...newRole, name: e.target.value })}
                                        required
                                        className="glass-effect"
                                        style={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)', padding: '0.75rem', fontWeight: 600 }}
                                    />
                                </div>
                                {['capacity_analysis', 'project_analysis', 'employee_list', 'allocation', 'administration'].map(mod => (
                                    <div key={mod} className="input-group">
                                        <label style={{ textTransform: 'capitalize' }}>{mod.replace(/_/g, ' ')} Access</label>
                                        <select value={newRole.permissions[mod]} onChange={e => handlePermChange(newRole, setNewRole, mod, e.target.value)}>
                                            <option value="none">None</option>
                                            <option value="r">Read Only</option>
                                            <option value="rw">Read-Write</option>
                                        </select>
                                    </div>
                                ))}
                                <button type="submit" className="glass-effect" style={{ width: '100%', marginTop: '1.5rem', padding: '0.8rem', background: 'var(--col-primary)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 900, fontSize: '0.85rem' }}>Create Role</button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default RoleManager;
