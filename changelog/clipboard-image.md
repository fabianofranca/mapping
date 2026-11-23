# Replace an image from the clipboard and export marking images — [Não lançado] (épico `epic/clipboard-image`, PR #2768, MCP 0.58.3, schema v23)

## Adicionado

- MCP: patch version with no change in behavior. The model gains the pure rules of the image export (`src/model/imageExport.ts`: which markings can be exported together, their bounding box and the suggested file name) and they enter the server bundle; no tool, parameter or format changes.
- Behind the scenes (no change on screen yet): the crop can keep the full size of the area (no 2048 px limit), "Save as" can open before the PNG is ready, and the app can read an image from the clipboard. The next parts of this stage use them: replace an image with the clipboard image, and "Export image…" for a marking or a selection of markings.
