import React, { useState } from 'react';
import Logo from './Logo';

const Sidebar = ({
    view,
    setView,
    theme,
    setTheme,
    handleLogout,
    claims,
    username
}) => {
    const [expandedGroups, setExpandedGroups] = useState(['dashboard']); // Default open

    const canView = (permission) => {
        const perm = claims?.[permission];
        return perm === 'r' || perm === 'rw';
    };

    const toggleGroup = (groupId) => {
        setExpandedGroups(prev =>
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    };

    const menuGroups = [
        {
            title: 'Reports',
            items: [
                {
                    id: 'dashboard',
                    label: 'Dashboard',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                    ),
                    subItems: [
                        { id: 'capacity', label: 'Capacity Analysis', icon: '📊', permission: 'capacity_analysis' },
                        { id: 'projects_analysis', label: 'Project Analysis', icon: '💰', permission: 'project_analysis' },
                    ]
                },
            ]
        },
        {
            title: 'Manage',
            items: [
                {
                    id: 'employees', label: 'Master Record', icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    ), permission: 'employee_list'
                },
                {
                    id: 'allocation', label: 'Planning Board', icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ), permission: 'allocation'
                },
            ]
        },
        {
            title: 'Setup',
            items: [
                {
                    id: 'admin', label: 'Administration', icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    ), permission: 'administration'
                },
            ]
        }
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <Logo size={32} />
                <span className="sidebar-brand">Aganya</span>
            </div>

            <nav>
                {menuGroups.map((group, groupIdx) => {
                    const visibleItems = group.items.filter(item =>
                        item.subItems
                            ? item.subItems.some(si => canView(si.permission))
                            : canView(item.permission)
                    );
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={groupIdx} className="sidebar-section">
                            <h3 className="sidebar-section-title">{group.title}</h3>
                            <div className="sidebar-nav">
                                {visibleItems.map(item => {
                                    const isExpanded = expandedGroups.includes(item.id);
                                    const hasSubItems = item.subItems && item.subItems.length > 0;
                                    const isActive = view === item.id || (item.subItems && item.subItems.some(si => si.id === view));

                                    return (
                                        <div key={item.id}>
                                            <div
                                                className={`sidebar-item ${isActive && !hasSubItems ? 'active' : ''}`}
                                                onClick={() => hasSubItems ? toggleGroup(item.id) : setView(item.id)}
                                            >
                                                <span className="sidebar-item-icon">{item.icon}</span>
                                                <span>{item.label}</span>
                                                {hasSubItems && (
                                                    <span style={{ marginLeft: 'auto', display: 'flex', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                                    </span>
                                                )}
                                                {item.id === 'allocation' && <span className="badge">LIVE</span>}
                                            </div>

                                            {hasSubItems && isExpanded && (
                                                <div style={{ marginLeft: '1.5rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '1px solid var(--border)', paddingLeft: '0.5rem' }}>
                                                    {item.subItems.filter(si => canView(si.permission)).map(si => (
                                                        <div
                                                            key={si.id}
                                                            className={`sidebar-item ${view === si.id ? 'active' : ''}`}
                                                            onClick={() => setView(si.id)}
                                                            style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                                                        >
                                                            <span className="sidebar-item-icon" style={{ fontSize: '1rem', width: '16px' }}>{si.icon}</span>
                                                            <span>{si.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="sidebar-user-avatar">
                        {username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{username || 'User'}</div>
                        <div className="sidebar-user-role">{claims?.role || 'Member'}</div>
                    </div>
                </div>

                <div className="sidebar-actions">
                    <button
                        className="sidebar-action-btn"
                        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        title="Toggle Theme"
                    >
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>
                    <button
                        className="sidebar-action-btn logout"
                        onClick={handleLogout}
                        title="Logout"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Logout
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
