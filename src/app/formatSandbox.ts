// The fixed texts of the sandbox that runs a format plugin in the app (stage #2035, decision 9):
// the `srcdoc` document of the hidden `sandbox="allow-scripts"` iframe with its only script
// (`SANDBOX_BOOTSTRAP`) and the one-line prefix and the suffix that surround the plugin's text in
// the Worker. They are constants, never built from data: the CSP allows the bootstrap by its hash
// (`pwa/csp.ts`) and Trusted Types accepts exactly `SANDBOX_SRCDOC` (`trustedTypes.ts`). Pure: no
// browser APIs at import, so the build (`pwa/csp.ts`) reads it in Node.
//
// The page talks to the bootstrap by `postMessage`:
//   page → frame   { id, source, fn, args, timeoutMs }   (`args` is one JSON text)
//   frame → page   { ready: true }                       (once, when the bootstrap runs)
//   frame → page   { id, status: 'ok', output }          (`output` is one JSON text)
//                  { id, status: 'error', message, line?, column?, phase? }   (`phase: 'load'` when the text failed to load,
//                                                                              `phase: 'sandbox'` when the page refused the Worker)
//                  { id, status: 'missing' }             (the plugin does not define `fn`)
//                  { id, status: 'invalid', message }    (a Promise, or not JSON)
//                  { id, status: 'timeout' }
// Each call gets a new `blob:` Worker, built from [prefix, plugin text, suffix], that the
// bootstrap terminates at the end or at the time limit.

/** Worker globals outside ECMAScript that the prefix removes (QuickJS has none of them). */
export const SANDBOX_REMOVED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'indexedDB',
  'caches',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'queueMicrotask',
  'requestAnimationFrame',
  'navigator',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'WebAssembly',
] as const;

/**
 * The first line of the Worker's script. It is one line, with no line break, and the plugin's
 * text follows it on that same line, so every line number the engine reports is the plugin's own
 * (only a column on line 1 is shifted, by `WORKER_PREFIX.length`; the suffix and the bootstrap
 * take it back). It removes the globals above from the global object and its prototypes and
 * gives `console` three methods that do nothing. No `"use strict"`: a directive here would make
 * the plugin strict, and a plugin is a classic script.
 */
export const WORKER_PREFIX =
  '(function(g){var n=' +
  JSON.stringify(SANDBOX_REMOVED_GLOBALS) +
  ';for(var o=g;o;o=Object.getPrototypeOf(o)){for(var i=0;i<n.length;i++){try{delete o[n[i]]}catch(e){}}}' +
  'for(var j=0;j<n.length;j++){if(typeof g[n[j]]!=="undefined"){try{Object.defineProperty(g,n[j],{value:undefined,configurable:true})}catch(e){}}}' +
  'var f=function(){};g.console={log:f,warn:f,error:f}})(self);';

/**
 * The suffix: answers the bootstrap's one message by calling `generate` or `parse` of the
 * plugin. Its names start with `$` so they never hide the plugin's `generate` and `parse`.
 */
export const WORKER_SUFFIX = `
;(function ($post, $parse, $stringify, $prefixLength) {
  var $failure = function (error) {
    var name = error && error.name ? String(error.name) : 'Error';
    var message = error && error.message !== undefined ? String(error.message) : String(error);
    var out = { status: 'error', message: name + ': ' + message };
    var match = /blob:\\S*?:(\\d+):(\\d+)/.exec(String(error && error.stack));
    if (match) {
      out.line = Number(match[1]);
      out.column = Number(match[2]) - (out.line === 1 ? $prefixLength : 0);
    }
    return out;
  };
  self.onmessage = function (event) {
    var wanted = event.data.fn;
    var $fn = wanted === 'parse' ? (typeof parse === 'function' ? parse : null) : (typeof generate === 'function' ? generate : null);
    if ($fn === null) return $post({ status: 'missing' });
    var out;
    try {
      out = $fn.apply(undefined, $parse(event.data.args));
    } catch (error) {
      return $post($failure(error));
    }
    if (out !== null && (typeof out === 'object' || typeof out === 'function') && typeof out.then === 'function') {
      return $post({ status: 'invalid', message: wanted + ' returned a Promise: the functions of a plugin are synchronous' });
    }
    var json;
    try {
      json = $stringify(out);
    } catch (error) {
      return $post({ status: 'invalid', message: wanted + ' returned something that is not JSON (' + String(error && error.message) + ')' });
    }
    if (json === undefined) return $post({ status: 'invalid', message: wanted + ' returned ' + typeof out });
    $post({ status: 'ok', output: json });
  };
})(self.postMessage.bind(self), self.JSON.parse.bind(self.JSON), self.JSON.stringify.bind(self.JSON), ${WORKER_PREFIX.length});
`;

