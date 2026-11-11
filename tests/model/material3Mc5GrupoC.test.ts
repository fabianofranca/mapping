// MC5 (#1033, etapa #898), grupo C: button, extended-fab, chip, text-field, secure-text-field e search-bar. A altura passa
// a seguir o conteúdo (o rótulo longo quebra e a altura cresce) ou os campos (o apoio do text-field), e os limites da
// raiz (280 do campo, 360 e 720 da barra) entram no template. Referência (commit 5113b82a…, androidx/compose/material3/
// material3/src/commonMain/kotlin/androidx/compose/material3):
//  - Button.kt 144 a 150: `Row(Modifier.defaultMinSize(58, 40).padding(contentPadding))`, `ContentPadding` 24/8 (479 a 486);
//  - FloatingActionButton.kt 107 a 123 e 159 a 161: o `Box` do `ExtendedFloatingActionButton` tem `defaultMinSize` 56 por 56
//    (`FabBaselineTokens`), sem padding vertical; 396 a 433: `Row` com `sizeIn(minWidth)` 80 e padding só dos lados;
//  - Chip.kt 2059: `defaultMinSize(minHeight = 32).padding(paddingValues)` com `paddingValues` só horizontal (2943 a 2964);
//  - TextFieldDefaults.kt 66 a 82 e 885 a 902 (`MinHeight` 56 e `MinWidth` 280), 466 a 470 (`supportingTextPadding`, topo 4),
//    TextField.kt 301 a 308 e 799 a 801, OutlinedTextField.kt 246 a 261 (`padding(top = minimizedLabelHalfHeight())`, 8) e
//    internal/TextFieldImpl.kt (`MinSupportingTextLineHeight` 16);
//  - SearchBar.kt 1356 a 1360 (`sizeIn(360, 720, 56)` do campo), 665 (o docked: `width(SearchBarMinWidth)`) e 2711 a 2714.
import { describe, expect, it } from 'vitest';
import { fitComponentSize } from '../../src/model/components/sizing';
import {
  approximateMeasurer,
  measureComponent,
} from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import {
  catalog,
  drawFitted,
  entryOf,
  fittedSize,
  templateNodes,
} from '../support/material3Fitted';
import type { Mode, Values } from '../support/material3Fitted';

type Drawing = ReturnType<typeof drawFitted>['drawing'];
const MODES: Mode[] = ['light', 'dark'];

const optionsOf = (mode: Mode) => {
  const library = catalog.library!;
  return {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  };
};
const allValues = (id: string, values: Values) =>
  ({ ...defaultValues(entryOf(id).type), ...values }) as never;

/**
 * O tamanho que o Arrumar da app dá à marcação de `width` × `height`: a largura dela fica
 * (`auto: { width: false }`) e a altura segue o `sizing`. Sem eixo ajustável, a marcação não muda.
 */
function arrumar(id: string, values: Values, width: number, height: number, mode: Mode) {
  const fit = fitComponentSize(
    entryOf(id).component!,
    allValues(id, values),
    optionsOf(mode),
    { base: { width, height }, auto: { width: false } },
  );
  return { width: fit?.width ?? width, height: fit?.height ?? height };
}

const visible = (d: Drawing, name: string): SceneNode[] =>
  [...walk(d.root)].filter((n) => n.name === name && n.visible);
const boxOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const textOf = (d: Drawing, name: string): TextNode => {
  const node = visible(d, name).find((n): n is TextNode => n.type === 'text');
  if (node === undefined) throw new Error(`texto ausente: ${name}`);
  return node;
};
const near = (value: number | undefined, expected: number, digits = 3) =>
  expect(value).toBeCloseTo(expected, digits);
/** As linhas do texto (a altura do nó dividida pela altura de linha). */
const linesOf = (d: Drawing, name: string): number => {
  const node = textOf(d, name);
  const lineHeight = node.style.lineHeight;
  if (lineHeight === undefined) throw new Error(`texto sem altura de linha: ${name}`);
  return Math.round(boxOf(d, node).height / lineHeight);
};
/** O primeiro ícone desenhado (grupo com caminho), na ordem do desenho. */
const firstIcon = (d: Drawing) =>
  [...walk(d.root)].find(
    (n) => n.visible && n.type === 'group' && [...walk(n)].some((c) => c.type === 'path'),
  )!;

