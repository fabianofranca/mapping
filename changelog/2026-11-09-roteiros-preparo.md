# Scripts that match the app — 2026-11-09 (epic `epic/roteiros-preparo`, PR #1244, MCP 0.28.12, schema v18)

## Corrigido

- R0.1 of `docs/TESTING.md` also lists **Open library** on the home screen, in the app's order.
- R1.8a reads the tooltip text from `span.tooltip` (the `data-tooltip` attribute is empty).
- R1.20b prepares its own project in `principal` (the **Show components over photos** option, a Note and **Link to…**), with the values expected from that setup (`data-arrows` 1, `data-components` 1); R1.20c undoes the setup at the end, and the "Não gravam nada" list and the `revision` of each write match that.
- R1.21a (2) and (3) expect `aria-pressed` `false` after closing with the **X**; R1.21b says where focus goes when closing Incomplete (the strip button if opened by it, the canvas if opened by `Ctrl+Shift+5`).
- R9.12a does not expect a marking name in `telas`; R9.13 gives the `rect` of the Top app bar and of the Button, and the expected result checks the Top app bar as the parent.
- R15.3 and R15.4 say that focus stays on **Image URL** when the strip appears, and count the requests by the difference of `grep -c foto.png` in the server log.
- R12.12 gives the size of the canvas Button (136 × 40, a small pill in **Fit all**); R12.20a says that you stay in the review and what the **Proposals** list shows after `Ctrl+Z`.
- R12.22 and the R12 note say that they depend on R12.17 to R12.21 and list the zip's root (`mapping.json`, `specs/` and `proposals/`).
- R12.15, R12.27, the Setup of R12.23 to R12.28, R16.3, R18.3 and R25.45 pass `root` `design/mapeamentos` in `create_project` (without it, `root-required` with the two roots); R25.54 uses `marking` in `update_marking`.
- R12.26 and the `get_marking_image` row in `docs/MCP.md` say `error.hint` (the `hint` comes directly in `error`).
- The R23 setup says that it runs only once; R23.8 describes the direction as an `img` icon with an accessible name; R23.16 fixes the count of the Draft.
- R17.10 talks about the stored `background` and the Scaffold that covers the container.
- R25.42 treats **icon** as a button group; R25.47 and R25.48 use the zooms that the keyboard gives (26%, ≈51% and 381%) and the container's scale.
- Fixes from the tester's directed round (RP3): the R1.20b setup uses **Add to canvas: Note** (the Note is floating), without the Settings option, and tells you to bring the panel back with **Show all** after R1.20a; R1.21a gains the setup of (6) and (7) and R1.21b calls the strip button **Details**; R15.3 and R15.4 count the request to Pages by `page.on('request')` (the local server log only applies to R15.7 to R15.11); R23.5 gives the label point near the left edge; R25.46 to R25.48 say that the Palette does not ask for a position and give the sizes with `placement.scale`; R12.20a says when the "In review" badge appears; R0.1, R1.4a, R1.16, R1.22, R9.15, R12.3, R12.10f, R12.11, R12.11d, R12.12, R17.7 and R17.10 align the text with what the app shows.
