# gql-generator

Generate queries from graphql schema for use in API tests such as K6

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

```ts
// Sample query generated
export const accessConsents = `
query user($id: Int!) {
  user(id: $id){
    id
    username
    email
    createdAt
  }
}
`
```

## Usage
> :warning: **BE VERY CAREFUL SETTING THE `--destDirPath` OPTION!**: It is recommended to set a new folder as it will empty out the one you specify before adding new files.
```bash
# Install
npm install gql-generator-ts-format -g

# see the usage
gqlgts --help

# Generate sample queries from schema file
gqlgts --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output --depthLimit 5
```

Now the queries generated from the [`sampleTypeDef.graphql`](./example/sampleTypeDef.graphql) can be found in the destDir: [`./example/output`](./example/output).

This tool generate 3 folders holding the queries: mutations, queries and subscriptions. And also `index.js` files to export the queries in each folder.

You can require the queries like this:

```ts
// require mutations
import * as mutations from './example/output/mutations'

// sample content
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

Before this tool, you would write a GQL API test like this:

```ts
import { GraphQLClient } from 'graphql-request'

const host = 'http://localhost:8080/graphql';

it('should return a signup token', async () => {
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

  expect(typeof data.signup.token).toEqual('string')
})
```

As `gqlgts` generated the queries for you, you don't need to write the query yourself, so your test will becomes:

```ts
import { GraphQLClient } from 'graphql-request'
import { signup } from'./example/output/mutations'

const host = 'http://localhost:8080/graphql';

it('should return a signup token', async () => {
  const gql = new GraphQLClient(host);
  
  const data = await gql.request(signup, {
    username: 'tim',
    email: 'timqian92@qq.com',
    password: 'samplepass',
  });
  
  expect(typeof data.signup.token).toEqual('string')
})
```

## Notes

- As this tool is used for tests, it expands all of the fields in a query. There might be recursive fields in the query, so `gqlgts` ignores the types which have been added in the parent queries already by default. This can be disabled using the `--includeCrossReferences` argument.
- Variable names are derived from argument names, so variables generated from multiple occurrences of the same argument name must be deduped. An index is appended to any duplicates e.g. `region(language: $language1)`.

