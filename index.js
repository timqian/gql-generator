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
  .option('-C, --includeDeprecatedFields [value]', 'Flag to include deprecated fields (The default is to exclude)')
  .option('-L, --leafsPath [value]', 'path of a file which specifies which types and fields to treat as leafs')
  .parse(process.argv);

const { schemaFilePath, destDirPath, depthLimit = 100, includeDeprecatedFields = false, leafsPath } = program;
const typeDef = fs.readFileSync(schemaFilePath);
const source = new Source(typeDef);
const gqlSchema = buildSchema(source);

/*
 * The leaf file should contain an object with types and fields.
 * e.g.
 * {
 *   ALeafType: ['fieldToInclude', 'anotherFieldToInclude']
 *   AnotherLeafType: ['fieldToInclude', 'anotherFieldToInclude']
 * }
 */

const leafs = leafsPath ? JSON.parse(fs.readFileSync(leafsPath)) : {};

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
 * Compile arguments dictionary for a field
 * @param field current field object
 * @param duplicateArgCounts map for deduping argument name collisions
 * @param allArgsDict dictionary of all arguments
 */
const getFieldArgsDict = (
  field,
  duplicateArgCounts,
  allArgsDict = {},
) => field.args.reduce((o, arg) => {
  if (arg.name in duplicateArgCounts) {
    const index = duplicateArgCounts[arg.name] + 1;
    duplicateArgCounts[arg.name] = index;
    o[`${arg.name}${index}`] = arg;
  } else if (allArgsDict[arg.name]) {
    duplicateArgCounts[arg.name] = 1;
    o[`${arg.name}1`] = arg;
  } else {
    o[arg.name] = arg;
  }
  return o;
}, {});

/**
 * Generate variables string
 * @param dict dictionary of arguments
 */
const getArgsToVarsStr = dict => Object.entries(dict)
  .map(([varName, arg]) => `${arg.name}: $${varName}`)
  .join(', ');

/**
 * Generate types string
 * @param dict dictionary of arguments
 */
const getVarsToTypesStr = dict => Object.entries(dict)
  .map(([varName, arg]) => `$${varName}: ${arg.type}`)
  .join(', ');

/**
 * Generate the query for the specified field
 * @param curName name of the current field
 * @param curParentType parent type of the current field
 * @param curParentName parent name of the current field
 * @param argumentsDict dictionary of arguments from all fields
 * @param duplicateArgCounts map for deduping argument name collisions
 * @param crossReferenceKeyList list of the cross reference
 * @param curDepth current depth of field
 */
const generateQuery = (
  curName,
  curParentType,
  curParentName,
  argumentsDict = {},
  duplicateArgCounts = {},
  crossReferenceKeyList = [], // [`${curParentName}To${curName}Key`]
  curDepth = 1,
) => {
  const field = gqlSchema.getType(curParentType).getFields()[curName];
  const topLevel = ['Query', 'Mutation', 'Subscription'].includes(curParentType);
  const curTypeName = field.type.inspect().replace(/[[\]!]/g, '');
  const curType = gqlSchema.getType(curTypeName);
  let queryStr = '';
  let childQuery = '';

  if (curType.getFields) {
    const crossReferenceKey = `${curParentName}To${curName}Key`;
    if (crossReferenceKeyList.indexOf(crossReferenceKey) !== -1 || curDepth > depthLimit) return '';
    crossReferenceKeyList.push(crossReferenceKey);
    const childKeys = Object.keys(curType.getFields());
    const leaf = leafs[curType];
    childQuery = childKeys
      .filter(fieldName => {
        let include;
        /* Exclude deprecated fields */
        include = gqlSchema.getType(curType).getFields()[fieldName];

        /* If this is a leaf type, exclude non-leaf fields */
        /* Types can only be leaves if they are nested, i.e. they are not at the top level */
        include = include && (topLevel || !leaf || leaf.includes(fieldName));

        return include
      })
      .map(cur => generateQuery(cur, curType, curName, argumentsDict, duplicateArgCounts,
        crossReferenceKeyList, curDepth + 1).queryStr)
      .filter(cur => cur)
      .join('\n');
  }

  if (!(curType.getFields && !childQuery)) {
    queryStr = `${'    '.repeat(curDepth)}${field.name}`;
    if (field.args.length > 0) {
      const dict = getFieldArgsDict(field, duplicateArgCounts, argumentsDict);
      Object.assign(argumentsDict, dict);
      queryStr += `(${getArgsToVarsStr(dict)})`;
    }
    if (childQuery) {
      queryStr += `{\n${childQuery}\n${'    '.repeat(curDepth)}}`;
    }
  }

  /* Union types */
  if (curType.astNode && curType.astNode.kind === 'UnionTypeDefinition') {
    const unionLeaf = leafs[curType]; // allows user to specify leaf fields on a union.
    const types = curType.getTypes();
    if (types && types.length) {
      const indent = `${'    '.repeat(curDepth)}`;
      const fragIndent = `${'    '.repeat(curDepth + 1)}`;
      queryStr += '{\n';

      for (let i = 0, len = types.length; i < len; i++) {
        const valueTypeName = types[i];
        const valueType = gqlSchema.getType(valueTypeName);
        const typeLeaf = leafs[valueType];
        const unionChildQuery = Object.keys(valueType.getFields())
          .filter(fieldName => {
            let include = true;
            /* If this is a leaf type, exclude non-leaf fields */
            /* Types can only be leaves if they are nested, i.e. they are not at the top level */
            if (!topLevel) {
              if (unionLeaf && !unionLeaf.includes(fieldName)) include = false;
              if (typeLeaf && !typeLeaf.includes(fieldName)) include = false;
            }
            return include;
          })
          .map(cur => generateQuery(cur, valueType, curName, argumentsDict, duplicateArgCounts,
            crossReferenceKeyList, curDepth + 2).queryStr)
          .filter(cur => cur)
          .join('\n');
        queryStr += `${fragIndent}... on ${valueTypeName} {\n${unionChildQuery}\n${fragIndent}}\n`;
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
    const field = gqlSchema.getType(description).getFields()[type];
    /* Only process non-deprecated queries/mutations: */
    if (includeDeprecatedFields || !field.isDeprecated) {
      const queryResult = generateQuery(type, description);
      const varsToTypesStr = getVarsToTypesStr(queryResult.argumentsDict);
      let query = queryResult.queryStr;
      query = `${description.toLowerCase()} ${type}${varsToTypesStr ? `(${varsToTypesStr})` : ''}{\n${query}\n}`;
      fs.writeFileSync(path.join(writeFolder, `./${type}.gql`), query);
      indexJs += `module.exports.${type} = fs.readFileSync(path.join(__dirname, '${type}.gql'), 'utf8');\n`;
    }
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