/**
 * The iframe's only script. The iframe has an opaque origin (`sandbox` without
 * `allow-same-origin`), so it sees nothing of the app. It creates its own Trusted Types `default`
 * policy (the document inherits `require-trusted-types-for`), whose `createScriptURL` accepts only
 * `blob:` URLs, runs one call at a time and terminates the Worker at the end or at the time limit.
 */
export const SANDBOX_BOOTSTRAP = `(function () {
  var host = window.parent;
  var prefix = ${JSON.stringify(WORKER_PREFIX)};
  var suffix = ${JSON.stringify(WORKER_SUFFIX)};
  var busy = false;
  try {
    trustedTypes.createPolicy('default', {
      createScriptURL: function (url) {
        if (/^blob:/.test(url)) return url;
        throw new TypeError('Only blob: URLs');
      },
    });
  } catch (error) {}
  var reply = function (message) { host.postMessage(message, '*'); };
  window.addEventListener('message', function (event) {
    if (event.source !== host || busy) return;
    var request = event.data;
    if (request === null || typeof request !== 'object' || typeof request.source !== 'string' || typeof request.args !== 'string' || typeof request.timeoutMs !== 'number' || (request.fn !== 'generate' && request.fn !== 'parse')) {
      return reply({ id: request && request.id, status: 'invalid', message: 'bad request' });
    }
    busy = true;
    var url = null;
    var worker = null;
    var timer = 0;
    var done = false;
    var finish = function (message) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { worker.terminate(); } catch (error) {}
      try { URL.revokeObjectURL(url); } catch (error) {}
      busy = false;
      message.id = request.id;
      reply(message);
    };
    try {
      url = URL.createObjectURL(new Blob([prefix + request.source + suffix], { type: 'text/javascript' }));
      worker = new Worker(url);
    } catch (error) {
      return finish({ status: 'error', phase: 'sandbox', message: String(error && error.message) });
    }
    worker.onmessage = function (answer) {
      var data = answer.data;
      if (data !== null && typeof data === 'object') finish(data);
    };
    worker.onerror = function (failure) {
      failure.preventDefault();
      // A plain event with no message: the page refused the Worker's script (its CSP), so the plugin never loaded.
      if (typeof failure.message !== 'string' || failure.message === '') {
        return finish({ status: 'error', phase: 'sandbox', message: 'the page did not allow the sandbox to start its Worker' });
      }
      var out = { status: 'error', phase: 'load', message: String(failure.message).replace(/^Uncaught /, '') };
      if (failure.lineno > 0) {
        out.line = failure.lineno;
        out.column = Math.max(1, failure.colno - (failure.lineno === 1 ? prefix.length : 0));
      }
      finish(out);
    };
    timer = setTimeout(function () { finish({ status: 'timeout' }); }, request.timeoutMs);
    worker.postMessage({ fn: request.fn, args: request.args });
  });
  reply({ ready: true });
})();`;

/**
 * The hash of `SANDBOX_BOOTSTRAP` in the form a CSP `script-src` takes (`'sha256-…'`): the host page allows
 * the iframe's only script by it (the app's CSP, `pwa/csp.ts`, and the host of the viewer, `FORMAT_SANDBOX_CSP`).
 * A constant, because this module stays pure (no `node:crypto` in the browser); `tests/app/cspBuild.test.ts`
 * checks that it equals `cspHash(SANDBOX_BOOTSTRAP)`, so a change to the bootstrap fails there until this is
 * updated (and the hash quoted in `viewer/PACKAGE-README.md` with it).
 */
export const SANDBOX_BOOTSTRAP_HASH =
  "'sha256-0Fot2/lUbTdR3FiiVQdAaKvHyEBgTK6ZQgIXa8WcuKI='";

/**
 * The sandbox document's own CSP (stage #2059, decision 5). A `<meta>` policy is enforced together with the one
 * the document inherits from the host, so it only narrows: the plugin has no network in any host (a host that
 * allows `connect-src *` would otherwise leave `WebTransport` and a dynamic `import()` open). The only script
 * is the bootstrap, by hash; the Worker is a `blob:` one, and it inherits this policy.
 */
export const SANDBOX_CSP = `default-src 'none'; script-src ${SANDBOX_BOOTSTRAP_HASH} blob:; worker-src blob:; connect-src 'none'`;

/** The iframe's document (`iframe.srcdoc`): its CSP first, then the bootstrap inline, in a `<script>` that the CSP allows by hash. */
export const SANDBOX_SRCDOC = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><script>${SANDBOX_BOOTSTRAP}</script></head><body></body></html>`;
