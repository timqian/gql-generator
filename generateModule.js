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

const createModuleGraphql = () => {
  const moduleGraphqlTemplate = fs.readFileSync(path.join(__dirname, './templates/module.graphql'), 'utf8');

  const generateIndex = () => Handlebars.compile(moduleGraphqlTemplate)({});

  fs.writeFileSync(
    path.join(`${projectMainPath}/src/modules/${moduleName}/graphql/`, `${moduleName}.graphql`),
    generateIndex()
  );
};

createModuleGraphql();

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


const createGlobalResolvers = () => {
  const template = fs.readFileSync(path.join(__dirname, './templates/resolvers.handlebars'), 'utf8');
  const context = { modules: [{name: "Inventory"}] };
  // const context = { types: true, queries: [{name: "myQuery"}], mutations: [{name: "myMutation"}], moduleName };
  const generateIndex = () => Handlebars.compile(template)(context);

  fs.writeFileSync(
    path.join(`${projectMainPath}/src/graphql/`, `resolvers.ts`),
    generateIndex()
  );
};

createGlobalResolvers();


const createCombineSchemas = () => {
  const template = fs.readFileSync(path.join(__dirname, './templates/combineSchemas.handlebars'), 'utf8');
  const context = { modules: [{name: "Inventory"}, {name: "Accounts"}, {name: "Products"}] };
  // const context = { types: true, queries: [{name: "myQuery"}], mutations: [{name: "myMutation"}], moduleName };
  const generateIndex = () => Handlebars.compile(template)(context);

  fs.writeFileSync(
    path.join(`${projectMainPath}/src/graphql/helpers`, `combineSchemas.ts`),
    generateIndex()
  );
};

createCombineSchemas();

