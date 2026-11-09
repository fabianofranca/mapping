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

const url = (path: string) => `mapping://pasta/${path}`;
const text = (t: string): ComposerPart => ({ type: 'text', text: t });
const chip = (label: string, u: string): ComposerPart => ({
  type: 'chip',
  label,
  url: u,
});

describe('composerToMarkdown', () => {
  it('concatena texto e chips sem espaço extra', () => {
    const doc: ComposerDoc = [
      text('Veja '),
      chip('Botão', url('m/m2')),
      text(', depois '),
      chip('titulo', url('a/am/f/titulo')),
      text('.'),
    ];
    expect(composerToMarkdown(doc)).toBe(
      `Veja [Botão](${url('m/m2')}), depois [titulo](${url('a/am/f/titulo')}).`,
    );
  });

  it('escapa o rótulo do chip', () => {
    expect(composerToMarkdown([chip('a[1] \\ b', url('m/m1'))])).toBe(
      formatCitation('a[1] \\ b', url('m/m1')),
    );
  });

  it('rótulo vazio usa o texto neutro recebido (padrão ·)', () => {
    expect(composerToMarkdown([chip('', url('m/m1'))])).toBe(`[·](${url('m/m1')})`);
    expect(composerToMarkdown([chip('', url('m/m1'))], 'sem nome')).toBe(
      `[sem nome](${url('m/m1')})`,
    );
  });

  it('documento vazio dá texto vazio', () => {
    expect(composerToMarkdown([])).toBe('');
  });
});

describe('normalizeDoc', () => {
  it('junta textos vizinhos e descarta textos vazios', () => {
    const c = chip('x', url('m/m1'));
    expect(
      normalizeDoc([text('a'), text(''), text('b'), c, text(''), text('c')]),
    ).toEqual([text('ab'), c, text('c')]);
    expect(normalizeDoc([text(''), text('')])).toEqual([]);
  });

  it('não junta chips', () => {
    const c = chip('x', url('m/m1'));
    expect(normalizeDoc([c, c])).toEqual([c, c]);
  });
});

describe('markdownToComposer', () => {
  it('transforma a citação válida em chip', () => {
    const md = `Veja ${formatCitation('Botão', url('m/m2'))} agora`;
    expect(markdownToComposer(md)).toEqual([
      text('Veja '),
      chip('Botão', url('m/m2')),
      text(' agora'),
    ]);
  });

  it('desescapa o rótulo e aceita campo codificado', () => {
    const md = formatCitation('a[1] \\ b', url('a/am/f/Tabela%20de%20dados'));
    expect(markdownToComposer(md)).toEqual([
      chip('a[1] \\ b', url('a/am/f/Tabela%20de%20dados')),
    ]);
  });

  it('chips colados um no outro', () => {
    const md = `${formatCitation('a', url('m/m1'))}${formatCitation('b', url('m/m2'))}`;
    expect(markdownToComposer(md)).toEqual([
      chip('a', url('m/m1')),
      chip('b', url('m/m2')),
    ]);
  });

  it('deixa como texto: link externo, link de biblioteca, link quebrado, rótulo vazio', () => {
    for (const md of [
      '[site](https://exemplo.com/m/m1)',
      '[Button](mapping://button)',
      '[Button](mapping://spec/button)',
      `[a](${url('m/m1/extra')})`,
      `[b](${url('z/m1')})`,
      `[](${url('m/m1')})`,
      '[a](mapping://pasta/m/m1',
      '**negrito** e `código` e # título',
    ]) {
      expect(markdownToComposer(md)).toEqual([text(md)]);
    }
  });

  it('não vira chip dentro de código em linha nem em bloco', () => {
    const inline = `\`${formatCitation('x', url('m/m1'))}\``;
    expect(markdownToComposer(inline)).toEqual([text(inline)]);
    const block = ['```', formatCitation('y', url('m/m1')), '```'].join('\n');
    expect(markdownToComposer(block)).toEqual([text(block)]);
    const mixed = `\`a\` ${formatCitation('z', url('m/m1'))}`;
    expect(markdownToComposer(mixed)).toEqual([text('`a` '), chip('z', url('m/m1'))]);
  });

  it('colchete escapado e [ solto ficam texto; o chip seguinte continua', () => {
    const md = `\\[x](${url('m/m1')}) e [ solto ${formatCitation('ok', url('m/m2'))}`;
    expect(markdownToComposer(md)).toEqual([
      text(`\\[x](${url('m/m1')}) e [ solto `),
      chip('ok', url('m/m2')),
    ]);
  });

  it('o texto devolvido já está normalizado', () => {
    const doc = markdownToComposer('a [b] c');
    expect(doc).toEqual([text('a [b] c')]);
    expect(markdownToComposer('')).toEqual([]);
  });
});

