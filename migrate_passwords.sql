-- Script to hash existing passwords using bcrypt
-- This updates the existing users with bcrypt-hashed passwords

-- Note: These are bcrypt hashes of the original passwords
-- admin password: 'admin' -> bcrypt hash
-- employee password: 'emp' -> bcrypt hash

-- You'll need to run this after the security schema is applied

-- Update admin user password (password: 'admin')
UPDATE iam.users
SET password = '$2b$10$Nmh4yXfnHM0uAFWW8U49xeH/aj8owSShAVnC/XpqVIj/j8WDJBfMi'
WHERE username = 'admin';

-- Update employee user password (password: 'emp')
UPDATE iam.users
SET password = '$2b$10$ymqV8DE2CmjC0bmaRj3uVOnrDCY3w4NXGKbUVNk0rcOaXLiWRqxv.'
WHERE username = 'employee';

-- Note: For production, you should generate proper bcrypt hashes
-- This is a placeholder. Run the Node.js script below to generate proper hashes:
-- node -e "const bcrypt = require('bcrypt'); bcrypt.hash('admin', 10).then(console.log);"
