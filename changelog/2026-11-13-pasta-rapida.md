# Fast folder — 2026-11-13 (épico `epic/pasta-rapida`, PR #1796, MCP unchanged, schema v19)

## Adicionado

- The text copied from Diagnostics, with a project in a folder, carries the `folder:` line with the folder calls and the time of the last operation of each kind (open, write, write with a library bundle, decide, apply proposal and check external changes); without a project in a folder, the line does not exist.

## Alterado

- On a slow folder, the check for external changes spaces itself out (from 3 s up to 30 s) and does not run in the middle of a write; applied or withdrawn proposals are checked when returning to the app or on **Check the folder now**.
- Opening a project in a folder, saving, accepting a proposal and applying or updating a specialization access the folder far less (faster on slow folders, such as Android's and the ones synced with the cloud): each folder is resolved once and reused, `mapping.json` is checked with a single read, independent files are read and written four at a time, and updating a specialization only re-checks its own library.
