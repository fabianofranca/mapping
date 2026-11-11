// R25.78 e R25.82 (achados 1.1 e 1.2 da rodada #1639): o esperado do roteiro na app tem de caber
// no que o desenho dá em qualquer escala (antialiasing e escala não inteira), sem valor exato
// que só vale a `s` 1 nem sonda na borda de um traço.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function row(id: string): string {
  const line = readFileSync('docs/TESTING.md', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`| ${id} |`));
  if (!line) throw new Error(`${id} não está no docs/TESTING.md`);
  return line;
}

describe('docs/TESTING.md: tolerâncias do R25.78 e do R25.82', () => {
  it('R25.78: o vermelho girado mede 55 a 58 (56,57 ± 1,5), medido com FUZZ=15', () => {
    const r = row('R25.78');
    expect(r).toContain("FUZZ=15 unid ra.png '#D32F2F'");
    expect(r).toContain('entre 55 e 58');
    expect(r).not.toContain('entre 56 e 59');
  });

  it('R25.82: o contorno se sonda dentro do traço e os cinzas seguem o critério do R25.81', () => {
    const r = row('R25.82');
    expect(r).not.toMatch(/353535|FDFDFD/);
    expect(r).toContain('(151, 60) no lugar de (150, 60)');
    expect(r).toContain('canais iguais e menores que `80`');
    expect(r).toContain('canais iguais e a partir de `F0`');
  });
});
