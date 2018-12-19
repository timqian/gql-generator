const cp = require('child_process');
require('should');

test('validate generated queries', async () => {
  cp.execSync('node index.js --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output');
  const queries = require('../example/output');
  queries.mutations.signin.indexOf('signin').should.not.equal(-1);
});

test('limt depth', async () => {
  cp.execSync('node index.js --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output2 --depthLimit 1');
  const queries = require('../example/output2');
  queries.mutations.signup.indexOf('createdAt').should.equal(-1);
});
