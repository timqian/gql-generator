#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const program = require('commander');
const { Source, buildSchema } = require('graphql');
const del = require('del');

program
  .option('--schemaFilePath [value]', 'path of your graphql schema file')
  .option('--destDirPath [value]', 'dir you want to store the generated queries')
  .option('--depthLimit [value]', 'depth you want to limit')
  .parse(process.argv);

const { schemaFilePath, destDirPath, depthLimit = 10 } = program;
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

const generateQuery = (
  curName,
  curParentType,
  curParentName,
  crossReferenceKeyList = [],
  level = 1,
) => {
  const field = gqlSchema.getType(curParentType).getFields()[curName];
  const curTypeName = field.type.inspect().replace(/[[\]!]/g, '');
  let fieldStr = '    '.repeat(level) + field.name;
  if (field.args.length > 0) {
    const argsList = field.args
      .reduce((acc, cur) => `${acc}, ${cur.name}: $${cur.name}`, '')
      .substring(2);
    fieldStr += `(${argsList})`;
  }
  const curType = gqlSchema.getType(curTypeName);
  if (curType.getFields) {
    const crossReferenceKey = `${curParentName}To${curName}Key`;
    if (crossReferenceKeyList.indexOf(crossReferenceKey) !== -1 || level > depthLimit) {
      return '';
    }
    crossReferenceKeyList.push(crossReferenceKey);
    const childQuery = Object.keys(curType.getFields())
      .reduce((acc, cur) => {
        const childData = generateQuery(cur, curType, curName, crossReferenceKeyList, level + 1);
        return childData ? `${acc}\n${childData}` : acc;
      }, '')
      .substring(1);
    fieldStr += `{\n${childQuery}\n${'    '.repeat(level)}}`;
  }
  return fieldStr;
};

const generateFile = (obj, description) => {
  let indexJs = 'const fs = require(\'fs\');\nconst path = require(\'path\');\n\r';
  const writeFolder = path.join(destDirPath, `./${description.toLowerCase()}`);
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
  indexJsExportAll += `module.exports.${description.toLowerCase()} = require('./${description.toLowerCase()}');\n`;
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
