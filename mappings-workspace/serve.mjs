#!/usr/bin/env node
// Starts the Mapping MCP server for this workspace from the repository root.
//
// - Locally, it only starts the server (tools/mapping-mcp.js is already installed).
// - In a Claude Code cloud session (CLAUDE_CODE_REMOTE=true) or when the server is missing, it runs
//   setup.sh first, so the session always has the latest server and skills.
//
// It runs setup.sh with --no-self-update: in this repository the versioned copy is the source (kept
// equal to examples/workspace/setup.sh by tests/tooling/mappingsWorkspaceSync.test.ts), so the
// session's setup.sh is never replaced by the one from the release (not in an epic that changes
// examples/workspace/setup.sh before the release is out, nor if the merge's release fails). The
// server, skill, AGENTS.md block, watcher and extractor still come from the latest stable release.
//
// If setup.sh fails or exceeds 25 s, the installed server starts anyway (exit 1 only without one).
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
  // Bounded below the 30 s that Claude Code waits for an MCP server to start: a slow network must not
  // make the client give up with no message. On timeout or failure, an installed server still starts.
  const setup = spawnSync('bash', ['./setup.sh', '--no-self-update'], {
    cwd: here,
    stdio: ['ignore', process.stderr.fd, process.stderr.fd],
    timeout: 25000,
  })
  if (setup.status !== 0 || !existsSync(server)) {
    const reason =
      setup.error?.code === 'ETIMEDOUT'
        ? 'timed out after 25 s'
        : (setup.error?.message ?? `exit ${setup.status}`)
    if (!existsSync(server)) {
      process.stderr.write(
        `mappings-workspace/setup.sh did not finish (${reason}); the MCP server was not started.\n`,
      )
      process.exit(1)
    }
    process.stderr.write(
      `mappings-workspace/setup.sh did not finish (${reason}); starting the installed server.\n`,
    )
  }
}

const child = spawn(
  process.execPath,
  [
    server,
    '--root',
    join(here, 'projects'),
    '--root',
    join(here, 'specializations'),
    '--scratch',
    join(here, 'scratch'),
  ],
  { stdio: 'inherit' },
)
child.on('error', (err) => {
  process.stderr.write(`could not start the MCP server: ${err.message}\n`)
  process.exit(1)
})
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
