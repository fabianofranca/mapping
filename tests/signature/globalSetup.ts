import { execFileSync } from 'node:child_process';

/** Generates `dist-mcp/mapping-signature.{js,mjs}` once before the extractor tests (which run the generated file). */
export default function setup(): void {
  execFileSync(process.execPath, ['signature/build.mjs'], { stdio: 'pipe' });
}
