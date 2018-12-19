#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const program = require('commander');
const { Source, buildSchema } = require('graphql');
const del = require('del');

program
  .option('--schemaFilePath [value]', 'path of your graphql schema file')
  .option('--destDirPath [value]', 'dir you want to store the generated queries')
  .option('--depthLimit [value]', 'depth you want to limit(The default is 100)')
  .parse(process.argv);

const { schemaFilePath, destDirPath, depthLimit = 100 } = program;
const typeDef = fs.readFileSync(schemaFilePath);
const source = new Source(typeDef);
const gqlSchema = buildSchema(source);

del.sync(destDirPath);
const pathArr = destDirPath.split('/');
let pathTmp = __dirname;
pathArr.forEach((i) => {
  pathTmp += `/${i}`;
  if (!fs.existsSync(pathTmp)) {
    fs.mkdirSync(pathTmp);
  }
});
let indexJsExportAll = '';

/**
 * Generate the query for the specified field
 * @param curName name of the current field
 * @param curParentType parent type of the current field
 * @param curParentName parent name of the current field
 * @param crossReferenceKeyList list of the cross reference
 * @param curDepth currentl depth of field
 */
const generateQuery = (
  curName,
  curParentType,
  curParentName,
  crossReferenceKeyList = [], // [`${curParentName}To${curName}Key`]
  curDepth = 1,
) => {
  const field = gqlSchema.getType(curParentType).getFields()[curName];
  const curTypeName = field.type.inspect().replace(/[[\]!]/g, '');
  let queryStr = '    '.repeat(curDepth) + field.name;
  if (field.args.length > 0) {
    const argsList = field.args
      .map(arg => `${arg.name}: $${arg.name}`)
      .join(', ');
    queryStr += `(${argsList})`;
  }
  const curType = gqlSchema.getType(curTypeName);
  if (curType.getFields) {
    const crossReferenceKey = `${curParentName}To${curName}Key`;
    if (crossReferenceKeyList.indexOf(crossReferenceKey) !== -1 || curDepth > depthLimit) return '';
    crossReferenceKeyList.push(crossReferenceKey);
    const childQuery = Object.keys(curType.getFields())
      .map(cur => generateQuery(cur, curType, curName, crossReferenceKeyList, curDepth + 1))
      .join('\n');
    queryStr += `{\n${childQuery}\n${'    '.repeat(curDepth)}}`;
  }
  return queryStr;
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
    let query = generateQuery(type, description);
    const field = gqlSchema.getType(description).getFields()[type];
    const argStr = field.args.map(arg => `$${arg.name}: ${arg.type}`).join(', ');
    query = `${description.toLowerCase()} ${type}${argStr ? `(${argStr})` : ''}{\n${query}\n}`;
    fs.writeFileSync(path.join(writeFolder, `./${type}.gql`), query);
    indexJs += `module.exports.${type} = fs.readFileSync(path.join(__dirname, '${type}.gql'), 'utf8');\n`;
  });
  fs.writeFileSync(path.join(writeFolder, 'index.js'), indexJs);
  indexJsExportAll += `module.exports.${outputFolderName} = require('./${outputFolderName}');\n`;
};

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
