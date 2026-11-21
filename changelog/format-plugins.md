# File formats of the specialization via isolated plugin — [Não lançado] (épico `epic/format-plugins`, PR #2426, MCP 0.53.0, schema v22, specialization formatVersion 20)

## Adicionado

- Specialization `formatVersion` 20: the root key `fileFormats` declares the file formats the specialization reads and writes (`id`, `name`, `extension`, `plugin`, `contract`, `scope`, `description`, `examples`). Each format is handled by a `.js` plugin of the package; a format is cited as `<specId>/<formatId>`. The key is outside the version contract (no `version` raise, no migration) and the earlier versions behave as before. Nothing runs a plugin yet (#1923).
- Package: the `.js` plugin is a text file of the package, read by the app and by `validate_library`/`apply_specialization` and copied to `specs/<id>/plugins/`; level 1 of the library validator checks that the plugin, the examples and the `input` files exist and that the plugin has at most 1 MiB. The `validate_library` summary gains `fileFormats` when the specialization declares formats.

## Alterado

- File formats of the specialization are handled by an isolated plugin running in QuickJS (formatVersion 20) (#1923).
- `docs/SPEC-FORMAT.md`, Help › Specializations, `spec-author` skill and `docs/AGENT-GUIDE.md`: the current format version is 20 and the code coming from a specialization only runs isolated.
- The `dist/index.html` ceiling went up 16 KiB, from 2,359,296 to 2,375,680 bytes, by the budget rule (the formatVersion 20 help text in both languages and the `fileFormats` validation); above the limits, `bug` for the owner to review.
