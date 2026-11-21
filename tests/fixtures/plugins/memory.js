// Plugin of the executor tests: `generate` allocates until the memory limit. It also catches the
// error and keeps going, which must not help it: the limit holds.
function generate() {
  var kept = [];
  for (;;) {
    try {
      kept.push(new Array(1000000).fill('memory'));
    } catch (error) {
      kept.push('caught: ' + error.message);
    }
  }
}
