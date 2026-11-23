# The viewer reads a file through the format plugin — [Não lançado] (épico `epic/viewer-format-plugins`, MCP 0.59.1, schema v24)

## Adicionado

- The model turns a file's text, read by a file format's `parse` plugin (`formatVersion` 22), into the screens the embeddable viewer draws: one screen per container with component markings, sized by the container's density, with stable instance ids (the marking's `source.id` when it is unique, otherwise `m<n>`) and every failure as a code and a message (`format-not-found`, `spec-invalid`, `nothing-to-draw`, `sandbox-unavailable` and the plugin's own codes). The `mapping-viewer/formats` entry that exposes it arrives in the next phases of this epic.

## Alterado

- A loaded library keeps the file formats of its specialization (`fileFormats`, with each plugin's text) and the specialization's JSON. `loadLibraryFromUrl` of the viewer also fetches each format's plugin as text; a plugin that does not arrive is left out and reported in `problems`. Nothing else in the library changes, and `source`, `screenFromSource` and `origins` behave as before.
- The MCP server version is 0.59.1 (a patch: no tool, operation or message changed).
