// Plugin of the executor tests: both functions return a Promise, which is not allowed.
function generate() {
  return Promise.resolve('text');
}

function parse() {
  return Promise.resolve({ operations: [] });
}
