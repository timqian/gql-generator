const fs = require('fs');
const parseGraphql = require('./parseGraphql');
module.exports = (namesObject) => {
  return namesObject.map((o) => {
    const schemaString = fs.readFileSync(o.graphqlFilePath, 'utf8');
    const parsedGraphql = parseGraphql(schemaString);
    return { name: o.name, ...parsedGraphql, types: parsedGraphql.typeDefinitions.length > 0 };
  });
};
