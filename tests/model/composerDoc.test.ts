import { describe, expect, it } from 'vitest';
import {
  composerToMarkdown,
  formatCitation,
  markdownToComposer,
  normalizeDoc,
  pasteToParts,
  type ComposerDoc,
  type ComposerPart,
  type ParsedAnyRef,
} from '../../src/model';

const url = (path: string) => `mapping://folder/${path}`;
const text = (t: string): ComposerPart => ({ type: 'text', text: t });
const chip = (label: string, u: string): ComposerPart => ({
  type: 'chip',
  label,
  url: u,
});

describe('composerToMarkdown', () => {
  it('concatenates text and chips with no extra space', () => {
    const doc: ComposerDoc = [
      text('See '),
      chip('Button', url('m/m2')),
      text(', then '),
      chip('title', url('a/am/f/title')),
      text('.'),
    ];
    expect(composerToMarkdown(doc)).toBe(
      `See [Button](${url('m/m2')}), then [title](${url('a/am/f/title')}).`,
    );
  });

  it('escapes the chip label', () => {
    expect(composerToMarkdown([chip('a[1] \\ b', url('m/m1'))])).toBe(
      formatCitation('a[1] \\ b', url('m/m1')),
    );
  });

  it('an empty label uses the given neutral text (default ·)', () => {
    expect(composerToMarkdown([chip('', url('m/m1'))])).toBe(`[·](${url('m/m1')})`);
    expect(composerToMarkdown([chip('', url('m/m1'))], 'unnamed')).toBe(
      `[unnamed](${url('m/m1')})`,
    );
  });

  it('an empty document gives empty text', () => {
    expect(composerToMarkdown([])).toBe('');
  });
});

describe('normalizeDoc', () => {
  it('merges neighboring texts and drops empty texts', () => {
    const c = chip('x', url('m/m1'));
    expect(
      normalizeDoc([text('a'), text(''), text('b'), c, text(''), text('c')]),
    ).toEqual([text('ab'), c, text('c')]);
    expect(normalizeDoc([text(''), text('')])).toEqual([]);
  });

  it('does not merge chips', () => {
    const c = chip('x', url('m/m1'));
    expect(normalizeDoc([c, c])).toEqual([c, c]);
  });
});

describe('markdownToComposer', () => {
  it('turns a valid citation into a chip', () => {
    const md = `See ${formatCitation('Button', url('m/m2'))} now`;
    expect(markdownToComposer(md)).toEqual([
      text('See '),
      chip('Button', url('m/m2')),
      text(' now'),
    ]);
  });

  it('unescapes the label and accepts an encoded field', () => {
    const md = formatCitation('a[1] \\ b', url('a/am/f/Data%20table'));
    expect(markdownToComposer(md)).toEqual([
      chip('a[1] \\ b', url('a/am/f/Data%20table')),
    ]);
  });

  it('chips glued to each other', () => {
    const md = `${formatCitation('a', url('m/m1'))}${formatCitation('b', url('m/m2'))}`;
    expect(markdownToComposer(md)).toEqual([
      chip('a', url('m/m1')),
      chip('b', url('m/m2')),
    ]);
  });

  it('leaves as text: external link, library link, broken link, empty label', () => {
    for (const md of [
      '[site](https://example.com/m/m1)',
      '[Button](mapping://button)',
      '[Button](mapping://spec/button)',
      `[a](${url('m/m1/extra')})`,
      `[b](${url('z/m1')})`,
      `[](${url('m/m1')})`,
      '[a](mapping://folder/m/m1',
      '**bold** and `code` and # title',
    ]) {
      expect(markdownToComposer(md)).toEqual([text(md)]);
    }
  });

  it('does not become a chip inside inline code or a code block', () => {
    const inline = `\`${formatCitation('x', url('m/m1'))}\``;
    expect(markdownToComposer(inline)).toEqual([text(inline)]);
    const block = ['```', formatCitation('y', url('m/m1')), '```'].join('\n');
    expect(markdownToComposer(block)).toEqual([text(block)]);
    const mixed = `\`a\` ${formatCitation('z', url('m/m1'))}`;
    expect(markdownToComposer(mixed)).toEqual([text('`a` '), chip('z', url('m/m1'))]);
  });

  it('an escaped bracket and a loose [ stay text; the next chip still works', () => {
    const md = `\\[x](${url('m/m1')}) and [ loose ${formatCitation('ok', url('m/m2'))}`;
    expect(markdownToComposer(md)).toEqual([
      text(`\\[x](${url('m/m1')}) and [ loose `),
      chip('ok', url('m/m2')),
    ]);
  });

  it('the returned text is already normalized', () => {
    const doc = markdownToComposer('a [b] c');
    expect(doc).toEqual([text('a [b] c')]);
    expect(markdownToComposer('')).toEqual([]);
  });
});

