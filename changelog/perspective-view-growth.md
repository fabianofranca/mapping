# The view of a perspective reads roots from the index — [Não lançado] (épico `epic/perspective-view-growth`, PR #2687, MCP 0.57.8, schema v23)

## Corrigido

- The growth case of the perspectives no longer goes red on a loaded runner: the view of a perspective in a large project does about half the work (about 2.7 times faster at 10,000 markings), because the project index now keeps the root of each container, marking and annotation by position and the view reads those arrays instead of hashing each id and reading each annotation. The pairwise third quartile of its growth ratio dropped from about 7× to about 5.3×, and the output of the view is unchanged.
