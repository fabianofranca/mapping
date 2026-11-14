// @vitest-environment node
// Stage #478, phase RE2: the changelog is one file per epic in changelog/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'changelog';
const entries = existsSync(DIR) ? readdirSync(DIR).filter((f) => f !== 'README.md') : [];
const read = (f: string): string => readFileSync(`${DIR}/${f}`, 'utf8');

const NAME = /^(?:(\d{4}-\d{2}-\d{2})-)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
// The unreleased marker is a frozen record title (decision 16 of #741).
const UNRELEASED = '[Não lançado]';
const TITLE = /^# .+ — (\d{4}-\d{2}-\d{2}|\[[^\]]+\])(?: \(.+\))?$/;
// Frozen record-title fragment: the epic cited in the first line of an entry.
const EPIC = 'épico `epic/';

// Migrated entry that never had the PR number in the title (the migration does not change the text).
const WITHOUT_PR = new Set(['2026-11-01-imagens-remotas.md']);

describe('changelog/', () => {
  it('the root CHANGELOG.md does not exist and changelog/README.md does', () => {
    expect(existsSync('CHANGELOG.md')).toBe(false);
    expect(existsSync(`${DIR}/README.md`)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s: name YYYY-MM-DD-<slug>.md or <slug>.md', (f) => {
    expect(f).toMatch(NAME);
  });

  it.each(entries)(
    '%s: first line in the format and date equal to that of the name',
    (f) => {
      const first = read(f).split('\n')[0] ?? '';
      expect(first).toMatch(TITLE);
      const date = NAME.exec(f)?.[1];
      const titleDate = TITLE.exec(first)?.[1];
      if (date) expect(titleDate).toBe(date);
      else expect(titleDate).toBe(UNRELEASED);
    },
  );

  it.each(entries)('%s: epic, PR, MCP and schema when it cites the epic', (f) => {
    const first = read(f).split('\n')[0] ?? '';
    if (!first.includes(EPIC)) return;
    const slug = NAME.exec(f)?.[2];
    expect(first).toContain(`${EPIC}${slug}\``);
    if (!WITHOUT_PR.has(f)) expect(first).toMatch(/PRs? #\d+/);
    expect(first).toMatch(/MCP (\d+\.\d+\.\d+|unchanged|no change)/);
    expect(first).toMatch(/schema v\d+/);
  });

  it.each(entries)('%s: categories Adicionado, Alterado or Corrigido', (f) => {
    const cats = read(f)
      .split('\n')
      .filter((l) => /^## /.test(l));
    for (const c of cats) expect(c).toMatch(/^## (Adicionado|Alterado|Corrigido)$/);
  });
});
