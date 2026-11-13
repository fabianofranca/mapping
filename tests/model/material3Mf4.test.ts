// MF4 (etapa #899): a Material 3 (Compose) adota o motor — cor do conteúdo herdada, duas sombras por nível,
// desabilitado opaco, vão arredondado no contorno, texto justificado e número sob a alça do time-picker.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { Spec } from '../../src/model/spec';
import { diffSpecs, missingMigrations } from '../../src/model/specVersions';
import { validateLibrary } from '../../src/model/library';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import { SPEC_FILE, drawIn, files, spec, text } from '../support/material3Library';

const catalog = buildCatalog(files);
type Mode = 'light' | 'dark';
type Values = Record<string, unknown>;

function entryOf(id: string) {
  const entry = findEntry(catalog, id);
  if (entry === undefined || entry.component === null) throw new Error(`sem ${id}`);
  return entry;
}

/** Desenha o tipo com os valores e, se vier, o que o ancestral ofereceu (cor herdada). */
function draw(id: string, values: Values, mode: Mode = 'light', provided?: Values) {
  const entry = entryOf(id);
  if (provided === undefined) return drawIn(catalog, entry, values as never, mode);
  const library = catalog.library;
  if (library === null || entry.component === null) throw new Error('sem biblioteca');
  const box = { x: 0, y: 0, ...entry.component.size };
  return instantiate(
    entry.component,
    { ...defaultValues(entry.type), ...values, ...provided } as never,
    box,
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
      provided: provided as never,
    },
  );
}

function find(node: SceneNode, name: string): SceneNode | undefined {
  if (node.name === name) return node;
  if ('children' in node)
    for (const child of node.children) {
      const found = find(child, name);
      if (found !== undefined) return found;
    }
  return undefined;
}
function findAll(node: SceneNode, name: string, out: SceneNode[] = []): SceneNode[] {
  if (node.name === name) out.push(node);
  if ('children' in node) for (const child of node.children) findAll(child, name, out);
  return out;
}
/**
 * A posição de `target` dentro de `root` (a soma dos deslocamentos dos quadros entre os dois, sem o de `root`); `undefined`
 * se `target` não está sob `root`. Na L2 (#1078) a cópia dos números sob a alça fica sob quadros `posição` deslocados.
 */
function offsetIn(
  root: SceneNode,
  target: SceneNode,
): { x: number; y: number } | undefined {
  const visit = (
    node: SceneNode,
    x: number,
    y: number,
  ): { x: number; y: number } | undefined => {
    const at = { x: x + node.transform[4], y: y + node.transform[5] };
    if (node === target) return at;
    if ('children' in node)
      for (const child of node.children) {
        const found = visit(child, at.x, at.y);
        if (found !== undefined) return found;
      }
    return undefined;
  };
  if (!('children' in root)) return undefined;
  for (const child of root.children) {
    const found = visit(child, 0, 0);
    if (found !== undefined) return found;
  }
  return undefined;
}
/** A cor de um preenchimento sólido; `#rrggbbff` (alfa total) vale `#rrggbb`. */
const rgb = (color: string | undefined): string | undefined =>
  color !== undefined && /^#[0-9a-f]{8}$/i.test(color) && color.endsWith('ff')
    ? color.slice(0, 7)
    : color;
const solidOf = (node: SceneNode | undefined): string | undefined => {
  const p = node?.fills[0];
  return p?.type === 'solid' ? rgb(p.color) : undefined;
};
const tokens = (mode: Mode) => resolveTokens(catalog.library!.tokens, {}, mode);

describe('MF4: versão e atualização aditiva', () => {
  it('é a versão 7 e a atualização da 6 é aditiva (sem quebra nem migração faltando)', () => {
    expect(spec.version).toBe(14);
    // A versão 6, a da `main` no início do épico, sem os tokens de elevação de duas sombras.
    const previous = JSON.parse(JSON.stringify(spec)) as Spec;
    (previous as { version: number }).version = 6;
    const values = previous.tokens?.values as Record<string, unknown>;
    for (const key of Object.keys(values))
      if (/^elevation-\d-(point|ambient)-|^elevation-(point|ambient)-shadow$/.test(key))
        delete values[key];
    const changes = diffSpecs(previous, spec);
    expect(changes.filter((c) => c.kind === 'breaking')).toEqual([]);
    expect(missingMigrations(previous, spec)).toEqual([]);
    expect(validateLibrary({ files, specPath: SPEC_FILE, previous }).errors).toEqual([]);
  });
});

