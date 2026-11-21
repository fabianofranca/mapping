// Plugin of the executor tests: `generate` throws. The test checks the message and the
// `line:column` of the throw (line 8).
function helper(value) {
  return value;
}

function generate(input) {
  throw new Error('boom from the plugin: ' + helper(input.format.id));
}
