import { execFileSync } from 'node:child_process';

/** Gera `dist-mcp/mapping-signature.{js,mjs}` uma vez antes dos testes do extrator (que rodam o arquivo gerado). */
export default function setup(): void {
  execFileSync(process.execPath, ['signature/build.mjs'], { stdio: 'pipe' });
}
