import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Achado 4.2 da #954: o roteiro R3.10 a R3.17 do `docs/TESTING.md` dizia que o pacote
// `libraries/material3-compose/` está na versão 2, e ele já estava na 3. O teste amarra o texto
// do guia à versão que a especialização do pacote declara, e as cópias `mat-vN` à cadeia.

const guide = readFileSync('docs/TESTING.md', 'utf8');
const spec = JSON.parse(
  readFileSync('libraries/material3-compose/material3-compose.spec.json', 'utf8'),
) as { version: number };
const row = (id: string): string => {
  const line = guide.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!line) throw new Error(`linha ${id} ausente`);
  return line;
};

describe('R3.10 a R3.17 do guia seguem a versão do pacote Material 3 (Compose)', () => {
  const v = spec.version;

  it('R3.10 mostra a versão do pacote na janela e na linha', () => {
    expect(row('R3.10')).toContain(`"v${v} · 50 tipo(s)`);
    expect(row('R3.10')).toContain(`"v${v} · 3 camada(s)"`);
  });

  it('o preparo gera mat-v(N+1) a mat-v(N+4) a partir da versão atual', () => {
    expect(guide).toContain(`\`mat-v${v + 1}\` a \`mat-v${v + 4}\``);
    expect(guide).toContain(`já está na versão ${v};`);
    expect(guide).toContain(`s['version'] = ${v + 1}`);
    expect(guide).toContain(`'from': ${v + 1}, 'to': ${v + 2}`);
  });

  it('R3.14 a R3.17 usam as versões deslocadas', () => {
    expect(row('R3.14')).toContain(`na versão ${v})`);
    expect(row('R3.14')).toContain(`\`mat-v${v + 1}\``);
    expect(row('R3.14')).toContain(`Da versão ${v} para a ${v + 1}.`);
    expect(row('R3.15')).toContain(`\`mat-v${v + 2}\``);
    expect(row('R3.16')).toContain(`\`mat-v${v + 3}\``);
    expect(row('R3.17')).toContain(`\`mat-v${v + 4}\``);
  });
});
