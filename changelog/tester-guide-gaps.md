# Cloud tester guide and helpers — [Não lançado] (épico `epic/tester-guide-gaps`, #2450)

MCP sem mudança. Schema unchanged.

## Alterado

- The report template (`docs/TESTING.md`, section 10) gives each finding a `- Cause: `produto`|`roteiro`` line, and the Summary counts `roteiro` apart. The batch subagent's `relato-<batch>.md` and its return line (`findings: <code severity cause short title…>`) carry the cause too, so the main session counts `roteiro` without opening the file (#2264).
- `docs/TESTING-NUVEM-CONSULTA.md` states the batch subagent's model: the `Agent` tool with `model: "sonnet"` and medium effort, whatever the session's model (#2364).
- Group and batch numbers no longer mix: a batch's `Mode:` line is copied verbatim from the message, the `Batch:` line carries the `batch k of n` of `--faixas`, and the `k` of `grupo k de n` comes only from the message (#2450).
