const bcrypt = require('bcryptjs');
const password = 'admin';
bcrypt.hash(password, 10).then(hash => {
    console.log('HASH:', hash);
});
