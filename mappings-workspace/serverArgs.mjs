// Arguments of the MCP server started by serve.mjs. `--scratch` exists since 0.51.0: an older
// installed server (setup.sh installs the latest stable release) exits with `unknown argument`,
// so the flag is only passed to a server that accepts it.
import { join } from 'node:path'

/** Does the server that printed this `--version` accept `--scratch` (0.51.0 or later)? */
export function supportsScratch(version) {
  const m = /^(\d+)\.(\d+)\./.exec(String(version).trim())
  if (!m) return false
  const major = Number(m[1])
  const minor = Number(m[2])
  return major > 0 || minor >= 51
}

/** The server's arguments for this workspace folder and the installed server version. */
export function serverArgs(here, version) {
  const args = ['--root', join(here, 'projects'), '--root', join(here, 'specializations')]
  if (supportsScratch(version)) args.push('--scratch', join(here, 'scratch'))
  return args
}
