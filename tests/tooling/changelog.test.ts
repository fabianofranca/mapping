// @vitest-environment node
// Etapa #478, fase RE2: o changelog é um arquivo por épico em changelog/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'changelog';
const entries = existsSync(DIR) ? readdirSync(DIR).filter((f) => f !== 'README.md') : [];
const read = (f: string): string => readFileSync(`${DIR}/${f}`, 'utf8');

const NAME = /^(?:(\d{4}-\d{2}-\d{2})-)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const TITLE = /^# .+ — (\d{4}-\d{2}-\d{2}|\[Não lançado\])(?: \(.+\))?$/;

// Entrada migrada que nunca teve o número do PR no título (a migração não muda o texto).
const WITHOUT_PR = new Set(['2026-11-01-imagens-remotas.md']);

describe('changelog/', () => {
  it('o CHANGELOG.md da raiz não existe e o changelog/README.md existe', () => {
    expect(existsSync('CHANGELOG.md')).toBe(false);
    expect(existsSync(`${DIR}/README.md`)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s: nome AAAA-MM-DD-<slug>.md ou <slug>.md', (f) => {
    expect(f).toMatch(NAME);
  });

  it.each(entries)('%s: primeira linha no formato e data igual à do nome', (f) => {
    const first = read(f).split('\n')[0] ?? '';
    expect(first).toMatch(TITLE);
    const date = NAME.exec(f)?.[1];
    const titleDate = TITLE.exec(first)?.[1];
    if (date) expect(titleDate).toBe(date);
    else expect(titleDate).toBe('[Não lançado]');
  });

  it.each(entries)('%s: épico, PR, MCP e schema quando cita o épico', (f) => {
    const first = read(f).split('\n')[0] ?? '';
    if (!first.includes('épico `epic/')) return;
    const slug = NAME.exec(f)?.[2];
    expect(first).toContain(`épico \`epic/${slug}\``);
    if (!WITHOUT_PR.has(f)) expect(first).toMatch(/PRs? #\d+/);
    expect(first).toMatch(/MCP (\d+\.\d+\.\d+|sem mudança)/);
    expect(first).toMatch(/schema v\d+/);
  });

  it.each(entries)('%s: categorias Adicionado, Alterado ou Corrigido', (f) => {
    const cats = read(f)
      .split('\n')
      .filter((l) => /^## /.test(l));
    for (const c of cats) expect(c).toMatch(/^## (Adicionado|Alterado|Corrigido)$/);
  });
});
