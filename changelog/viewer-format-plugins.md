# The viewer reads a file through the format plugin — [Não lançado] (épico `epic/viewer-format-plugins`, PR #2788, MCP 0.59.1, schema v24)

## Adicionado

- The model turns a file's text, read by a file format's `parse` plugin (`formatVersion` 22), into the screens the embeddable viewer draws: one screen per container with component markings, sized by the container's density, with stable instance ids (the marking's `source.id` when it is unique, otherwise `m<n>`) and every failure as a code and a message (`format-not-found`, `spec-invalid`, `nothing-to-draw`, `sandbox-unavailable` and the plugin's own codes). The `mapping-viewer/formats` entry that exposes it arrives in the next phases of this epic.

- `mapping-viewer/formats`, a third entry of the viewer package (`mapping-viewer` 0.10.0): `screenFromFormat(library, text, { format, measure })` reads a file through the specialization's format plugin and gives the screens the viewer draws, `disposeFormatSandbox()` removes the page's iframe and `FORMAT_SANDBOX_CSP` has the exact values a host's CSP needs (the bootstrap hash in `script-src`, `blob:` in `worker-src`, `mapping-viewer` and `default` in `trusted-types`). The plugin runs in the app's sandbox iframe and `blob:` Worker, with the `srcdoc` set through a Trusted Types policy named `mapping-viewer`; a host page that refuses any of the three gets `sandbox-unavailable` in the result (nothing in the console) and the rest of the viewer keeps working. `viewer/PACKAGE-README.md` gains "Screen from a file format" and "Content Security Policy of the host". The core bundle does not change (it only exports the type `LibraryFileFormat`).

## Alterado

- The sandbox document of a format plugin (`SANDBOX_SRCDOC`) carries a CSP of its own in a `<meta>` (`default-src 'none'; script-src <hash> blob:; worker-src blob:; connect-src 'none'`), enforced together with the host's: in a page whose CSP allows the network the plugin still has none (`WebTransport` and a dynamic `import()` included). The app does not change behavior. `SANDBOX_BOOTSTRAP_HASH` is a constant checked against the build's hash by a test, and a failure of the sandbox itself (a refused frame or Worker, a frame that never says it is ready) is tagged `phase: 'sandbox'`; the app words it as before.

- A loaded library keeps the file formats of its specialization (`fileFormats`, with each plugin's text) and the specialization's JSON. `loadLibraryFromUrl` of the viewer also fetches each format's plugin as text; a plugin that does not arrive is left out and reported in `problems`. Nothing else in the library changes, and `source`, `screenFromSource` and `origins` behave as before.
- The MCP server version is 0.59.1 (a patch: no tool, operation or message changed).
