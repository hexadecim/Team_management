import React, { useState, useEffect } from 'react';
import './index.css';
import AllocationCalendar from './components/AllocationCalendar';
import Dashboard from './components/Dashboard';

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

function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard', 'employees', or 'allocation'
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [search, setSearch] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isAllocPanelOpen, setIsAllocPanelOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [allocData, setAllocData] = useState(INITIAL_ALLOCATION_FORM);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    fetchEmployees();
    fetchProjects();
    fetchAllocations();
  }, [search]);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts([...toasts, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const fetchEmployees = async () => {
    try {
      const url = search ? `${API_BASE}/employees?q=${search}` : `${API_BASE}/employees`;
      const res = await fetch(url);
      setEmployees(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects`);
      setProjects(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchAllocations = async () => {
    try {
      const res = await fetch(`${API_BASE}/allocations`);
      setAllocations(await res.json());
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
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setIsPanelOpen(false);
      addToast(editingId ? 'Employee updated' : 'Employee created');
      fetchEmployees();
    } catch (err) { addToast('Error saving employee', 'error'); }
  };

  const handleDeleteEmployee = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;

    try {
      const res = await fetch(`${API_BASE}/employees/${id}`, { method: 'DELETE' });

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

  const handleSubmitAllocation = async (e) => {
    e.preventDefault();
    const project = projects.find(p => p.id === allocData.projectId);
    const payload = { ...allocData, projectName: project ? project.name : '' };

    try {
      const res = await fetch(`${API_BASE}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 400) {
        const errData = await res.json();
        addToast(`Capacity Exceeded: Total would be ${errData.total}%`, 'error');
        return;
      }

      setIsAllocPanelOpen(false);
      addToast('Allocation successful');
      fetchAllocations();
    } catch (err) { addToast('Error creating allocation', 'error'); }
  };

  return (
    <div className="container">
      <header>
        <h1>Resource System <span style={{ opacity: 0.3 }}>/</span> {
          view === 'dashboard' ? 'Analytics Dashboard' :
            view === 'employees' ? 'Employee List' : 'Allocation Board'
        }</h1>
        <div className="status-badge">Ecosystem Online</div>
      </header>

      <div className="tabs">
        <div className={`tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</div>
        <div className={`tab ${view === 'employees' ? 'active' : ''}`} onClick={() => setView('employees')}>Employee List</div>
        <div className={`tab ${view === 'allocation' ? 'active' : ''}`} onClick={() => setView('allocation')}>Allocation Board</div>
      </div>

      {view === 'dashboard' && <Dashboard employees={employees} allocations={allocations} />}

      {view === 'employees' && (
        <>
          <div className="control-bar">
            <div className="search-field">
              <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button className="action-btn" onClick={() => handleOpenPanel()}>+ Add Employee</button>
          </div>
          <div className="card">
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
                        <button className="action-btn" style={{ padding: '0.4rem 0.8rem' }} onClick={() => handleOpenPanel(emp)}>Edit</button>
                        <button className="action-btn" style={{ padding: '0.4rem 0.8rem', background: '#ef4444' }} onClick={() => setDeleteConfirm({ id: emp.id, name: `${emp.firstName} ${emp.lastName}` })}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'allocation' && (
        <div className="card" style={{ padding: 0 }}>
          <AllocationCalendar
            employees={employees}
            allocations={allocations}
            projects={projects}
            onAddAllocation={handleOpenAllocPanel}
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
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
    </div>
  );
}

export default App;
