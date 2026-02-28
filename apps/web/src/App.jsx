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
import FinancialYearManager from './components/FinancialYearManager';
import SystemSettings from './components/SystemSettings';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { API_BASE } from './config';
import { api } from './utils/api';
import { ConfigProvider, theme as antdTheme } from 'antd';

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  primarySkills: '',
  secondarySkills: '',
  projectName: '',
  allocation: 0
};

// monthIndex 0 = Apr, 1 = May, ..., 11 = Mar
const getMonthDates = (monthIndex, fyStartDateStr) => {
  const now = new Date();

  // Parse fyStartDate or fallback to current FY logic
  let startYear;
  if (fyStartDateStr) {
    startYear = new Date(fyStartDateStr).getFullYear();
  } else {
    startYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  }

  const year = monthIndex < 9 ? startYear : startYear + 1;
  const month = (monthIndex + 3) % 12; // 0-11 (Jan-Dec)

  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;

  // If it's the current month, start from TODAY so allocation is active immediately
  const start = new Date(year, month, isCurrentMonth ? Math.min(now.getDate(), 20) : 1); // Cap start at 20th if it's current month
  const end = new Date(year, month + 1, 0);

  // Helper to account for timezone offset
  const toLocalISO = (d) => {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  return { start: toLocalISO(start), end: toLocalISO(end) };
};

const getCurrentMonthIndex = () => {
  // Apr=0, ..., Mar=11
  return (new Date().getMonth() + 9) % 12;
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
  const [claims, setClaims] = useState(token ? (decodeToken(token)?.claims || {}) : {});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);


  const [view, setView] = useState('capacity');
  const [adminView, setAdminView] = useState('users'); // 'users' or 'roles'
  const [masterView, setMasterView] = useState('employees'); // 'employees' or 'projects'
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [isAllocPanelOpen, setIsAllocPanelOpen] = useState(false);
  const [allocData, setAllocData] = useState(INITIAL_ALLOCATION_FORM);
  const [toasts, setToasts] = useState([]);

  // Financial Year State
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFY, setSelectedFY] = useState(null);

  // Partial Delete State
  const [isPartialDeleteModalOpen, setIsPartialDeleteModalOpen] = useState(false);
  const [allocationToPartialDelete, setAllocationToPartialDelete] = useState(null);
  const [partialDeleteDates, setPartialDeleteDates] = useState({ start: '', end: '' });

  // System Settings
  const [systemSettings, setSystemSettings] = useState({ currency: 'USD' });

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
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('vibe-token');
      localStorage.removeItem('vibe-refresh-token');
      setToken(null);
      setClaims({});
      setView('capacity');
    }
  };

  const glassTheme = {
    algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      borderRadius: 12,
      colorBgContainer: theme === 'dark' ? 'rgba(12, 74, 110, 0.4)' : 'rgba(255, 255, 255, 0.4)',
      colorBgElevated: theme === 'dark' ? 'rgba(12, 74, 110, 0.8)' : 'rgba(255, 255, 255, 0.8)',
    },
    components: {
      Button: { borderRadius: 10 },
      Card: { borderRadius: 16 }
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
        localStorage.setItem('vibe-token', data.accessToken);
        localStorage.setItem('vibe-refresh-token', data.refreshToken);
        setToken(data.accessToken);
        const decoded = decodeToken(data.accessToken);
        setClaims(decoded ? decoded.claims : {});
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

    fetchAllocations();
    fetchProjects();
    fetchEmployees();
    fetchFinancialYears();
    fetchSettings();
  }, [token]);

  const canView = (permission) => {
    const perm = claims?.[permission];
    return perm === 'r' || perm === 'rw';
  };
  const canEdit = (permission) => claims?.[permission] === 'rw';

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/employees');
      if (res.ok) setEmployees(await res.json());
      else console.error('Fetch employees failed:', res.status);
    } catch (err) { console.error(err); }
  };

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects');
      if (res.ok) setProjects(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchAllocations = async () => {
    try {
      const res = await api.get('/allocations');
      if (res.ok) setAllocations(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.ok) setSystemSettings(await res.json());
    } catch (err) { console.error(err); }
  };

  const formatCurrency = (amount, maximumFractionDigits = 0) => {
    const currency = systemSettings.currency || 'USD';
    const mapping = {
      'USD': { locale: 'en-US', currency: 'USD' },
      'INR': { locale: 'en-IN', currency: 'INR' },
      'EUR': { locale: 'de-DE', currency: 'EUR' }
    };
    const { locale, currency: currCode } = mapping[currency] || mapping.USD;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currCode,
      maximumFractionDigits
    }).format(amount || 0);
  };

  const fetchFinancialYears = async () => {
    try {
      const res = await api.get('/financial-years');
      if (res.ok) {
        const data = await res.json();
        setFinancialYears(data);
        const current = data.find(fy => fy.isCurrent);
        if (current && !selectedFY) {
          setSelectedFY(current);
        }
      }
    } catch (err) {
      console.error('Fetch FY failed:', err);
    }
  };

  const handleOpenAllocPanel = (employee = null, monthIdx = getCurrentMonthIndex()) => {
    const dates = getMonthDates(monthIdx, selectedFY?.startDate);
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

  const handleDeleteAllocation = (allocation) => {
    setAllocationToPartialDelete(allocation);
    setPartialDeleteDates({ start: allocation.startDate, end: allocation.endDate });
    setIsPartialDeleteModalOpen(true);
  };

  const handleConfirmDeleteFull = async () => {
    if (!allocationToPartialDelete) return;
    if (!window.confirm('Delete FULL allocation?')) return;

    try {
      const res = await api.delete(`/allocations/${allocationToPartialDelete.id}`);

      if (res.ok) {
        addToast('Allocation deleted successfully', 'success');
        fetchAllocations();
        setIsPartialDeleteModalOpen(false);
        setIsAllocationListOpen(false);
      } else {
        addToast('Failed to delete allocation', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error deleting allocation', 'error');
    }
  };

  const handleConfirmDeletePartial = async () => {
    if (!allocationToPartialDelete) return;

    try {
      const res = await api.post(`/allocations/${allocationToPartialDelete.id}/partial-delete`, {
        startDate: partialDeleteDates.start,
        endDate: partialDeleteDates.end
      });

      if (res.ok) {
        addToast('Allocation period deleted', 'success');
        fetchAllocations();
        setIsPartialDeleteModalOpen(false);
        setIsAllocationListOpen(false);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to delete period', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error deleting period', 'error');
    }
  };

  const handleSubmitAllocation = async (e) => {
    e.preventDefault();
    const project = projects.find(p => p.id === allocData.projectId);
    const payload = { ...allocData, projectName: project ? project.name : '' };

    try {
      const endpoint = isEditMode
        ? `/allocations/${selectedAllocationId}`
        : `/allocations`;

      const method = isEditMode ? 'put' : 'post';

      const res = await api[method](endpoint, payload);

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
    <ConfigProvider theme={glassTheme}>
      <div className="app-wrapper glass-effect">
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
              {view === 'employees' ? 'Resource Management' :
                view === 'allocation' ? 'Planning Board' :
                  view === 'admin' ? 'Administration' : ''}
            </h1>
            <p className="page-description">
              {view === 'employees' ? 'Manage employee records, skills, and rates.' :
                view === 'allocation' ? 'Live project assignments and timeline.' :
                  view === 'admin' ? 'Configure system settings, users, and roles.' : ''}
            </p>
          </div>

          {view === 'capacity' && canView('capacity_analysis') && (
            <CapacityDashboard token={token} formatCurrency={formatCurrency} />
          )}

          {view === 'projects_analysis' && canView('project_analysis') && (
            <ProjectDashboard employees={employees} allocations={allocations} projects={projects} addToast={addToast} formatCurrency={formatCurrency} systemSettings={systemSettings} />
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
                <div
                  className={`tab ${adminView === 'fy' ? 'active' : ''}`}
                  onClick={() => setAdminView('fy')}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                >
                  Financial Years
                </div>
                <div
                  className={`tab ${adminView === 'settings' ? 'active' : ''}`}
                  onClick={() => setAdminView('settings')}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                >
                  Currency Settings
                </div>
              </div>

              {adminView === 'users' && <UserManager token={token} addToast={addToast} />}
              {adminView === 'roles' && <RoleManager token={token} addToast={addToast} />}
              {adminView === 'smtp' && <SMTPConfig token={token} addToast={addToast} />}
              {adminView === 'fy' && <FinancialYearManager token={token} addToast={addToast} onFYChange={setFinancialYears} />}
              {adminView === 'settings' && <SystemSettings token={token} addToast={addToast} settings={systemSettings} onSettingsChange={fetchSettings} />}
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
                  formatCurrency={formatCurrency}
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
                selectedFY={selectedFY}
                onFYChange={setSelectedFY}
                allFYs={financialYears}
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
                            {(project && project.name && project.name.length > 0) ? project.name.charAt(0).toUpperCase() + project.name.slice(1) : 'Unknown Project'}
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
                              onClick={() => handleDeleteAllocation(allocation)}
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
                    handleOpenAllocPanel(selectedEmployee, getCurrentMonthIndex());
                  }}
                  className="action-btn"
                  style={{ width: '100%', marginTop: '1.5rem' }}
                >
                  + Add New Allocation
                </button>
              )}
            </div>
          </div>

          {/* Partial Delete Modal */}
          <div className={`overlay ${isPartialDeleteModalOpen ? 'open' : ''}`} onClick={() => setIsPartialDeleteModalOpen(false)}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', margin: 'auto', padding: '2rem' }}>
              <h2 style={{ margin: 0, marginBottom: '1.5rem' }}>Delete Allocation</h2>
              <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--muted-fg)' }}>
                Choose to delete the entire project allocation or only for a specific period.
              </p>

              <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--col-primary)', marginBottom: '1rem' }}>DELETE FOR PERIOD</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'flex-end' }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>From</label>
                    <input
                      type="date"
                      value={partialDeleteDates.start}
                      onChange={e => setPartialDeleteDates({ ...partialDeleteDates, start: e.target.value })}
                      style={{ padding: '0.3rem' }}
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>To</label>
                    <input
                      type="date"
                      value={partialDeleteDates.end}
                      onChange={e => setPartialDeleteDates({ ...partialDeleteDates, end: e.target.value })}
                      style={{ padding: '0.3rem' }}
                    />
                  </div>
                </div>
                <button
                  onClick={handleConfirmDeletePartial}
                  className="action-btn"
                  style={{ width: '100%', marginTop: '1rem', fontSize: '0.85rem', background: 'var(--col-warning)', color: '#000' }}
                >
                  Delete Selected Period
                </button>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  className="action-btn"
                  style={{ flex: 1, background: 'var(--muted)', color: 'var(--fg)' }}
                  onClick={() => setIsPartialDeleteModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="action-btn"
                  style={{ flex: 1, background: 'var(--col-danger)' }}
                  onClick={handleConfirmDeleteFull}
                >
                  Delete Full Allocation
                </button>
              </div>
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
    </ConfigProvider>
  );
}

export default App;
