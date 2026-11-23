# External image reload — [Não lançado] (épico `epic/external-image-reload`, PR #0, MCP unchanged, schema v23)

## Corrigido

- An image file replaced on disk with the same name (by another program, git or a text editor) shows its new content on the canvas as soon as the app checks the folder (focus back on the window, or a reload from outside). Before, it stayed blank until the project was reopened. The same goes for a new image that arrives with a project reloaded from outside.
