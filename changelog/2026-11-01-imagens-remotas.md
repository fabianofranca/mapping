# Remote images — 2026-11-01 (épico `epic/imagens-remotas`, MCP 0.11.0, schema v13)

## Adicionado

- `image` node in components (component `formatVersion` 3; versions 1 and 2 are still accepted): a component can display an image from an `https://` URL, bound to a `string` field.
- Consent per origin: a bar above the canvas lists the new origins and only requests the image from the network after "Allow these"; the default is "Not now".
- Settings › Privacy: allowed origins with Revoke, and switches (off by default) for any origin, `http:`, local network and servers without CORS.
- Embeddable viewer 0.3.0 with the `remoteImages` option (off by default) and `allowOrigin`.
- Test script R15 and a library example with an avatar component.

## Alterado

- The `index.html` CSP now allows `https:` and `http:` in `img-src`, with Trusted Types and `no-referrer`; `connect-src` stays `'none'`.
- The image is never saved (project, zip, IndexedDB or cache): only the URL stays in `mapping.json`.
- The MCP never downloads images: it draws the placeholder and returns the URL as text.
- Images that fail or are blocked appear in Diagnostics and stay in the placeholder.
