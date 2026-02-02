import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:4001';

function UserManager({ token }) {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [projects, setProjects] = useState([]);
    const [newUser, setNewUser] = useState({ username: '', password: '', roles: [], project_ids: [] });

    // Track editing user state
    const [editingUser, setEditingUser] = useState(null); // { username, roles: [], project_ids: [] }
    const [isEditingRoles, setIsEditingRoles] = useState(false);
    const [isEditingProjects, setIsEditingProjects] = useState(false);

    useEffect(() => {
        fetchUsers();
        fetchRoles();
        fetchProjects();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_BASE}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setUsers(await res.json());
        } catch (err) { console.error(err); }
    };

    const fetchRoles = async () => {
        try {
            const res = await fetch(`${API_BASE}/roles`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setRoles(await res.json());
        } catch (err) { console.error(err); }
    };

    const fetchProjects = async () => {
        try {
            const res = await fetch(`${API_BASE}/projects`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setProjects(await res.json());
        } catch (err) { console.error(err); }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    username: newUser.username,
                    password: newUser.password,
                    roles: newUser.roles,
                    project_ids: newUser.project_ids
                })
            });

            if (res.ok) {
                setNewUser({ username: '', password: '', roles: [], project_ids: [] });
                fetchUsers();
            } else {
                const error = await res.json();
                alert(error.error || error.errors?.[0]?.msg || 'Failed to create user');
            }
        } catch (err) { console.error(err); }
    };
    // ... existing toggle functions ...
    const handleToggleNewUserRole = (roleName) => {
        setNewUser(prev => {
            const roles = prev.roles.includes(roleName)
                ? prev.roles.filter(r => r !== roleName)
                : [...prev.roles, roleName];
            return { ...prev, roles };
        });
    };

    const handleToggleNewUserProject = (projectId) => {
        setNewUser(prev => {
            const project_ids = prev.project_ids.includes(projectId)
                ? prev.project_ids.filter(id => id !== projectId)
                : [...prev.project_ids, projectId];
            return { ...prev, project_ids };
        });
    };

    const handleUpdateRoles = async (username) => {
        if (!editingUser || editingUser.username !== username) return;

        try {
            await fetch(`${API_BASE}/users/${username}/roles`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ roles: editingUser.roles })
            });
            fetchUsers();
            setEditingUser(null);
            setIsEditingRoles(false);
        } catch (err) { console.error(err); }
    };

    const handleUpdateProjects = async (username) => {
        if (!editingUser || editingUser.username !== username) return;

        try {
            await fetch(`${API_BASE}/users/${username}/projects`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ project_ids: editingUser.project_ids })
            });
            fetchUsers();
            setEditingUser(null);
            setIsEditingProjects(false);
        } catch (err) { console.error(err); }
    };

    const handleDeleteUser = async (username) => {
        if (username === 'admin') {
            alert("Cannot delete primary admin account");
            return;
        }
        if (!window.confirm(`Are you sure you want to delete user ${username}?`)) return;

        try {
            const res = await fetch(`${API_BASE}/users/${username}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchUsers();
            }
        } catch (err) { console.error(err); }
    };

    const handleToggleEditingRole = (roleName) => {
        if (!editingUser) return;
        setEditingUser(prev => {
            const roles = prev.roles.includes(roleName)
                ? prev.roles.filter(r => r !== roleName)
                : [...prev.roles, roleName];
            return { ...prev, roles };
        });
    };

    const handleToggleEditingProject = (projectId) => {
        if (!editingUser) return;
        setEditingUser(prev => {
            const project_ids = prev.project_ids.includes(projectId)
                ? prev.project_ids.filter(id => id !== projectId)
                : [...prev.project_ids, projectId];
            return { ...prev, project_ids };
        });
    };

    const startEditingRoles = (user) => {
        setEditingUser({ username: user.username, roles: user.roles, project_ids: user.project_ids });
        setIsEditingRoles(true);
        setIsEditingProjects(false);
    };

    const startEditingProjects = (user) => {
        setEditingUser({ username: user.username, roles: user.roles, project_ids: user.project_ids });
        setIsEditingProjects(true);
        setIsEditingRoles(false);
    };

    const cancelEditing = () => {
        setEditingUser(null);
        setIsEditingRoles(false);
        setIsEditingProjects(false);
    };

    return (
        <div className="card" style={{ marginTop: '2rem', background: 'transparent', border: 'none', padding: 0 }}>
            <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
                <div style={{ flex: 2 }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>System Users</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Assigned Project</th>
                                <th>Active Roles</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.username}>
                                    <td><strong>{u.username}</strong></td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                            {u.project_names && u.project_names.length > 0 ? (
                                                u.project_names.map(pn => (
                                                    <span key={pn} className="chip project" style={{ fontSize: '0.7rem' }}>{pn}</span>
                                                ))
                                            ) : (
                                                <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>None</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                            {u.roles.map(r => (
                                                <span key={r} className="chip primary" style={{ fontSize: '0.7rem' }}>{r}</span>
                                            ))}
                                            {u.roles.length === 0 && <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>No roles</span>}
                                        </div>
                                    </td>
                                    <td>
                                        {editingUser?.username === u.username ? (
                                            <div style={{ display: 'block', minWidth: '200px' }}>
                                                {isEditingRoles && (
                                                    <div style={{ marginBottom: '0.5rem' }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: 'var(--card-bg)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                                                            {roles.map(r => (
                                                                <label key={r.name} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editingUser.roles.includes(r.name)}
                                                                        onChange={() => handleToggleEditingRole(r.name)}
                                                                    />
                                                                    {r.name}
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <button onClick={() => handleUpdateRoles(u.username)} className="action-btn" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>Save Roles</button>
                                                            <button onClick={cancelEditing} className="action-btn" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'var(--muted)', color: 'var(--fg)' }}>Cancel</button>
                                                        </div>
                                                    </div>
                                                )}
                                                {isEditingProjects && (
                                                    <div style={{ marginBottom: '0.5rem' }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: 'var(--card-bg)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                                                            {projects.map(p => (
                                                                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editingUser.project_ids.includes(p.id)}
                                                                        onChange={() => handleToggleEditingProject(p.id)}
                                                                    />
                                                                    {p.name}
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <button onClick={() => handleUpdateProjects(u.username)} className="action-btn" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>Save Projects</button>
                                                            <button onClick={cancelEditing} className="action-btn" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'var(--muted)', color: 'var(--fg)' }}>Cancel</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => startEditingRoles(u)}
                                                    className="action-btn"
                                                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'var(--muted)', color: 'var(--fg)' }}
                                                >
                                                    Edit Roles
                                                </button>
                                                <button
                                                    onClick={() => startEditingProjects(u)}
                                                    className="action-btn"
                                                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'var(--muted)', color: 'var(--fg)' }}
                                                >
                                                    Edit Projects
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(u.username)}
                                                    className="action-btn"
                                                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'var(--col-danger)' }}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ flex: 1, borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Create New User</h3>
                    <form onSubmit={handleCreateUser}>
                        <div className="input-group">
                            <label>Username</label>
                            <input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} required />
                        </div>
                        <div className="input-group">
                            <label>Password</label>
                            <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required />
                        </div>
                        <div className="input-group">
                            <label>Assign Projects</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '4px' }}>
                                {projects.map(p => (
                                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={newUser.project_ids.includes(p.id)}
                                            onChange={() => handleToggleNewUserProject(p.id)}
                                        />
                                        {p.name}
                                    </label>
                                ))}
                                {projects.length === 0 && <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>No projects available</span>}
                            </div>
                        </div>
                        <div className="input-group">
                            <label>Assign Roles</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                                {roles.map(r => (
                                    <label key={r.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={newUser.roles.includes(r.name)}
                                            onChange={() => handleToggleNewUserRole(r.name)}
                                        />
                                        {r.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <button type="submit" className="action-btn" style={{ width: '100%', marginTop: '1rem' }}>Create User</button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default UserManager;
