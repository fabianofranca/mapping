// Plugin of the executor tests: `generate` never returns. The time limit must end it.
function generate() {
  for (;;) {
    // Never returns.
  }
}

// The viewer reads files with `parse`: the same call must end at the time limit too.
function parse() {
  for (;;) {
    // Never returns.
  }
}