describe('round trip composerToMarkdown(markdownToComposer(s)) === s', () => {
  const fixed = [
    '',
    'text only',
    formatCitation('Button', url('m/m2')),
    `before ${formatCitation('a[1]', url('m/m2'))} after ${formatCitation('b\\', url('i/i1'))}`,
    `[ ${formatCitation('x', url('m/m1'))}`,
    `[a](${url('m/m1/extra')}) broken`,
    '[a](mapping://folder/m/m1',
    '[a]( mapping://folder/m/m1)',
    `\\${formatCitation('x', url('m/m1'))}`,
    `\`${formatCitation('x', url('m/m1'))}\` ${formatCitation('y', url('m/m1'))}`,
    '``` no end [x](mapping://folder/m/m1)',
    `[a\\x](${url('m/m1')})`,
    `[a\\\\](${url('m/m1')})`,
    '[]()',
    '[[a]](mapping://folder/m/m1)',
    `line\n${formatCitation('x', url('a/am/f/campos/r/r1'))}\nend`,
  ];

  it.each(fixed.map((s) => [s]))('fixed case %j', (s) => {
    expect(composerToMarkdown(markdownToComposer(s))).toBe(s);
  });

  it('property over pseudo-random texts', () => {
    const pieces = [
      '[',
      ']',
      '\\',
      '(',
      ')',
      '`',
      '```',
      'a',
      ' ',
      '\n',
      '!',
      'mapping://folder/m/m1',
      '](mapping://folder/m/m1)',
      '[x](mapping://folder/m/m2)',
      '[a\\]b](mapping://folder/i/i1)',
      '](mapping://folder/z/m1)',
    ];
    let seed = 12345;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let round = 0; round < 500; round++) {
      let s = '';
      for (let i = next(12); i > 0; i--) s += pieces[next(pieces.length)];
      expect(composerToMarkdown(markdownToComposer(s))).toBe(s);
    }
  });
});

describe('pasteToParts', () => {
  const resolves = (ref: ParsedAnyRef) => {
    if (ref.ref.type === 'item' && ref.ref.kind === 'm' && ref.ref.code === 'm2') {
      return { label: 'Live button', url: url('m/m2') };
    }
    if (ref.ref.type === 'field') {
      return { label: ref.ref.key, url: url(`a/${ref.ref.annotation}/f/${ref.ref.key}`) };
    }
    return null;
  };

  it('text without a URL enters as plain text', () => {
    expect(pasteToParts('hello *world*', resolves)).toEqual([text('hello *world*')]);
    expect(pasteToParts('', resolves)).toEqual([]);
  });

  it('a raw URL that resolves becomes a chip with the live label', () => {
    expect(pasteToParts(`see ${url('m/m2')} here`, resolves)).toEqual([
      text('see '),
      chip('Live button', url('m/m2')),
      text(' here'),
    ]);
  });

  it('a raw URL that does not resolve (or does not fit the grammar) stays text', () => {
    for (const s of [url('m/m9'), 'mapping://button', url('m/m2/extra'), url('z/m2')]) {
      expect(pasteToParts(s, resolves)).toEqual([text(s)]);
    }
  });

  it('emphasis markers glued around the URL do not enter it', () => {
    for (const mark of ['**', '*', '_', '__', '`', '~~']) {
      expect(pasteToParts(`${mark}${url('m/m2')}${mark}`, resolves)).toEqual([
        text(mark),
        chip('Live button', url('m/m2')),
        text(mark),
      ]);
    }
  });

  it('label with *, _ and backtick: round trip through the composer markdown', () => {
    const doc: ComposerDoc = [chip('a*b_c`d', url('m/m1'))];
    expect(markdownToComposer(composerToMarkdown(doc))).toEqual(doc);
  });

  it('trailing sentence punctuation does not enter the URL', () => {
    expect(pasteToParts(`See ${url('m/m2')}.`, resolves)).toEqual([
      text('See '),
      chip('Live button', url('m/m2')),
      text('.'),
    ]);
    expect(pasteToParts(`(${url('m/m2')}), ok`, resolves)).toEqual([
      text('('),
      chip('Live button', url('m/m2')),
      text('), ok'),
    ]);
  });

  it('a pasted markdown link becomes a chip with the live label', () => {
    expect(pasteToParts(`[old](${url('m/m2')})`, resolves)).toEqual([
      chip('Live button', url('m/m2')),
    ]);
  });

  it('a markdown link that does not resolve stays text as it was', () => {
    const md = `[old](${url('m/m9')})`;
    expect(pasteToParts(md, resolves)).toEqual([text(md)]);
  });

  it('several, mixed, over several lines', () => {
    const pasted = `a ${url('m/m2')}\n[x](${url('a/am/f/title')}) e ${url('m/m9')}`;
    expect(pasteToParts(pasted, resolves)).toEqual([
      text('a '),
      chip('Live button', url('m/m2')),
      text('\n'),
      chip('title', url('a/am/f/title')),
      text(` e ${url('m/m9')}`),
    ]);
  });

  it('the pasted chip label is the one from resolves, even with brackets in the old label', () => {
    const md = `[a\\[1\\]](${url('m/m2')})`;
    expect(pasteToParts(md, resolves)).toEqual([chip('Live button', url('m/m2'))]);
  });
});