describe('ida e volta composerToMarkdown(markdownToComposer(s)) === s', () => {
  const fixed = [
    '',
    'só texto',
    formatCitation('Botão', url('m/m2')),
    `antes ${formatCitation('a[1]', url('m/m2'))} depois ${formatCitation('b\\', url('i/i1'))}`,
    `[ ${formatCitation('x', url('m/m1'))}`,
    `[a](${url('m/m1/extra')}) quebrado`,
    '[a](mapping://pasta/m/m1',
    '[a]( mapping://pasta/m/m1)',
    `\\${formatCitation('x', url('m/m1'))}`,
    `\`${formatCitation('x', url('m/m1'))}\` ${formatCitation('y', url('m/m1'))}`,
    '``` sem fim [x](mapping://pasta/m/m1)',
    `[a\\x](${url('m/m1')})`,
    `[a\\\\](${url('m/m1')})`,
    '[]()',
    '[[a]](mapping://pasta/m/m1)',
    `linha\n${formatCitation('x', url('a/am/f/campos/r/r1'))}\nfim`,
  ];

  it.each(fixed.map((s) => [s]))('caso fixo %j', (s) => {
    expect(composerToMarkdown(markdownToComposer(s))).toBe(s);
  });

  it('propriedade em textos pseudoaleatórios', () => {
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
      'mapping://pasta/m/m1',
      '](mapping://pasta/m/m1)',
      '[x](mapping://pasta/m/m2)',
      '[a\\]b](mapping://pasta/i/i1)',
      '](mapping://pasta/z/m1)',
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
      return { label: 'Botão vivo', url: url('m/m2') };
    }
    if (ref.ref.type === 'field') {
      return { label: ref.ref.key, url: url(`a/${ref.ref.annotation}/f/${ref.ref.key}`) };
    }
    return null;
  };

  it('texto sem URL entra como texto puro', () => {
    expect(pasteToParts('olá *mundo*', resolves)).toEqual([text('olá *mundo*')]);
    expect(pasteToParts('', resolves)).toEqual([]);
  });

  it('URL crua que resolve vira chip com o rótulo vivo', () => {
    expect(pasteToParts(`veja ${url('m/m2')} aqui`, resolves)).toEqual([
      text('veja '),
      chip('Botão vivo', url('m/m2')),
      text(' aqui'),
    ]);
  });

  it('URL crua que não resolve (ou não fecha a gramática) fica texto', () => {
    for (const s of [url('m/m9'), 'mapping://button', url('m/m2/extra'), url('z/m2')]) {
      expect(pasteToParts(s, resolves)).toEqual([text(s)]);
    }
  });

  it('marcadores de ênfase colados em volta da URL não entram nela', () => {
    for (const mark of ['**', '*', '_', '__', '`', '~~']) {
      expect(pasteToParts(`${mark}${url('m/m2')}${mark}`, resolves)).toEqual([
        text(mark),
        chip('Botão vivo', url('m/m2')),
        text(mark),
      ]);
    }
  });

  it('rótulo com *, _ e crase: round-trip pelo markdown do compositor', () => {
    const doc: ComposerDoc = [chip('a*b_c`d', url('m/m1'))];
    expect(markdownToComposer(composerToMarkdown(doc))).toEqual(doc);
  });

  it('pontuação final da frase não entra na URL', () => {
    expect(pasteToParts(`Ver ${url('m/m2')}.`, resolves)).toEqual([
      text('Ver '),
      chip('Botão vivo', url('m/m2')),
      text('.'),
    ]);
    expect(pasteToParts(`(${url('m/m2')}), ok`, resolves)).toEqual([
      text('('),
      chip('Botão vivo', url('m/m2')),
      text('), ok'),
    ]);
  });

  it('link markdown colado inteiro vira chip com o rótulo vivo', () => {
    expect(pasteToParts(`[antigo](${url('m/m2')})`, resolves)).toEqual([
      chip('Botão vivo', url('m/m2')),
    ]);
  });

  it('link markdown que não resolve fica texto como estava', () => {
    const md = `[antigo](${url('m/m9')})`;
    expect(pasteToParts(md, resolves)).toEqual([text(md)]);
  });

  it('vários, misturados, em várias linhas', () => {
    const pasted = `a ${url('m/m2')}\n[x](${url('a/am/f/titulo')}) e ${url('m/m9')}`;
    expect(pasteToParts(pasted, resolves)).toEqual([
      text('a '),
      chip('Botão vivo', url('m/m2')),
      text('\n'),
      chip('titulo', url('a/am/f/titulo')),
      text(` e ${url('m/m9')}`),
    ]);
  });

  it('o rótulo do chip colado é o de resolves, mesmo com colchetes no rótulo antigo', () => {
    const md = `[a\\[1\\]](${url('m/m2')})`;
    expect(pasteToParts(md, resolves)).toEqual([chip('Botão vivo', url('m/m2'))]);
  });
});
