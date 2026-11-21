// Plugin of the executor tests: gives back what it receives. `generate` writes its input as JSON
// text; `parse` returns the text and the input it got, so a test sees both arrive intact.
function generate(input) {
  return JSON.stringify(input);
}

function parse(text, input) {
  return { operations: [], warnings: [text], input: input };
}
