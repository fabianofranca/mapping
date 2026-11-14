import { describe, expect, it } from 'vitest';
import {
  inlinesToText,
  isSafeLinkTarget,
  parseInlines,
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
} from '../../src/model';

function first(text: string): MarkdownBlock {
  const b = parseMarkdown(text)[0];
  if (!b) throw new Error('no block');
  return b;
}

function inlinesOf(text: string): readonly MarkdownInline[] {
  const b = first(text);
  if (b.type !== 'paragraph') throw new Error('not a paragraph');
  return b.inlines;
}

/** Walks everything and gathers the text: used to check that nothing is lost. */
function walk(
  blocks: readonly MarkdownBlock[],
  visit: (i: MarkdownInline) => void,
): void {
  const inl = (list: readonly MarkdownInline[]): void => {
    for (const i of list) {
      visit(i);
      if (i.type === 'strong' || i.type === 'em' || i.type === 'link') inl(i.children);
    }
  };
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') inl(b.inlines);
    else if (b.type === 'list') {
      for (const it of b.items) {
        inl(it.inlines);
        walk(it.children, visit);
      }
    } else if (b.type === 'table') {
      b.header.forEach(inl);
      b.rows.forEach((r) => r.forEach(inl));
    }
  }
}

describe('markdown: building', () => {
  it('headings 1 to 6 with an id', () => {
    const blocks = parseMarkdown('# One\n## Two\n###### Six');
    expect(blocks.map((b) => (b.type === 'heading' ? b.level : 0))).toEqual([1, 2, 6]);
    expect(blocks[0]).toMatchObject({ id: 'one' });
  });

  // pt-BR kept: the accents stripped from the slug are the object of the test
  it('repeated ids get a suffix and accents leave the slug (pt-BR)', () => {
    const ids = parseMarkdown('# Seção\n# Seção\n# Seção\n# Seção-1')
      .map((b) => (b.type === 'heading' ? b.id : ''))
      .join(',');
    expect(ids).toBe('secao,secao-1,secao-2,secao-1-1');
  });

  it('paragraphs, bold, italic, inline code', () => {
    const b = parseMarkdown('one **strong** and *emphasis* and __x__ and _y_ and `c`\n\nOther');
    expect(b).toHaveLength(2);
    const types = inlinesOf('one **strong** and *emphasis* and __x__ and _y_ and `c`').map(
      (i) => i.type,
    );
    expect(types).toEqual([
      'text',
      'strong',
      'text',
      'em',
      'text',
      'strong',
      'text',
      'em',
      'text',
      'code',
    ]);
  });

  it('does not confuse snake_case with italic', () => {
    expect(inlinesOf('a_b_c')).toEqual([{ type: 'text', text: 'a_b_c' }]);
  });

  it('fenced code block with a language, without interpreting the content', () => {
    expect(first('```ts\nconst a = **b**;\n\n<x>\n```')).toEqual({
      type: 'code',
      lang: 'ts',
      text: 'const a = **b**;\n\n<x>',
    });
    expect(first('```\nplain')).toEqual({ type: 'code', lang: '', text: 'plain' });
  });

  it('bulleted, numbered and nested lists', () => {
    const b = first('- a\n- b\n  - b1\n  - b2\n    - b21\n- c');
    expect(b.type).toBe('list');
    if (b.type !== 'list') return;
    expect(b.ordered).toBe(false);
    expect(b.items).toHaveLength(3);
    const nested = b.items[1]?.children[0];
    expect(nested?.type === 'list' && nested.items).toHaveLength(2);
    const ord = first('1. one\n2. two\n\n3. three');
    expect(ord.type === 'list' && ord.ordered && ord.items.length).toBe(3);
    const star = first('* x\n+ y');
    expect(star.type === 'list' && star.items.length).toBe(2);
  });

  it('item continuation and end of the list', () => {
    const blocks = parseMarkdown('- a\n  continues\n\nparagraph');
    expect(blocks).toHaveLength(2);
    const l = blocks[0];
    expect(l?.type === 'list' && inlinesToText(l.items[0]?.inlines ?? [])).toBe(
      'a continues',
    );
  });

  it('table with alignment', () => {
    const b = first('| A | B | C |\n| :-- | :-: | --: |\n| 1 | **2** | 3 |\n| x | y |');
    expect(b.type).toBe('table');
    if (b.type !== 'table') return;
    expect(b.align).toEqual(['left', 'center', 'right']);
    expect(b.header).toHaveLength(3);
    expect(b.rows).toHaveLength(2);
    expect(b.rows[1]).toHaveLength(3);
  });

  it('table without alignment and without pipes at the edges', () => {
    const b = first('A | B\n--- | ---\n1 | 2');
    expect(b.type === 'table' && b.align).toEqual([null, null]);
  });

  it('links: mapping://, anchor and absolute http(s):// are live', () => {
    const [a, b, c, d] = [
      inlinesOf('[x](mapping://material3/button)')[0],
      inlinesOf('[x](#section)')[0],
      inlinesOf('[x](http://e.com)')[0],
      inlinesOf('[x](relative.md)')[0],
    ];
    expect(a).toMatchObject({
      type: 'link',
      kind: 'mapping',
      href: 'mapping://material3/button',
    });
    expect(b).toMatchObject({ type: 'link', kind: 'anchor' });
    expect(c).toMatchObject({ type: 'link', kind: 'external', href: 'http://e.com' });
    expect(d).toEqual({ type: 'text', text: 'x' });
    expect(isSafeLinkTarget('mapping://a/b')).toBe(true);
    expect(isSafeLinkTarget('#a')).toBe(true);
    expect(isSafeLinkTarget('https://example.com/a?b=1#c')).toBe(true);
    for (const bad of [
      '',
      '#',
      'mapping://',
      'javascript:alert(1)',
      'https://',
      'https:/x',
      'ftp://x.com/a',
      'https://a b',
      'data:text/html,a',
      'a b',
    ])
      expect(isSafeLinkTarget(bad)).toBe(false);
  });

  it('an image becomes its alternative text', () => {
    expect(inlinesOf('![alt here](http://x/y.png)')).toEqual([
      { type: 'text', text: 'alt here' },
    ]);
  });

  it('CRLF is equivalent to LF', () => {
    expect(parseMarkdown('# A\r\n\r\nb\r\n- c\r\n')).toEqual(
      parseMarkdown('# A\n\nb\n- c\n'),
    );
  });
});

