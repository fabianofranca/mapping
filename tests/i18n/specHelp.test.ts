import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { specHelpSections } from '../../src/i18n/specHelp';

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
