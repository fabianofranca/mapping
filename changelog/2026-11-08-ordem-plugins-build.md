# Build resilient to plugin order — 2026-11-08 (épico `epic/ordem-plugins-build`, PR #1069, MCP 0.28.4, schema v18)

## Corrigido

- `npm run build` no longer breaks with `vite-plugin-singlefile` 2.3.4 or newer: the CSP and the service worker now always run after the JS and CSS are embedded in `index.html`, whatever the plugin version.
