// M3 da etapa "Material 3 fiel", grupo B: text-field, secure-text-field e search-bar contra o que
// o `TextField.kt`, o `TextFieldDefaults.kt`, o `SearchBar.kt` e os tokens fixam no commit 5113b82a.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { SPEC_FILE, files, solid, text } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof instantiate>[1];

/** Desenha o componente numa caixa `width` × `height` (a padrão é a `size` dele). */
function draw(
  id: string,
  values: Values,
  mode: 'light' | 'dark' = 'light',
  box?: { width: number; height: number },
) {
  const entry = entryOf(id);
  const library = catalog.library!;
  const size = box ?? entry.component!.size;
  return instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, ...size },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
}
type Drawing = ReturnType<typeof draw>;
const both = (id: string, values: Values, box?: { width: number; height: number }) => ({
  light: draw(id, values, 'light', box),
  dark: draw(id, values, 'dark', box),
});

/** O primeiro nó visível com o nome. */
const named = (root: SceneNode, name: string): SceneNode | undefined => {
  for (const node of walk(root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const texts = (d: Drawing, name: string): TextNode | undefined => {
  const node = named(d.root, name);
  return node?.type === 'text' ? node : undefined;
};
const iconOf = (d: Drawing, name: string) => {
  const node = named(d.root, name);
  const path = node && [...walk(node)].find((n): n is PathNode => n.type === 'path');
  return { node, color: path === undefined ? undefined : solid(path.fills) };
};
const color = (node: SceneNode | undefined) => solid(node?.fills ?? []);
const strokeColor = (node: SceneNode | undefined) => solid(node?.stroke?.paints ?? []);
const textColor = (node: TextNode | undefined) => solid(node?.fills ?? []);
const boxOf = (d: Drawing, name: string) => {
  const node = named(d.root, name);
  return node === undefined ? undefined : absoluteBoxes(d.root).get(node.id);
};
const fontOf = (node: TextNode | undefined) => {
  const s = node?.style;
  return [s?.fontSize, s?.lineHeight, s?.fontWeight, s?.letterSpacing];
};
const BODY_LARGE = [16, 24, 400, 0.5];
const BODY_SMALL = [12, 16, 400, 0.4];

describe('M3 grupo B — text-field', () => {
  it('filled: 56 de altura, fundo surface-container-highest com raio superior 4 e indicador de 1 só embaixo', () => {
    const base = { label: 'Nome', value: 'Maria', supportingText: 'Obrigatório' };
    const { light, dark } = both('text-field', base);
    // o contêiner fica em 56 (altura fixa); o desenho tem a altura do size (84) e os 8 que sobram ficam vazios embaixo
    expect(boxOf(light, 'contêiner')?.height).toBe(56);
    expect(boxOf(light, 'contêiner')?.width).toBe(280);
    const fundo = named(light.root, 'fundo');
    expect(color(fundo)).toBe('#E6E0E9');
    expect(color(named(dark.root, 'fundo'))).toBe('#36343B');
    // raio superior 4 por token (CornerExtraSmallTop): a lista de 4 raios aceita `$token` por item
    expect(fundo?.type === 'rect' && fundo.cornerRadius).toEqual([4, 4, 0, 0]);
    expect(fundo?.height).toBe(56);
    expect(
      named(light.root, 'contêiner')?.type === 'frame' &&
        (named(light.root, 'contêiner') as { clip: boolean }).clip,
    ).toBe(true);
    // FilledTextFieldTokens.ActiveIndicatorHeight = 1, só a borda de baixo (stroke.sides)
    const indicador = named(light.root, 'indicador');
    expect(indicador?.stroke?.sides).toEqual(['bottom']);
    expect(indicador?.stroke?.width).toBe(1);
    expect(strokeColor(indicador)).toBe('#49454F');
    expect(strokeColor(named(dark.root, 'indicador'))).toBe('#CAC4D0');
    // nenhum retângulo de 1 px de altura faz o papel do indicador
    const thin = [...walk(light.root)].filter(
      (n) => n.type === 'rect' && n.visible && n.height === 1,
    );
    expect(thin).toEqual([]);
    // o contorno do outlined não aparece no filled
    expect(named(light.root, 'contorno')).toBeUndefined();
  });

  it('filled: o indicador é de 1 px sem foco, mesmo em erro (a espessura de 2 é do foco)', () => {
    const { light } = both('text-field', { label: 'Nome', isError: 'true' });
    expect(named(light.root, 'indicador')?.stroke?.width).toBe(1);
  });

  it('cores do rótulo, do valor, da dica, do apoio e dos ícones por token, em light e dark', () => {
    const base = {
      label: 'Nome',
      value: 'Maria',
      supportingText: 'Ajuda',
      leadingIcon: 'Email',
      trailingIcon: 'Lock',
    };
    const normal = both('text-field', base);
    // LabelColor/SupportingColor = onSurfaceVariant; InputColor = onSurface; ícones onSurfaceVariant
    expect(textColor(texts(normal.light, 'rótulo'))).toBe('#49454F');
    expect(textColor(texts(normal.dark, 'rótulo'))).toBe('#CAC4D0');
    expect(textColor(texts(normal.light, 'valor'))).toBe('#1D1B20');
    expect(textColor(texts(normal.dark, 'valor'))).toBe('#E6E0E9');
    expect(textColor(texts(normal.light, 'apoio'))).toBe('#49454F');
    expect(iconOf(normal.light, 'email').color).toBe('#49454F');
    expect(iconOf(normal.dark, 'lock').color).toBe('#CAC4D0');
    const hint = both('text-field', { label: 'Nome', placeholder: 'Dica' });
    expect(textColor(texts(hint.light, 'dica'))).toBe('#49454F');
    expect(textColor(texts(hint.dark, 'dica'))).toBe('#CAC4D0');

    // erro: indicador, rótulo, apoio e ícone final em error; o valor e o ícone inicial não mudam
    const erro = both('text-field', { ...base, isError: 'true' });
    expect(strokeColor(named(erro.light.root, 'indicador'))).toBe('#B3261E');
    expect(strokeColor(named(erro.dark.root, 'indicador'))).toBe('#F2B8B5');
    expect(textColor(texts(erro.light, 'rótulo'))).toBe('#B3261E');
    expect(textColor(texts(erro.dark, 'apoio'))).toBe('#F2B8B5');
    expect(iconOf(erro.light, 'lock').color).toBe('#B3261E');
    expect(iconOf(erro.light, 'email').color).toBe('#49454F');
    expect(textColor(texts(erro.light, 'valor'))).toBe('#1D1B20');
    // a dica em erro continua onSurfaceVariant (errorPlaceholderColor)
    const dicaErro = both('text-field', {
      label: 'Nome',
      placeholder: 'Dica',
      isError: 'true',
    });
    expect(textColor(texts(dicaErro.light, 'dica'))).toBe('#49454F');
  });

  it('tipografia: rótulo e valor em body-large, rótulo minimizado e apoio em body-small', () => {
    const empty = both('text-field', { label: 'Nome', supportingText: 'Ajuda' });
    expect(fontOf(texts(empty.light, 'rótulo'))).toEqual(BODY_LARGE);
    const filled = both('text-field', { label: 'Nome', value: 'Maria' });
    expect(fontOf(texts(filled.light, 'rótulo'))).toEqual(BODY_SMALL);
    expect(fontOf(texts(filled.light, 'valor'))).toEqual(BODY_LARGE);
    const hint = both('text-field', { label: 'Nome', placeholder: 'Dica' });
    expect(fontOf(texts(hint.light, 'rótulo'))).toEqual(BODY_SMALL);
    expect(fontOf(texts(hint.light, 'dica'))).toEqual(BODY_LARGE);
    const support = both('text-field', { label: 'Nome', supportingText: 'Ajuda' });
    expect(fontOf(texts(support.light, 'apoio'))).toEqual(BODY_SMALL);
    // nenhum nó de texto declara a família: todos herdam font-sans
    for (const node of walk(filled.light.root))
      if (node.type === 'text') expect(node.style.fontFamily).toBe('Roboto, sans-serif');
  });

  it('posições: ícone inicial em 12, texto em 52 (4 do padding + 48 do ícone), apoio com 16 e 4', () => {
    const d = draw('text-field', {
      label: 'Nome',
      value: 'Maria',
      supportingText: 'Ajuda',
      leadingIcon: 'Email',
      trailingIcon: 'Lock',
    }).root;
    const boxes = absoluteBoxes(d);
    const at = (name: string) => boxes.get(named(d, name)!.id)!;
    expect(at('email').x).toBe(12);
    expect(at('email').width).toBe(24);
    expect(at('valor').x).toBe(52);
    expect(at('lock').x).toBe(280 - 12 - 24);
    // rótulo minimizado (16) acima do valor (24), ambos centrados nos 56: começa em 8
    expect(at('rótulo').y).toBe(8);
    expect(at('valor').y).toBe(24);
    expect(at('apoio').x).toBe(16);
    expect(at('apoio').y).toBe(56 + 4);
    // sem ícones o texto começa em 16
    const plain = draw('text-field', { label: 'Nome', value: 'Maria' }).root;
    expect(absoluteBoxes(plain).get(named(plain, 'valor')!.id)!.x).toBe(16);
  });

  it('desabilitado: conteúdo a 0,38 sobre onSurface, indicador a 0,38 e contêiner mantido', () => {
    const base = {
      label: 'Nome',
      value: 'Maria',
      supportingText: 'Ajuda',
      leadingIcon: 'Email',
      enabled: 'false',
    };
    const { light, dark } = both('text-field', base);
    // TextFieldDefaults.colors: disabledContainerColor = ContainerColor (surfaceContainerHighest)
    expect(color(named(light.root, 'fundo'))).toBe('#E6E0E9');
    const indicador = named(dark.root, 'indicador');
    expect(strokeColor(indicador)).toBe('#E6E0E9');
    expect(indicador?.opacity).toBe(0.38);
    for (const name of ['rótulo', 'valor', 'apoio']) {
      expect(textColor(texts(dark, name))).toBe('#E6E0E9');
      expect(texts(dark, name)?.opacity).toBe(0.38);
    }
    expect(iconOf(light, 'email').color).toBe('#1D1B20');
    expect(iconOf(light, 'email').node?.opacity).toBe(0.38);
    // o desabilitado vence o erro
    const erro = draw('text-field', { ...base, isError: 'true' }).root;
    expect(strokeColor(named(erro, 'indicador'))).toBe('#1D1B20');
  });

  it('outlined: contorno de 1 com raio 4 por token, sem fundo, e 56 de campo sob o rótulo na borda', () => {
    const { light, dark } = both(
      'text-field',
      { label: 'Nome', style: 'outlined', supportingText: 'Ajuda' },
      { width: 280, height: 84 },
    );
    // OutlinedTextField: padding(top = metade do rótulo minimizado = 8) + MinHeight 56
    expect(boxOf(light, 'contêiner')?.height).toBe(64);
    const contorno = named(light.root, 'contorno');
    expect(contorno?.height).toBe(56);
    expect(contorno?.stroke?.width).toBe(1);
    expect(contorno?.stroke?.sides).toBeUndefined();
    expect(contorno?.type === 'rect' && contorno.cornerRadius).toBe(4);
    expect(contorno?.fills).toEqual([]);
    expect(strokeColor(contorno)).toBe('#79747E');
    expect(strokeColor(named(dark.root, 'contorno'))).toBe('#938F99');
    expect(named(light.root, 'fundo')).toBeUndefined();
    expect(named(light.root, 'indicador')).toBeUndefined();
    // erro: OutlinedTextFieldTokens.ErrorOutlineColor = error
    const erro = both('text-field', {
      label: 'Nome',
      style: 'outlined',
      isError: 'true',
    });
    expect(strokeColor(named(erro.light.root, 'contorno'))).toBe('#B3261E');
    expect(strokeColor(named(erro.dark.root, 'contorno'))).toBe('#F2B8B5');
    // desabilitado: DisabledOutlineColor = onSurface a 0,12 (state-disabled-container)
    const off = draw('text-field', {
      label: 'Nome',
      style: 'outlined',
      enabled: 'false',
    });
    expect(strokeColor(named(off.root, 'contorno'))).toBe('#1D1B20');
    expect(named(off.root, 'contorno')?.opacity).toBe(0.12);
  });

  it('outlined com texto: o rótulo minimizado abre um vão no contorno (sem remendo de cor), sem 1 px de altura', () => {
    const d = draw('text-field', { label: 'Nome', value: 'Maria', style: 'outlined' });
    expect(named(d.root, 'contorno')).toBeUndefined();
    const lados = named(d.root, 'contorno (lados)');
    expect(lados?.stroke?.sides).toEqual(
      expect.arrayContaining(['left', 'bottom', 'right']),
    );
    expect(strokeColor(lados)).toBe('#79747E');
    const inicio = named(d.root, 'trecho inicial');
    const fim = named(d.root, 'trecho final');
    expect(inicio?.stroke?.sides).toEqual(['top']);
    expect(fim?.stroke?.sides).toEqual(['top']);
    const boxes = absoluteBoxes(d.root);
    const label = texts(d, 'rótulo')!;
    // o rótulo minimizado fica em x = 16 (TextFieldPadding), entre o vão de 4 de cada lado
    expect(boxes.get(label.id)!.x).toBe(16);
    expect(boxes.get(inicio!.id)!.x + boxes.get(inicio!.id)!.width).toBe(12);
    expect(boxes.get(fim!.id)!.x).toBeCloseTo(16 + boxes.get(label.id)!.width + 4, 5);
    // a linha de cima do contorno está em y = 8, no centro do rótulo de 16
    expect(boxes.get(inicio!.id)!.y).toBe(8);
    expect(boxes.get(lados!.id)!.y).toBe(8);
    expect(fontOf(label)).toEqual(BODY_SMALL);
    // o vão é um vão de verdade: nenhum quadro ou retângulo cobre o contorno com cor de fundo
    const patch = [...walk(d.root)].filter(
      (n) => (n.type === 'frame' || n.type === 'rect') && n.visible && n.fills.length > 0,
    );
    expect(patch).toEqual([]);
    // sem texto, o rótulo fica dentro do campo (sem vão) em body-large
    const empty = draw('text-field', { label: 'Nome', style: 'outlined' });
    expect(named(empty.root, 'contorno')).toBeDefined();
    expect(named(empty.root, 'contorno (lados)')).toBeUndefined();
    expect(fontOf(texts(empty, 'rótulo'))).toEqual(BODY_LARGE);
  });

  it('valor: linha única não quebra nem leva reticências; maxLines vem do campo e do singleLine', () => {
    const long = 'um texto bem comprido que não cabe numa linha do campo de texto';
    const single = draw('text-field', { label: 'Nome', value: long, singleLine: 'true' });
    expect(texts(single, 'valor')?.style.wrap).toBe('none');
    expect(texts(single, 'valor')?.style.maxLines).toBe(1);
    expect(texts(single, 'valor')?.style.ellipsis).toBeUndefined();
    const multi = draw('text-field', { label: 'Nome', value: long }, 'light', {
      width: 280,
      height: 200,
    });
    expect(texts(multi, 'valor')?.style.wrap).toBeUndefined();
    expect(texts(multi, 'valor')?.style.maxLines).toBeUndefined();
    // a quebra por palavra cresce o texto; maxLines corta no número de linhas do campo
    const two = draw('text-field', { label: 'Nome', value: long, maxLines: 2 }, 'light', {
      width: 280,
      height: 200,
    });
    expect(texts(two, 'valor')?.style.maxLines).toBe(2);
    expect(texts(two, 'valor')?.height).toBe(48);
    expect(texts(multi, 'valor')!.height).toBeGreaterThan(48);
    // singleLine ignora maxLines, como o BasicTextField
    const both1 = draw('text-field', {
      label: 'Nome',
      value: long,
      singleLine: 'true',
      maxLines: 3,
    });
    expect(texts(both1, 'valor')?.style.maxLines).toBe(1);
  });

  it('rótulo e apoio quebram por palavra, sem limite de linhas nem reticências (como o Text do Compose)', () => {
    const d = draw('text-field', {
      label: 'Rótulo muito comprido do campo',
      supportingText:
        'Texto de apoio comprido o bastante para passar de uma linha na largura',
    });
    for (const name of ['rótulo', 'apoio']) {
      const node = texts(d, name);
      expect(node?.style.wrap).toBeUndefined();
      expect(node?.style.maxLines).toBeUndefined();
      expect(node?.style.ellipsis).toBeUndefined();
    }
  });

  it('o piso de 56 de altura do campo vem de minHeight, mesmo numa caixa mais baixa', () => {
    const d = draw('text-field', { label: 'Nome' }, 'light', { width: 280, height: 40 });
    expect(boxOf(d, 'contêiner')?.height).toBe(56);
  });
});

describe('M3 grupo B — secure-text-field', () => {
  it('filled: indicador de 1 só embaixo, fundo e cores por token em light e dark', () => {
    const { light, dark } = both('secure-text-field', {
      label: 'Senha',
      hasText: 'true',
      supportingText: 'Ajuda',
      leadingIcon: 'Lock',
      trailingIcon: 'Visibility',
    });
    expect(boxOf(light, 'contêiner')?.height).toBe(56);
    expect(color(named(light.root, 'fundo'))).toBe('#E6E0E9');
    expect(color(named(dark.root, 'fundo'))).toBe('#36343B');
    const indicador = named(light.root, 'indicador');
    expect(indicador?.stroke?.sides).toEqual(['bottom']);
    expect(indicador?.stroke?.width).toBe(1);
    expect(strokeColor(indicador)).toBe('#49454F');
    expect(strokeColor(named(dark.root, 'indicador'))).toBe('#CAC4D0');
    expect(textColor(texts(light, 'rótulo'))).toBe('#49454F');
    expect(fontOf(texts(light, 'rótulo'))).toEqual(BODY_SMALL);
    expect(texts(light, 'valor')?.text).toBe('••••••••');
    expect(textColor(texts(light, 'valor'))).toBe('#1D1B20');
    expect(textColor(texts(dark, 'valor'))).toBe('#E6E0E9');
    expect(fontOf(texts(light, 'valor'))).toEqual(BODY_LARGE);
    // linha única: não quebra e não leva reticências
    expect(texts(light, 'valor')?.style.wrap).toBe('none');
    expect(texts(light, 'valor')?.style.maxLines).toBe(1);
    expect(iconOf(light, 'lock').color).toBe('#49454F');
    expect(iconOf(dark, 'visibility').color).toBe('#CAC4D0');
    expect(iconOf(light, 'lock').node?.width).toBe(24);
    // sem texto digitado, o rótulo fica expandido em body-large e não há valor
    const empty = draw('secure-text-field', { label: 'Senha' });
    expect(fontOf(texts(empty, 'rótulo'))).toEqual(BODY_LARGE);
    expect(texts(empty, 'valor')).toBeUndefined();
  });

  it('erro e desabilitado seguem o text-field', () => {
    const base = {
      label: 'Senha',
      hasText: 'true',
      supportingText: 'Incorreta',
      trailingIcon: 'Visibility',
    };
    const erro = both('secure-text-field', { ...base, isError: 'true' });
    expect(strokeColor(named(erro.light.root, 'indicador'))).toBe('#B3261E');
    expect(strokeColor(named(erro.dark.root, 'indicador'))).toBe('#F2B8B5');
    expect(textColor(texts(erro.light, 'apoio'))).toBe('#B3261E');
    expect(iconOf(erro.light, 'visibility').color).toBe('#B3261E');
    expect(textColor(texts(erro.light, 'valor'))).toBe('#1D1B20');
    const off = draw('secure-text-field', { ...base, enabled: 'false' }, 'dark');
    expect(named(off.root, 'indicador')?.opacity).toBe(0.38);
    expect(strokeColor(named(off.root, 'indicador'))).toBe('#E6E0E9');
    for (const name of ['rótulo', 'valor', 'apoio']) {
      expect(texts(off, name)?.opacity).toBe(0.38);
      expect(textColor(texts(off, name))).toBe('#E6E0E9');
    }
    expect(iconOf(off, 'visibility').node?.opacity).toBe(0.38);
  });

  it('outlined: contorno de 1 por token com raio 4, vão no rótulo e desabilitado a 0,12', () => {
    const d = draw('secure-text-field', {
      label: 'Senha',
      hasText: 'true',
      style: 'outlined',
    });
    expect(named(d.root, 'contorno')).toBeUndefined();
    expect([...(named(d.root, 'contorno (lados)')?.stroke?.sides ?? [])].sort()).toEqual([
      'bottom',
      'left',
      'right',
    ]);
    expect(strokeColor(named(d.root, 'trecho inicial'))).toBe('#79747E');
    const empty = both(
      'secure-text-field',
      { label: 'Senha', style: 'outlined', supportingText: 'Ajuda' },
      { width: 280, height: 84 },
    );
    const contorno = named(empty.light.root, 'contorno');
    expect(contorno?.height).toBe(56);
    expect(contorno?.type === 'rect' && contorno.cornerRadius).toBe(4);
    expect(strokeColor(contorno)).toBe('#79747E');
    expect(strokeColor(named(empty.dark.root, 'contorno'))).toBe('#938F99');
    const off = draw('secure-text-field', {
      label: 'Senha',
      style: 'outlined',
      enabled: 'false',
    });
    expect(named(off.root, 'contorno')?.opacity).toBe(0.12);
    const erro = draw('secure-text-field', {
      label: 'Senha',
      style: 'outlined',
      isError: 'true',
    });
    expect(strokeColor(named(erro.root, 'contorno'))).toBe('#B3261E');
  });
});

describe('M3 grupo B — search-bar', () => {
  it('56 de altura, forma full, fundo surface-container-high e sem sombra', () => {
    const { light, dark } = both('search-bar', {
      placeholder: 'Pesquisar',
      leadingIcon: 'Search',
    });
    expect(light.root.height).toBe(56);
    expect(light.root.width).toBe(360);
    // corner-full (9999) limitado à metade da altura pelo motor
    expect(light.root.type === 'frame' && light.root.cornerRadius).toBeGreaterThanOrEqual(
      28,
    );
    expect(solid(light.root.fills)).toBe('#ECE6F0');
    expect(solid(dark.root.fills)).toBe('#2B2930');
    // SearchBarDefaults.ShadowElevation = Level0
    expect(light.root.effects).toEqual([]);
    expect(light.root.stroke).toBeUndefined();
  });

  it('ícones pelo nó icon: inicial onSurface, final onSurfaceVariant, 24, a 16 das bordas', () => {
    const { light, dark } = both('search-bar', {
      query: 'jazz',
      leadingIcon: 'Search',
      trailingIcon: 'Close',
    });
    expect(iconOf(light, 'search').color).toBe('#1D1B20');
    expect(iconOf(dark, 'search').color).toBe('#E6E0E9');
    expect(iconOf(light, 'close').color).toBe('#49454F');
    expect(iconOf(dark, 'close').color).toBe('#CAC4D0');
    expect(iconOf(light, 'search').node?.width).toBe(24);
    const boxes = absoluteBoxes(light.root);
    const at = (name: string) => boxes.get(named(light.root, name)!.id)!;
    expect(at('search').x).toBe(16);
    expect(at('close').x).toBe(360 - 16 - 24);
    // texto em 52 = 4 + 48 do ícone (SearchBarIconOffsetX 4 e área de 48)
    expect(at('consulta').x).toBe(52);
    expect(at('search').y).toBe(16);
  });

  it('consulta e dica em body-large: consulta onSurface em linha única, dica onSurfaceVariant', () => {
    const query = both('search-bar', { query: 'jazz', placeholder: 'Pesquisar' });
    expect(fontOf(texts(query.light, 'consulta'))).toEqual(BODY_LARGE);
    expect(textColor(texts(query.light, 'consulta'))).toBe('#1D1B20');
    expect(textColor(texts(query.dark, 'consulta'))).toBe('#E6E0E9');
    expect(texts(query.light, 'consulta')?.style.wrap).toBe('none');
    expect(texts(query.light, 'consulta')?.style.maxLines).toBe(1);
    expect(texts(query.light, 'dica')).toBeUndefined();
    const hint = both('search-bar', { placeholder: 'Pesquisar' });
    expect(fontOf(texts(hint.light, 'dica'))).toEqual(BODY_LARGE);
    expect(textColor(texts(hint.light, 'dica'))).toBe('#49454F');
    expect(textColor(texts(hint.dark, 'dica'))).toBe('#CAC4D0');
    expect(texts(hint.light, 'consulta')).toBeUndefined();
    for (const node of walk(hint.light.root))
      if (node.type === 'text') expect(node.style.fontFamily).toBe('Roboto, sans-serif');
  });

  it('expandida: docked leva raio 28 e o divisor logo abaixo dos 56; bar vira tela cheia com 8 de respiro', () => {
    const docked = draw(
      'search-bar',
      { query: 'jaz', expanded: 'true', style: 'docked' },
      'light',
      { width: 360, height: 240 },
    );
    expect(docked.root.type === 'frame' && docked.root.cornerRadius).toBe(28);
    const divisor = named(docked.root, 'divisor');
    expect(named(docked.root, 'divisor (bar)')).toBeUndefined();
    expect(divisor?.height).toBe(1);
    expect(color(divisor)).toBe('#79747E');
    expect(absoluteBoxes(docked.root).get(divisor!.id)!.y).toBe(56);
    expect(
      color(
        named(
          draw('search-bar', { expanded: 'true', style: 'docked' }, 'dark', {
            width: 360,
            height: 240,
          }).root,
          'divisor',
        ),
      ),
    ).toBe('#938F99');
    // bar expandida: CornerNone, campo a 8 do topo (SearchBarVerticalPadding), divisor em 8 + 56 + 8
    const bar = draw(
      'search-bar',
      { query: 'jaz', expanded: 'true', style: 'bar' },
      'light',
      {
        width: 360,
        height: 240,
      },
    );
    expect(bar.root.type === 'frame' && bar.root.cornerRadius).toBe(0);
    const boxes = absoluteBoxes(bar.root);
    expect(boxes.get(named(bar.root, 'linha')!.id)!.y).toBe(8);
    expect(boxes.get(named(bar.root, 'divisor (bar)')!.id)!.y).toBe(72);
    expect(named(bar.root, 'divisor')).toBeUndefined();
    // recolhida não tem divisor
    const closed = draw('search-bar', { placeholder: 'Pesquisar' });
    expect(named(closed.root, 'divisor')).toBeUndefined();
  });

  it('o campo tem no mínimo 56 de altura (InputFieldHeight), mesmo numa caixa mais baixa', () => {
    const d = draw('search-bar', { placeholder: 'Pesquisar' }, 'light', {
      width: 360,
      height: 40,
    });
    expect(boxOf(d, 'linha')?.height).toBe(56);
  });
});

describe('M3 grupo B — ícones e combinações', () => {
  const rawNodes = (id: string) => {
    const raw = JSON.parse(text(`components/${id}.json`)) as { template: unknown };
    const out: { name: { $switch?: string; cases?: Record<string, string> } | string }[] =
      [];
    const visit = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const rec = node as { type?: string; children?: unknown[] };
      if (rec.type === 'icon') out.push(rec as (typeof out)[number]);
      rec.children?.forEach(visit);
    };
    visit(raw.template);
    return out;
  };
  const snake = (name: string): string =>
    name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();

  it.each(['text-field', 'secure-text-field', 'search-bar'])(
    '%s: o $switch do nó icon cobre toda sugestão, sem caminho SVG',
    (id) => {
      const nodes = rawNodes(id);
      expect(nodes.length).toBe(2);
      const spec = JSON.parse(text(SPEC_FILE)) as {
        layers: {
          annotationTypes: {
            id: string;
            fields: { key: string; suggestions?: string[] }[];
          }[];
        }[];
      };
      const type = spec.layers
        .flatMap((l) => l.annotationTypes)
        .find((t) => t.id === id)!;
      for (const field of type.fields.filter((f) => f.suggestions !== undefined)) {
        const node = nodes.find(
          (n) => typeof n.name !== 'string' && n.name.$switch === field.key,
        );
        expect(node, field.key).toBeDefined();
        const cases = typeof node!.name === 'string' ? {} : (node!.name.cases ?? {});
        for (const name of field.suggestions ?? [])
          expect(cases[name], name).toBe(snake(name));
      }
    },
  );

  it('todas as combinações de estilo, estado e ícones desenham sem aviso em light e dark', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const style of ['filled', 'outlined']) {
        for (const enabled of ['true', 'false']) {
          for (const isError of ['true', 'false']) {
            for (const icons of [
              {},
              { leadingIcon: 'Email' },
              { trailingIcon: 'Lock' },
              { leadingIcon: 'Email', trailingIcon: 'Lock' },
            ]) {
              for (const extra of [
                { value: 'Maria', hasText: 'true' },
                { placeholder: 'Dica', supportingText: 'Ajuda' },
                {},
              ]) {
                const values = {
                  label: 'Campo',
                  style,
                  enabled,
                  isError,
                  ...icons,
                  ...extra,
                };
                for (const id of ['text-field', 'secure-text-field']) {
                  const d = draw(id, values, mode, { width: 280, height: 100 });
                  expect(d.warnings, `${id} ${JSON.stringify(values)}`).toEqual([]);
                }
              }
            }
          }
        }
      }
      for (const style of ['bar', 'docked']) {
        for (const expanded of ['true', 'false']) {
          const values = {
            query: 'jazz',
            placeholder: 'Pesquisar',
            leadingIcon: 'Search',
            trailingIcon: 'Close',
            style,
            expanded,
          };
          const d = draw('search-bar', values, mode, { width: 360, height: 200 });
          expect(d.warnings, JSON.stringify(values)).toEqual([]);
        }
      }
    }
  });
});
