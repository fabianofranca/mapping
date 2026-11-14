import { execFileSync } from 'node:child_process';

/** Generates `dist-mcp/mapping-mcp.js` once before all the server tests (which start it over stdio). */
export default function setup(): void {
  execFileSync(process.execPath, ['mcp/build.mjs'], { stdio: 'pipe' });
}
