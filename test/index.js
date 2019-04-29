const cp = require('child_process');
require('should');

test('validate generated queries', async () => {
  cp.execSync('node index.js --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output');
  const queries = require('../example/output');
  queries.mutations.signin.indexOf('signin').should.not.equal(-1);
});

test('limit depth', async () => {
  cp.execSync('node index.js --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output2 --depthLimit 1');
  const queries = require('../example/output2');
  queries.mutations.signup.indexOf('createdAt').should.equal(-1);
});

test('excludes deprecated fields by default', async () => {
  cp.execSync('node index.js --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output3 --depthLimit 1');
  const queries = require('../example/output3');
  should(typeof queries.queries.user).be.exactly("string");
  should(queries.queries.members === undefined).be.true();
  should(queries.mutations.sendMessage === undefined).be.true();

  const expected = `query user($language: String, $id: Int!){
    user(id: $id){
        id
        username
        email
        createdAt
        details{
            ... on Guest {
                region(language: $language)
            }
            ... on Member {
                address
            }
        }
    }
}`

  should(queries.queries.user === expected).be.true();  
});

test('includes deprecated fields with includeDeprecatedFields flag', async () => {
  cp.execSync('node index.js --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output4 --depthLimit 1 --includeDeprecatedFields');
  const queries = require('../example/output4');

  should(typeof queries.queries.user).be.exactly("string");
  should(typeof queries.queries.members).be.exactly("string");
  should(typeof queries.mutations.sendMessage).be.exactly("string");

  const expected = `query user($language: String, $id: Int!){
    user(id: $id){
        id
        username
        email
        createdAt
        details{
            ... on Guest {
                region(language: $language)
            }
            ... on Member {
                address
            }
        }
        address
    }
}`
  should(queries.queries.user === expected).be.true();
});