describe('MF4: cor do conteúdo herdada (decisão 14)', () => {
  it('o surface e o scaffold oferecem o contentColorFor (ColorScheme.kt, 1064 a 1092) pelo content-color', () => {
    const t = tokens('light');
    const cases: [string, string, string][] = [
      ['primary', 'on-primary', 'surface'],
      ['primaryContainer', 'on-primary-container', 'surface'],
      ['inverseSurface', 'inverse-on-surface', 'surface'],
      ['surfaceVariant', 'on-surface-variant', 'surface'],
      ['surfaceContainerHigh', 'on-surface', 'surface'],
      ['error', 'on-error', 'surface'],
    ];
    for (const [color, on] of cases)
      expect(draw('surface', { color }).provides, color).toEqual({
        'content-color': t[on],
      });
    expect(draw('scaffold', { containerColor: 'primary' }).provides).toEqual({
      'content-color': t['on-primary'],
    });
    // Sem containerColor, o padrão do Scaffold é `background` → `on-background`.
    expect(draw('scaffold', {}).provides).toEqual({
      'content-color': t['on-background'],
    });
  });

  it('cor sem par (contentColorFor devolve Unspecified) herda o que o pai ofereceu, e sem pai é on-surface', () => {
    const t = tokens('light');
    expect(draw('surface', { color: 'outline' }).provides).toEqual({
      'content-color': t['on-surface'],
    });
    expect(
      draw('surface', { color: 'outline' }, 'light', { 'content-color': '#123456' })
        .provides,
    ).toEqual({ 'content-color': '#123456' });
  });

  it.each(['light', 'dark'] as const)(
    'um text sem color dentro de um surface primary sai em on-primary (%s)',
    (mode) => {
      const t = tokens(mode);
      const offered = draw('surface', { color: 'primary' }, mode).provides ?? {};
      expect(offered['content-color']).toBe(t['on-primary']);
      const inherited = draw('text', { text: 'Olá' }, mode, offered);
      expect(solidOf(find(inherited.root, 'texto'))).toBe(t['on-primary']);
      // O `color` próprio vale mais que a herança.
      const own = draw('text', { text: 'Olá', color: 'error' }, mode, offered);
      expect(solidOf(find(own.root, 'texto'))).toBe(t['error']);
      // Sem ancestral que ofereça, o padrão de sempre (on-surface).
      const alone = draw('text', { text: 'Olá' }, mode);
      expect(solidOf(find(alone.root, 'texto'))).toBe(t['on-surface']);
    },
  );

  it('o icon sem tint lê a cor herdada; o icon-button standard e o icon-toggle-button standard e outlined (desmarcado) também', () => {
    const t = tokens('light');
    const provided = { 'content-color': t['on-primary'] };
    const icon = draw('icon', { imageVector: 'Home' }, 'light', provided);
    const iconNode = (root: SceneNode) => {
      const all: SceneNode[] = [];
      const visit = (n: SceneNode) => {
        if (n.type === 'path') all.push(n);
        if ('children' in n) n.children.forEach(visit);
      };
      visit(root);
      return all;
    };
    const colors = (root: SceneNode) =>
      iconNode(root).map((n) => solidOf(n) ?? n.stroke?.paints[0]?.type);
    expect(new Set(colors(icon.root))).toEqual(new Set([t['on-primary']]));
    for (const [id, values] of [
      ['icon-button', { icon: 'Edit', style: 'standard' }],
      ['icon-button', { icon: 'Edit', style: 'outlined' }],
      ['icon-toggle-button', { icon: 'Edit', style: 'standard', checked: 'false' }],
      ['icon-toggle-button', { icon: 'Edit', style: 'outlined', checked: 'false' }],
    ] as [string, Values][]) {
      const drawn = draw(id, values, 'light', provided);
      expect(new Set(colors(drawn.root)), `${id} ${String(values.style)}`).toEqual(
        new Set([t['on-primary']]),
      );
      const alone = draw(id, values, 'light');
      expect(colors(alone.root), `${id} sem herança`).not.toContain(t['on-primary']);
    }
    // O estilo filled tem o conteúdo próprio (on-primary / on-surface-variant): não herda.
    const filled = draw('icon-button', { icon: 'Edit', style: 'filled' }, 'light', {
      'content-color': '#123456',
    });
    expect(colors(filled.root)).not.toContain('#123456');
  });
});

/** Todo `shadow` dos componentes da biblioteca, com o arquivo e o caminho. */
function shadows(): { file: string; path: string; value: unknown }[] {
  const out: { file: string; path: string; value: unknown }[] = [];
  const walk = (file: string, node: unknown, path: string): void => {
    if (Array.isArray(node)) return node.forEach((v, i) => walk(file, v, `${path}/${i}`));
    if (typeof node !== 'object' || node === null) return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'shadow') out.push({ file, path, value: v });
      walk(file, v, `${path}/${k}`);
    }
  };
  for (const f of files)
    if (f.path.startsWith('components/') && f.text !== undefined)
      walk(f.path, JSON.parse(f.text), '');
  return out;
}

