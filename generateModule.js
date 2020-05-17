#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const program = require('commander');
const finder = require('find-package-json');
const shelljs = require('shelljs');
const f = finder(process.cwd());
const projectMainPath = f
  .next()
  .filename.split('/')
  .filter((c) => c.indexOf('package.json') == -1)
  .join('/');
let moduleName;

program
  .version('0.1.0')
  .arguments('<moduleName>')
  .action(function (_moduleName) {
    moduleName = _moduleName;
  });

program.parse(process.argv);

if (typeof moduleName === 'undefined') {
  console.error('  Error: No module name given!');
  program.help();
}
//TODO find package.josn and go to ./src/graphql from there
//TODO take path to the graphql folder
//TODO don't allow if uncommited changes.

console.log('command:', moduleName, projectMainPath);

console.log('create path', `${projectMainPath}/src/modules/${moduleName}/graphql`);
shelljs.mkdir('-p', `${projectMainPath}/src/modules/${moduleName}/graphql`);

const Handlebars = require('handlebars');

const modules = shelljs.ls(`${projectMainPath}/src/modules/`).map((p) => ({ name: p }));

const accounts = modules.find((m) => m.name === 'Accounts');
accounts.types = true;
accounts.queries = [{ name: 'me' }, { name: 'notMe' }];
accounts.mutations = [{ name: 'UserChangeName' }];
if (modules.inventory) {
  modules.inventory.queries = [{ name: 'inventoryGetName' }];
}

modules.forEach((module) => {

  const moduleName = module.name
  const createModuleResolvers = () => {
    const template = fs.readFileSync(path.join(__dirname, './templates/moduleResolvers.handlebars'), 'utf8');
    const context = { types: true, queries: [], mutations: [], moduleName };
    // const context = { types: true, queries: [{name: "myQuery"}], mutations: [{name: "myMutation"}], moduleName };
    const generateIndex = () => Handlebars.compile(template)(context);

    fs.writeFileSync(
      path.join(`${projectMainPath}/src/modules/${moduleName}/graphql/`, `${moduleName}Resolvers.ts`),
      generateIndex()
    );
  };

  createModuleResolvers();
})

// const createModuleGraphql = () => {
//   const moduleGraphqlTemplate = fs.readFileSync(path.join(__dirname, './templates/module.graphql'), 'utf8');
//
//   const generateIndex = () => Handlebars.compile(moduleGraphqlTemplate)({});
//
//   fs.writeFileSync(
//     path.join(`${projectMainPath}/src/modules/${moduleName}/graphql/`, `${moduleName}.graphql`),
//     generateIndex()
//   );
// };
//
// createModuleGraphql();


const createGlobalResolvers = () => {
  const template = fs.readFileSync(path.join(__dirname, './templates/resolvers.handlebars'), 'utf8');
  const context = { modules: [{ name: 'Inventory' }] };
  // const context = { types: true, queries: [{name: "myQuery"}], mutations: [{name: "myMutation"}], moduleName };
  const generateIndex = () => Handlebars.compile(template)(context);

  fs.writeFileSync(path.join(`${projectMainPath}/src/graphql/`, `resolvers.ts`), generateIndex());
};

createGlobalResolvers();

const createCombineSchemas = () => {
  const template = fs.readFileSync(path.join(__dirname, './templates/combineSchemas.handlebars'), 'utf8');
  const context = { modules };
  // const context = { types: true, queries: [{name: "myQuery"}], mutations: [{name: "myMutation"}], moduleName };
  const generateIndex = () => Handlebars.compile(template)(context);

  fs.writeFileSync(path.join(`${projectMainPath}/src/graphql/helpers`, `combineSchemas.ts`), generateIndex());
};

createCombineSchemas();

const createTypes = () => {
  const template = fs.readFileSync(path.join(__dirname, './templates/types.handlebars'), 'utf8');
  const context = { modules };
  // const context = { types: true, queries: [{name: "myQuery"}], mutations: [{name: "myMutation"}], moduleName };
  const generateIndex = () => Handlebars.compile(template)(context);

  fs.writeFileSync(path.join(`${projectMainPath}/src/`, `types.ts`), generateIndex());
};

createTypes();

const createStartupConfig = () => {
  const template = fs.readFileSync(path.join(__dirname, './templates/startupConfig.handlebars'), 'utf8');
  const context = { modules };
  // const context = { types: true, queries: [{name: "myQuery"}], mutations: [{name: "myMutation"}], moduleName };
  const generateIndex = () => Handlebars.compile(template)(context);

  fs.writeFileSync(path.join(`${projectMainPath}/src/`, `startupConfig.ts`), generateIndex());
};

createStartupConfig();

const createIModuleNameContexts = () => {
  const template = fs.readFileSync(path.join(__dirname, './templates/IModuleNameContext.handlebars'), 'utf8');

  modules.forEach(({ name }) => {
    const context = { moduleName: name };

    const generateIndex = () => Handlebars.compile(template)(context);

    fs.writeFileSync(path.join(`${projectMainPath}/src/modules/${name}/`, `I${name}Context.ts`), generateIndex());
  });
};

createIModuleNameContexts();

const createGetModuleNameContexts = () => {
  const template = fs.readFileSync(path.join(__dirname, './templates/getModuleNameContext.handlebars'), 'utf8');

  modules.forEach(({ name }) => {
    const context = { moduleName: name };

    const generateIndex = () => Handlebars.compile(template)(context);

    fs.writeFileSync(path.join(`${projectMainPath}/src/modules/${name}/`, `get${name}Context.ts`), generateIndex());
  });
};

createGetModuleNameContexts();
