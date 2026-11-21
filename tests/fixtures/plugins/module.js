// Plugin of the executor tests: an ES module, which is a syntax error in a classic script. It is
// the one fixture that ESLint skips (eslint.config.js), because it must not parse.
export function generate() {
  return 'text';
}
