# Decorative markings (Frame, Bracket, Line) — [Não lançado] (épico `epic/decorative-markings`, PR #2922, MCP 0.62.0, schema v25)

## Adicionado

- The format has a new optional `markings[].decorative` flag (schema v25, written only when `true`, right after `floating`). A decorative marking is a child like any other but is never a parent: the parents of the other markings and containers are the same as without it. Migration v24 → v25 only changes the version number, so an earlier app opens a file that holds one read-only instead of dropping the flag.
- The model settles a decorative marking into the smallest non-decorative marking that contains it, refuses to make a marking both decorative and floating (`decorative-floating`) and checks the new invariants `parent-decorative` and `decorative-floating`, with a repair for each. A marking created decorative is drawn below its siblings.
