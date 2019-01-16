#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const program = require('commander');
const { Source, buildSchema } = require('graphql');
const del = require('del');

program
  .option('--schemaFilePath [value]', 'path of your graphql schema file')
  .option('--destDirPath [value]', 'dir you want to store the generated queries')
  .option('--depthLimit [value]', 'query depth you want to limit(The default is 100)')
  .parse(process.argv);

const { schemaFilePath, destDirPath, depthLimit = 100 } = program;
const typeDef = fs.readFileSync(schemaFilePath);
const source = new Source(typeDef);
const gqlSchema = buildSchema(source);

del.sync(destDirPath);
path.resolve(destDirPath).split(path.sep).reduce((before, cur) => {
  const pathTmp = path.join(before, cur + path.sep);
  if (!fs.existsSync(pathTmp)) {
    fs.mkdirSync(pathTmp);
  }
  return path.join(before, cur + path.sep);
}, '');
let indexJsExportAll = '';

/**
 * Generate the query for the specified field
 * @param curName name of the current field
 * @param curParentType parent type of the current field
 * @param curParentName parent name of the current field
 * @param argumentsDict dictionary of arguments from all fields
 * @param crossReferenceKeyList list of the cross reference
 * @param curDepth currentl depth of field
 */
const generateQuery = (
  curName,
  curParentType,
  curParentName,
  argumentsDict = {},
  crossReferenceKeyList = [], // [`${curParentName}To${curName}Key`]
  curDepth = 1,
) => {
  const field = gqlSchema.getType(curParentType).getFields()[curName];
  const curTypeName = field.type.inspect().replace(/[[\]!]/g, '');
  const curType = gqlSchema.getType(curTypeName);
  let queryStr = '';
  let childQuery = '';

  if (curType.getFields) {
    const crossReferenceKey = `${curParentName}To${curName}Key`;
    if (crossReferenceKeyList.indexOf(crossReferenceKey) !== -1 || curDepth > depthLimit) return '';
    crossReferenceKeyList.push(crossReferenceKey);
    const childKeys = Object.keys(curType.getFields());
    childQuery = childKeys
      .map(cur =>
        generateQuery(cur, curType, curName, argumentsDict, crossReferenceKeyList, curDepth + 1).queryStr
      )
      .filter(cur => cur)
      .join('\n');
  }

  if (!(curType.getFields && !childQuery)) {
    queryStr = `${'    '.repeat(curDepth)}${field.name}`;
    if (field.args.length > 0) {
      const dict = getArgsDict(field);
      Object.assign(argumentsDict, dict);
      const argsToVarsStr = getArgsToVarsStr(dict);
      queryStr += `(${argsToVarsStr})`;
    }
    if (childQuery) {
      queryStr += `{\n${childQuery}\n${'    '.repeat(curDepth)}}`;
    }
  }

  /* Union types */
  if (curType.astNode && curType.astNode.kind === 'UnionTypeDefinition') {
    const types = curType._types;
    if (types && types.length) {
      const indent = `${'    '.repeat(curDepth)}`;
      const fragIndent = `${'    '.repeat(curDepth + 1)}`;
      queryStr += `{\n`;

      for (let i = 0, len = types.length; i < len; i++) {
        const valueTypeName = types[i];
        const valueType = gqlSchema.getType(valueTypeName);
        const childQuery = Object.keys(valueType.getFields())
          .map(cur =>
            generateQuery(cur, valueType, curName, argumentsDict, crossReferenceKeyList, curDepth + 2).queryStr
          )
          .filter(cur => cur)
          .join('\n');
            queryStr += `${fragIndent}... on ${valueTypeName} {\n${childQuery}\n${fragIndent}}\n`;
          }
          queryStr += `${indent}}`;
      }
  }
  return { queryStr, argumentsDict };
};

/**
 * Generate the query for the specified field
 * @param obj one of the root objects(Query, Mutation, Subscription)
 * @param description description of the current object
 */
const generateFile = (obj, description) => {
  let indexJs = 'const fs = require(\'fs\');\nconst path = require(\'path\');\n\n';
  let outputFolderName;
  switch (description) {
    case 'Mutation':
      outputFolderName = 'mutations';
      break;
    case 'Query':
      outputFolderName = 'queries';
      break;
    case 'Subscription':
      outputFolderName = 'subscriptions';
      break;
    default:
      console.log('[gqlg warning]:', 'description is required');
  }
  const writeFolder = path.join(destDirPath, `./${outputFolderName}`);
  fs.mkdirSync(writeFolder);
  Object.keys(obj).forEach((type) => {
    const queryResult = generateQuery(type, description);
    let query = queryResult.queryStr;
    const field = gqlSchema.getType(description).getFields()[type];
    const varsToTypesStr = getVarsToTypesStr({
        ...getArgsDict(field),
        ...queryResult.argumentsDict
    });
    query = `${description.toLowerCase()} ${type}${varsToTypesStr ? `(${varsToTypesStr})` : ''}{\n${query}\n}`;
    fs.writeFileSync(path.join(writeFolder, `./${type}.gql`), query);
    indexJs += `module.exports.${type} = fs.readFileSync(path.join(__dirname, '${type}.gql'), 'utf8');\n`;
  });
  fs.writeFileSync(path.join(writeFolder, 'index.js'), indexJs);
  indexJsExportAll += `module.exports.${outputFolderName} = require('./${outputFolderName}');\n`;
};

function getArgsDict(field) {
  return field.args.reduce((o, arg) => {
      o[`${field.name}_${arg.name}`] = arg;
      return o;
  }, {});
}

function getArgsToVarsStr(dict) {
  return Object.entries(dict)
    .map(([ varName, arg ]) => `${arg.name}: $${varName}`)
    .join(', ');
}

function getVarsToTypesStr(dict) {
  return Object.entries(dict)
    .map(([ varName, arg ]) => `$${varName}: ${arg.type}`)
    .join(', ');
}

if (gqlSchema.getMutationType()) {
  generateFile(gqlSchema.getMutationType().getFields(), 'Mutation');
} else {
  console.log('[gqlg warning]:', 'No mutation type found in your schema');
}

if (gqlSchema.getQueryType()) {
  generateFile(gqlSchema.getQueryType().getFields(), 'Query');
} else {
  console.log('[gqlg warning]:', 'No query type found in your schema');
}

if (gqlSchema.getSubscriptionType()) {
  generateFile(gqlSchema.getSubscriptionType().getFields(), 'Subscription');
} else {
  console.log('[gqlg warning]:', 'No subscription type found in your schema');
}

fs.writeFileSync(path.join(destDirPath, 'index.js'), indexJsExportAll);
