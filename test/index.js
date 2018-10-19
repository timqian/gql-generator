
const cp = require('child_process');
require('should');

test('validate generated queries', async () => {
  cp.execSync('node index.js --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output');
  const queries = require('../example/output');
  queries.mutations.signin.indexOf('signin').should.not.equal(-1);
});
