# gql-generator

Generate queries from graphql schema, used for writing api test.

## Example
```gql
# Sample schema
type Query {
  user(id: Int!): User!
}

type User {
  id: Int!
  username: String!
  email: String!
  createdAt: String!
}
```

```gql
# Sample query generated
query user($id: Int!) {
  user(id: $id){
    id
    username
    email
    createdAt
  }
}
```

## Usage
```bash
# Install
npm install gql-generator -g

# see the usage
gqlg --help

# Generate sample queries from schema file
gqlg --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output --depthLimit 5
```

Now the queries generated from the [`sampleTypeDef.graphql`](./example/sampleTypeDef.graphql) can be found in the destDir: [`./example/output`](./example/output).

This tool generate 3 folders holding the queries: mutations, queries and subscriptions. And also `index.js` files to export the queries in each folder.

You can require the queries like this:

```js
// require all the queries
const queries = require('./example/output');
// require mutations only
const mutations = require('./example/output/mutations');

// sample content
console.log(queries.mutations.signup);
console.log(mutations.signup);
/*
mutation signup($username: String!, email: String!, password: String!){
  signup(username: $username, email: $email, password: $password){
    token
    user {
      id
      username
      email
      createdAt
    }
  }
}
*/

```

The tool will automatically exclude any `@deprecated` schema fields (see more on schema directives [here](https://www.apollographql.com/docs/graphql-tools/schema-directives)). To change this behavior to include deprecated fields you can use the `includeDeprecatedFields` flag when running the tool, e.g. `gqlg --includeDeprecatedFields`.

### Programmatic Access

Alternatively, you can run `gql-generator` directly from your scripts:

```js
const gqlg = require('gql-generator')

gqlg({ schemaFilePath: './example/sampleTypeDef.graphql', destDirPath: './example/output', depthLimit: 5 })
```

## Usage example

Say you have a graphql schema like this: 

```gql
type Mutation {
  signup(
    email: String!
    username: String!
    password: String!
  ): UserToken!
}

type UserToken {
  token: String!
  user: User!
}

type User {
  id: Int!
  username: String!
  email: String!
  createdAt: String!
}
```

Before this tool, you write graphql api test like this:

```js
const { GraphQLClient } = require('graphql-request');
require('should');

const host = 'http://localhost:8080/graphql';

test('signup', async () => {
  const gql = new GraphQLClient(host);
  const query = `mutation signup($username: String!, email: String!, password: String!){
    signup(username: $username, email: $email, password: $password){
      token
      user {
        id
        username
        email
        createdAt
      }
    }
  }`;

  const data = await gql.request(query, {
    username: 'tim',
    email: 'timqian92@qq.com',
    password: 'samplepass',
  });

  (typeof data.signup.token).should.equal('string');
);
```

As `gqlg` generated the queries for you, you don't need to write the query yourself, so your test will becomes:

```js
const { GraphQLClient } = require('graphql-request');
require('should');
const mutations = require('./example/output/mutations');

const host = 'http://localhost:8080/graphql';

test('signup', async () => {
  const gql = new GraphQLClient(host);

  const data = await gql.request(mutations.signup, {
    username: 'tim',
    email: 'timqian92@qq.com',
    password: 'samplepass',
  });

  (typeof data.signup.token).should.equal('string');
);
```

## Notes

- As this tool is used for tests, it expands all of the fields in a query. There might be recursive fields in the query, so `gqlg` ignores the types which have been added in the parent queries already by default. This can be disabled using the `--includeCrossReferences` argument.
- Variable names are derived from argument names, so variables generated from multiple occurrences of the same argument name must be deduped. An index is appended to any duplicates e.g. `region(language: $language1)`.

