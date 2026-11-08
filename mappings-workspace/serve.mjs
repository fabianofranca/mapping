#!/usr/bin/env node
// Starts the Mapping MCP server for this workspace from the repository root.
//
// - Locally, it only starts the server (tools/mapping-mcp.js is already installed).
// - In a Claude Code cloud session (CLAUDE_CODE_REMOTE=true) or when the server is missing, it runs
//   setup.sh first, so the session always has the latest server and skills.
//
// setup.sh output goes to stderr: stdout is the MCP protocol and must stay clean.
// The server keeps the repository root as its working directory, so code checks (find_by_code,
// get_code_hints) see the repository; only the roots point into this folder.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const server = join(here, 'tools', 'mapping-mcp.js')

if (process.env.CLAUDE_CODE_REMOTE === 'true' || !existsSync(server)) {
  const setup = spawnSync('bash', ['./setup.sh'], {
    cwd: here,
    stdio: ['ignore', process.stderr.fd, process.stderr.fd],
  })
  if (setup.status !== 0 || !existsSync(server)) {
    process.stderr.write(
      `mappings-workspace/setup.sh failed (${setup.error?.message ?? `exit ${setup.status}`}); ` +
        'the MCP server was not started.\n',
    )
    process.exit(1)
  }
}

const child = spawn(
  process.execPath,
  [
    server,
    '--root',
    join(here, 'projetos'),
    '--root',
    join(here, 'especializacoes'),
  ],
  { stdio: 'inherit' },
)
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
