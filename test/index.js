const cp = require('child_process');
require('should');

test('validate generated queries', async () => {
  cp.execSync('node index.js --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output --depthLimit 3');
  const query = require('../example/output');
  query.mutation.signin.indexOf('signin').should.not.equal(-1);
});
