// Plugin of the browser e2e tests (stage #2035, AF3): `generate` looks, inside the app's sandbox,
// for a way out of it and writes what it found as JSON. A clean sandbox has none of the globals
// below, and `fetch` and `indexedDB.open` fail (here: because the names do not exist).
function generate() {
  var found = [];
  var names = [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'importScripts',
    'indexedDB',
    'caches',
    'setTimeout',
    'setInterval',
    'queueMicrotask',
    'navigator',
    'parent',
    'document',
    'window',
    'localStorage',
    'Worker',
    'WebAssembly',
  ];
  names.forEach(function (name) {
    if (typeof globalThis[name] !== 'undefined') found.push(name);
  });
  var report = { found: found, fetch: 'none', indexedDB: 'none' };
  try {
    fetch('https://example.invalid/leak');
    report.fetch = 'called';
  } catch (error) {
    report.fetch = 'threw';
  }
  try {
    indexedDB.open('mapping');
    report.indexedDB = 'called';
  } catch (error) {
    report.indexedDB = 'threw';
  }
  return JSON.stringify(report);
}
