// Returns whichever lodash version gets resolved at runtime
module.exports = function getLodashVersion() {
  return require("lodash/package.json").version;
};
