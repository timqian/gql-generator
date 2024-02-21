#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const program = require('commander');
const { Source, buildSchema } = require('graphql');
const del = require('del');

const camelToUnderscore = (key) => {
  const result = key.replace(/([A-Z])/g, ' $1');
  return result.split(' ').join('_').toUpperCase();
};

function main ({
                 schemaFilePath,
                 destDirPath,
                 depthLimit = 100,
                 includeDeprecatedFields = false,
                 fileExtension,
                 assumeValid,
                 includeCrossReferences = false,
               } = {}) {
  let assume = false;
  if (assumeValid === 'true') {
    assume = true;
  }

  const typeDef = fs.readFileSync(schemaFilePath, 'utf-8');
  const source = new Source(typeDef);
  const gqlSchema = buildSchema(source, { assumeValidSDL: assume });

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
   * @param fromUnion adds additional depth for unions to avoid empty child
   */
  const generateQuery = (
    curName,
    curParentType,
    curParentName,
    argumentsDict = {},
    duplicateArgCounts = {},
    crossReferenceKeyList = [], // [`${curParentName}To${curName}Key`]
    curDepth = 1,
    fromUnion = false,
  ) => {
    // console.log(curName)
    const field = gqlSchema.getType(curParentType).getFields()[curName];
    const curTypeName = field.type.toJSON().replace(/[[\]!]/g, '');
    const curType = gqlSchema.getType(curTypeName);
    let queryStr = '';
    let childQuery = '';





    if (curType.getFields) {
      if(curDepth > depthLimit) return { queryStr, argumentsDict }
      /**
       * @HARD_CODED_DEPTH
       * 이건 카테고리 한정으로 적용 (maxDepth가 4기 때문)
       * **/
      const CATEGORY_MAX_DEPTH = 6
      if(curTypeName  ==='CategorySchema' && curDepth > CATEGORY_MAX_DEPTH) {

        return { queryStr, argumentsDict }
      }
      // const crossReferenceKey = `${curParentName}To${curName}Key`;
      // if (
      //   (!includeCrossReferences && crossReferenceKeyList.indexOf(crossReferenceKey) !== -1)
      //   || (fromUnion ? curDepth - 2 : curDepth) > depthLimit
      // ) {
      //   return '';
      // }
      // if (!fromUnion) {
      //   crossReferenceKeyList.push(crossReferenceKey);
      // }
      const childKeys = Object.keys(curType.getFields());
      childQuery = childKeys
        .filter((fieldName) => {
          /* Exclude deprecated fields */
          const fieldSchema = gqlSchema.getType(curType).getFields()[fieldName];
          return includeDeprecatedFields || !fieldSchema.deprecationReason;
        })
        .map(cur => generateQuery(cur, curType, curName, argumentsDict, duplicateArgCounts,
          crossReferenceKeyList, curDepth + 1, fromUnion).queryStr)
        .filter(cur => Boolean(cur))
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
      const types = curType.getTypes();
      if (types && types.length) {
        const indent = `${'    '.repeat(curDepth)}`;
        const fragIndent = `${'    '.repeat(curDepth + 1)}`;
        queryStr += '{\n';
        queryStr += `${fragIndent}__typename\n`

        for (let i = 0, len = types.length; i < len; i++) {
          const valueTypeName = types[i];
          const valueType = gqlSchema.getType(valueTypeName);
          const unionChildQuery = Object.keys(valueType.getFields())
            .map(cur => generateQuery(cur, valueType, curName, argumentsDict, duplicateArgCounts,
              crossReferenceKeyList, curDepth + 2, true).queryStr)
            .filter(cur => Boolean(cur))
            .join('\n');

          /* Exclude empty unions */
          if (unionChildQuery) {
            queryStr += `${fragIndent}... on ${valueTypeName} {\n${unionChildQuery}\n${fragIndent}}\n`;
          }
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
    switch (true) {
      case /Mutation.*$/.test(description):
      case /mutation.*$/.test(description):
        outputFolderName = 'mutations';
        break;
      case /Query.*$/.test(description):
      case /query.*$/.test(description):
        outputFolderName = 'queries';
        break;
      case /Subscription.*$/.test(description):
      case /subscription.*$/.test(description):
        outputFolderName = 'subscriptions';
        break;
      default:
        console.log('[gqlg warning]:', 'description is required');
    }
    const writeFolder = path.join(destDirPath, `./${outputFolderName}`);
    try {
      fs.mkdirSync(writeFolder);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    Object.keys(obj).forEach((type) => {
      const field = gqlSchema.getType(description).getFields()[type];
      /* Only process non-deprecated queries/mutations: */
      if (includeDeprecatedFields || !field.deprecationReason) {
        const queryResult = generateQuery(type, description);
        const varsToTypesStr = getVarsToTypesStr(queryResult.argumentsDict);
        let query = queryResult.queryStr;
        let queryName;
        switch (true) {
          case /Mutation/.test(description):
          case /mutation/.test(description):
            queryName = 'mutation';
            break;
          case /Query/.test(description):
          case /query/.test(description):
            queryName = 'query';
            break;
          case /Subscription/.test(description):
          case /subscription/.test(description):
            queryName = 'subscription';
            break;
          default:
            break;
        }
        const importStr = "import { gql } from '@apollo/client';";
        const exportConstStr = `export const ${camelToUnderscore(queryName)} = gql\``;
        const params = varsToTypesStr && varsToTypesStr !== '' ? `(${varsToTypesStr})` : '';
        query = `${importStr}\n${exportConstStr}${queryName || description.toLowerCase()} ${type}${params}{\n${query}\n}\``;
        fs.writeFileSync(path.join(writeFolder, `./${type}.${fileExtension}`), query);
        indexJs += `module.exports.${type} = fs.readFileSync(path.join(__dirname, '${type}.${fileExtension}'), 'utf8');\n`;
      }
    });
    // fs.writeFileSync(path.join(writeFolder, 'index.js'), indexJs);
    indexJsExportAll += `module.exports.${outputFolderName} = require('./${outputFolderName}');\n`;
  };

  if (gqlSchema.getMutationType()) {
    generateFile(gqlSchema.getMutationType().getFields(), gqlSchema.getMutationType().name);
  } else {
    console.log('[gqlg warning]:', 'No mutation type found in your schema');
  }

  if (gqlSchema.getQueryType()) {
    generateFile(gqlSchema.getQueryType().getFields(), gqlSchema.getQueryType().name);
  } else {
    console.log('[gqlg warning]:', 'No query type found in your schema');
  }

  if (gqlSchema.getSubscriptionType()) {
    generateFile(gqlSchema.getSubscriptionType().getFields(), gqlSchema.getSubscriptionType().name);
  } else {
    console.log('[gqlg warning]:', 'No subscription type found in your schema');
  }

  // fs.writeFileSync(path.join(destDirPath, 'index.js'), indexJsExportAll);
}

module.exports = main

if (require.main === module) {
  program
    .option('--schemaFilePath [value]', 'path of your graphql schema file')
    .option('--destDirPath [value]', 'dir you want to store the generated queries')
    .option('--depthLimit [value]', 'query depth you want to limit (The default is 100)')
    .option('--assumeValid [value]', 'assume the SDL is valid (The default is false)')
    .option('--ext [value]', 'extension file to use', 'ts')
    .option('-C, --includeDeprecatedFields [value]', 'Flag to include deprecated fields (The default is to exclude)')
    .option('-R, --includeCrossReferences', 'Flag to include fields that have been added to parent queries already (The default is to exclude)')
    .parse(process.argv);

  return main({...program, fileExtension: program.ext })
}
