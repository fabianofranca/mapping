# Backlog detailing skill — 2026-11-08 (epic `epic/skill-detalhar`, PR #938, MCP 0.28.2, schema v18)

## Adicionado

- Claude Code skill `/detalhar-backlog` (`.claude/skills/detalhar-backlog/`), for the delivery flow. First, an Opus session proposes merging issues into a single epic, to have fewer small MCP versions and one tester round for several. Then, Opus sessions detail as `ready` stages all the open `roadmap` and `bug` issues that are not yet `ready`, up to 3 at a time. Product decisions reach the owner through the question picker, always with a recommended option. Each stage comes out with the `**Depende de:**` line, which gives the implementation order.
