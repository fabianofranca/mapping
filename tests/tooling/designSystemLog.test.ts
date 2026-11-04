// @vitest-environment node
// Etapa #478, fase RE3: o registro do DS é um arquivo por épico em docs/design-system/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'docs/design-system';
const entries = existsSync(DIR) ? readdirSync(DIR).filter((f) => f !== 'README.md') : [];
const read = (f: string): string => readFileSync(`${DIR}/${f}`, 'utf8');

const NAME = /^(?:(\d{4}-\d{2}-\d{2})-)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const TITLE =
  /^# .+ — (\d{4}-\d{2}-\d{2}|\[Não lançado\]) \(épico `epic\/([a-z0-9-]+)`\)$/;
const SECTIONS = new Set(['## Pendências', '## Sincronização', '## Ficou sem gravar']);

describe('docs/design-system/', () => {
  it('a pasta existe e tem registros', () => {
    expect(existsSync(DIR)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s: nome AAAA-MM-DD-<slug>.md ou <slug>.md', (f) => {
    expect(f).toMatch(NAME);
  });

  it.each(entries)('%s: primeira linha no formato e data igual à do nome', (f) => {
    const first = read(f).split('\n')[0] ?? '';
    expect(first).toMatch(TITLE);
    const m = TITLE.exec(first);
    const [, date, slug] = NAME.exec(f) ?? [];
    expect(m?.[2]).toBe(NAME.exec(f)?.[2]);
    if (date) expect(m?.[1]).toBe(date);
    else expect(m?.[1]).toBe('[Não lançado]');
    expect(slug).toBeDefined();
  });

  it.each(entries)('%s: seções só Pendências, Sincronização e Ficou sem gravar', (f) => {
    const sections = read(f)
      .split('\n')
      .filter((l) => /^## /.test(l));
    for (const s of sections) expect(SECTIONS.has(s)).toBe(true);
  });

  it.each(entries.filter((f) => /^\d{4}-/.test(f)))(
    '%s: o registro com data tem Sincronização',
    (f) => {
      expect(read(f)).toMatch(/^## Sincronização$/m);
    },
  );

  it('o DESIGN-SYSTEM.md não guarda histórico nem pendência de épico', () => {
    const ds = readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
    expect(ds).not.toMatch(/^\| 20\d\d-/m);
    expect(ds).not.toMatch(/^### .*\(`epic\/.*`\)/m);
  });
});
