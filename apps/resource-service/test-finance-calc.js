const mockAllocations = [
    {
        startDate: '2026-03-01',
        endDate: '2026-03-15', // Exactly 15 days
        percentage: 100,
        employeeId: 'emp-1'
    }
];

const mockEmployeeMap = new Map([
    ['emp-1', { billableRate: 100, expenseRate: 50 }]
]);

const workingHours = 160;
const startDate = new Date('2026-03-01');
const endDate = new Date('2026-03-31');

function calculateMonthlyData(allocations, employeeMap, startDate, endDate, B) {
    const monthlyMap = new Map();
    const months = [];
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        months.push(`${year}-${month}-01`);
        current.setMonth(current.getMonth() + 1);
    }

    const A = months.length;
    console.log(`A (Total Months) = ${A}`);
    console.log(`B (Working Hours) = ${B}`);

    months.forEach(month => {
        monthlyMap.set(month, { billing: 0, expense: 0 });
    });

    allocations.forEach(allocation => {
        const employee = employeeMap.get(allocation.employeeId);
        if (!employee) return;

        const allocStart = new Date(allocation.startDate);
        const allocEnd = new Date(allocation.endDate);
        const hourlyBillableRate = parseFloat(employee.billableRate) || 0;
        const allocationPct = parseFloat(allocation.percentage) || 0;

        const dailyBillableRate = hourlyBillableRate * 8;
        const monthlyMultiplier = B / 8;

        months.forEach(monthStr => {
            const monthDate = new Date(monthStr);
            const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

            if (allocStart <= monthEnd && allocEnd >= monthDate) {
                const data = monthlyMap.get(monthStr);
                const overlapStart = allocStart > monthDate ? allocStart : monthDate;
                const overlapEnd = allocEnd < monthEnd ? allocEnd : monthEnd;

                const daysInMonth = monthEnd.getDate();
                const overlapDays = Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;

                const utilization = (allocationPct / 100) * (overlapDays / daysInMonth);
                const monthlyBillingPart = utilization * dailyBillableRate * monthlyMultiplier;

                data.billing += monthlyBillingPart;

                console.log(`Month: ${monthStr}`);
                console.log(`Daily Rate: ${dailyBillableRate.toFixed(2)} (${hourlyBillableRate}/hr * 8)`);
                console.log(`Monthly Multiplier: ${monthlyMultiplier.toFixed(2)} working days`);
                console.log(`Allocation: ${allocationPct}% over ${overlapDays}/${daysInMonth} days`);
                console.log(`Utilization_i: ${utilization.toFixed(4)}`);
                console.log(`Billing Part: ${monthlyBillingPart.toFixed(2)}`);
            }
        });
    });
}

console.log('--- Testing 15 days in March (31 days) ---');
calculateMonthlyData(mockAllocations, mockEmployeeMap, startDate, endDate, workingHours);

console.log('\n--- Testing 15 days in February (28 days) ---');
const febAllocations = [{ ...mockAllocations[0], startDate: '2026-02-01', endDate: '2026-02-14' }];
calculateMonthlyData(febAllocations, mockEmployeeMap, new Date('2026-02-01'), new Date('2026-02-28'), workingHours);
