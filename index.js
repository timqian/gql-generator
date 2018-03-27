#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const program = require('commander');
const { Source, buildSchema } = require('graphql');
const del = require('del');

program
    .option('--schemaFilePath [value]', 'path of your graphql schema file')
    .option('--destDirPath [value]', 'dir you want to store the generated queries')
    .parse(process.argv);

const schemaFilePath = program.schemaFilePath;
const destDirPath = program.destDirPath;

console.log('[gqlg]:', `Going to create 3 folders to store the queries inside path: ${destDirPath}`);
const typeDef = fs.readFileSync(schemaFilePath);


const source = new Source(typeDef);
// const ast = parse(source);
const gqlSchema = buildSchema(source);

const addQueryDepthLimit = 100;
// schema.getType

/**
 * Cleans out getType() names to contain only the type name itself
 * @param name
 */
function cleanName(name) {
    return name.replace(/[\[\]!]/g, '');
}


/**
 * Generate the query for the specified field
 * @param name name of the current field
 * @param parentType parent type of the current field
 * @param parentFields preceding parent field and type combinations
 */
function generateQuery(name, parentType) {
    let query = '';
    let hasArgs = false;
    const argTypes = []; // [{name: 'id', type: 'Int!'}]

    const fieldData = generateFieldData(name, parentType, [], 1);

    const argStr = argTypes
        .map(argType => `${argType.name}: ${argType.type}`)
        .join(', ');

    // Add the root type of the query
    switch (parentType) {
    case gqlSchema.getQueryType() && gqlSchema.getQueryType().name:
        query += `query ${name}(${argStr}) `;
        break;
    case gqlSchema.getMutationType() && gqlSchema.getMutationType().name:
        query += `mutation ${name}(${argStr}) `;
        break;
    case gqlSchema.getSubscriptionType() &&
      gqlSchema.getSubscriptionType().name:
        query += `subscription ${name}(${argStr}) `;
        break;
    default:
        throw new Error('parentType is not one of mutation/query/subscription');
    }

    // Add the query fields
    query += `{\n${fieldData.query}\n}`;

    const meta = { ...fieldData.meta };

    // Update hasArgs option
    meta.hasArgs = hasArgs || meta.hasArgs;

    return { query, meta };

    /**
     * Generate the query for the specified field
     * @param name name of the current field
     * @param parentType parent type of the current field
     * @param parentFields preceding parent field and type combinations
     * @param level current depth level of the current field
     */
    function generateFieldData(name, parentType, parentFields, level) {
    // console.log('Generating query for ', name, parentType);

        const tabSize = 4;
        const field = gqlSchema.getType(parentType).getFields()[name];

        const meta = {
            hasArgs: false,
        };

        // Start the query with the field name
        let fieldStr = ' '.repeat(level * tabSize) + field.name;

        // If the field has arguments, add them
        if (field.args && field.args.length) {
            meta.hasArgs = true;

            const argsList = field.args
                .reduce((acc, cur) => `${acc}, ${cur.name}: $${cur.name}`, '')
                .substring(2);

            fieldStr += `(${argsList})`;

            field.args.forEach((arg) => {
                argTypes.push({
                    name: `$${arg.name}`,
                    type: arg.type,
                });
            });
        }

        // Retrieve the current field type
        const curTypeName = cleanName(field.type.inspect());
        const curType = gqlSchema.getType(curTypeName);

        // Don't add a field if it has been added in the query already.
        // This happens when there is a recursive field
        if (parentFields.filter(x => x.type === curTypeName).length) {
            return { query: '', meta: {} };
        }

        // Stop adding new fields once the specified level depth limit is reached
        if (level >= addQueryDepthLimit) {
            return { query: '', meta: {} };
        }

        // Get all the fields of the field type, if available
        const innerFields = curType.getFields && curType.getFields();
        let innerFieldsData = null;
        if (innerFields) {
            innerFieldsData = Object.keys(innerFields)
                .reduce((acc, cur) => {
                // Don't add a field if it has been added in the query already.
                // This happens when there is a recursive field
                    if (
                        parentFields.filter(x => x.name === cur && x.type === curTypeName)
                            .length
                    ) {
                        return '';
                    }

                    const curInnerFieldData = generateFieldData(
                        cur,
                        curTypeName,
                        [...parentFields, { name, type: curTypeName }],
                        level + 1,
                    );
                    const curInnerFieldStr = curInnerFieldData.query;

                    // Set the hasArgs meta if the inner field has args
                    meta.hasArgs = meta.hasArgs || curInnerFieldData.meta.hasArgs;

                    // Don't bother adding the field if there was nothing generated.
                    // This should fix the empty line issue in the inserted queries
                    if (!curInnerFieldStr) {
                        return acc;
                    }

                    // Join all the fields together
                    return `${acc}\n${curInnerFieldStr}`;
                }, '')
                .substring(1);
        }

        // Add the inner fields with braces if available
        if (innerFieldsData) {
            fieldStr += `{\n${innerFieldsData}\n`;
            fieldStr += `${' '.repeat(level * tabSize)}}`;
        }

        return { query: fieldStr, meta };
    }
}

