// @vitest-environment node
// Stage #478, phase RE3: the DS log is one file per epic in docs/design-system/.
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
  it('the folder exists and has records', () => {
    expect(existsSync(DIR)).toBe(true);
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
      const m = TITLE.exec(first);
      const [, date, slug] = NAME.exec(f) ?? [];
      expect(m?.[2]).toBe(NAME.exec(f)?.[2]);
      if (date) expect(m?.[1]).toBe(date);
      else expect(m?.[1]).toBe('[Não lançado]');
      expect(slug).toBeDefined();
    },
  );

  it.each(entries)(
    '%s: sections only Pendências, Sincronização and Ficou sem gravar',
    (f) => {
      const sections = read(f)
        .split('\n')
        .filter((l) => /^## /.test(l));
      for (const s of sections) expect(SECTIONS.has(s)).toBe(true);
    },
  );

  it.each(entries.filter((f) => /^\d{4}-/.test(f)))(
    '%s: the dated record has Sincronização',
    (f) => {
      expect(read(f)).toMatch(/^## Sincronização$/m);
    },
  );

  it('DESIGN-SYSTEM.md keeps no epic history or pending items', () => {
    const ds = readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
    expect(ds).not.toMatch(/^\| 20\d\d-/m);
    expect(ds).not.toMatch(/^### .*\(`epic\/.*`\)/m);
  });
});

// Stage #1390, phase DS2 (decisions 11 and 12): the closing writes to the artifact. A dated
// record that has real `## Pendências` and does not say it wrote must explain each unwritten item.
const sectionOf = (text: string, heading: string): string[] | null => {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trimEnd() === heading);
  if (at < 0) return null;
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return end < 0 ? rest : rest.slice(0, end);
};

// First-level list item, with its continuation lines.
const listItems = (lines: string[]): string[] => {
  const items: string[] = [];
  for (const l of lines) {
    if (/^[-*] /.test(l)) items.push(l);
    else if (items.length > 0 && /^\s+\S/.test(l)) items[items.length - 1] += `\n${l}`;
  }
  return items;
};