describe('markdown: hostile input', () => {
  it('raw HTML is text', () => {
    for (const html of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<b>x</b>',
    ]) {
      const seen: string[] = [];
      walk(parseMarkdown(html), (i) => {
        expect(i.type === 'link').toBe(false);
        if (i.type === 'text') seen.push(i.text);
      });
      expect(seen.join('')).toBe(html);
    }
  });

  it('dangerous links do not become links', () => {
    const hostile = [
      '[x](javascript:alert(1))',
      '[x](JavaScript:alert(1))',
      '[x](data:text/html,<script>alert(1)</script>)',
      '[x]()',
      '![alt](http://evil.example/a.png)',
      '[x](mapping://)',
      '[x](  javascript:alert(1))',
    ];
    for (const h of hostile) {
      let links = 0;
      walk(parseMarkdown(h), (i) => {
        if (i.type === 'link') links++;
      });
      expect(links, h).toBe(0);
    }
  });

  it('empty inputs', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n \t \n')).toEqual([]);
  });

  const big: Record<string, string> = {
    '1 MB of asterisks': '*'.repeat(1_000_000),
    '1 MB of "*a "': '*a '.repeat(350_000),
    '1 MB of underscores': '_'.repeat(1_000_000),
    '1 MB of brackets': '['.repeat(1_000_000),
    '1 MB of backticks': '`'.repeat(1_000_000),
    '5000 levels of [': '['.repeat(5000) + 'x' + ']('.repeat(5000),
    '5000 levels of (': '[x]' + '('.repeat(5000),
    '5000 levels of >': '> '.repeat(5000) + 'x',
    '5000 levels of -': Array.from(
      { length: 5000 },
      (_, i) => ' '.repeat(i) + '- x',
    ).join('\n'),
    '5000 levels of * emphasis': '*a '.repeat(5000) + 'b' + '* '.repeat(5000),
    '5000 levels of [ with ]': '[a'.repeat(5000) + '](#x)'.repeat(5000),
    'unclosed fence': '```js\n' + 'x\n'.repeat(10_000),
    '1 MB fence': '`'.repeat(3) + '\n' + 'a'.repeat(1_000_000),
    'malformed table': '|\n|-|\n||||\n| a | b\n|:|\n---|---|---\n| x |',
    'huge table': '| a | b |\n|---|---|\n' + '| 1 | 2 |\n'.repeat(20_000),
    'pipes only': '|'.repeat(100_000),
    'loose CRLF': '\r'.repeat(10_000) + '\r\n'.repeat(10_000),
  };
  for (const [name, input] of Object.entries(big)) {
    it(`${name}: does not throw or take long`, () => {
      const t0 = performance.now();
      const out = parseMarkdown(input);
      expect(Array.isArray(out)).toBe(true);
      expect(performance.now() - t0).toBeLessThan(2000);
      walk(out, (i) =>
        expect(i.type === 'link' && !isSafeLinkTarget(i.href)).toBe(false),
      );
    });
  }

  it('deeply nested lists have limited depth', () => {
    let depth = 0;
    let blocks: readonly MarkdownBlock[] = parseMarkdown(
      Array.from({ length: 100 }, (_, i) => ' '.repeat(i * 2) + '- x').join('\n'),
    );
    while (blocks[0]?.type === 'list') {
      depth++;
      blocks = blocks[0].items[blocks[0].items.length - 1]?.children ?? [];
    }
    expect(depth).toBeLessThanOrEqual(6);
  });
});