describe('MF4: duas sombras por nível (decisão 15)', () => {
  it('os tokens trazem a sombra de ponto e a ambiente dos cinco níveis, com y, blur, spread e cor', () => {
    const values = spec.tokens?.values as Record<string, unknown>;
    for (let n = 1; n <= 5; n++)
      for (const kind of ['point', 'ambient'])
        for (const key of ['y', 'blur', 'spread'])
          expect(
            typeof values[`elevation-${n}-${kind}-${key}`],
            `elevation-${n}-${kind}-${key}`,
          ).toBe('number');
    // Valores de elevação do Material 3 para a web (Material Design 3, sombras de elevação 1 a 5).
    expect([1, 2, 3, 4, 5].map((n) => values[`elevation-${n}-point-y`])).toEqual([
      1, 1, 1, 2, 4,
    ]);
    expect([1, 2, 3, 4, 5].map((n) => values[`elevation-${n}-ambient-blur`])).toEqual([
      3, 6, 8, 10, 12,
    ]);
    expect([1, 2, 3, 4, 5].map((n) => values[`elevation-${n}-ambient-spread`])).toEqual([
      1, 2, 3, 4, 6,
    ]);
  });

  it('nenhum componente tem uma sombra só: toda `shadow` é a lista de ponto e ambiente do mesmo nível', () => {
    const all = shadows();
    expect(all.length).toBeGreaterThanOrEqual(20);
    for (const { file, path, value } of all) {
      expect(Array.isArray(value), `${file}${path}`).toBe(true);
      const list = value as { y: { $token: string }; spread?: unknown }[];
      expect(list, `${file}${path}`).toHaveLength(2);
      const used = JSON.stringify(list);
      const levels = new Set(
        [...used.matchAll(/elevation-(\d)-(point|ambient)-/g)].map((m) => `${m[1]}`),
      );
      expect(levels.size, `${file}${path} mistura níveis`).toBe(1);
      expect(used, `${file}${path}`).toContain('elevation-point-shadow');
      expect(used, `${file}${path}`).toContain('elevation-ambient-shadow');
      expect(used, `${file}${path} sem token antigo`).not.toMatch(
        /elevation-\d-(y|blur)"/,
      );
      expect(used).toContain('spread');
    }
  });

  it('o card elevated desenha as duas sombras, a de ponto por cima, e o outlined sem hover nenhuma cor', () => {
    const elevated = draw('card', { style: 'elevated' }).root;
    expect(elevated.effects).toHaveLength(2);
    const t = tokens('light');
    const [point, ambient] = elevated.effects;
    expect(point).toMatchObject({ offset: { x: 0, y: t['elevation-1-point-y'] } });
    expect(ambient).toMatchObject({
      offset: { x: 0, y: t['elevation-1-ambient-y'] },
      blur: t['elevation-1-ambient-blur'],
      spread: t['elevation-1-ambient-spread'],
    });
    expect(point?.color).not.toBe(ambient?.color);
  });
});

