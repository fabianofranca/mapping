// Plugin of the executor tests: `generate` looks for a way out of the sandbox and writes what it
// found as JSON. A clean sandbox gives `found: []` and an `import()` that never loads.
function generate() {
  var found = [];
  if (typeof fetch !== 'undefined') found.push('fetch');
  if (typeof XMLHttpRequest !== 'undefined') found.push('XMLHttpRequest');
  if (typeof require !== 'undefined') found.push('require');
  if (typeof module !== 'undefined') found.push('module');
  if (typeof process !== 'undefined') found.push('process');
  if (typeof Buffer !== 'undefined') found.push('Buffer');
  if (typeof setTimeout !== 'undefined') found.push('setTimeout');
  if (typeof setInterval !== 'undefined') found.push('setInterval');
  if (typeof setImmediate !== 'undefined') found.push('setImmediate');
  if (typeof queueMicrotask !== 'undefined') found.push('queueMicrotask');
  if (typeof WebAssembly !== 'undefined') found.push('WebAssembly');
  if (typeof SharedArrayBuffer !== 'undefined') found.push('SharedArrayBuffer');
  var imported = 'none';
  try {
    var loading = import('node:fs');
    imported = 'pending';
    loading.then(
      function () {
        imported = 'loaded';
      },
      function () {
        imported = 'refused';
      },
    );
  } catch (error) {
    imported = 'threw';
  }
  return JSON.stringify({
    found: found,
    imported: imported,
    console: [typeof console.log, typeof console.warn, typeof console.error],
  });
}
