const getModuleNames = require('./getModuleNames');
const exampleList = [
  {
    name: '/src/modules/Accounts/graphql/Accounts.graphql',
  },
  {
    name: '/src/modules/Inventory/graphql/Inventory.graphql',
  },
];

test('', () => {
  expect(getModuleNames(exampleList)).toEqual([
    { name: 'Accounts', graphqlFilePath: '/src/modules/Accounts/graphql/Accounts.graphql' },
    { name: 'Inventory', graphqlFilePath: '/src/modules/Inventory/graphql/Inventory.graphql' },
  ]);
});