// ---------------------------------------------------------------------------------------------
// button
// ---------------------------------------------------------------------------------------------
describe('MC5 grupo C — button, a altura segue as linhas do rótulo (Button.kt 144 a 150)', () => {
  const STYLES = ['filled', 'tonal', 'outlined', 'text', 'elevated'];

  it('o sizing.height é hug, a raiz guarda o mínimo de 40 e o conteúdo e o rótulo abraçam a altura', () => {
    const comp = entryOf('button').component!;
    expect(comp.sizing?.height).toBe('hug');
    expect(comp.size.height).toBe(40);
    expect(comp.template.minHeight).toBe(40);
    expect(templateNodes('button', 'conteúdo')[0]!.height).toBe('hug');
    expect(templateNodes('button', 'rótulo')[0]!.height).toBe('hug');
  });

  it.each(MODES)(
    'a marcação de 136 de largura: 1 linha mede 40 e 2 linhas medem 56 (8 + 40 + 8) (%s)',
    (mode) => {
      expect(arrumar('button', { label: 'Salvar' }, 136, 40, mode)).toEqual({
        width: 136,
        height: 40,
      });
      expect(arrumar('button', { label: 'Salvar e continuar' }, 136, 40, mode)).toEqual({
        width: 136,
        height: 56,
      });
    },
  );

  it.each(MODES)(
    'o exemplo "Rótulo longo" cresce pelas linhas: altura = 16 + 20 × linhas, largura mantida (%s)',
    (mode) => {
      const values = {
        label: 'Salvar alterações e continuar editando',
        style: 'filled',
      };
      const fit = arrumar('button', values, 136, 40, mode);
      const { drawing } = drawFitted('button', values, mode, fit);
      const lines = linesOf(drawing, 'rótulo');
      expect(lines).toBeGreaterThanOrEqual(3);
      expect(fit).toEqual({ width: 136, height: 16 + 20 * lines });
      // O texto cabe na caixa ajustada, com 8 em cima e embaixo.
      const text = boxOf(drawing, textOf(drawing, 'rótulo'));
      near(text.y, 8);
      near(text.y + text.height, fit.height - 8);
      expect(drawing.warnings).toEqual([]);
    },
  );

  it.each(STYLES.flatMap((style) => MODES.map((mode) => [style, mode] as const)))(
    'o botão %s de rótulo longo desenha sem aviso no tamanho ajustado (%s)',
    (style, mode) => {
      const values = { label: 'Salvar e continuar', style, icon: 'Add' };
      const fit = arrumar('button', values, 136, 40, mode);
      expect(fit.height).toBe(56);
      const { drawing } = drawFitted('button', values, mode, fit);
      expect(drawing.warnings).toEqual([]);
      // O ícone fica centrado na altura do bloco de texto (Row com CenterVertically).
      const icon = boxOf(drawing, firstIcon(drawing));
      near(icon.y + icon.height / 2, fit.height / 2);
    },
  );

  it('o rótulo de uma linha continua centrado pela maiúscula na caixa de 40', () => {
    const { drawing } = drawFitted('button', { label: 'Salvar' }, 'light', {
      width: 136,
      height: 40,
    });
    const text = boxOf(drawing, textOf(drawing, 'rótulo'));
    near(text.y + text.height / 2, 20, 0);
    expect(textOf(drawing, 'rótulo').style.verticalAlign).toBe('cap-middle');
  });
});

// ---------------------------------------------------------------------------------------------
// extended-fab
// ---------------------------------------------------------------------------------------------
describe('MC5 grupo C — extended-fab, a altura segue as linhas do rótulo (FloatingActionButton.kt 159 a 161)', () => {
  const base = { text: 'Criar', icon: 'Add' };

  it('o sizing.height é hug, a raiz guarda o mínimo de 56 e o conteúdo e o rótulo abraçam a altura', () => {
    const comp = entryOf('extended-fab').component!;
    expect(comp.sizing?.height).toBe('hug');
    expect(comp.size.height).toBe(56);
    expect(comp.template.minHeight).toBe(56);
    expect(templateNodes('extended-fab', 'conteúdo')[0]!.height).toBe('hug');
    expect(templateNodes('extended-fab', 'texto')[0]!.height).toBe('hug');
  });

  it.each(MODES)(
    'uma e duas linhas ficam nos 56 do mínimo (40 < 56) e três linhas medem 60 (%s)',
    (mode) => {
      expect(arrumar('extended-fab', base, 142, 56, mode).height).toBe(56);
      const two = { ...base, text: 'Criar nota' };
      const { drawing: d2 } = drawFitted('extended-fab', two, mode, { width: 142 });
      expect(linesOf(d2, 'texto')).toBe(2);
      expect(arrumar('extended-fab', two, 142, 56, mode).height).toBe(56);
      const three = { ...base, text: 'Criar nota fiscal' };
      const { drawing: d3 } = drawFitted('extended-fab', three, mode, { width: 142 });
      expect(linesOf(d3, 'texto')).toBe(3);
      expect(arrumar('extended-fab', three, 142, 56, mode)).toEqual({
        width: 142,
        height: 60,
      });
      expect(
        drawFitted('extended-fab', three, mode, { width: 142, height: 60 }).drawing
          .warnings,
      ).toEqual([]);
    },
  );

  it.each(MODES)('recolhido (só o ícone) fica nos 56 do mínimo (%s)', (mode) => {
    const values = { text: 'Criar uma nota fiscal nova', icon: 'Add', expanded: 'false' };
    expect(arrumar('extended-fab', values, 56, 56, mode)).toEqual({
      width: 56,
      height: 56,
    });
  });
});