// "- AB1: nenhuma (…)" or "- Nada." are not a real pending item.
// "nenhuma"/"nada" alone (period, parenthesis or end): "- Nada gravado ainda: …" is a real pending item.
const NO_ITEM =
  /^[-*] (?:[A-Za-z]{1,4}\d+:\s*)?(?:\*\*)?(?:nenhuma|nada)(?:\*\*)?\s*(?:[.(]|$)/i;
// "Sem impacto" is a valid closing result (docs/DESIGN-SYSTEM.md); "Versão N não foi gravada" is not.
const WROTE =
  /^(?:Gravado no artefato|Vers(?:ão|ões) \d(?!.*não foi gravada)|Sem impacto)/;
const MOVED = /Passou para o registro do épico `epic\/([a-z0-9-]+)`/;

/** The rule of decision 12; returns the reason for the failure, or null if the record passes. */
function ruleViolation(
  name: string,
  text: string,
  files: readonly string[],
): string | null {
  if (!/^\d{4}-/.test(name)) return null;
  const pending = listItems(sectionOf(text, '## Pendências') ?? []).filter(
    (i) => !NO_ITEM.test(i),
  );
  if (pending.length === 0) return null;
  const firstSync =
    (sectionOf(text, '## Sincronização') ?? [])
      .map((l) => l.trim())
      .find((l) => l !== '') ?? '';
  if (WROTE.test(firstSync)) return null;
  const left = listItems(sectionOf(text, '## Ficou sem gravar') ?? []);
  if (left.length === 0) {
    return `${name}: has real Pendências and does not say it wrote, but "Ficou sem gravar" has no item`;
  }
  for (const item of left) {
    const moved = MOVED.exec(item);
    if (moved) {
      const slug = moved[1];
      const own = NAME.exec(name);
      // The target is another record, undated or dated no earlier than this one (epic still open).
      const target = files.some((f) => {
        const m = NAME.exec(f);
        return (
          m !== null &&
          m[2] === slug &&
          f !== name &&
          (!m[1] || !own?.[1] || m[1] >= own[1])
        );
      });
      if (!target) {
        return `${name}: "Passou para o registro do épico" points to epic/${slug}, which has no record in the folder`;
      }
    } else if (!/Motivo:/.test(item)) {
      return `${name}: "Ficou sem gravar" item with neither "Motivo:" nor "Passou para o registro do épico": ${item.slice(0, 60)}`;
    }
  }
  return null;
}

const base = (
  sync: string,
  left: string,
  pending = '- **Guide:** something new.',
): string =>
  `# X — 2026-11-10 (épico \`epic/x\`)\n\n## Pendências\n\n${pending}\n\n## Sincronização\n\n${sync}\n\n## Ficou sem gravar\n\n${left}\n`;

describe('log rule: the closing writes to the artifact (#1390, DS2)', () => {
  const NAME_ = '2026-11-10-x.md';
  it('fails the text of 2026-11-10-barra-canvas-estreita.md from before DS1 (commit cf50aaec)', () => {
    // Text of the deciding sections, as it was in `cf50aaec` (before DS1), without depending on git.
    const old = [
      '# Barra do canvas estreita — 2026-11-10 (épico `epic/barra-canvas-estreita`)',
      '',
      '## Pendências',
      '',
      '- **`Breadcrumbs`:** na barra do canvas estreita o meio do caminho recolhe e aparece o **…**.',
      '- **`Popover`:** prop nova `anchor` (elemento que ancora o painel no lugar do host).',
      '',
      '## Sincronização',
      '',
      'Nenhuma gravação feita pelo agente: artefato curado à mão.',
      '',
      '## Ficou sem gravar',
      '',
      '- As pendências acima (guias `Breadcrumbs`, `ActionMenu`, `Popover` e a barra do canvas), para aplicar à mão no artefato.',
      '',
    ].join('\n');
    const why = ruleViolation('2026-11-10-barra-canvas-estreita.md', old, []);
    expect(why).toContain('2026-11-10-barra-canvas-estreita.md');
    expect(why).toContain('Motivo:');
  });

  it.each([
    ['Gravado no artefato', 'Gravado no artefato **Mapping** em 2026-11-10: versão 70.'],
    ['Versões', 'Versões 53 (conteúdo) e 54 (índice) do artefato.'],
    ['Versão', 'Versão 34 (conteúdo e índice) do artefato.'],
    ['Sem impacto', 'Sem impacto no DS: só documentação.'],
  ])('passes with the Sincronização opened by "%s"', (_n, sync) => {
    expect(ruleViolation(NAME_, base(sync, '- Nothing.'), [])).toBeNull();
  });

  it('passes with an item that carries Motivo:', () => {
    const t = base(
      'No recording.',
      '- **Guide:** the tool failed. **Motivo:** repeated refusal.',
    );
    expect(ruleViolation(NAME_, t, [])).toBeNull();
  });

  it('passes with an item that moved to the record of another existing epic', () => {
    const t = base(
      'Nenhuma gravação.',
      '- Passou para o registro do épico `epic/outro`: guia do X.',
    );
    expect(ruleViolation(NAME_, t, ['outro.md'])).toBeNull();
    expect(ruleViolation(NAME_, t, ['2026-11-11-outro.md'])).toBeNull();
    expect(ruleViolation(NAME_, t, [])).toContain('epic/outro');
    // the record of `epic/barra-canvas` is not that of `epic/canvas`
    const other = base(
      'Nenhuma gravação.',
      '- Passou para o registro do épico `epic/canvas`: guia.',
    );
    expect(ruleViolation(NAME_, other, ['2026-11-09-barra-canvas.md'])).toContain(
      'epic/canvas',
    );
  });

  it('passes with Pendências only "- XX1: nenhuma (…)"', () => {
    const t = base('No recording.', '', '- XX1: nenhuma (nothing changed in the DS).');
    expect(ruleViolation(NAME_, t, [])).toBeNull();
  });

  // DS7 (#1472, achados 5 a 7)
  it('"Versão N não foi gravada" does not count as a recording', () => {
    const b = base('Versão 3 não foi gravada.', '');
    expect(ruleViolation(NAME_, b, [])).toContain('has no item');
  });

  it('"- Nada gravado ainda: …" is a real pending item', () => {
    const t = base(
      'Nenhuma gravação.',
      '',
      '- Nada gravado ainda: the guide of X is missing.',
    );
    expect(ruleViolation(NAME_, t, [])).toContain('has no item');
  });

  it('"Passou para" does not point to its own record nor to an already closed epic', () => {
    const own = base(
      'Nenhuma gravação.',
      '- Passou para o registro do épico `epic/x`: guia.',
    );
    expect(ruleViolation(NAME_, own, ['2026-11-10-x.md'])).toContain('epic/x');
    const t = base(
      'Nenhuma gravação.',
      '- Passou para o registro do épico `epic/velho`: guia.',
    );
    expect(ruleViolation(NAME_, t, ['2026-11-01-velho.md'])).toContain('epic/velho');
    expect(ruleViolation(NAME_, t, ['2026-11-10-velho.md'])).toBeNull();
    expect(ruleViolation(NAME_, t, ['velho.md'])).toBeNull();
  });

  it('fails with no item in "Ficou sem gravar" and with an item without a reason', () => {
    expect(ruleViolation(NAME_, base('Nothing recorded.', ''), [])).toContain(
      'has no item',
    );
    const why = ruleViolation(
      NAME_,
      base('Nothing recorded.', '- To apply by hand.'),
      [],
    );
    expect(why).toContain(NAME_);
    expect(why).toContain('Motivo:');
  });

  it('does not apply to an undated record', () => {
    expect(ruleViolation('x.md', base('Nothing recorded.', ''), [])).toBeNull();
  });

  it.each(entries.filter((f) => /^\d{4}-/.test(f)))(
    '%s: writes, or says why not',
    (f) => {
      expect(ruleViolation(f, read(f), entries)).toBeNull();
    },
  );
});

describe('rule texts: the closing writes to the artifact (#1390, DS2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const ds = readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
  // From the start of `from` up to `to`; without `to`, up to the end. A final heading that vanishes fails.
  const part = (text: string, from: RegExp, to?: RegExp): string => {
    const a = text.search(from);
    expect(a).toBeGreaterThanOrEqual(0);
    const rest = text.slice(a + 1);
    if (!to) return rest;
    const b = rest.search(to);
    expect(b).toBeGreaterThanOrEqual(0);
    return rest.slice(0, b);
  };

  it('the "Closing" step of SKILL.md orders the recording, cites "When writing" and denies "curated by hand"', () => {
    const step = part(skill, /^5\. \*\*Closing\*\*/m, /^6\. \*\*Merge\*\*/m);
    expect(step).toContain('docs/DESIGN-SYSTEM.md');
    expect(step).toContain('When writing');
    expect(step).toMatch(/Curated by hand. is no reason/);
    expect(step).toContain('## Ficou sem gravar');
    expect(step).toContain('Motivo');
    expect(step).toContain('subagent');
    expect(step).toContain('Artifact');
    expect(step).not.toContain('pending items applied in the DS artifact');
  });

  it('the "Merge" section of SKILL.md holds the epic that did not write', () => {
    const merge = part(skill, /^## Merge$/m, /^## Parallel$/m);
    expect(merge).toContain('## Pendências');
    expect(merge).toContain('pending defect');
    expect(merge).toContain('esperando dono');
    expect(merge).toContain('PushNotification');
    expect(merge).toMatch(/sem acesso/i);
  });

  it('"It is hand-curated" of DESIGN-SYSTEM.md does not stop the closing from writing', () => {
    const item = part(
      ds,
      /^- \*\*It is hand-curated\.\*\*/m,
      /^- \*\*It is not generated/m,
    );
    expect(item).toContain('does not stop the closing from writing');
    expect(item).toContain('/design-sync');
  });

  it('"When writing" cites the Artifact tool and the three openings of Sincronização', () => {
    const rec = part(ds, /^When writing:/m, /^## Map$/m);
    expect(rec).toContain('`Artifact`');
    expect(rec).toContain('Gravado no artefato');
    expect(rec).toMatch(/Versões? <n>/);
    expect(rec).toContain('Sem impacto');
  });

  it('"Sync history" carries the format of the "Ficou sem gravar" item', () => {
    const log = part(ds, /^## Sync history$/m);
    expect(log).toContain('Motivo:');
    expect(log).toContain('Passou para o registro do épico');
  });
});
