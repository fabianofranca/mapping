// @vitest-environment node
// Devolução do portão da 8.2 (achado 7): catraca do "aplicar em curso". Enquanto o
// aplicar das aceitas roda, a revisão segura a reavaliação (`derived.hold()`), e quem
// segura é `review.apply()` (`src/store/review.ts`). Por isso só ele chama
// `proposalActions.applyAccepted(`: um chamador novo aplicaria sem segurar e traria de
// volta o "Aplicar bloqueado" e o "O projeto mudou desde a sua última sessão" falsos no
// meio do aplicar. A lista é exata (`toEqual`): um chamador novo quebra este teste.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const PATTERN = /\.applyAccepted\(/;

/** Arquivos (ordenados) que chamam `.applyAccepted(`. */
export function callersOf(files: ReadonlyMap<string, string>): string[] {
  return [...files]
    .filter(([, text]) => PATTERN.test(text))
    .map(([path]) => path)
    .sort();
}

/** `{ caminho relativo → texto }` de todo `.ts`/`.tsx` sob `dir`. */
function sources(dir: string, root = dir): Map<string, string> {
  const result = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      for (const [k, v] of sources(path, root)) result.set(k, v);
    } else if (/\.tsx?$/.test(name)) {
      result.set(relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8'));
    }
  }
  return result;
}

/** Quem pode chamar `.applyAccepted(`: só o `review.apply()`, que segura a revisão. */
const ALLOWED = ['src/store/review.ts'];

describe('aplicar aceitas: só review.apply() chama applyAccepted', () => {
  it('os chamadores em src/ são exatamente os permitidos', () => {
    const files = sources(join(process.cwd(), 'src'), process.cwd());
    expect(callersOf(files)).toEqual(ALLOWED);
  });

  it('a varredura pega um chamador novo e deixa passar o certo', () => {
    const files = new Map([
      ['src/store/review.ts', 'return proposalActions.applyAccepted(id);'],
      ['src/ui/review/Novo.tsx', 'void session.proposalActions.applyAccepted(id);'],
      ['src/ui/review/Certo.tsx', 'const result = await review.apply();'],
      // A função do modelo não é o aplicar da sessão.
      ['src/store/proposalActions.ts', 'const applying = applyAccepted(base, p, now());'],
    ]);
    expect(callersOf(files)).toEqual(['src/store/review.ts', 'src/ui/review/Novo.tsx']);
  });
});