// ---------------------------------------------------------------------------------------------
// chip
// ---------------------------------------------------------------------------------------------
describe('MC5 grupo C — chip, a altura segue as linhas do rótulo (Chip.kt 2059)', () => {
  const long = 'Adicionar reunião ao calendário compartilhado';

  it('o sizing.height é hug, a raiz guarda o mínimo de 32 e o conteúdo e o rótulo abraçam a altura', () => {
    const comp = entryOf('chip').component!;
    expect(comp.sizing?.height).toBe('hug');
    expect(comp.size.height).toBe(32);
    expect(comp.template.minHeight).toBe(32);
    expect(templateNodes('chip', 'conteúdo')[0]!.height).toBe('hug');
    expect(templateNodes('chip', 'rótulo')[0]!.height).toBe('hug');
  });

  it.each(MODES)(
    'uma linha mede 32 e duas linhas medem 40 (o Compose não põe padding vertical) (%s)',
    (mode) => {
      expect(arrumar('chip', { label: 'Aberto agora' }, 232, 32, mode)).toEqual({
        width: 232,
        height: 32,
      });
      const values = { label: long, style: 'assist' };
      const fit = arrumar('chip', values, 232, 32, mode);
      const { drawing } = drawFitted('chip', values, mode, fit);
      expect(linesOf(drawing, 'rótulo')).toBe(2);
      expect(fit).toEqual({ width: 232, height: 40 });
      expect(drawing.warnings).toEqual([]);
    },
  );

  const STYLES = [
    'assist',
    'assist-elevated',
    'filter',
    'filter-elevated',
    'input',
    'suggestion',
    'suggestion-elevated',
  ];
  const ICONS: Values[] = [
    {},
    { leadingIcon: 'DateRange' },
    { trailingIcon: 'Close' },
    { leadingIcon: 'DateRange', trailingIcon: 'Close' },
    { selected: 'true' },
    { selected: 'true', trailingIcon: 'Close' },
    { avatar: 'https://example.com/ana.png', trailingIcon: 'Close' },
  ];
  const cases = STYLES.flatMap((style) =>
    ICONS.flatMap((icons) =>
      MODES.map((mode) => ({ style, icons, mode, name: JSON.stringify(icons) })),
    ),
  );
  it.each(cases)(
    'o rótulo longo quebra no que sobra da largura: o conteúdo ocupa a largura da marcação, sem aviso ($style $name, $mode)',
    ({ style, icons, mode }) => {
      const values = { label: long, style, ...icons };
      const fit = arrumar('chip', values, 200, 32, mode);
      const { drawing } = drawFitted('chip', values, mode, fit);
      const content = boxOf(drawing, visible(drawing, 'conteúdo')[0]!);
      near(content.x, 0);
      near(content.width, fit.width);
      expect(drawing.warnings).toEqual([]);
      expect(fit.height).toBe(Math.max(32, 20 * linesOf(drawing, 'rótulo')));
    },
  );
});

