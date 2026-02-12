import React, { useState, useEffect } from 'react';
import './index.css';
import AllocationCalendar from './components/AllocationCalendar';
import CapacityDashboard from './components/CapacityDashboard';
import ProjectDashboard from './components/ProjectDashboard';
import RoleManager from './components/RoleManager';
import UserManager from './components/UserManager';
import ProjectManager from './components/ProjectManager';
import Logo from './components/Logo';
import EmployeeManager from './components/EmployeeManager';
import Sidebar from './components/Sidebar';
import SMTPConfig from './components/SMTPConfig';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { API_BASE } from './config';

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


  const [view, setView] = useState('dashboard');
  const [adminView, setAdminView] = useState('users'); // 'users' or 'roles'
  const [masterView, setMasterView] = useState('employees'); // 'employees' or 'projects'
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [isAllocPanelOpen, setIsAllocPanelOpen] = useState(false);
  const [allocData, setAllocData] = useState(INITIAL_ALLOCATION_FORM);
  const [toasts, setToasts] = useState([]);

  // Edit/Delete state
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedAllocationId, setSelectedAllocationId] = useState(null);
  const [isAllocationListOpen, setIsAllocationListOpen] = useState(false);
  const [selectedMonthAllocations, setSelectedMonthAllocations] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

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
    if (!token) return;

    // Initial fetch
    fetchEmployees();
    fetchProjects();
    fetchAllocations();

    // Polling interval (2 seconds)
    const interval = setInterval(() => {
      fetchEmployees();
      fetchProjects();
      fetchAllocations();
    }, 30000);

    return () => clearInterval(interval);
  }, [token]);

  const canView = (permission) => {
    const perm = claims?.[permission];
    return perm === 'r' || perm === 'rw';
  };
  const canEdit = (permission) => claims?.[permission] === 'rw';

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE}/employees`, {
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

  const handleOpenAllocPanel = (employee = null, monthIdx = 0) => {
    const dates = getMonthDates(monthIdx);
    setAllocData({
      ...INITIAL_ALLOCATION_FORM,
      employeeId: employee ? employee.id : '',
      startDate: dates.start,
      endDate: dates.end
    });
    setIsEditMode(false);
    setSelectedAllocationId(null);
    setIsAllocPanelOpen(true);
  };

  const handleShowAllocationList = (employee, monthIdx, monthAllocations) => {
    setSelectedEmployee(employee);
    setSelectedMonthAllocations(monthAllocations);
    setIsAllocationListOpen(true);
  };

  const handleEditAllocation = (allocation) => {
    setAllocData({
      employeeId: allocation.employeeId,
      projectId: allocation.projectId,
      percentage: allocation.percentage,
      startDate: allocation.startDate,
      endDate: allocation.endDate
    });
    setIsEditMode(true);
    setSelectedAllocationId(allocation.id);
    setIsAllocationListOpen(false);
    setIsAllocPanelOpen(true);
  };

  const handleDeleteAllocation = async (allocationId) => {
    if (!window.confirm('Are you sure you want to delete this allocation?')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/allocations/${allocationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        addToast('Failed to delete allocation', 'error');
        return;
      }

      addToast('Allocation deleted successfully', 'success');
      fetchAllocations();
      fetchEmployees();

      // Close the list modal if no more allocations
      const remainingAllocations = selectedMonthAllocations.filter(a => a.id !== allocationId);
      if (remainingAllocations.length === 0) {
        setIsAllocationListOpen(false);
      } else {
        setSelectedMonthAllocations(remainingAllocations);
      }
    } catch (err) {
      addToast('Error deleting allocation', 'error');
    }
  };

  const handleSubmitAllocation = async (e) => {
    e.preventDefault();
    const project = projects.find(p => p.id === allocData.projectId);
    const payload = { ...allocData, projectName: project ? project.name : '' };

    try {
      const url = isEditMode
        ? `${API_BASE}/allocations/${selectedAllocationId}`
        : `${API_BASE}/allocations`;

      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
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
        addToast(`Failed to ${isEditMode ? 'update' : 'create'} allocation`, 'error');
        return;
      }

      setIsAllocPanelOpen(false);
      setIsEditMode(false);
      setSelectedAllocationId(null);
      addToast(`Allocation ${isEditMode ? 'updated' : 'created'} successfully`, 'success');
      fetchAllocations();
      fetchEmployees(); // Sum changed
    } catch (err) {
      addToast(`Error ${isEditMode ? 'updating' : 'creating'} allocation`, 'error');
    }
  };

  if (!token) {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--fg)', marginBottom: '0.5rem' }}>
              Aganya Core
            </h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--muted-fg)', fontWeight: 500 }}>
              The Performance & Efficiency Analyzing Tool
            </p>
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
    <div className="app-wrapper">
      <Sidebar
        view={view}
        setView={setView}
        theme={theme}
        setTheme={setTheme}
        handleLogout={handleLogout}
        claims={claims}
        username="System Admin"
      />

      <main className="main-content">
        <header className="old-header" style={{ display: 'none' }}>
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
            <div className="status-badge">System Admin</div>
            <button className="action-btn" onClick={handleLogout} style={{ background: 'var(--col-danger)', color: '#ffffff', padding: '0.4rem 1rem' }}>Logout</button>
          </div>
        </header>

        <div className="tabs old-tabs" style={{ display: 'none' }}>
          {canView('dashboard') && <div className={`tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</div>}
          {canView('employee_list') && <div className={`tab ${view === 'employees' ? 'active' : ''}`} onClick={() => setView('employees')}>Master record</div>}
          {canView('allocation') && <div className={`tab ${view === 'allocation' ? 'active' : ''}`} onClick={() => setView('allocation')}>Planning Board</div>}
          {canView('administration') && <div className={`tab ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>Administration</div>}
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--fg)' }}>
            {view === 'capacity' ? 'Capacity Analysis' :
              view === 'projects_analysis' ? 'Project Analysis' :
                view === 'employees' ? 'Resource Management' :
                  view === 'allocation' ? 'Planning Board' :
                    view === 'admin' ? 'Administration' : 'Resource Hub'}
          </h1>
          <p className="page-description">
            {view === 'capacity' ? 'Analyze resource loading, utilization trends, and availability.' :
              view === 'projects_analysis' ? 'Monitor project financial performance and profitability.' :
                view === 'employees' ? 'Manage employee records, skills, and rates.' :
                  view === 'allocation' ? 'Live project assignments and timeline.' :
                    view === 'admin' ? 'Configure system settings, users, and roles.' : ''}
          </p>
        </div>

        {view === 'capacity' && canView('capacity_analysis') && (
          <CapacityDashboard employees={employees} allocations={allocations} />
        )}

        {view === 'projects_analysis' && canView('project_analysis') && (
          <ProjectDashboard employees={employees} allocations={allocations} projects={projects} addToast={addToast} />
        )}

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
              <div
                className={`tab ${adminView === 'smtp' ? 'active' : ''}`}
                onClick={() => setAdminView('smtp')}
                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
              >
                Email Settings
              </div>
            </div>

            {adminView === 'users' && <UserManager token={token} addToast={addToast} />}
            {adminView === 'roles' && <RoleManager token={token} addToast={addToast} />}
            {adminView === 'smtp' && <SMTPConfig token={token} addToast={addToast} />}
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
              <EmployeeManager
                token={token}
                canEdit={canEdit}
                addToast={addToast}
                employees={employees}
                projects={projects}
                onRefresh={fetchEmployees}
                fetchAllocations={fetchAllocations}
              />
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
              onShowAllocationList={canView('allocation') ? handleShowAllocationList : undefined}
            />
          </div>
        )}

        <div className="toast-container">
          {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
        </div>

        {/* Allocation Panel */}
        <div className={`overlay ${isAllocPanelOpen ? 'open' : ''}`} onClick={() => setIsAllocPanelOpen(false)}>
          <div className="slide-over" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ margin: 0 }}>{isEditMode ? 'Edit Allocation' : 'Assign Project'}</h2>
              <button onClick={() => setIsAllocPanelOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--fg)' }}>&times;</button>
            </div>
            <form onSubmit={handleSubmitAllocation}>
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
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input type="range" min="1" max="100" value={allocData.percentage} onChange={e => setAllocData({ ...allocData, percentage: e.target.value })} style={{ flex: 1 }} />
                  <input type="number" min="1" max="100" value={allocData.percentage} onChange={e => setAllocData({ ...allocData, percentage: e.target.value })} style={{ width: '60px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label>Start Date</label>
                  <input type="date" value={allocData.startDate} onChange={e => setAllocData({ ...allocData, startDate: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>End Date</label>
                  <input type="date" value={allocData.endDate} onChange={e => setAllocData({ ...allocData, endDate: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="action-btn" style={{ width: '100%', marginTop: '2rem' }}>
                {isEditMode ? 'Update Allocation' : 'Assign Resources'}
              </button>
            </form>
          </div>
        </div>

        {/* Allocation List Modal */}
        <div className={`overlay ${isAllocationListOpen ? 'open' : ''}`} onClick={() => setIsAllocationListOpen(false)}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', margin: 'auto', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>
                {selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}'s Allocations` : 'Allocations'}
              </h2>
              <button onClick={() => setIsAllocationListOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--fg)' }}>&times;</button>
            </div>

            {selectedMonthAllocations.length === 0 ? (
              <p style={{ color: 'var(--muted-fg)', textAlign: 'center', padding: '2rem' }}>No allocations found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {selectedMonthAllocations.map(allocation => {
                  const project = projects.find(p => p.id === allocation.projectId);
                  return (
                    <div key={allocation.id} className="allocation-item" style={{
                      padding: '1rem',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--card-bg)'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                          {project ? project.name : 'Unknown Project'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--muted-fg)' }}>
                          {allocation.percentage}% • {new Date(allocation.startDate).toLocaleDateString()} - {new Date(allocation.endDate).toLocaleDateString()}
                        </div>
                      </div>
                      {canEdit('allocation') && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleEditAllocation(allocation)}
                            className="action-btn"
                            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAllocation(allocation.id)}
                            className="action-btn"
                            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'var(--col-danger)', color: 'white' }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {canEdit('allocation') && (
              <button
                onClick={() => {
                  setIsAllocationListOpen(false);
                  handleOpenAllocPanel(selectedEmployee, 0);
                }}
                className="action-btn"
                style={{ width: '100%', marginTop: '1.5rem' }}
              >
                + Add New Allocation
              </button>
            )}
          </div>
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
      </main>
    </div>
  );
}

export default App;
