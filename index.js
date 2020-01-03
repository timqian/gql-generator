#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const program = require('commander');
const { Source, buildSchema } = require('graphql');

program
  .option('--schemaFilePath [value]', 'path of your graphql schema file')
  .option('--destDirPath [value]', 'dir you want to store the generated queries')
  .option('--depthLimit [value]', 'query depth you want to limit(The default is 100)')
  .option('--varsDepthLimit [value]', 'variables depth you want to limit(The default is 1)')
  .option('-C, --includeDeprecatedFields [value]', 'Flag to include deprecated fields (The default is to exclude)')
  .option('-L, --filterPath [value]', 'path of a file containing a javascript function which filters fields')
  .option(
    '-D, --createDestPath [value]',
    'path of a file containing a javascript function which returns a destination path',
  )
  .parse(process.argv);

const {
  schemaFilePath,
  destDirPath,
  depthLimit = 100,
  varsDepthLimit = 1,
  includeDeprecatedFields = false,
  filterPath,
  createDestPath,
} = program;
const typeDef = fs.readFileSync(schemaFilePath);
const source = new Source(typeDef);
const gqlSchema = buildSchema(source);

const filterFunc = filterPath ? require(path.resolve(filterPath)) : () => true;
const createDestFunc = createDestPath
  ? require(path.resolve(createDestPath))
  : ({ description, type }) => `${description}/${type}.gql`;

/**
 * Compile arguments dictionary for a field
 * @param field current field object
 * @param duplicateArgCounts map for deduping argument name collisions
 * @param allArgsDict dictionary of all arguments
 */
const getFieldArgsDict = (field, duplicateArgCounts, allArgsDict = {}) => field.args.reduce((o, arg) => {
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
  crossReferenceKeyList = [],
  curDepth = 1,
  curParentSchema,
  curPath = [],
  rootName,
  rootTypeName,
) => {
  const field = gqlSchema.getType(curParentType).getFields()[curName];
  const curParentTypeName = curParentType.inspect().replace(/[[\]!]/g, '');
  const curTypeName = field.type.inspect().replace(/[[\]!]/g, '');
  const curType = gqlSchema.getType(curTypeName);
  let queryStr = '';
  let childQuery = '';

  if (
    !filterFunc({
      parentSchema: curParentSchema,
      parentType: curParentType,
      parentTypeName: curParentTypeName,
      parentName: curParentName,
      curSchema: field,
      curType,
      curTypeName,
      curName,
      curDepth,
      argumentsDict,
      curPath,
      rootName,
      rootTypeName,
    })
  ) {
    return;
  }

  if (curType.getFields) {
    const crossReferenceKey = `${curParentName}To${curName}Key`;
    if (crossReferenceKeyList.indexOf(crossReferenceKey) !== -1 || curDepth > depthLimit) return '';
    crossReferenceKeyList.push(crossReferenceKey);
    const childKeys = Object.keys(curType.getFields());
    childQuery = childKeys
      .filter((fieldName) => {
        const fieldSchema = gqlSchema.getType(curType).getFields()[fieldName];
        const fieldTypeName = fieldSchema.type.inspect().replace(/[[\]!]/g, '');
        const fieldType = gqlSchema.getType(fieldTypeName);
        const include = filterFunc({
          parentSchema: curParentSchema,
          parentType: curParentType,
          parentTypeName: curParentTypeName,
          parentName: curParentName,
          curSchema: field,
          curType,
          curTypeName,
          curName,
          curDepth,
          fieldSchema,
          fieldType,
          fieldTypeName,
          fieldName,
          argumentsDict,
          curPath: [...curPath, fieldName],
          rootName,
          rootTypeName,
        });
        return include && (includeDeprecatedFields || !fieldSchema.isDeprecated);
      })
      .map(
        cur => generateQuery(
            cur,
            curType,
            curName,
            argumentsDict,
            duplicateArgCounts,
            crossReferenceKeyList,
            curDepth + 1,
            field,
            [...curPath, cur],
            rootName,
            rootTypeName,
          ).queryStr,
      )
      .filter(cur => cur)
      .join('\n');
  }

  if (!(curType.getFields && !childQuery)) {
    queryStr = `${'  '.repeat(curDepth)}${field.name}`;
    if (field.args.length > 0 && curDepth <= varsDepthLimit) {
      const dict = getFieldArgsDict(field, duplicateArgCounts, argumentsDict);
      Object.assign(argumentsDict, dict);
      queryStr += `(${getArgsToVarsStr(dict)})`;
    }
    if (childQuery) {
      queryStr += ` {\n${childQuery}\n${'  '.repeat(curDepth)}}`;
    }
  }

  /* Union types */
  if (curType.astNode && curType.astNode.kind === 'UnionTypeDefinition') {
    const types = curType.getTypes();
    if (types && types.length) {
      const indent = `${'  '.repeat(curDepth)}`;
      const fragIndent = `${'  '.repeat(curDepth + 1)}`;
      queryStr += ' {\n';

      for (let i = 0, len = types.length; i < len; i++) {
        const valueTypeName = types[i];
        const valueType = gqlSchema.getType(valueTypeName);
        const unionChildQuery = Object.keys(valueType.getFields())
          .filter((fieldName) => {
            const fieldSchema = valueType.getFields()[fieldName];
            const fieldTypeName = fieldSchema.type.inspect().replace(/[[\]!]/g, '');
            const fieldType = gqlSchema.getType(fieldTypeName);
            const include = filterFunc({
              parentSchema: curParentSchema,
              parentType: curParentType,
              parentTypeName: curParentTypeName,
              parentName: curParentName,
              curSchema: field,
              curType,
              curTypeName,
              curName,
              curDepth,
              fieldSchema,
              fieldType,
              fieldTypeName,
              fieldName,
              argumentsDict,
              curPath: [...curPath, fieldName],
              rootName,
              rootTypeName,
            });
            return include;
          })
          .map(
            cur => generateQuery(
                cur,
                valueType,
                curName,
                argumentsDict,
                duplicateArgCounts,
                crossReferenceKeyList,
                curDepth + 2,
                field,
                [...curPath, cur],
                rootName,
                rootTypeName,
              ).queryStr,
          )
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
  Object.keys(obj).forEach((type) => {
    const schema = gqlSchema.getType(description);
    const field = schema.getFields()[type];
    const typeName = field.type.inspect().replace(/[[\]!]/g, '');

    /* Only process non-deprecated queries/mutations: */
    if (includeDeprecatedFields || !field.isDeprecated) {
      const queryResult = generateQuery(
        type,
        schema,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        [description, type],
        type,
        typeName,
      );

      if (!queryResult) {
        return;
      }

      const varsToTypesStr = getVarsToTypesStr(queryResult.argumentsDict);
      let query = queryResult.queryStr;
      query = `${description.toLowerCase()} ${type}${varsToTypesStr ? `(${varsToTypesStr})` : ''}{\n${query}\n}`;

      const dest = createDestFunc({
        description,
        type,
        typeName,
      });

      mkdirp.sync(path.join(destDirPath, path.dirname(dest)));

      fs.writeFileSync(
        path.join(destDirPath, dest),
        `const gql = require('graphql-tag');\n\nmodule.exports = gql\`${query}\`;`,
      );
    }
  });
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
