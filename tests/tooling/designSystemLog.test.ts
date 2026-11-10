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

// Etapa #1390, fase DS2 (decisões 11 e 12): o fechamento grava no artefato. O registro com
// data que tem `## Pendências` reais e não diz que gravou precisa explicar cada item sem gravar.
const sectionOf = (text: string, heading: string): string[] | null => {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trimEnd() === heading);
  if (at < 0) return null;
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return end < 0 ? rest : rest.slice(0, end);
};

// Item de lista de primeiro nível, com as linhas de continuação.
const listItems = (lines: string[]): string[] => {
  const items: string[] = [];
  for (const l of lines) {
    if (/^[-*] /.test(l)) items.push(l);
    else if (items.length > 0 && /^\s+\S/.test(l)) items[items.length - 1] += `\n${l}`;
  }
  return items;
};

// "- AB1: nenhuma (…)" ou "- Nada." não são pendência real.
const NO_ITEM = /^[-*] (?:[A-Za-z]{1,4}\d+:\s*)?(?:\*\*)?(?:nenhuma|nada)\b/i;
const WROTE = /^(?:Gravado no artefato|Vers(?:ão|ões) \d|Sem impacto)/;
const MOVED = /Passou para o registro do épico `epic\/([a-z0-9-]+)`/;

/** A regra da decisão 12; devolve o motivo da reprovação, ou null se o registro passa. */
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
    return `${name}: tem Pendências reais e não diz que gravou, mas "Ficou sem gravar" não tem item`;
  }
  for (const item of left) {
    const moved = MOVED.exec(item);
    if (moved) {
      const slug = moved[1];
      if (!files.some((f) => NAME.exec(f)?.[2] === slug)) {
        return `${name}: "Passou para o registro do épico" aponta para epic/${slug}, que não tem registro na pasta`;
      }
    } else if (!/Motivo:/.test(item)) {
      return `${name}: item de "Ficou sem gravar" sem "Motivo:" nem "Passou para o registro do épico": ${item.slice(0, 60)}`;
    }
  }
  return null;
}

const base = (sync: string, left: string, pending = '- **Guia:** algo novo.'): string =>
  `# X — 2026-11-10 (épico \`epic/x\`)\n\n## Pendências\n\n${pending}\n\n## Sincronização\n\n${sync}\n\n## Ficou sem gravar\n\n${left}\n`;

describe('regra do registro: o fechamento grava no artefato (#1390, DS2)', () => {
  const NAME_ = '2026-11-10-x.md';
  it('reprova o texto de 2026-11-10-barra-canvas-estreita.md de antes da DS1 (commit cf50aaec)', () => {
    // Texto das seções que decidem, como estava em `cf50aaec` (antes da DS1), sem depender do git.
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
  ])('passa com a Sincronização aberta por "%s"', (_n, sync) => {
    expect(ruleViolation(NAME_, base(sync, '- Nada.'), [])).toBeNull();
  });

  it('passa com item que traz Motivo:', () => {
    const t = base(
      'Nenhuma gravação.',
      '- **Guia:** a ferramenta falhou. **Motivo:** recusa repetida.',
    );
    expect(ruleViolation(NAME_, t, [])).toBeNull();
  });

  it('passa com item que passou para o registro de outro épico existente', () => {
    const t = base(
      'Nenhuma gravação.',
      '- Passou para o registro do épico `epic/outro`: guia do X.',
    );
    expect(ruleViolation(NAME_, t, ['outro.md'])).toBeNull();
    expect(ruleViolation(NAME_, t, ['2026-11-11-outro.md'])).toBeNull();
    expect(ruleViolation(NAME_, t, [])).toContain('epic/outro');
    // o registro de `epic/barra-canvas` não é o de `epic/canvas`
    const other = base(
      'Nenhuma gravação.',
      '- Passou para o registro do épico `epic/canvas`: guia.',
    );
    expect(ruleViolation(NAME_, other, ['2026-11-09-barra-canvas.md'])).toContain(
      'epic/canvas',
    );
  });

  it('passa com Pendências só "- XX1: nenhuma (…)"', () => {
    const t = base('Nenhuma gravação.', '', '- XX1: nenhuma (nada mudou no DS).');
    expect(ruleViolation(NAME_, t, [])).toBeNull();
  });

  it('reprova sem item em "Ficou sem gravar" e com item sem motivo', () => {
    expect(ruleViolation(NAME_, base('Nada gravado.', ''), [])).toContain('não tem item');
    const why = ruleViolation(NAME_, base('Nada gravado.', '- Para aplicar à mão.'), []);
    expect(why).toContain(NAME_);
    expect(why).toContain('Motivo:');
  });

  it('não vale para registro sem data', () => {
    expect(ruleViolation('x.md', base('Nada gravado.', ''), [])).toBeNull();
  });

  it.each(entries.filter((f) => /^\d{4}-/.test(f)))(
    '%s: grava, ou diz por que não',
    (f) => {
      expect(ruleViolation(f, read(f), entries)).toBeNull();
    },
  );
});

describe('textos da regra: o fechamento grava no artefato (#1390, DS2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const ds = readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
  // Do começo de `from` até `to`; sem `to`, até o fim. O título final que sumir reprova.
  const part = (text: string, from: RegExp, to?: RegExp): string => {
    const a = text.search(from);
    expect(a).toBeGreaterThanOrEqual(0);
    const rest = text.slice(a + 1);
    if (!to) return rest;
    const b = rest.search(to);
    expect(b).toBeGreaterThanOrEqual(0);
    return rest.slice(0, b);
  };

  it('o passo "Fechamento" do SKILL.md manda gravar, cita "Ao gravar" e nega "curado à mão"', () => {
    const step = part(skill, /^5\. \*\*Fechamento\*\*/m, /^6\. \*\*Merge\*\*/m);
    expect(step).toContain('docs/DESIGN-SYSTEM.md');
    expect(step).toContain('Ao gravar');
    expect(step).toMatch(/Curado à mão. não é motivo/);
    expect(step).toContain('## Ficou sem gravar');
    expect(step).toContain('Motivo');
    expect(step).toContain('subagente');
    expect(step).toContain('Artifact');
    expect(step).not.toContain('pendências aplicadas no artefato do DS');
  });

  it('a seção "Merge" do SKILL.md segura o épico que não gravou', () => {
    const merge = part(skill, /^## Merge$/m, /^## Paralelo$/m);
    expect(merge).toContain('## Pendências');
    expect(merge).toContain('defeito pendente');
    expect(merge).toContain('esperando dono');
    expect(merge).toContain('PushNotification');
    expect(merge).toMatch(/sem acesso/i);
  });

  it('"É curado à mão" do DESIGN-SYSTEM.md não impede o fechamento de gravar', () => {
    const item = part(ds, /^- \*\*É curado à mão\.\*\*/m, /^- \*\*Não é gerado/m);
    expect(item).toContain('não impede o fechamento de gravar');
    expect(item).toContain('/design-sync');
  });

  it('"Ao gravar" cita a ferramenta Artifact e as três aberturas da Sincronização', () => {
    const rec = part(ds, /^Ao gravar:/m, /^## Mapa$/m);
    expect(rec).toContain('`Artifact`');
    expect(rec).toContain('Gravado no artefato');
    expect(rec).toMatch(/Versões? <n>/);
    expect(rec).toContain('Sem impacto');
  });

  it('"Histórico de sincronização" traz o formato do item de "Ficou sem gravar"', () => {
    const log = part(ds, /^## Histórico de sincronização$/m);
    expect(log).toContain('Motivo:');
    expect(log).toContain('Passou para o registro do épico');
  });
});
