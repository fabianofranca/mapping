import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { specHelpSections } from '../../src/i18n/specHelp';
import { SPEC_FORMAT_VERSION } from '../../src/model/spec';

// A página "Ajuda → Especializações" (pt-BR) e o docs/SPEC-FORMAT.md descrevem o mesmo
// formato. Para não divergirem, cada seção da ajuda precisa ter no documento uma seção
// `## <mesmo título>` com os mesmos blocos de código e todos os termos citados.

const doc = readFileSync('docs/SPEC-FORMAT.md', 'utf8');

/** Seções de nível 2 (`## título`) do documento, com o texto até a próxima. */
function docSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  let title: string | null = null;
  let lines: string[] = [];
  let fenced = false;
  const close = () => {
    if (title !== null) sections.set(title, lines.join('\n'));
  };
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = !fenced && /^## (.+)$/.exec(line);
    if (heading) {
      close();
      title = heading[1] ?? '';
      lines = [];
    } else lines.push(line);
  }
  close();
  return sections;
}

/** Blocos de código cercados (```), sem a linha de abertura e de fechamento. */
function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)\n```/g)].map((m) => m[1] ?? '');
}

/** Compara JSON pelo conteúdo: o Prettier reformata os blocos ```json do Markdown. */
function normalized(code: string): string {
  try {
    return JSON.stringify(JSON.parse(code));
  } catch {
    return code.trim();
  }
}

const sections = docSections(doc);

describe('ajuda de especializações × docs/SPEC-FORMAT.md', () => {
  const help = specHelpSections('pt-BR');

  it('tem as mesmas seções, na mesma ordem', () => {
    const titles = [...sections.keys()];
    const helpTitles = help.map((s) => s.title);
    expect(titles.filter((t) => helpTitles.includes(t))).toEqual(helpTitles);
  });

  it.each(help.map((s) => [s.title, s] as const))('%s', (title, section) => {
    const body = sections.get(title);
    expect(body, `falta "## ${title}" no SPEC-FORMAT.md`).toBeDefined();
    const text = body ?? '';
    const blocks = codeBlocks(text).map(normalized);
    for (const block of section.blocks) {
      if (block.kind === 'code') expect(blocks).toContain(normalized(block.code));
      if (block.kind === 'terms') {
        for (const { term } of block.items) {
          expect(text, `termo "${term}"`).toContain(`\`${term}\``);
        }
      }
    }
  });
});

describe('ajuda de especializações: versão e estrutura', () => {
  type Locale = 'pt-BR' | 'en-US';
  const range: Record<Locale, string> = {
    'pt-BR': `1 a ${SPEC_FORMAT_VERSION}`,
    'en-US': `1 to ${SPEC_FORMAT_VERSION}`,
  };

  /** Texto de todos os blocos de uma seção (parágrafos e itens de listas). */
  function sectionText(locale: Locale, id: string): string {
    const section = specHelpSections(locale).find((s) => s.id === id);
    const parts: string[] = [];
    for (const block of section?.blocks ?? []) {
      if (block.kind === 'p') parts.push(block.text);
      if (block.kind === 'list') parts.push(...block.items);
    }
    return parts.join('\n');
  }

  it.each(['pt-BR', 'en-US'] as const)(
    '%s: a raiz e as regras citam o intervalo atual',
    (locale) => {
      const format = sectionText(locale, 'format');
      expect(format).toContain(`formatVersion (${range[locale]})`);
      const rules = sectionText(locale, 'validation');
      expect(rules).toContain(`formatVersion (${range[locale]})`);
    },
  );

  /** Forma da página: seções, tipo dos blocos e tamanho de cada lista. */
  function shape(locale: Locale): unknown {
    return specHelpSections(locale).map((s) => ({
      id: s.id,
      blocks: s.blocks.map((b) =>
        b.kind === 'list'
          ? ['list', b.items.length]
          : b.kind === 'terms'
            ? ['terms', b.items.length]
            : [b.kind],
      ),
    }));
  }

  it('pt-BR e en-US têm a mesma estrutura', () => {
    expect(shape('en-US')).toEqual(shape('pt-BR'));
  });
});
