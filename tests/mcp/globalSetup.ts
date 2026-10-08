import { execFileSync } from 'node:child_process';

/** Gera `dist-mcp/mapping-mcp.js` uma vez antes de todos os testes do servidor (que o sobem por stdio). */
export default function setup(): void {
  execFileSync(process.execPath, ['mcp/build.mjs'], { stdio: 'pipe' });
}
