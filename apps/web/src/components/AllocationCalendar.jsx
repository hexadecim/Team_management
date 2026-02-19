import React, { useState } from 'react';

const AllocationCalendar = ({ employees, allocations, projects, onAddAllocation, onShowAllocationList, selectedFY, onFYChange, allFYs }) => {
    const [selectedProject, setSelectedProject] = useState('');
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

    // Dynamic Pastel Colors for Projects
    const getProjectColor = (projectId) => {
        if (!projectId) return 'var(--muted)';
        // Simple hash to pick a color 1-8
        let hash = 0;
        for (let i = 0; i < projectId.length; i++) {
            hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % 8 + 1; // 1 to 8
        return `var(--pastel-${index})`;
    };

    const getAllocationsForMonth = (employeeId, monthIndex) => {
        // monthIndex 0 = Apr, 1 = May, ..., 11 = Mar
        return allocations.filter(a => {
            if (a.employeeId !== employeeId) return false;

            const start = new Date(a.startDate);
            const end = new Date(a.endDate);

            // We need to check if the allocation covers any part of the month
            // Fiscal year starts Apr - use selectedFY if available, fallback to current year
            const fyStart = selectedFY ? new Date(selectedFY.startDate) : new Date(new Date().getFullYear(), 3, 1);
            if (new Date().getMonth() < 3 && !selectedFY) fyStart.setFullYear(fyStart.getFullYear() - 1);

            const startYear = fyStart.getFullYear();
            const monthYear = monthIndex < 9 ? startYear : startYear + 1; // Apr-Dec, Jan-Mar
            const actualMonth = (monthIndex + 3) % 12; // 0=Apr -> 3 (Apr), 8=Dec -> 11 (Dec), 9=Jan -> 0 (Jan)

            const monthStart = new Date(monthYear, actualMonth, 1);
            const monthEnd = new Date(monthYear, actualMonth + 1, 0);

            return start <= monthEnd && end >= monthStart;
        });
    };

    const getTooltipText = (monthAllocations) => {
        return monthAllocations.map(allocation => {
            const project = projects.find(p => p.id === allocation.projectId);
            const projectName = project ? project.name : 'Unknown Project';
            return `${projectName} (${allocation.percentage}%)`;
        }).join(', ');
    };

    const [selectedSkills, setSelectedSkills] = useState([]);
    const [isSkillFilterOpen, setIsSkillFilterOpen] = useState(false);

    // Extract unique skills
    const allSkills = Array.from(new Set(
        employees.flatMap(e => e.primarySkills || [])
    )).sort();

    const handleSkillToggle = (skill) => {
        setSelectedSkills(prev =>
            prev.includes(skill)
                ? prev.filter(s => s !== skill)
                : [...prev, skill]
        );
    };

    const filteredEmployees = employees.filter(emp => {
        const matchesProject = selectedProject
            ? allocations.some(a => a.employeeId === emp.id && a.projectId === selectedProject)
            : true;

        const matchesSkill = selectedSkills.length > 0
            ? selectedSkills.some(s => emp.primarySkills?.includes(s))
            : true;

        return matchesProject && matchesSkill;
    });

    return (
        <div className="calendar-view">
            <div className="control-bar" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Project:</div>
                        <select
                            value={selectedProject}
                            onChange={(e) => setSelectedProject(e.target.value)}
                            style={{
                                padding: '0.4rem',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                minWidth: '150px',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="">All Projects</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Skills:</div>
                        <button
                            onClick={() => setIsSkillFilterOpen(!isSkillFilterOpen)}
                            style={{
                                padding: '0.4rem 0.8rem',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                minWidth: '200px',
                                textAlign: 'left',
                                background: 'white',
                                color: '#0f172a',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                zIndex: 45
                            }}
                        >
                            {selectedSkills.length > 0 ? `${selectedSkills.length} selected` : 'All Skills'}
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>▼</span>
                        </button>

                        {isSkillFilterOpen && (
                            <>
                                <div
                                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }}
                                    onClick={() => setIsSkillFilterOpen(false)}
                                />
                                <div className="animate-pop-in" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '0.2rem',
                                    background: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                    padding: '0.5rem',
                                    zIndex: 50,
                                    minWidth: 'max-content', // Allow width to grow
                                    maxWidth: '400px', // But cap it reasonably
                                    maxHeight: '300px',
                                    overflowY: 'auto'
                                }}>
                                    <div
                                        onClick={() => setSelectedSkills([])}
                                        style={{
                                            padding: '0.4rem',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem',
                                            color: '#64748b',
                                            borderBottom: '1px solid #f1f5f9',
                                            marginBottom: '0.4rem',
                                            textAlign: 'right'
                                        }}
                                    >
                                        Clear Selection
                                    </div>
                                    {allSkills.map(s => (
                                        <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedSkills.includes(s)}
                                                onChange={() => handleSkillToggle(s)}
                                                style={{ cursor: 'pointer', width: 'auto', margin: 0 }}
                                            />
                                            {s}
                                        </label>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {allFYs && allFYs.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>FY:</div>
                            <select
                                value={selectedFY?.id || ''}
                                onChange={(e) => {
                                    const fy = allFYs.find(f => f.id === e.target.value);
                                    if (fy && onFYChange) onFYChange(fy);
                                }}
                                style={{
                                    padding: '0.4rem',
                                    borderRadius: '4px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.85rem',
                                    minWidth: '120px',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    color: '#6366f1',
                                    background: '#f5f7ff'
                                }}
                            >
                                {allFYs.map(fy => (
                                    <option key={fy.id} value={fy.id}>{fy.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                </div>
                {(selectedProject || selectedSkills.length > 0) && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: 'auto' }}>
                        Found {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''}
                    </div>
                )}
            </div>
            <div className="calendar-header" style={{ gridTemplateColumns: '200px repeat(12, 1fr)' }}>
                <div className="calendar-header-cell">Employee</div>
                {months.map(m => (
                    <div key={m} className="calendar-header-cell">{m}</div>
                ))}
            </div>

            {
                filteredEmployees.map(emp => (
                    <div key={emp.id} className="calendar-row" style={{ gridTemplateColumns: '200px repeat(12, 1fr)' }}>
                        <div className="employee-cell">
                            {emp.firstName} {emp.lastName}
                        </div>
                        {months.map((_, idx) => {
                            const monthAllocations = getAllocationsForMonth(emp.id, idx);
                            const totalOnMonth = monthAllocations.reduce((sum, a) => sum + a.percentage, 0);

                            return (
                                <div
                                    key={idx}
                                    className="day-cell"
                                    onClick={() => {
                                        if (totalOnMonth > 0) {
                                            if (onShowAllocationList) onShowAllocationList(emp, idx, monthAllocations);
                                        } else {
                                            if (onAddAllocation) onAddAllocation(emp, idx);
                                        }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {totalOnMonth > 0 && (
                                        <div
                                            className="allocation-bar animate-growth"
                                            style={{
                                                backgroundColor: getProjectColor(monthAllocations[0]?.projectId),
                                                // Optional: If multiple projects, show a gradient or mixed indicator?
                                                // For now, taking the primary project's color
                                            }}
                                            title={getTooltipText(monthAllocations)}
                                        >
                                            {totalOnMonth}%
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))
            }
        </div >
    );
};

export default AllocationCalendar;