const mutationsFolder = path.join(destDirPath, './mutations');
const queriesFolder = path.join(destDirPath, './queries');
const subscriptionsFolder = path.join(destDirPath, './subscriptions');

del.sync(mutationsFolder);
fs.mkdirSync(mutationsFolder);
del.sync(queriesFolder);
fs.mkdirSync(queriesFolder);
del.sync(subscriptionsFolder);
fs.mkdirSync(subscriptionsFolder);

const indexJsStart = `
const fs = require('fs');
const path = require('path');

`;

let indexJsExportAll = '';

if(gqlSchema.getMutationType()) {
    let mutationsIndexJs = indexJsStart;
    Object.keys(gqlSchema.getMutationType().getFields()).forEach((mutationType) => {
        const { query } = generateQuery(mutationType, 'Mutation');
        fs.writeFileSync(path.join(mutationsFolder, `./${mutationType}.gql`), query);
        mutationsIndexJs += `module.exports.${mutationType} = fs.readFileSync(path.join(__dirname, '${mutationType}.gql'), 'utf8');\n`;
    });
    fs.writeFileSync(path.join(mutationsFolder, 'index.js'), mutationsIndexJs);
    indexJsExportAll += `module.exports.mutations = require('./mutations');
`
} else {
    console.log('[gqlg warning]:', 'No mutation type found in your schema');
}

if(gqlSchema.getQueryType()) {
    let queriesIndexJs = indexJsStart;
    Object.keys(gqlSchema.getQueryType().getFields()).forEach((queryType) => {
        const { query } = generateQuery(queryType, 'Query');
        fs.writeFileSync(path.join(queriesFolder, `./${queryType}.gql`), query);
        queriesIndexJs += `module.exports.${queryType} = fs.readFileSync(path.join(__dirname, '${queryType}.gql'), 'utf8');\n`;
    });
    fs.writeFileSync(path.join(queriesFolder, 'index.js'), queriesIndexJs);
    indexJsExportAll += `module.exports.queries = require('./queries');`
} else {
    console.log('[gqlg warning]:', 'No query type found in your schema');
}

if(gqlSchema.getSubscriptionType()) {
    let subscriptionsIndexJs = indexJsStart;
    Object.keys(gqlSchema.getSubscriptionType().getFields()).forEach((subscriptionType) => {
        const { query } = generateQuery(subscriptionType, 'Subscription');
        fs.writeFileSync(path.join(subscriptionsFolder, `./${subscriptionType}.gql`), query);
        subscriptionsIndexJs += `module.exports.${subscriptionType} = fs.readFileSync(path.join(__dirname, '${subscriptionType}.gql'), 'utf8');\n`;
    });
    fs.writeFileSync(path.join(subscriptionsFolder, 'index.js'), subscriptionsIndexJs);
    indexJsExportAll += `module.exports.subscriptions = require('./subscriptions');`
} else {
    console.log('[gqlg warning]:', 'No subscription type found in your schema');
}

fs.writeFileSync(path.join(destDirPath, 'index.js'), indexJsExportAll);
