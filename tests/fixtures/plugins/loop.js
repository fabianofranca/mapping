// Plugin of the executor tests: `generate` never returns. The time limit must end it.
function generate() {
  var counter = 0;
  for (;;) {
    counter += 1;
  }
}
