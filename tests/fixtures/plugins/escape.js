// Plugin of the executor tests: `generate` looks for a way out of the sandbox and writes what it
// found as JSON. A clean sandbox gives `found: []` and an `import()` that never loads.
function generate() {
  var found = [];
  var names = [
    'fetch',
    'XMLHttpRequest',
    'require',
    'module',
    'process',
    'Buffer',
    'setTimeout',
    'setInterval',
    'setImmediate',
    'queueMicrotask',
    'std',
    'os',
    'print',
    'scriptArgs',
    'WebAssembly',
  ];
  names.forEach(function (name) {
    if (typeof globalThis[name] !== 'undefined') found.push(name);
  });
  var report = { found: found, imported: 'none' };
  try {
    var loading = import('node:fs');
    report.imported = 'pending';
    loading.then(
      function () {
        report.imported = 'loaded';
      },
      function () {
        report.imported = 'refused';
      },
    );
  } catch {
    report.imported = 'threw';
  }
  report.console = [typeof console.log, typeof console.warn, typeof console.error];
  return JSON.stringify(report);
}
