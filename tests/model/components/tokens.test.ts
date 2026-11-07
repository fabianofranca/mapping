// Formato 4, fase CF5: `{ "$token": "<nome>" }`, resolução por modo e fonte padrão do hospedeiro.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { resolveTokens } from '../../../src/model/components/tokens';

const V4 = 'só é permitido com formatVersion 4';

const TOKENS = {
  modes: ['light', 'dark'],
  values: { primary: { light: '#1a73e8', dark: '#8ab4f8' }, radius: 8 },
};

function component(template: unknown, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

const withChild = (child: Record<string, unknown>, version = 4) =>
  component({ type: 'frame', children: [child] }, version);

describe('$token: validação do arquivo', () => {
  it('vale em cor, número, família, $switch, stop de gradiente, stroke e limites', () => {
    const t = (name: string) => ({ $token: name });
    const issues = validateComponent(
      component({
        type: 'frame',
        fill: t('primary'),
        layout: { type: 'row', gap: t('radius') },
        minWidth: t('radius'),
        children: [
          {
            type: 'rect',
            fill: {
              type: 'linear',
              angle: 0,
              stops: [
                { offset: 0, color: t('primary') },
                { offset: 1, color: '#000' },
              ],
            },
            stroke: { color: t('primary'), width: t('radius') },
            cornerRadius: t('radius'),
          },
          {
            type: 'text',
            text: 'x',
            color: { $switch: 'k', cases: { a: t('primary') }, default: t('primary') },
            font: { size: t('radius'), family: t('font-sans') },
          },
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it('na v3 falha com a mensagem de versão, no caminho', () => {
    expect(
      validateComponent(withChild({ type: 'rect', fill: { $token: 'primary' } }, 3)),
    ).toContain(`template.children[0].fill: ${V4}`);
  });

  it('em valor que não é cor, número nem família falha', () => {
    const errors = validateComponent(
      withChild({ type: 'frame', layout: { type: 'row', align: { $token: 'x' } } }),
    );
    expect(errors.some((e) => e.includes('layout.align') && e.includes('$token'))).toBe(
      true,
    );
  });

  it('o nome precisa seguir o padrão e o objeto não aceita outra chave', () => {
    expect(
      validateComponent(withChild({ type: 'rect', fill: { $token: 'Primary' } })).length,
    ).toBeGreaterThan(0);
    expect(
      validateComponent(
        withChild({ type: 'rect', fill: { $token: 'primary', default: '#fff' } }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('o resultado lista as referências com caminho, nome e tipo esperado', () => {
    const r = parseComponent(
      withChild({
        type: 'text',
        text: 'x',
        color: { $token: 'primary' },
        font: { size: { $token: 'radius' }, family: { $token: 'font-sans' } },
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: 'template.children[0].color', name: 'primary', kind: 'color' },
      { path: 'template.children[0].font.family', name: 'font-sans', kind: 'family' },
      { path: 'template.children[0].font.size', name: 'radius', kind: 'number' },
    ]);
  });
});

const rectComponent = (extra: Record<string, unknown>): ComponentFile => {
  const r = parseComponent(withChild({ type: 'rect', ...extra }));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
};

function solidColor(node: unknown): unknown {
  const fills = (node as { fills?: readonly { type: string; color?: string }[] }).fills;
  return fills?.[0]?.color;
}

function firstFill(file: ComponentFile, mode: string | undefined): unknown {
  const tokens = resolveTokens(TOKENS, {}, mode);
  const { root } = instantiate(
    file,
    {},
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer, tokens },
  );
  return solidColor(root.children[0]);
}

describe('$token: resolução por modo', () => {
  const file = rectComponent({ fill: { $token: 'primary' } });

  it('no modo dark devolve o valor do dark', () => {
    expect(firstFill(file, 'dark')).toBe('#8ab4f8');
  });

  it('em modo não declarado usa o primeiro modo, sem aviso', () => {
    expect(firstFill(file, 'contrast')).toBe('#1a73e8');
    expect(firstFill(file, undefined)).toBe('#1a73e8');
  });

  it('valor simples vale em todos os modos', () => {
    const tokens = (mode: string) => resolveTokens(TOKENS, {}, mode);
    expect(tokens('light').radius).toBe(8);
    expect(tokens('dark').radius).toBe(8);
  });

  it('$token como resultado de $switch', () => {
    const f = rectComponent({
      fill: { $switch: 'k', cases: { a: { $token: 'primary' } } },
    });
    const tokens = resolveTokens(TOKENS, {}, 'dark');
    const { root } = instantiate(
      f,
      { k: 'a' },
      { x: 0, y: 0, width: 10, height: 10 },
      { measure: approximateMeasurer, tokens },
    );
    expect(solidColor(root.children[0])).toBe('#8ab4f8');
  });
});

describe('fonte padrão do hospedeiro', () => {
  const textFile = (font: Record<string, unknown> = {}): ComponentFile => {
    const r = parseComponent(
      withChild({ type: 'text', text: 'Olá', font: { size: 10, ...font } }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.component;
  };

  function families(
    file: ComponentFile,
    tokens = resolveTokens(undefined, {}),
  ): string[] {
    const seen: string[] = [];
    const measure: TextMeasurer = (text, font, maxWidth) => {
      seen.push(font.family);
      return approximateMeasurer(text, font, maxWidth);
    };
    instantiate(file, {}, { x: 0, y: 0, width: 200, height: 100 }, { measure, tokens });
    return seen;
  }

  it('sem family o texto usa o font-sans dado pelo hospedeiro', () => {
    const tokens = resolveTokens(undefined, { sans: 'Tema Sans, sans-serif' });
    expect(new Set(families(textFile(), tokens))).toEqual(
      new Set(['Tema Sans, sans-serif']),
    );
  });

  it('a especialização que redefine font-sans nos tokens vence', () => {
    const tokens = resolveTokens(
      { modes: ['m'], values: { 'font-sans': 'Spec Sans' } },
      { sans: 'Tema Sans' },
    );
    expect(new Set(families(textFile(), tokens))).toEqual(new Set(['Spec Sans']));
  });

  it('font-mono vem do hospedeiro e a especialização o redefine', () => {
    const file = textFile({ family: { $token: 'font-mono' } });
    expect(
      new Set(families(file, resolveTokens(undefined, { mono: 'Tema Mono' }))),
    ).toEqual(new Set(['Tema Mono']));
    const spec = { modes: ['m'], values: { 'font-mono': 'Spec Mono' } };
    expect(new Set(families(file, resolveTokens(spec, { mono: 'Tema Mono' })))).toEqual(
      new Set(['Spec Mono']),
    );
  });

  it('um family literal vence o padrão', () => {
    const tokens = resolveTokens(undefined, { sans: 'Tema Sans' });
    expect(new Set(families(textFile({ family: 'Roboto' }), tokens))).toEqual(
      new Set(['Roboto']),
    );
  });

  it('sem hospedeiro o padrão é sans-serif', () => {
    expect(new Set(families(textFile()))).toEqual(new Set(['sans-serif']));
  });

  it('regressão de largura: o texto sem family mede com a fonte do tema', () => {
    // A largura depende da família: 10 px por letra na fonte larga do tema, 6 nas demais.
    const measure: TextMeasurer = (text, font) => ({
      width: text.length * (font.family === 'Tema Largo' ? 10 : 6),
      height: font.lineHeight,
    });
    const r = parseComponent(
      component({
        type: 'frame',
        layout: { type: 'row' },
        children: [{ type: 'text', text: 'Olá', width: 'hug', font: { size: 10 } }],
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const size = { width: null, height: 20 };
    const wide = measureComponent(r.component, {}, size, {
      measure,
      tokens: resolveTokens(undefined, { sans: 'Tema Largo' }),
    });
    const plain = measureComponent(r.component, {}, size, { measure });
    expect(wide.width).toBe(30);
    expect(plain.width).toBe(18);
  });

  it("'Inter' não aparece mais no código do modelo", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && readFileSync(path, 'utf8').includes("'Inter'"))
          hits.push(path);
      }
    };
    walk('src/model');
    expect(hits).toEqual([]);
  });
});