describe('quote (> )', () => {
  it('becomes a quote block with the paragraphs inside, without the loose sign', () => {
    const blocks = parseMarkdown(
      'Before:\n\n> a `line`\n> continues\n>\n> other\n\nAfter',
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'quote', 'paragraph']);
    const quote = blocks[1];
    if (quote?.type !== 'quote') throw new Error('no quote');
    expect(quote.children.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
    const text: string[] = [];
    walk(blocks, (i) => {
      if (i.type === 'text') text.push(i.text);
    });
    expect(text.join('')).not.toContain('>');
  });

  it('a nested quote has limited depth and never loses the text', () => {
    const blocks = parseMarkdown(`${'> '.repeat(30)}deep`);
    expect(blocks[0]?.type).toBe('quote');
  });
});

describe('markdown: line break in the paragraph (option)', () => {
  it('without the option, a single break stays a space (the Catalog default)', () => {
    expect(inlinesOf('a\nb')).toEqual([{ type: 'text', text: 'a b' }]);
    expect(inlinesOf('a\nb')).toEqual(
      (parseMarkdown('a\nb', { lineBreaks: false })[0] as { inlines: unknown }).inlines,
    );
  });

  it('with the option, it becomes a break node inside the same paragraph', () => {
    const blocks = parseMarkdown('a\nb', { lineBreaks: true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      inlines: [
        { type: 'text', text: 'a' },
        { type: 'break' },
        { type: 'text', text: 'b' },
      ],
    });
  });

  it('a blank line still separates paragraphs and several lines give several breaks', () => {
    const blocks = parseMarkdown('a\nb\nc\n\nd', { lineBreaks: true });
    expect(blocks).toHaveLength(2);
    const first = blocks[0];
    if (first?.type !== 'paragraph') throw new Error('not a paragraph');
    expect(first.inlines.filter((i) => i.type === 'break')).toHaveLength(2);
  });

  it('emphasis that spans the line and inline code stay whole', () => {
    const blocks = parseMarkdown('one **strong\nbold** and `a\nb`', { lineBreaks: true });
    const inl = (blocks[0] as { inlines: readonly MarkdownInline[] }).inlines;
    expect(inl[1]).toMatchObject({ type: 'strong' });
    const strong = inl[1] as Extract<MarkdownInline, { type: 'strong' }>;
    expect(strong.children.map((c) => c.type)).toEqual(['text', 'break', 'text']);
    expect(inl.at(-1)).toEqual({ type: 'code', text: 'a b' });
  });

  it('blocks that are not a paragraph do not change (heading, list, table)', () => {
    const src = '# T\n\n- a\n  b\n\n| x | y |\n| - | - |\n| 1 | 2 |';
    expect(parseMarkdown(src, { lineBreaks: true })).toEqual(parseMarkdown(src));
  });

  it('inlinesToText returns the break as \\n', () => {
    const b = parseMarkdown('a\nb', { lineBreaks: true })[0] as {
      inlines: readonly MarkdownInline[];
    };
    expect(inlinesToText(b.inlines)).toBe('a\nb');
  });
});

describe('list with an indent that comes back (item 29)', () => {
  it('"  - a\\n- b" stays in the same root list', () => {
    const blocks = parseMarkdown('  - a\n- b');
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    expect(list?.type).toBe('list');
    if (list?.type !== 'list') return;
    expect(list.items.map((i) => inlinesToText(i.inlines))).toEqual(['a', 'b']);
  });
});

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('long text sliced at a safe boundary (item 30)', () => {
  const CHUNK = 20000;

  it('does not split a link that would cross the limit', () => {
    const link = '[label with spacing](mapping://items/m/abc12345)';
    const text = 'a'.repeat(CHUNK - 10) + ' ' + link + ' end';
    const links: MarkdownInline[] = [];
    walk(parseMarkdown(text), (i) => {
      if (i.type === 'link') links.push(i);
    });
    expect(links).toHaveLength(1);
  });

  it('does not split an emphasis that would cross the limit', () => {
    const text = 'a'.repeat(CHUNK - 6) + ' **bold text with gap** end';
    const strong: MarkdownInline[] = [];
    walk(parseMarkdown(text), (i) => {
      if (i.type === 'strong') strong.push(i);
    });
    expect(strong).toHaveLength(1);
  });

  it('does not split a surrogate pair', () => {
    const text = 'a'.repeat(CHUNK - 1) + '😀' + 'b'.repeat(10);
    const parts = parseInlines(text).flatMap((i) => (i.type === 'text' ? [i.text] : []));
    for (const part of parts) {
      expect(part).not.toMatch(LONE_SURROGATE);
    }
    expect(parts.join('')).toBe(text);
  });
});