// ---------------------------------------------------------------------------------------------
// text-field e secure-text-field
// ---------------------------------------------------------------------------------------------
describe.each(['text-field', 'secure-text-field'])(
  'MC5 grupo C — %s, a altura pelo estilo e pelo texto de apoio (TextFieldDefaults.kt 66 a 82, 466 a 470)',
  (id) => {
    const filled = { label: 'Nome', style: 'filled' };
    const support = { supportingText: 'Mínimo de 8 caracteres' };
    const cases: [string, Values, number][] = [
      ['filled sem apoio', filled, 56],
      ['filled com apoio (56 + 4 + 16)', { ...filled, ...support }, 76],
      ['outlined sem apoio (8 + 56)', { label: 'Nome', style: 'outlined' }, 64],
      [
        'outlined com apoio (8 + 56 + 4 + 16)',
        { label: 'Nome', style: 'outlined', ...support },
        84,
      ],
    ];

    it('o size continua 280 por 84 e o sizing.height é uma expressão (não os 84 fixos)', () => {
      const comp = entryOf(id).component!;
      expect(comp.size).toEqual({ width: 280, height: 84 });
      expect(typeof comp.sizing?.height).toBe('object');
    });

    it('a raiz do template guarda o mínimo de 280 de largura (defaultMinSize do Compose)', () => {
      expect(entryOf(id).component!.template.minWidth).toBe(280);
    });

    it.each(
      cases.flatMap(([name, values, height]) =>
        MODES.map((mode) => ({ name, values, height, mode })),
      ),
    )(
      '$name mede $height de altura e 280 de largura ($mode)',
      ({ values, height, mode }) => {
        const size = fittedSize(id, values, mode);
        expect({ width: size.width, height: size.height }).toEqual({
          width: 280,
          height,
        });
      },
    );

    it.each(
      cases.flatMap(([name, values, height]) =>
        MODES.map((mode) => ({ name, values, height, mode })),
      ),
    )(
      '$name desenha sem pixels vazios embaixo: o último nó termina na altura ajustada ($mode)',
      ({ values, height, mode }) => {
        const { drawing, box } = drawFitted(id, values, mode);
        expect(box.height).toBe(height);
        expect(drawing.warnings).toEqual([]);
        const field = boxOf(drawing, visible(drawing, 'contêiner')[0]!);
        near(field.y, 0);
        const support = visible(drawing, 'apoio (linha)')[0];
        const bottom = support === undefined ? field : boxOf(drawing, support);
        near(bottom.y + bottom.height, height);
      },
    );

    it.each(MODES)('a largura medida nunca fica abaixo dos 280 da raiz (%s)', (mode) => {
      const measured = measureComponent(
        entryOf(id).component!,
        allValues(id, filled),
        { width: null, height: null },
        optionsOf(mode),
      );
      expect(measured.width).toBeGreaterThanOrEqual(280);
    });
  },
);

// ---------------------------------------------------------------------------------------------
// search-bar
// ---------------------------------------------------------------------------------------------
describe('MC5 grupo C — search-bar, os limites de largura da raiz (SearchBar.kt 1356 a 1360, 665 e 2711 a 2714)', () => {
  const bar = { placeholder: 'Pesquisar', leadingIcon: 'Search', style: 'bar' };
  const docked = { ...bar, style: 'docked' };

  it('a raiz guarda minWidth 360 e maxWidth 720 (o docked fixa os dois em 360)', () => {
    const root = entryOf('search-bar').component!.template as unknown as Record<
      string,
      unknown
    >;
    expect(root.minWidth).toBeDefined();
    expect(root.maxWidth).toBeDefined();
    expect(JSON.stringify(root.minWidth)).toContain('360');
    expect(JSON.stringify(root.maxWidth)).toContain('720');
    expect(JSON.stringify(root.maxWidth)).toContain('360');
  });

  it.each(MODES)(
    'a largura medida fica entre 360 e 720 (o docked, em 360) (%s)',
    (mode) => {
      const measure = (values: Values) =>
        measureComponent(
          entryOf('search-bar').component!,
          allValues('search-bar', values),
          { width: null, height: null },
          optionsOf(mode),
        ).width;
      expect(measure(bar)).toBe(360);
      expect(measure(docked)).toBe(360);
    },
  );

  it.each(MODES)(
    'o docked tem 360 de largura no ajuste da instância e a barra segue a largura que tem (%s)',
    (mode) => {
      const comp = entryOf('search-bar').component!;
      const fit = (values: Values) =>
        fitComponentSize(comp, allValues('search-bar', values), optionsOf(mode), {
          base: { width: 500, height: 56 },
        });
      expect(fit(docked)?.width).toBe(360);
      expect(fit(bar)?.width ?? 500).toBe(500);
    },
  );
});
