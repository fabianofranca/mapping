// Plugin of the executor tests: `generate` returns 5 MiB of text, over the 4 MiB limit.
function generate() {
  return 'x'.repeat(5 * 1024 * 1024);
}