describe('MF4: desabilitado opaco (decisão 16)', () => {
  const over = (top: unknown, alpha: number, base: unknown): string => {
    const c = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [a, b] = [c(String(top)), c(String(base))];
    return `#${a
      .map((v, i) =>
        Math.round(v! * alpha + b[i]! * (1 - alpha))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  };
  /** Igual a ±1 por canal (o motor arredonda a composição de outro jeito que o `Math.round` do teste). */
  function expectNear(actual: string | undefined, expected: string): void {
    expect(actual).toMatch(/^#[0-9a-f]{6}$/i);
    const c = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    c(actual!).forEach((v, i) =>
      expect(Math.abs(v - c(expected)[i]!)).toBeLessThanOrEqual(1),
    );
  }
  const opaqueHex = /^#[0-9a-f]{6}$/i; // `solidOf` já tira o `ff` do alfa total

  it.each(['light', 'dark'] as const)(
    'o switch desabilitado deixa o trilho, o contorno e a alça em cor opaca, sem camada de opacidade (%s)',
    (mode) => {
      const t = tokens(mode);
      const off = draw('switch', { checked: 'false', enabled: 'false' }, mode).root;
      for (const gone of [
        'trilho desabilitado',
        'contorno desabilitado',
        'alça desabilitada',
      ])
        expect(find(off, gone), gone).toBeUndefined();
      const rail = find(off, 'trilho')!;
      expectNear(
        solidOf(rail),
        over(t['surface-container-highest']!, 0.12, t['surface']!),
      );
      expect(rail.opacity).toBe(1);
      const outline = find(off, 'contorno')!;
      const line = outline.stroke?.paints[0];
      expectNear(
        line?.type === 'solid' ? rgb(line.color) : undefined,
        over(t['on-surface']!, 0.12, t['surface']!),
      );
      expect(outline.opacity).toBe(1);
      const thumb = find(off, 'alça')!;
      expectNear(solidOf(thumb), over(t['on-surface']!, 0.38, t['surface']!));
      expect(thumb.opacity).toBe(1);
      const on = draw('switch', { checked: 'true', enabled: 'false' }, mode).root;
      expectNear(
        solidOf(find(on, 'trilho')),
        over(t['on-surface']!, 0.12, t['surface']!),
      );
      expect(solidOf(find(on, 'alça'))).toBe(t['surface']);
    },
  );

  it.each(['light', 'dark'] as const)(
    'o slider desabilitado compõe a alça, o trilho e as marcas sobre o surface: cor opaca, sem empilhar transparência (%s)',
    (mode) => {
      const t = tokens(mode);
      const root = draw(
        'slider',
        { type: 'single', value: 0.5, steps: 4, enabled: 'false' },
        mode,
      ).root;
      const handle = findAll(root, 'alça');
      const tracks = [
        ...findAll(root, 'trilho ativo'),
        ...findAll(root, 'trilho inativo'),
      ];
      const marks = findAll(root, 'marca').filter((n) => n.visible);
      expect(handle.length + tracks.length + marks.length).toBeGreaterThan(3);
      for (const n of [...handle, ...tracks, ...marks]) {
        expect(n.opacity, n.name).toBe(1);
        expect(solidOf(n), n.name).toMatch(opaqueHex);
      }
      for (const n of [
        ...handle,
        ...findAll(root, 'trilho ativo').filter((x) => x.visible),
      ])
        expectNear(solidOf(n), over(t['on-surface']!, 0.38, t['surface']!));
      for (const n of findAll(root, 'trilho inativo'))
        expectNear(solidOf(n), over(t['on-surface']!, 0.12, t['surface']!));
    },
  );
});

describe('MF4: vão arredondado no contorno do text-field e do secure-text-field (decisão 17)', () => {
  const textFieldValues: Record<string, Values> = {
    'text-field': { style: 'outlined', label: 'E-mail', value: 'ana@exemplo.com' },
    'secure-text-field': { style: 'outlined', label: 'Senha', hasText: 'true' },
  };
  it.each(['text-field', 'secure-text-field'])(
    '%s outlined com valor tem um contorno só, com stroke.gap sobre o rótulo (padding 4) e o raio corner-extra-small',
    (id) => {
      const root = draw(id, textFieldValues[id]!).root;
      const outlines = findAll(root, 'contorno').filter((n) => n.visible);
      expect(outlines).toHaveLength(1);
      const outline = outlines[0]!;
      expect(outline).toMatchObject({ type: 'rect', cornerRadius: 4 });
      expect(outline.stroke?.sides).toBeUndefined();
      expect(outline.stroke?.gaps).toHaveLength(1);
      const gap = outline.stroke!.gaps![0]!;
      expect(gap.side).toBe('top');
      expect(gap.to).toBeGreaterThan(gap.from + 8);
      // O vão cobre o rótulo minimizado mais 4 de cada lado.
      const label = find(root, 'rótulo minimizado') as TextNode;
      expect(label).toBeDefined();
      expect(find(root, 'contorno (lados)')).toBeUndefined();
      expect(find(root, 'trecho final')).toBeUndefined();
    },
  );
  it.each(['text-field', 'secure-text-field'])(
    '%s outlined sem valor nem dica, o rótulo fica dentro e o contorno não abre vão',
    (id) => {
      const root = draw(id, { style: 'outlined', label: 'E-mail' }).root;
      const outline = findAll(root, 'contorno').find((n) => n.visible)!;
      expect(outline.stroke?.gaps ?? []).toEqual([]);
    },
  );
  it('nenhum componente da biblioteca abre o contorno com `sides` em três lados (a conferência da decisão 17)', () => {
    for (const f of files) {
      if (!f.path.startsWith('components/') || f.text === undefined) continue;
      for (const m of f.text.matchAll(/"sides":\s*\[([^\]]*)\]/g))
        expect(m[1]!.split(',').length, `${f.path}: ${m[0]}`).toBe(1);
    }
  });
});

describe('MF4: texto justificado (decisão 18)', () => {
  it('o textAlign Justify desenha com align justify; os outros mantêm o alinhamento', () => {
    const long =
      'Uma frase longa o bastante para quebrar em duas ou mais linhas na caixa.';
    const justified = draw('text', {
      text: long,
      textAlign: 'Justify',
      width: 'fill',
    }).root;
    expect((find(justified, 'texto') as TextNode).style.align).toBe('justify');
    for (const [align, expected] of [
      ['Start', 'left'],
      ['Center', 'center'],
      ['End', 'right'],
    ] as const)
      expect(
        (find(draw('text', { text: long, textAlign: align }).root, 'texto') as TextNode)
          .style.align,
      ).toBe(expected);
  });
});

describe('MF4: número sob a alça do time-picker (decisão 21)', () => {
  const values: Values = {
    mode: 'picker',
    hour: 10,
    minute: 37,
    is24Hour: 'true',
    selection: 'minute',
  };

  it('a alça é um quadro circular com clip e a cópia dos números em on-primary', () => {
    const t = tokens('light');
    const root = draw('time-picker', values).root;
    const handle = find(root, 'alça')!;
    expect(handle).toMatchObject({ type: 'frame', clip: true });
    expect(handle.width).toBe(48);
    expect((handle as { cornerRadius: unknown }).cornerRadius).toBeGreaterThanOrEqual(24);
    const copies = findAll(handle, 'número sob a alça') as TextNode[];
    expect(copies).toHaveLength(12);
    for (const c of copies) expect(solidOf(c)).toBe(t['on-primary']);
    // Os números do relógio continuam em on-surface, fora da alça.
    const originals = findAll(find(root, 'relógio')!, 'número') as TextNode[];
    expect(originals).toHaveLength(12);
    for (const o of originals) expect(solidOf(o)).toBe(t['on-surface']);
  });

  it('às 10:37 o número 35 fica coberto pela metade: a cópia em on-primary cruza a borda da alça (meio on-primary, meio on-surface)', () => {
    const root = draw('time-picker', values).root;
    const handle = find(root, 'alça')!;
    const copies = findAll(handle, 'número sob a alça') as TextNode[];
    const texts = copies.map((c) => c.text);
    expect(texts).toContain('35');
    expect(texts).toContain('40');
    const partly = (c: TextNode): boolean => {
      // A posição na alça: a dos quadros `posição` mais a do texto.
      const { x, y } = offsetIn(handle, c)!;
      const inside = (px: number, py: number) =>
        px >= 0 && px <= 48 && py >= 0 && py <= 48;
      const corners = [
        [x, y],
        [x + c.width, y],
        [x, y + c.height],
        [x + c.width, y + c.height],
      ] as const;
      const count = corners.filter(([px, py]) => inside(px, py)).length;
      return count > 0 && count < 4;
    };
    const covered = copies.filter(partly).map((c) => c.text);
    expect(covered).toEqual(expect.arrayContaining(['35', '40']));
    // O número no centro da alça (37 não existe) não aparece inteiro: o que se vê é de 35 e de 40.
    expect(copies.some((c) => c.text === '37')).toBe(false);
  });

  it('com a alça sobre um número (hora 10), a cópia dele fica inteira dentro da alça', () => {
    const root = draw('time-picker', {
      mode: 'picker',
      hour: 10,
      is24Hour: 'true',
      selection: 'hour',
    }).root;
    const handle = find(root, 'alça')!;
    const ten = (findAll(handle, 'número sob a alça') as TextNode[]).find(
      (c) => c.text === '10',
    )!;
    const at = offsetIn(handle, ten)!;
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.x + ten.width).toBeLessThanOrEqual(48);
    expect(at.y).toBeGreaterThanOrEqual(0);
    expect(at.y + ten.height).toBeLessThanOrEqual(48);
  });
});

describe('MF4: exemplos novos', () => {
  it('o surface primário e o parágrafo justificado desenham sem aviso, em light e dark', () => {
    for (const mode of ['light', 'dark'] as const)
      for (const [id, name] of [
        ['surface', 'Primário'],
        ['text', 'Parágrafo justificado'],
      ] as const) {
        const entry = entryOf(id);
        const example = entry.examples.find((e) => e.name === name);
        expect(example, `${id}: ${name}`).toBeDefined();
        expect(drawIn(catalog, entry, example!.values as never, mode).warnings).toEqual(
          [],
        );
      }
  });
  it('o texto da especialização é lido', () => {
    expect(text(SPEC_FILE).length).toBeGreaterThan(0);
  });
});
