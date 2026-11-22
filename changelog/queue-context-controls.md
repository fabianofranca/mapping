# Queue context and cost controls — [Não lançado] (épico `epic/queue-context-controls`, PR #0, MCP unchanged, schema v23)

## Alterado

- The PR gate of the context hook (`scripts/ci/contextGuard.mjs`) no longer refuses text that only mentions `gh pr create` (a heredoc body or a quoted string, such as a multi-line commit message) and now also sees the other ways of opening a PR: `bash -c`/`sh -c`/`eval`, a `curl` POST to the pulls endpoint and the GraphQL `createPullRequest` mutation (`gh api graphql` or `curl` to `/graphql`). A script file, a command built in a variable, another HTTP client and a query read from a file stay best effort.
