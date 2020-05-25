const path = require('path');
module.exports = (fileList) => {
  return fileList.map(({ name }) => {
    const possibleModuleName = path.basename(name, '.graphql');
    return { name: possibleModuleName, graphqlFilePath: name };
  });
};
