const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const csvWithBOM = '\uFEFFFirst name,Last name,skill\nSanya,Iyer,Full Stack Developer';

console.log('--- Testing with BOM ---');
const workbookBOM = xlsx.read(csvWithBOM, { type: 'string' });
const dataBOM = xlsx.utils.sheet_to_json(workbookBOM.Sheets[workbookBOM.SheetNames[0]]);
console.log('Parsed BOM row:', JSON.stringify(dataBOM[0], null, 2));
console.log('BOM row keys:', Object.keys(dataBOM[0]).map(k => escape(k)));

const csvData = `First name,Last name,skill
Sanya,Iyer,Full Stack Developer
David,Chen,PostgreSQL Specialist
Amara,Okoro,UI/UX Design
Lucas,Müller,DevOps Engineer
Priya,Sharma,Product Management
Hiroshi,Tanaka,React Native
Elena,Rodriguez,QA Automation
Karthik,Nair,WAF Framework
Fatima,Zahra,Business Analysis
Marcus,Thorne,Backend Developer
Ananya,Das,Data Science
Jean,Dupont,Cloud Security
Nisha,Verma,Agile Coaching
Samuel,Lee,Frontend Developer
Rohan,Gupta,Kubernetes
Chloe,Smith,Technical Writing
Vikram,Singh,Mobile Development
Zoe,Foster,Customer Success
Omar,Siddiqui,Database Admin`;

const filePath = path.join(__dirname, 'user_data.csv');
fs.writeFileSync(filePath, csvData);

const workbook = xlsx.read(csvData, { type: 'string' });
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet);

console.log('Parsed data count:', data.length);
console.log('Sample row:', JSON.stringify(data[0], null, 2));

const getValue = (row, possibleKeys) => {
    const normalizedRow = {};
    for (const key of Object.keys(row)) {
        // Strip everything except alphanumeric
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        normalizedRow[normalizedKey] = row[key];
    }

    for (const key of possibleKeys) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedRow[normalizedKey] !== undefined) {
            return normalizedRow[normalizedKey]?.toString().trim();
        }
    }
    return undefined;
};

const errors = [];
const junkPattern = /[^\x20-\x7E]/;

for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const firstName = getValue(row, ['First Name', 'FirstName', 'first_name', 'fname']);
    const lastName = getValue(row, ['Last Name', 'LastName', 'last_name', 'lname']);
    const skill = getValue(row, ['Skill', 'Primary Skill', 'Skills', 'primary_skill']);

    const lineNum = i + 2;

    if (!firstName || !lastName || !skill) {
        errors.push(`Row ${lineNum}: Missing required fields (First Name, Last Name, and Skill are mandatory)`);
        console.log(`Row ${lineNum} FAILED: Missing fields. Row keys:`, Object.keys(row));
        continue;
    }

    if (junkPattern.test(firstName) || junkPattern.test(lastName) || junkPattern.test(skill)) {
        errors.push(`Row ${lineNum}: Contains junk data or invalid characters`);
        console.log(`Row ${lineNum} FAILED: Junk data. Names: ${firstName} ${lastName}`);
        continue;
    }
}

console.log('Total Errors:', errors.length);
errors.forEach(e => console.log(e));

fs.unlinkSync(filePath);
