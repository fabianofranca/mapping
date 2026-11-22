# Code review of the growth tests and the local settle — [Não lançado] (épico `epic/cr-scale-settle`, PR #1971, MCP 0.56.2, schema v20)

## Corrigido

- a `mapping.json` edited by hand with a wrong `parentId` opens with the hierarchy by geometry, in the app and in the MCP, and the next save writes it
- the `create_marking` summary of the MCP names an unnamed instance like the app (`<Type> <code>`) even when the type's component file is missing from the catalog, instead of "Marking <code>"

## Alterado

- the container overlap check of `validateProject` groups containers by size class instead of one grid the size of the largest container, so one very large container among many small ones no longer makes opening a large project quadratic, and it no longer overflows the stack with hundreds of thousands of containers
- reading a project settles it in memory (a few tens of milliseconds more at 2,500 markings, nothing is written on open), and the clipped settle of an edit looks containers up through one lazy map and computes the difference between the projects once when the settle changed nothing
- the spatial index of a space walks only the occupied cells of a size class when a query is far from the grid (a marking placed very far away no longer stalls every settle of that space), and a move or resize inside a space keeps the position table instead of rescanning the project on the next edit, so a sequence of moves in a large project settles without sweeping the markings array
- in an MCP batch, a creation inside a container (with a parent) keeps the short-code prefix map current, so the next top-level creation no longer rebuilds the prefixes of every marking and arrow (a batch that alternates nested and top-level creations in a large project), and the container label rule of the MCP summaries lives in one place
