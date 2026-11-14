// L4 (decisões 17 e 18 da #1078): `min-content` e `max-content` em `width`/`height` do nó e no
// `sizing` da instância, no motor, com o `approximateMeasurer` (fonte de tamanho 10: 5,5 px por
// caractere; linha de 12 px).
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type MeasureFont,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { absoluteBoxes, walk, type SceneNode } from '../../../src/model/components/scene';
import { fitComponentSize, resolveSizing } from '../../../src/model/components/sizing';

type Json = Record<string, unknown>;

const CHAR = 5.5;
const LINE_HEIGHT = 12;
const V4 = 'only allowed with formatVersion 4';

/** 16 caracteres: a linha inteira mede 88 e a palavra mais larga ("bbbbbbbb") 44. */
const SENTENCE = 'aaaa bbbbbbbb cc';
const SENTENCE_MAX = 16 * CHAR;
const SENTENCE_MIN = 8 * CHAR;
/** 5 caracteres: uma linha de 27,5; a palavra mais larga é "yy" (11). */
const SHORT = 'xx yy';
const SHORT_MAX = 5 * CHAR;
const SHORT_MIN = 2 * CHAR;

function file(template: Json, formatVersion = 4, extra: Json = {}): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 400, height: 200 },
    template,
    ...extra,
  };
}

function text(name: string, value: string, extra: Json = {}): Json {
  return { type: 'text', name, text: value, font: { size: 10 }, ...extra };
}

function frame(name: string, layout: Json, children: Json[], extra: Json = {}): Json {
  return { type: 'frame', name, layout, children, ...extra };
}

/** O quadro `host` (coluna que ocupa a raiz) com o filho `kid` dentro. */
function host(kid: Json): Json {
  return frame('host', { type: 'column' }, [kid], { width: 'fill', height: 'fill' });
}

const BOX = { x: 0, y: 0, width: 400, height: 200 };

function build(template: Json, box = BOX, measure: TextMeasurer = approximateMeasurer) {
  const result = instantiate(file(template) as never, {} as never, box, { measure });
  const boxes = absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const at = (name: string): { x: number; y: number; width: number; height: number } => {
    const node = nodes.find((n) => n.name === name) as SceneNode | undefined;
    if (node === undefined) throw new Error(`sem nó ${name}`);
    const b = boxes.get(node.id) ?? { x: 0, y: 0 };
    return { x: b.x, y: b.y, width: node.width, height: node.height };
  };
  return { ...result, at };
}

