import { describe, expect, it } from 'vitest';
import {
  inlinesToText,
  isSafeLinkTarget,
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
} from '../../src/model';

function first(text: string): MarkdownBlock {
  const b = parseMarkdown(text)[0];
  if (!b) throw new Error('sem bloco');
  return b;
}

function inlinesOf(text: string): readonly MarkdownInline[] {
  const b = first(text);
  if (b.type !== 'paragraph') throw new Error('não é parágrafo');
  return b.inlines;
}

/** Percorre tudo e junta o texto: usado para conferir que nada se perde. */
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

describe('markdown: construção', () => {
  it('títulos de 1 a 6 com id', () => {
    const blocks = parseMarkdown('# Um\n## Dois\n###### Seis');
    expect(blocks.map((b) => (b.type === 'heading' ? b.level : 0))).toEqual([1, 2, 6]);
    expect(blocks[0]).toMatchObject({ id: 'um' });
  });

  it('ids repetidos ganham sufixo e acentos saem do slug', () => {
    const ids = parseMarkdown('# Seção\n# Seção\n# Seção\n# Seção-1')
      .map((b) => (b.type === 'heading' ? b.id : ''))
      .join(',');
    expect(ids).toBe('secao,secao-1,secao-2,secao-1-1');
  });

  it('parágrafos, negrito, itálico, código em linha', () => {
    const b = parseMarkdown('um **forte** e *ênfase* e __x__ e _y_ e `c`\n\nOutro');
    expect(b).toHaveLength(2);
    const types = inlinesOf('um **forte** e *ênfase* e __x__ e _y_ e `c`').map(
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

  it('não confunde snake_case com itálico', () => {
    expect(inlinesOf('a_b_c')).toEqual([{ type: 'text', text: 'a_b_c' }]);
  });

  it('bloco de código cercado com linguagem, sem interpretar o conteúdo', () => {
    expect(first('```ts\nconst a = **b**;\n\n<x>\n```')).toEqual({
      type: 'code',
      lang: 'ts',
      text: 'const a = **b**;\n\n<x>',
    });
    expect(first('```\nsem')).toEqual({ type: 'code', lang: '', text: 'sem' });
  });

  it('listas com marcador, numeradas e aninhadas', () => {
    const b = first('- a\n- b\n  - b1\n  - b2\n    - b21\n- c');
    expect(b.type).toBe('list');
    if (b.type !== 'list') return;
    expect(b.ordered).toBe(false);
    expect(b.items).toHaveLength(3);
    const nested = b.items[1]?.children[0];
    expect(nested?.type === 'list' && nested.items).toHaveLength(2);
    const ord = first('1. um\n2. dois\n\n3. três');
    expect(ord.type === 'list' && ord.ordered && ord.items.length).toBe(3);
    const star = first('* x\n+ y');
    expect(star.type === 'list' && star.items.length).toBe(2);
  });

  it('continuação de item e fim da lista', () => {
    const blocks = parseMarkdown('- a\n  continua\n\nparágrafo');
    expect(blocks).toHaveLength(2);
    const l = blocks[0];
    expect(l?.type === 'list' && inlinesToText(l.items[0]?.inlines ?? [])).toBe(
      'a continua',
    );
  });

  it('tabela com alinhamento', () => {
    const b = first('| A | B | C |\n| :-- | :-: | --: |\n| 1 | **2** | 3 |\n| x | y |');
    expect(b.type).toBe('table');
    if (b.type !== 'table') return;
    expect(b.align).toEqual(['left', 'center', 'right']);
    expect(b.header).toHaveLength(3);
    expect(b.rows).toHaveLength(2);
    expect(b.rows[1]).toHaveLength(3);
  });

  it('tabela sem alinhamento e sem pipes nas bordas', () => {
    const b = first('A | B\n--- | ---\n1 | 2');
    expect(b.type === 'table' && b.align).toEqual([null, null]);
  });

  it('links: só mapping:// e âncora são vivos', () => {
    const [a, b, c, d] = [
      inlinesOf('[x](mapping://material3/button)')[0],
      inlinesOf('[x](#secao)')[0],
      inlinesOf('[x](http://e.com)')[0],
      inlinesOf('[x](relativo.md)')[0],
    ];
    expect(a).toMatchObject({
      type: 'link',
      kind: 'mapping',
      href: 'mapping://material3/button',
    });
    expect(b).toMatchObject({ type: 'link', kind: 'anchor' });
    expect(c).toEqual({ type: 'text', text: 'x' });
    expect(d).toEqual({ type: 'text', text: 'x' });
    expect(isSafeLinkTarget('mapping://a/b')).toBe(true);
    expect(isSafeLinkTarget('#a')).toBe(true);
    for (const bad of [
      '',
      '#',
      'mapping://',
      'javascript:alert(1)',
      'https://x',
      'data:text/html,a',
      'a b',
    ])
      expect(isSafeLinkTarget(bad)).toBe(false);
  });

  it('imagem vira o texto alternativo', () => {
    expect(inlinesOf('![alt aqui](http://x/y.png)')).toEqual([
      { type: 'text', text: 'alt aqui' },
    ]);
  });

  it('CRLF equivale a LF', () => {
    expect(parseMarkdown('# A\r\n\r\nb\r\n- c\r\n')).toEqual(
      parseMarkdown('# A\n\nb\n- c\n'),
    );
  });
});

describe('markdown: entrada hostil', () => {
  it('HTML cru é texto', () => {
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

  it('links perigosos não viram link', () => {
    const hostile = [
      '[x](javascript:alert(1))',
      '[x](JavaScript:alert(1))',
      '[x](data:text/html,<script>alert(1)</script>)',
      '[x](http://evil.example)',
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

  it('entradas vazias', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n \t \n')).toEqual([]);
  });

  const big: Record<string, string> = {
    '1 MB de asteriscos': '*'.repeat(1_000_000),
    '1 MB de "*a "': '*a '.repeat(350_000),
    '1 MB de underscores': '_'.repeat(1_000_000),
    '1 MB de colchetes': '['.repeat(1_000_000),
    '1 MB de crases': '`'.repeat(1_000_000),
    '5000 níveis de [': '['.repeat(5000) + 'x' + ']('.repeat(5000),
    '5000 níveis de (': '[x]' + '('.repeat(5000),
    '5000 níveis de >': '> '.repeat(5000) + 'x',
    '5000 níveis de -': Array.from(
      { length: 5000 },
      (_, i) => ' '.repeat(i) + '- x',
    ).join('\n'),
    '5000 níveis de * ênfase': '*a '.repeat(5000) + 'b' + '* '.repeat(5000),
    '5000 níveis de [ com ]': '[a'.repeat(5000) + '](#x)'.repeat(5000),
    'cerca não fechada': '```js\n' + 'x\n'.repeat(10_000),
    'cerca de 1 MB': '`'.repeat(3) + '\n' + 'a'.repeat(1_000_000),
    'tabela malformada': '|\n|-|\n||||\n| a | b\n|:|\n---|---|---\n| x |',
    'tabela enorme': '| a | b |\n|---|---|\n' + '| 1 | 2 |\n'.repeat(20_000),
    'só pipes': '|'.repeat(100_000),
    'CRLF solto': '\r'.repeat(10_000) + '\r\n'.repeat(10_000),
  };
  for (const [name, input] of Object.entries(big)) {
    it(`${name}: não lança nem demora`, () => {
      const t0 = performance.now();
      const out = parseMarkdown(input);
      expect(Array.isArray(out)).toBe(true);
      expect(performance.now() - t0).toBeLessThan(2000);
      walk(out, (i) =>
        expect(i.type === 'link' && !isSafeLinkTarget(i.href)).toBe(false),
      );
    });
  }

  it('listas aninhadas profundas têm profundidade limitada', () => {
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
