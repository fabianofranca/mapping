# Whole project in English — [Não lançado] (épico `epic/english`, PR #0, MCP 0.41.0, schema v20)

## Alterado

- **Language rule in `CLAUDE.md` (for whoever runs the flow, #741, ID1):** everything in the repository and on GitHub (code, comments, documentation, tests, messages, commits, issues and PRs) is written in English; Brazilian Portuguese stays only in the app's pt-BR dictionary, the interactive guide's pt-BR strings, the locale tests, the declared fixtures, the protocol terms (`PROTOCOL_TERMS`) and `mappings-workspace/`. Chats with the owner stay in Portuguese. The line that allowed comments and documentation in Portuguese is gone.
- **`CLAUDE.md` and `README.md` translated to English (#741, ID1):** no rule changes meaning; the section titles are now in English (`Project`, `Commands`, `Architecture rules`, `Runtime environment restrictions`, `Code`, `Workflow (summary)`, `Mapping workspace` in `CLAUDE.md`), and the anchors the stage sheets cite follow them (for example `CLAUDE.md#architecture-rules`).

## Adicionado

- **`tests/tooling/portugueseAllowlist.ts` with the `PROTOCOL_TERMS` list (for whoever runs the flow, #741, ID1):** the frozen machine vocabulary (values written to the panel, outputs read by skills and scheduled prompts, phrases of the notices between sessions, section titles of the records and markers of the issues), each term with the file that produces or reads it. No test uses the list yet; the guard that does is the work of phase ID10.
