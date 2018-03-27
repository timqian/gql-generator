
const fs = require('fs');
const path = require('path');

module.exports.signup = fs.readFileSync(path.join(__dirname, 'signup.gql'), 'utf8');
module.exports.signin = fs.readFileSync(path.join(__dirname, 'signin.gql'), 'utf8');
