import React from 'react';

const AllocationCalendar = ({ employees, allocations, projects, onAddAllocation }) => {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

    const getHeatClass = (percentage) => {
        if (percentage <= 25) return 'heat-lite';
        if (percentage <= 50) return 'heat-low';
        if (percentage <= 75) return 'heat-med';
        if (percentage < 100) return 'heat-high';
        return 'heat-max';
    };

    const getAllocationsForMonth = (employeeId, monthIndex) => {
        // monthIndex 0 = Apr, 1 = May, ..., 11 = Mar
        return allocations.filter(a => {
            if (a.employeeId !== employeeId) return false;

            const start = new Date(a.startDate);
            const end = new Date(a.endDate);

            // We need to check if the allocation covers any part of the month
            // Fiscal year starts Apr 2026
            const monthYear = monthIndex < 9 ? 2026 : 2027; // Apr-Dec 2026, Jan-Mar 2027
            const actualMonth = (monthIndex + 3) % 12; // 0=Apr -> 3 (Apr), 8=Dec -> 11 (Dec), 9=Jan -> 0 (Jan)

            const monthStart = new Date(monthYear, actualMonth, 1);
            const monthEnd = new Date(monthYear, actualMonth + 1, 0);

            return start <= monthEnd && end >= monthStart;
        });
    };

    return (
        <div className="calendar-view">
            <div className="calendar-header" style={{ gridTemplateColumns: '200px repeat(12, 1fr)' }}>
                <div className="calendar-header-cell">Employee</div>
                {months.map(m => (
                    <div key={m} className="calendar-header-cell">{m}</div>
                ))}
            </div>

            {employees.map(emp => (
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
                                onClick={() => onAddAllocation(emp, idx)}
                                style={{ cursor: 'pointer' }}
                            >
                                {totalOnMonth > 0 && (
                                    <div className={`allocation-bar ${getHeatClass(totalOnMonth)}`}>
                                        {totalOnMonth}%
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

export default AllocationCalendar;
