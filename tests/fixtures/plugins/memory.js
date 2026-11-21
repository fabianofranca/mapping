// Plugin of the executor tests: `generate` allocates until the memory limit stops it.
function generate() {
  var kept = [];
  for (;;) {
    kept.push(new Array(1000000).fill('memory'));
  }
}
