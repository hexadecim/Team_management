import React, { useState, useEffect } from 'react';
import './index.css';
import AllocationCalendar from './components/AllocationCalendar';
import Dashboard from './components/Dashboard';
import RoleManager from './components/RoleManager';
import UserManager from './components/UserManager';
import ProjectManager from './components/ProjectManager';
import Logo from './components/Logo';
import { useSessionTimeout } from './hooks/useSessionTimeout';

const API_BASE = 'http://localhost:4001';

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  primarySkills: '',
  secondarySkills: '',
  projectName: '',
  allocation: 0
};

// monthIndex 0 = Apr, 1 = May, ..., 11 = Mar
const getMonthDates = (monthIndex) => {
  const year = monthIndex < 9 ? 2026 : 2027;
  const month = (monthIndex + 3) % 12;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  const formatDate = (d) => d.toISOString().split('T')[0];
  return { start: formatDate(start), end: formatDate(end) };
};

const INITIAL_ALLOCATION_FORM = {
  employeeId: '',
  projectId: '',
  percentage: 50,
  startDate: '',
  endDate: ''
};

const decodeToken = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('vibe-token'));
  const [claims, setClaims] = useState(token ? decodeToken(token)?.claims : {});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Browser close detection
  useEffect(() => {
    if (!token) return;

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable async logout on browser close
      const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
      navigator.sendBeacon(
        `${API_BASE}/auth/logout`,
        blob
      );
      // Note: Authorization header cannot be set with sendBeacon
      // The session will be invalidated based on cookies or other mechanisms
      // For now, we'll clear local storage
      localStorage.removeItem('vibe-token');
      localStorage.removeItem('vibe-refresh-token');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [token]);

  const [view, setView] = useState('dashboard');
  const [adminView, setAdminView] = useState('users'); // 'users' or 'roles'
  const [masterView, setMasterView] = useState('employees'); // 'employees' or 'projects'
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [search, setSearch] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isAllocPanelOpen, setIsAllocPanelOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [allocData, setAllocData] = useState(INITIAL_ALLOCATION_FORM);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts([...toasts, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleLogout = async () => {
    try {
      // Call logout endpoint
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear tokens regardless of API call result
      localStorage.removeItem('vibe-token');
      localStorage.removeItem('vibe-refresh-token');
      setToken(null);
      setClaims({});
      setView('dashboard');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        // Store both access and refresh tokens
        localStorage.setItem('vibe-token', data.accessToken);
        localStorage.setItem('vibe-refresh-token', data.refreshToken);
        setToken(data.accessToken);
        setClaims(decodeToken(data.accessToken).claims);
        addToast('Welcome back!', 'success');
      } else {
        const error = await res.json();
        addToast(error.error || 'Invalid credentials', 'error');
      }
    } catch (err) {
      addToast('Login failed', 'error');
    }
  };

  // Session timeout hook
  const { showWarning, handleStayLoggedIn } = useSessionTimeout(token, handleLogout, addToast);

  useEffect(() => {
    if (token) {
      fetchEmployees();
      fetchProjects();
      fetchAllocations();
    }
  }, [search, token]);

  const canView = (permission) => {
    const perm = claims?.[permission];
    return perm === 'r' || perm === 'rw';
  };
  const canEdit = (permission) => claims?.[permission] === 'rw';

  const fetchEmployees = async () => {
    try {
      const url = search ? `${API_BASE}/employees?q=${search}` : `${API_BASE}/employees`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setEmployees(await res.json());
      else console.error('Fetch employees failed:', res.status);
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

  const fetchAllocations = async () => {
    try {
      const res = await fetch(`${API_BASE}/allocations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setAllocations(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleOpenPanel = (employee = null) => {
    if (employee) {
      setEditingId(employee.id);
      setFormData({
        ...employee,
        primarySkills: employee.primarySkills.join(', '),
        secondarySkills: employee.secondarySkills.join(', ')
      });
    } else {
      setEditingId(null);
      setFormData(INITIAL_FORM);
    }
    setIsPanelOpen(true);
  };

  const handleOpenAllocPanel = (employee = null, monthIdx = 0) => {
    const dates = getMonthDates(monthIdx);
    setAllocData({
      ...INITIAL_ALLOCATION_FORM,
      employeeId: employee ? employee.id : '',
      startDate: dates.start,
      endDate: dates.end
    });
    setIsAllocPanelOpen(true);
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
      fetchEmployees();
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
        await fetchEmployees();
        await fetchAllocations();
      } else {
        const err = await res.json();
        console.error('[App] Delete failed:', err);
        addToast('Error removing employee', 'error');
      }
    } catch (err) {
      console.error('[App] Error during delete:', err);
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
        fetchEmployees();
      } else {
        if (data.details) {
          // Validation errors
          const errorMsg = `Upload failed:\n${data.details.join('\n')}${data.totalErrors > 10 ? `\n...and ${data.totalErrors - 10} more` : ''}`;
          alert(errorMsg);
        } else {
          addToast(data.error || 'Failed to upload employees', 'error');
        }
      }
    } catch (err) {
      console.error('[Bulk Upload Error]', err);
      addToast('Error during bulk upload', 'error');
    } finally {
      // Clear file input
      e.target.value = null;
    }
  };

  const handleSubmitAllocation = async (e) => {
    e.preventDefault();
    const project = projects.find(p => p.id === allocData.projectId);
    const payload = { ...allocData, projectName: project ? project.name : '' };

    try {
      const res = await fetch(`${API_BASE}/allocations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 400) {
        const errData = await res.json();
        addToast(errData.error, 'error');
        return;
      }

      if (!res.ok) {
        addToast('Failed to create allocation', 'error');
        return;
      }

      setIsAllocPanelOpen(false);
      addToast('Allocation successful', 'success');
      fetchAllocations();
      fetchEmployees(); // Sum changed
    } catch (err) { addToast('Error creating allocation', 'error'); }
  };

  if (!token) {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ marginBottom: '2rem' }}>
            <Logo size={140} />
          </div>
          <div className="card">
            <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Sign In</h2>
            <form onSubmit={handleLogin}>
              <div className="input-group">
                <label>Username</label>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin or employee" />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="admin or emp" />
              </div>
              <button type="submit" className="action-btn" style={{ width: '100%', marginTop: '1rem' }}>Login</button>
            </form>
          </div>
        </div>
        <div className="toast-container">
          {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>Resource System <span style={{ opacity: 0.3 }}>/</span> {
          view === 'dashboard' ? 'Analytics Dashboard' :
            view === 'employees' ? 'Master record' :
              view === 'projects' ? 'Project Master' :
                view === 'allocation' ? 'Planning Board' : 'Administration'
        }</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className="action-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            style={{ background: 'transparent', color: 'var(--fg)', border: '1px solid var(--border)', padding: '0.4rem 0.8rem' }}
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
          <div className="status-badge">Sanjay Rana Product</div>
          <button className="action-btn" onClick={handleLogout} style={{ background: 'var(--col-danger)', color: '#ffffff', padding: '0.4rem 1rem' }}>Logout</button>
        </div>
      </header>

      <div className="tabs">
        {canView('dashboard') && <div className={`tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</div>}
        {canView('employee_list') && <div className={`tab ${view === 'employees' ? 'active' : ''}`} onClick={() => setView('employees')}>Master record</div>}
        {canView('allocation') && <div className={`tab ${view === 'allocation' ? 'active' : ''}`} onClick={() => setView('allocation')}>Planning Board</div>}
        {canView('administration') && <div className={`tab ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>Administration</div>}
      </div>

      {view === 'dashboard' && canView('dashboard') && <Dashboard employees={employees} allocations={allocations} />}

      {view === 'admin' && canView('administration') && (
        <div className="card">
          <div className="tabs" style={{ marginBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
            <div
              className={`tab ${adminView === 'users' ? 'active' : ''}`}
              onClick={() => setAdminView('users')}
              style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
            >
              User Management
            </div>
            <div
              className={`tab ${adminView === 'roles' ? 'active' : ''}`}
              onClick={() => setAdminView('roles')}
              style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
            >
              Role Management
            </div>
          </div>

          {adminView === 'users' && <UserManager token={token} />}
          {adminView === 'roles' && <RoleManager token={token} />}
        </div>
      )}

      {view === 'employees' && (
        <div className="card">
          <div className="tabs" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            <div
              className={`tab ${masterView === 'employees' ? 'active' : ''}`}
              onClick={() => setMasterView('employees')}
              style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
            >
              Employee Master
            </div>
            {canView('administration') && (
              <div
                className={`tab ${masterView === 'projects' ? 'active' : ''}`}
                onClick={() => setMasterView('projects')}
                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
              >
                Project Master
              </div>
            )}
          </div>

          {masterView === 'employees' && canView('employee_list') && (
            <>
              <div className="control-bar" style={{ marginBottom: '1rem' }}>
                <div className="search-field">
                  <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                      <th>Skills</th>
                      <th>Project</th>
                      <th>Allocation</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id}>
                        <td><strong>{emp.firstName} {emp.lastName}</strong></td>
                        <td>
                          <div className="chip-container">
                            {emp.primarySkills.map(s => <span key={s} className="chip primary">{s}</span>)}
                          </div>
                        </td>
                        <td><span className="chip project">{emp.projectName || 'Unassigned'}</span></td>
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
            </>
          )}

          {masterView === 'projects' && canView('administration') && (
            <ProjectManager
              token={token}
              projects={projects}
              onProjectCreated={fetchProjects}
              addToast={addToast}
            />
          )}
        </div>
      )}

      {view === 'allocation' && canView('allocation') && (
        <div className="card" style={{ padding: 0 }}>
          <AllocationCalendar
            employees={employees}
            allocations={allocations}
            projects={projects}
            onAddAllocation={canEdit('allocation') ? handleOpenAllocPanel : undefined}
          />
        </div>
      )}

      {/* Employee Panel */}
      <div className={`overlay ${isPanelOpen ? 'open' : ''}`} onClick={() => setIsPanelOpen(false)}>
        <div className="slide-over" onClick={e => e.stopPropagation()}>
          <h2>{editingId ? 'Edit Employee' : 'Add Employee'}</h2>
          <form onSubmit={handleSubmitEmployee} style={{ marginTop: '2rem' }}>
            <div className="input-group"><label>First Name</label><input required value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} /></div>
            <div className="input-group"><label>Last Name</label><input required value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} /></div>
            <div className="input-group"><label>Skills</label><input value={formData.primarySkills} onChange={e => setFormData({ ...formData, primarySkills: e.target.value })} /></div>
            <button type="submit" className="action-btn" style={{ width: '100%', marginTop: '2rem' }}>Save</button>
          </form>
        </div>
      </div>

      {/* Allocation Panel */}
      <div className={`overlay ${isAllocPanelOpen ? 'open' : ''}`} onClick={() => setIsAllocPanelOpen(false)}>
        <div className="slide-over" onClick={e => e.stopPropagation()}>
          <h2>Assign Project</h2>
          <form onSubmit={handleSubmitAllocation} style={{ marginTop: '2rem' }}>
            <div className="input-group">
              <label>Employee</label>
              <select value={allocData.employeeId} onChange={e => setAllocData({ ...allocData, employeeId: e.target.value })}>
                <option value="">Select Employee</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Project</label>
              <select value={allocData.projectId} onChange={e => setAllocData({ ...allocData, projectId: e.target.value })}>
                <option value="">Select Project</option>
                {projects.filter(p => !p.status || p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Allocation % ({allocData.percentage}%)</label>
              <input type="range" min="1" max="100" value={allocData.percentage} onChange={e => setAllocData({ ...allocData, percentage: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Start Month</label>
              <input type="date" value={allocData.startDate} onChange={e => setAllocData({ ...allocData, startDate: e.target.value })} />
            </div>
            <div className="input-group">
              <label>End Month</label>
              <input type="date" value={allocData.endDate} onChange={e => setAllocData({ ...allocData, endDate: e.target.value })} />
            </div>
            <button type="submit" className="action-btn" style={{ width: '100%', marginTop: '2rem' }}>Assign</button>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <div className={`overlay ${deleteConfirm ? 'open' : ''}`} onClick={() => setDeleteConfirm(null)}>
        <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', margin: 'auto', textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1rem' }}>Confirm Deletion</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '2rem' }}>
            Are you sure, want to delete <strong>{deleteConfirm?.name}</strong>?
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="action-btn" style={{ flex: 1, background: 'var(--muted)', color: 'var(--fg)' }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="action-btn" style={{ flex: 1, background: '#ef4444' }} onClick={handleDeleteEmployee}>Delete</button>
          </div>
        </div>
      </div>

      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>

      {/* Session Expiry Warning Modal */}
      <div className={`overlay ${showWarning ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', margin: 'auto', textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '1rem' }}>Session Expiring Soon</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted-fg)', marginBottom: '2rem', lineHeight: '1.6' }}>
            Your session will expire in <strong>1 minute</strong> due to inactivity.
            <br />
            Click "Stay Logged In" to continue your session.
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              className="action-btn"
              style={{ flex: 1, background: 'var(--muted)', color: 'var(--fg)' }}
              onClick={handleLogout}
            >
              Logout Now
            </button>
            <button
              className="action-btn"
              style={{ flex: 1, background: 'var(--col-primary)' }}
              onClick={handleStayLoggedIn}
            >
              Stay Logged In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
