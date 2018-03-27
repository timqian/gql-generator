
const fs = require('fs');
const path = require('path');

module.exports.user = fs.readFileSync(path.join(__dirname, 'user.gql'), 'utf8');