describe('texto: min-content e max-content', () => {
  it('max-content é a linha mais larga sem quebra, mesmo num pai mais estreito', () => {
    const { at } = build(
      host(text('t', SENTENCE, { width: 'max-content', height: 'hug' })),
      { x: 0, y: 0, width: 50, height: 200 },
    );
    expect(at('t').width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(at('t').height).toBe(LINE_HEIGHT);
  });

  it('min-content é a palavra mais larga e o texto quebra uma palavra por linha', () => {
    const { at } = build(
      host(text('t', SENTENCE, { width: 'min-content', height: 'hug' })),
    );
    expect(at('t').width).toBeCloseTo(SENTENCE_MIN, 9);
    expect(at('t').height).toBe(3 * LINE_HEIGHT);
  });

  it('wrap none: min-content e max-content valem a linha inteira', () => {
    const font = { size: 10, wrap: 'none' };
    const min = build(host(text('t', SENTENCE, { width: 'min-content', font }))).at('t');
    const max = build(host(text('t', SENTENCE, { width: 'max-content', font }))).at('t');
    expect(min.width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(max.width).toBeCloseTo(SENTENCE_MAX, 9);
  });

  it('o texto com \\n: max-content é a linha mais larga e min-content a palavra mais larga', () => {
    const value = 'aa\nbbbb cc';
    const max = build(host(text('t', value, { width: 'max-content' }))).at('t');
    const min = build(host(text('t', value, { width: 'min-content' }))).at('t');
    expect(max.width).toBeCloseTo(7 * CHAR, 9);
    expect(min.width).toBeCloseTo(4 * CHAR, 9);
  });

  it('o espaço sem quebra (NBSP) não separa palavras no min-content', () => {
    const { at } = build(host(text('t', '10\u00a0kg aa', { width: 'min-content' })));
    expect(at('t').width).toBeCloseTo(5 * CHAR, 9);
  });

  it('o texto rico: a palavra que atravessa trechos é uma só e o chip é atômico', () => {
    const runs = [
      { text: 'Pa' },
      { text: 'gar' },
      { text: ' agora ' },
      { text: 'ab cd', background: '#cccccc', padding: [2, 4] },
    ];
    const min = build(host(text('t', '', { runs, width: 'min-content' }))).at('t');
    const max = build(host(text('t', '', { runs, width: 'max-content' }))).at('t');
    // Palavras: "Pagar" (27,5), "agora" (27,5); o chip "ab cd" mede 27,5 + 2 × 4 = 35,5.
    expect(min.width).toBeCloseTo(5 * CHAR + 8, 9);
    // Tudo numa linha: "Pagar agora " (12 caracteres com os espaços entre os trechos) e o chip.
    expect(max.width).toBeCloseTo(12 * CHAR + 5 * CHAR + 8, 9);
  });

  it('o limite maxWidth do próprio nó ainda corta o max-content', () => {
    const { at } = build(
      host(text('t', SENTENCE, { width: 'max-content', maxWidth: 60 })),
    );
    expect(at('t').width).toBe(60);
  });
});

describe('quadros: min-content e max-content', () => {
  const A = (extra: Json = {}) => text('a', SENTENCE, extra);
  const B = (extra: Json = {}) => text('b', SHORT, extra);

  it('row: max-content soma os max-content dos filhos + gaps + padding', () => {
    const row = frame('r', { type: 'row', gap: 4, padding: 6 }, [A(), B()], {
      width: 'max-content',
      height: 'hug',
    });
    const { at } = build(host(row), { x: 0, y: 0, width: 50, height: 200 });
    expect(at('r').width).toBeCloseTo(SENTENCE_MAX + SHORT_MAX + 4 + 12, 9);
    expect(at('a').width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(at('r').height).toBe(LINE_HEIGHT + 12);
  });

  it('row: min-content soma os min-content dos filhos + gaps + padding', () => {
    const row = frame('r', { type: 'row', gap: 4, padding: 6 }, [A(), B()], {
      width: 'min-content',
      height: 'hug',
    });
    const { at } = build(host(row));
    expect(at('r').width).toBeCloseTo(SENTENCE_MIN + SHORT_MIN + 4 + 12, 9);
  });

  it('row com wrap: max-content é uma linha só; min-content é o maior min-content', () => {
    const wrapped = (width: string) =>
      frame('r', { type: 'row', gap: 4, wrap: 'wrap' }, [A(), B()], {
        width,
        height: 'hug',
      });
    expect(build(host(wrapped('max-content'))).at('r').width).toBeCloseTo(
      SENTENCE_MAX + SHORT_MAX + 4,
      9,
    );
    expect(build(host(wrapped('min-content'))).at('r').width).toBeCloseTo(
      SENTENCE_MIN,
      9,
    );
  });

  it('column e none: o maior filho (o none soma as âncoras)', () => {
    const column = (width: string) =>
      frame('c', { type: 'column', gap: 3 }, [A(), B()], { width, height: 'hug' });
    expect(build(host(column('max-content'))).at('c').width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(build(host(column('min-content'))).at('c').width).toBeCloseTo(SENTENCE_MIN, 9);
    const none = (width: string) =>
      frame(
        'n',
        { type: 'none' },
        [A({ anchors: { left: 5 } }), B({ anchors: { right: 8 } })],
        {
          width,
          height: 'hug',
        },
      );
    expect(build(host(none('max-content'))).at('n').width).toBeCloseTo(
      5 + SENTENCE_MAX,
      9,
    );
    expect(build(host(none('min-content'))).at('n').width).toBeCloseTo(
      5 + SENTENCE_MIN,
      9,
    );
  });

  it('grid: n × a maior célula + gaps + padding', () => {
    const grid = (width: string) =>
      frame(
        'g',
        { type: 'grid', columns: 2, gap: 4, padding: 3 },
        [A(), B(), text('c', 'zz')],
        { width, height: 'hug' },
      );
    expect(build(host(grid('max-content'))).at('g').width).toBeCloseTo(
      2 * SENTENCE_MAX + 4 + 6,
      9,
    );
    expect(build(host(grid('min-content'))).at('g').width).toBeCloseTo(
      2 * SENTENCE_MIN + 4 + 6,
      9,
    );
  });

  it('grid adaptativa: min-content é uma coluna de minColumnWidth (ou da maior célula)', () => {
    const grid = (min: number) =>
      frame('g', { type: 'grid', minColumnWidth: min, gap: 4 }, [A(), B()], {
        width: 'min-content',
        height: 'hug',
      });
    expect(build(host(grid(120))).at('g').width).toBe(120);
    expect(build(host(grid(10))).at('g').width).toBeCloseTo(SENTENCE_MIN, 9);
  });

  it('um filho fill contribui com o próprio min/max-content; % contribui 0', () => {
    const row = (kid: Json, width: string) =>
      frame('r', { type: 'row' }, [kid, B()], { width, height: 'hug' });
    expect(
      build(host(row(A({ width: 'fill' }), 'max-content'))).at('r').width,
    ).toBeCloseTo(SENTENCE_MAX + SHORT_MAX, 9);
    expect(
      build(host(row(A({ width: 'fill' }), 'min-content'))).at('r').width,
    ).toBeCloseTo(SENTENCE_MIN + SHORT_MIN, 9);
    expect(
      build(host(row(A({ width: '50%' }), 'max-content'))).at('r').width,
    ).toBeCloseTo(SHORT_MAX, 9);
  });

  it('um filho com tamanho em px contribui com o px; um filho com o próprio min-content, com ele', () => {
    const row = frame(
      'r',
      { type: 'row' },
      [A({ width: 30 }), B({ width: 'min-content' })],
      { width: 'max-content', height: 'hug' },
    );
    expect(build(host(row)).at('r').width).toBeCloseTo(30 + SHORT_MIN, 9);
  });

  it('aninhado: row max-content › column min-content › row com dois textos', () => {
    const inner = () => frame('in', { type: 'row' }, [A(), B()], { width: 'fill' });
    const column = frame('col', { type: 'column' }, [inner(), inner()], {
      width: 'min-content',
      height: 'hug',
    });
    const outer = frame('out', { type: 'row', gap: 2 }, [column, column], {
      width: 'max-content',
      height: 'hug',
    });
    const { at } = build(host(outer));
    // O min-content da coluna é o da linha interna (a soma dos min-content dos filhos).
    expect(at('out').width).toBeCloseTo(2 * (SENTENCE_MIN + SHORT_MIN) + 2, 9);
  });

  it('o hug continua igual: o shrink-to-fit limitado pelo espaço (o max-content não)', () => {
    const row = (width: string) =>
      host(
        frame('r', { type: 'column' }, [A({ width: 'fill' })], { width, height: 'hug' }),
      );
    const at60 = { x: 0, y: 0, width: 60, height: 200 };
    expect(build(row('hug'), BOX).at('r').width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(build(row('hug'), at60).at('r').width).toBe(60);
    expect(build(row('max-content'), at60).at('r').width).toBeCloseTo(SENTENCE_MAX, 9);
  });

  it('height: min-content e max-content valem o hug (a altura na largura já resolvida)', () => {
    const col = (height: string) =>
      frame('c', { type: 'column' }, [A({ width: 'min-content' })], {
        width: 'fill',
        height,
      });
    expect(build(host(col('max-content'))).at('c').height).toBe(3 * LINE_HEIGHT);
    expect(build(host(col('min-content'))).at('c').height).toBe(3 * LINE_HEIGHT);
    expect(build(host(col('hug'))).at('c').height).toBe(3 * LINE_HEIGHT);
  });

  it('um slot mede o conteúdo do slot', () => {
    const slot = { type: 'slot', name: 's', width: 'max-content', height: 'hug' };
    const result = instantiate(file(host(slot)) as never, {} as never, BOX, {
      measure: approximateMeasurer,
      slotContent: { width: 77, height: 30 },
    });
    const node = [...walk(result.root)].find((n) => n.name === 's');
    expect(node?.width).toBe(77);
  });
});

describe('o memo intrínseco e a contagem de chamadas ao medidor', () => {
  function spy() {
    const calls = new Map<string, number>();
    const measure: TextMeasurer = (
      value: string,
      font: MeasureFont,
      maxWidth?: number,
    ) => {
      const key = `${value}|${maxWidth ?? ''}`;
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return approximateMeasurer(value, font, maxWidth);
    };
    return { calls, measure };
  }

  it('o max-content aninhado não mede duas vezes o mesmo (texto, limite)', () => {
    const { calls, measure } = spy();
    const inner = (i: number) =>
      frame('in', { type: 'row' }, [text('a', `${SENTENCE} ${i}`), text('b', SHORT)], {
        width: 'fill',
      });
    const column = (i: number) =>
      frame('col', { type: 'column' }, [inner(i), inner(i), inner(i)], {
        width: 'min-content',
        height: 'hug',
      });
    const outer = frame(
      'out',
      { type: 'row' },
      [column(1), column(2), column(3), column(4)],
      { width: 'max-content', height: 'hug' },
    );
    build(host(outer), BOX, measure);
    expect([...calls.values()].every((count) => count === 1)).toBe(true);
  });
});

describe('medida do componente (measureComponent e sizing)', () => {
  const component = (template: Json, sizing?: Json): never =>
    file(template, 4, sizing === undefined ? {} : { sizing }) as never;
  const body = frame('root', { type: 'column', padding: 4 }, [
    text('a', SENTENCE, { width: 'fill' }),
  ]);

  it('measureComponent mede o eixo max-content/min-content da raiz', () => {
    const maxContent = measureComponent(
      component(body),
      {},
      { width: 'max-content', height: null },
      { measure: approximateMeasurer },
    );
    expect(maxContent.width).toBeCloseTo(SENTENCE_MAX + 8, 9);
    expect(maxContent.height).toBe(LINE_HEIGHT + 8);
    const minContent = measureComponent(
      component(body),
      {},
      { width: 'min-content', height: null },
      { measure: approximateMeasurer },
    );
    expect(minContent.width).toBeCloseTo(SENTENCE_MIN + 8, 9);
    expect(minContent.height).toBe(3 * LINE_HEIGHT + 8);
  });

  it('o sizing aceita min-content e max-content (literal e por expressão)', () => {
    const literal = resolveSizing(
      component(body, { width: 'max-content', height: 'min-content' }),
      {},
    );
    expect(literal.width).toEqual({ spec: 'max-content', source: 'literal' });
    expect(literal.height).toEqual({ spec: 'min-content', source: 'literal' });
    const expr = resolveSizing(
      component(body, { width: { $switch: 'style', cases: { a: 'min-content' } } }),
      { style: 'a' } as never,
    );
    expect(expr.width).toEqual({ spec: 'min-content', source: 'expression' });
  });

  it('fitComponentSize: o sizing max-content ajusta para a largura sem quebra', () => {
    const fitted = fitComponentSize(
      component(body, { width: 'max-content' }),
      {},
      { measure: approximateMeasurer },
      { maxWidth: 80 },
    );
    // max-content não quebra: o limite maxWidth da medida não vale.
    expect(fitted?.width).toBe(Math.ceil(SENTENCE_MAX + 8 - 1e-6));
  });

  it('fitComponentSize: o sizing min-content ajusta para a palavra mais larga', () => {
    const fitted = fitComponentSize(
      component(body, { width: 'min-content' }),
      {},
      { measure: approximateMeasurer },
    );
    expect(fitted?.width).toBe(Math.ceil(SENTENCE_MIN + 8 - 1e-6));
  });
});

describe('validação: min-content e max-content só na formatVersion 4', () => {
  const nodeWith = (width: unknown): Json =>
    frame('r', { type: 'column' }, [text('t', 'a', { width })]);

  it('na v4 o literal vale em width, height e no sizing', () => {
    expect(validateComponent(file(nodeWith('max-content')))).toEqual([]);
    expect(validateComponent(file(nodeWith('min-content')))).toEqual([]);
    expect(
      validateComponent(
        file(frame('r', { type: 'column' }, []), 4, {
          sizing: { width: 'max-content', height: 'min-content' },
        }),
      ),
    ).toEqual([]);
  });

  it('numa versão 1 a 3 o literal é só da v4, no caminho da chave', () => {
    for (const version of [1, 2, 3]) {
      const list = validateComponent(file(nodeWith('max-content'), version));
      expect(list).toContain(`template.children[0].width: ${V4}`);
    }
    const sizingList = validateComponent(
      file(frame('r', { type: 'column' }, []), 3, { sizing: { width: 'min-content' } }),
    );
    expect(sizingList).toContain(`sizing.width: ${V4}`);
  });

  it('outro texto continua inválido', () => {
    expect(validateComponent(file(nodeWith('mid-content'))).length).toBeGreaterThan(0);
  });

  it('por expressão, o valor inválido cai no padrão com o aviso', () => {
    const template = host(
      text('t', SENTENCE, {
        width: { $switch: 'style', cases: { a: 'max-content', b: 'banana' } },
      }),
    );
    const run = (style: string) => {
      const result = instantiate(file(template) as never, { style } as never, BOX, {
        measure: approximateMeasurer,
      });
      return {
        width: [...walk(result.root)].find((n) => n.name === 't')?.width,
        warnings: result.warnings,
      };
    };
    expect(run('a').width).toBeCloseTo(SENTENCE_MAX, 9);
    const bad = run('b');
    expect(bad.warnings).toContain('valor inválido em width: banana');
  });

  it('numa v3, o valor vindo de expressão cai no padrão com o aviso', () => {
    const old = instantiate(
      file(host(text('t', SENTENCE, { width: { $field: 'w' } })), 3) as never,
      { w: 'max-content' } as never,
      BOX,
      { measure: approximateMeasurer },
    );
    expect(old.warnings).toContain('valor inválido em width: max-content');
  });
});
