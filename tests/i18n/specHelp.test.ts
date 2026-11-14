import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { specHelpSections } from '../../src/i18n/specHelp';
import { SPEC_FORMAT_VERSION } from '../../src/model/spec';

// The "Help → Specializations" page (en-US) and docs/SPEC-FORMAT.md describe the same format. So
// that they do not diverge, each help section needs a `## <same title>` section in the document
// with the same code blocks and every term cited.

const doc = readFileSync('docs/SPEC-FORMAT.md', 'utf8');

/** Level-2 sections (`## title`) of the document, with the text up to the next one. */
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

/** Fenced code blocks (```), without the opening and closing lines. */
function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)\n```/g)].map((m) => m[1] ?? '');
}

/**
 * Prose fields of the example blocks: the help carries them in the UI language while the doc
 * is English, so their text is not compared. Ids, keys, structure and every other value are.
 */
const PROSE_KEYS = new Set([
  'name',
  'description',
  'label',
  'notes',
  'title',
  'childRolesLabel',
  'message',
  'true',
  'false',
]);

function withoutProse(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => withoutProse(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, withoutProse(v, k)]),
    );
  }
  return typeof value === 'string' && key !== undefined && PROSE_KEYS.has(key)
    ? ''
    : value;
}

/** Compares JSON by content (Prettier reformats the ```json blocks) minus the prose fields. */
function normalized(code: string): string {
  try {
    return JSON.stringify(withoutProse(JSON.parse(code)));
  } catch {
    // A file tree: compare the paths, not the comment text after them.
    return code
      .split('\n')
      .map((line) => line.trim().split(/\s{2,}/)[0])
      .join('\n');
  }
}

const sections = docSections(doc);

describe('specializations help × docs/SPEC-FORMAT.md', () => {
  const help = specHelpSections('en-US');

  it('has the same sections, in the same order', () => {
    const titles = [...sections.keys()];
    const helpTitles = help.map((s) => s.title);
    expect(titles.filter((t) => helpTitles.includes(t))).toEqual(helpTitles);
  });

  it.each(help.map((s) => [s.title, s] as const))('%s', (title, section) => {
    const body = sections.get(title);
    expect(body, `missing "## ${title}" in SPEC-FORMAT.md`).toBeDefined();
    const text = body ?? '';
    const blocks = codeBlocks(text).map(normalized);
    for (const block of section.blocks) {
      if (block.kind === 'code') expect(blocks).toContain(normalized(block.code));
      if (block.kind === 'terms') {
        for (const { term } of block.items) {
          expect(text, `term "${term}"`).toContain(`\`${term}\``);
        }
      }
    }
  });
});

describe('specializations help: version and structure', () => {
  type Locale = 'pt-BR' | 'en-US';
  const range: Record<Locale, string> = {
    'pt-BR': `1 a ${SPEC_FORMAT_VERSION}`,
    'en-US': `1 to ${SPEC_FORMAT_VERSION}`,
  };

  /** Text of all the blocks of a section (paragraphs and list items). */
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
    '%s: the root and the rules cite the current range',
    (locale) => {
      const format = sectionText(locale, 'format');
      expect(format).toContain(`formatVersion (${range[locale]})`);
      const rules = sectionText(locale, 'validation');
      expect(rules).toContain(`formatVersion (${range[locale]})`);
    },
  );

  /** Shape of the page: sections, block kinds and the size of each list. */
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

  it('pt-BR and en-US have the same structure', () => {
    expect(shape('en-US')).toEqual(shape('pt-BR'));
  });

  /** The file-format content of a section: the terms listed and the code minus its prose. */
  function format(locale: Locale): unknown {
    return specHelpSections(locale).map((s) => ({
      id: s.id,
      terms: s.blocks.flatMap((b) =>
        b.kind === 'terms' ? b.items.map((i) => i.term) : [],
      ),
      code: s.blocks.flatMap((b) => (b.kind === 'code' ? [normalized(b.code)] : [])),
    }));
  }

  it('pt-BR and en-US describe the same format (same terms, ids and code, only the prose differs)', () => {
    expect(format('pt-BR')).toEqual(format('en-US'));
  });

  it('the en-US examples carry no Portuguese sample text', () => {
    const code = specHelpSections('en-US')
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.kind === 'code' ? [b.code] : []))
      .join('\n');
    expect(code).not.toMatch(/[ãõçáéíóúâêôà]/i);
  });
});
