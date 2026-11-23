# Replace an image from the clipboard and export marking images — [Não lançado] (épico `epic/clipboard-image`, PR #2768, MCP 0.58.3, schema v23)

## Adicionado

- MCP: patch version with no change in behavior. The model gains the pure rules of the image export (`src/model/imageExport.ts`: which markings can be exported together, their bounding box and the suggested file name) and they enter the server bundle; no tool, parameter or format changes.
- **Replace an image from the clipboard:** Ctrl/Cmd+V with one image selected asks "Paste image": **Replace the selected image** (one undo entry, with the aspect dialog when the ratio differs), **Add as new** or **Cancel**. The canvas menu of an image with a file also has **Replace with clipboard image**: it is disabled in read-only and in review, hidden where the browser cannot read the clipboard, and toasts when the clipboard has no image or access is refused.
- **Export image…** in the canvas menu of a marking and in the ⋯ menu of its Tree row: saves the PNG of the marking, or of the selected markings on the same image (their bounding box), at the full original size, through "Save as" (or a download where the browser has no picker). It stays available with locked markings, in read-only and in review; it is disabled, with the reason as a tooltip, for markings of different images or without an image file.
- Test script R46 ("Replace from the clipboard and export the image", 14 steps) in `docs/TESTING.md`, in block 5 of the full round, and the flows described in `docs/ARCHITECTURE.md`.
