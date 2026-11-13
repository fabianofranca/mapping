// Material 3 (Compose) importada pela assinatura (etapa #1079, S5, decisões 14 e 17): cada tipo e cada
// caso de `variants` cita a ficha derivada do androidx no commit fixado (`signatures/`), reimportar a
// ficha não muda a especialização (a prova de "sem modelagem à mão"), os parâmetros da prova de
// aceite viraram campos e o desenho segue os campos novos.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { parseSignatureText } from '../../src/model/signatures/parseSignature';
import { planSignatureImport } from '../../src/model/signatures/importPlan';
import { validateLibrary } from '../../src/model/library';
import type { Spec, SpecAnnotationType, SpecField } from '../../src/model/spec';
import type { SceneNode } from '../../src/model/components/scene';
import {
  SPEC_FILE,
  drawIn,
  files,
  solid,
  spec,
  text,
  typeOf,
  types,
} from '../support/material3Library';

const COMMIT = '5113b82a4ed6416d6344efa50e41db8cb65928ff';

/** Todo caminho de ficha que a especialização cita: o do tipo e o de cada caso de `variants`. */
const cited = types.flatMap((type) => {
  const code = type.code?.compose;
  const base = [
    { id: type.id, variant: undefined as string | undefined, path: code?.signature },
  ];
  const cases = Object.entries(code?.variants?.cases ?? {}).map(([variant, kase]) => ({
    id: type.id,
    variant: variant as string | undefined,
    path: kase.signature,
  }));
  return [...base, ...cases];
});

const fieldOf = (type: SpecAnnotationType, key: string): SpecField | undefined =>
  type.fields.find((f) => f.key === key);

const FICHAS = files.filter((f) => f.path.startsWith('signatures/'));

function readSignature(path: string) {
  const parsed = parseSignatureText(text(path));
  if (!parsed.ok)
    throw new Error(`${path}: ${parsed.issues[0]?.message ?? 'ficha inválida'}`);
  return parsed.signature;
}

describe('Material 3 (Compose): as fichas de assinatura (decisão 14 da #1079)', () => {
  it('é a formatVersion 16 e a versão 12 (a version subiu uma vez, sobre a 11 da main)', () => {
    expect(spec.formatVersion).toBe(16);
    expect(spec.version).toBe(12);
  });

  it('todo tipo, e todo caso de variants, cita a sua ficha em signatures/', () => {
    expect(cited.length).toBeGreaterThan(90);
    for (const { id, variant, path } of cited) {
      const expected =
        variant === undefined
          ? `signatures/${id}.compose.json`
          : `signatures/${id}.${variant}.compose.json`;
      expect(path, `${id}${variant === undefined ? '' : `/${variant}`}`).toBe(expected);
    }
  });

  it('toda ficha citada existe, é válida e bate com o símbolo, o arquivo e o commit do code', () => {
    for (const { id, variant, path } of cited) {
      const name = `${id}${variant === undefined ? '' : `/${variant}`}`;
      expect(text(path ?? ''), name).not.toBe('');
      const sig = readSignature(path as string);
      const code = typeOf(id).code?.compose;
      const kase = variant === undefined ? undefined : code?.variants?.cases[variant];
      expect(sig.source.kind, name).toBe('code');
      if (sig.source.kind !== 'code') continue;
      expect(sig.source.symbol, name).toBe(kase?.symbol ?? code?.symbol);
      expect(sig.source.path, name).toBe(kase?.path ?? code?.path);
      expect(sig.source.ref, name).toBe(COMMIT);
      expect(sig.source.extractor, name).toMatch(/^mapping-signature\/kotlin@1$/);
    }
  });

  it('toda ficha do pacote é citada (nenhuma sobra em signatures/)', () => {
    const citedPaths = new Set(cited.map((c) => c.path));
    expect(FICHAS.length).toBe(citedPaths.size);
    for (const file of FICHAS) expect(citedPaths.has(file.path), file.path).toBe(true);
  });

  it('o pacote valida sem erro nos três níveis', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
  });

  // Um `it` por ficha: o laço único levava ~1,4 s e estourava os 5 s do teste no shard sob carga do CI (CL2, E-1).
  it.each(
    cited.map(({ id, variant, path }) => ({
      name: `${id}${variant === undefined ? '' : `/${variant}`}`,
      id,
      variant,
      path,
    })),
  )('reimportar a ficha $name não muda a especialização (idempotência)', (entry) => {
    const { name, id, variant, path } = entry;
    const signature = readSignature(path as string);
    const result = planSignatureImport(spec, {
      type: id,
      target: { platform: 'compose' },
      ...(variant === undefined ? {} : { variant }),
      signature,
      previous: signature,
    });
    expect(result.ok, name).toBe(true);
    if (!result.ok) return;
    expect(result.plan.spec, name).toEqual(spec);
    expect(result.plan.changes, name).toEqual([]);
    expect(result.plan.versionBump, name).toBe(false);
  });

  it('o fieldModels.compose traz os modelos da prova (decisão 14)', () => {
    const models = (
      spec as Spec & { fieldModels?: Record<string, Record<string, unknown>> }
    ).fieldModels?.compose;
    expect(models).toMatchObject({
      Color: { like: 'surface.color' },
      Shape: { like: 'surface.shape' },
      Dp: { type: 'number', format: '{value}.dp' },
      TextUnit: { type: 'number', format: '{value}.sp' },
      PaddingValues: { expand: { params: { horizontal: 'Dp', vertical: 'Dp' } } },
      BorderStroke: { expand: { params: { width: 'Dp', color: 'Color' } } },
      'BorderStroke?': { expand: { params: { width: 'Dp', color: 'Color' } } },
      '@Composable () -> Unit': { type: 'string', format: '{ Text("{value}") }' },
      '(@Composable () -> Unit)?': { type: 'string', format: '{ Text("{value}") }' },
      '@Composable (() -> Unit)?': { type: 'string', format: '{ Text("{value}") }' },
    });
    expect((models as Record<string, { options?: string[] }>).boolean?.options).toEqual([
      'true',
      'false',
    ]);
  });

  it('os parâmetros que a prova de aceite lista viraram campos, sem modelagem à mão', () => {
    // O `PaddingValues` expande em `horizontal`/`vertical` e o `BorderStroke` em `borderWidth`/`borderColor`
    // (ou `width`/`color`, quando não há colisão); o campo nasce com o nome do parâmetro.
    const wanted: Record<string, string[]> = {
      button: [
        'shape',
        'horizontal',
        'vertical',
        'containerColor',
        'contentColor',
        'disabledContainerColor',
        'disabledContentColor',
        'borderWidth',
      ],
      'radio-button': ['selectedColor', 'unselectedColor', 'disabledSelectedColor'],
      switch: ['checkedThumbColor', 'checkedTrackColor', 'uncheckedThumbColor'],
      divider: ['color'],
      surface: ['shadowElevation', 'borderWidth', 'borderColor'],
      'top-app-bar': ['subtitle', 'containerColor', 'titleContentColor'],
      'text-field': ['prefix', 'suffix'],
      'secure-text-field': ['prefix', 'suffix'],
    };
    for (const [id, keys] of Object.entries(wanted)) {
      const type = typeOf(id);
      for (const key of keys) expect(fieldOf(type, key), `${id}.${key}`).toBeDefined();
    }
  });

  it('o button expande o shape, o contentPadding e as cores nos argumentos do código', () => {
    const code = typeOf('button').code?.compose;
    expect(code?.calls).toMatchObject({
      colors: 'androidx.compose.material3.ButtonDefaults.buttonColors',
    });
    expect(code?.variants?.cases.outlined?.calls).toMatchObject({
      colors: 'androidx.compose.material3.ButtonDefaults.outlinedButtonColors',
    });
    expect(code?.params).toMatchObject({
      shape: 'shape',
      containerColor: 'colors.containerColor',
      horizontal: 'contentPadding.horizontal',
      vertical: 'contentPadding.vertical',
    });
    expect(code?.formats).toMatchObject({
      horizontal: '{value}.dp',
      vertical: '{value}.dp',
    });
  });

  it('os parâmetros sem campo deixam rastro: avisos pending com o ref da ficha', () => {
    let pending = 0;
    for (const type of types) {
      for (const notice of type.notices ?? []) {
        if (notice.kind !== 'pending' || !notice.ref?.startsWith('signatures/')) continue;
        pending++;
        expect(notice.message, `${type.id}`).toMatch(/^compose: /);
      }
    }
    expect(pending).toBeGreaterThan(20);
  });
});

function allText(node: SceneNode, acc: string[] = []): string[] {
  if (node.type === 'text') acc.push(node.text ?? '');
  if ('children' in node) for (const c of node.children) allText(c, acc);
  return acc;
}
function named(node: SceneNode, name: string): SceneNode | undefined {
  if (node.name === name) return node;
  if ('children' in node) {
    for (const c of node.children) {
      const found = named(c, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
const fillOf = (node: SceneNode, name: string): string | undefined => {
  const found = named(node, name);
  return found === undefined ? undefined : solid(found.fills);
};
const radiusOf = (node: SceneNode, name: string): unknown =>
  (named(node, name) as { cornerRadius?: unknown } | undefined)?.cornerRadius;
const widthOf = (node: SceneNode, name: string): number | undefined =>
  named(node, name)?.width;
const textColor = (node: SceneNode, name: string): string | undefined => {
  const found = named(node, name);
  return found?.type === 'text' ? solid(found.fills) : undefined;
};

describe('Material 3 (Compose): o desenho segue os campos importados (decisão 14)', () => {
  const catalog = buildCatalog(files);
  const draw = (id: string, values: Record<string, unknown>, mode: 'light' | 'dark') =>
    drawIn(catalog, findEntry(catalog, id)!, values as never, mode);

  it('button: containerColor e contentColor mudam as cores, e o desabilitado vence', () => {
    for (const mode of ['light', 'dark'] as const) {
      const base = draw('button', { label: 'Ok' }, mode);
      const tertiary = draw('button', { label: 'Ok', containerColor: 'tertiary' }, mode);
      expect(fillOf(tertiary.root, 'container'), mode).toBeDefined();
      expect(fillOf(tertiary.root, 'container'), mode).not.toBe(
        fillOf(base.root, 'container'),
      );
      const content = draw('button', { label: 'Ok', contentColor: 'error' }, mode);
      expect(textColor(content.root, 'rótulo'), mode).not.toBe(
        textColor(base.root, 'rótulo'),
      );
      expect(tertiary.warnings).toEqual([]);
      expect(content.warnings).toEqual([]);
    }
    const light = draw('button', { label: 'Ok', containerColor: 'tertiary' }, 'light');
    const dark = draw('button', { label: 'Ok', containerColor: 'tertiary' }, 'dark');
    expect(fillOf(light.root, 'container')).not.toBe(fillOf(dark.root, 'container'));
    const off = draw(
      'button',
      { label: 'Ok', containerColor: 'tertiary', enabled: 'false' },
      'light',
    );
    expect(fillOf(off.root, 'container')).not.toBe(fillOf(light.root, 'container'));
    const offOwn = draw(
      'button',
      {
        label: 'Ok',
        enabled: 'false',
        disabledContainerColor: 'error',
        disabledContentColor: 'primary',
      },
      'light',
    );
    const offBase = draw('button', { label: 'Ok', enabled: 'false' }, 'light');
    expect(fillOf(offOwn.root, 'container')).not.toBe(fillOf(offBase.root, 'container'));
    expect(textColor(offOwn.root, 'rótulo')).not.toBe(textColor(offBase.root, 'rótulo'));
  });

  it('button: shape pequeno muda o raio e contentPadding muda a caixa do conteúdo', () => {
    const base = draw('button', { label: 'Ok' }, 'light');
    const small = draw('button', { label: 'Ok', shape: 'small' }, 'light');
    expect(radiusOf(small.root, 'container')).not.toEqual(
      radiusOf(base.root, 'container'),
    );
    const wide = draw('button', { label: 'Ok', horizontal: 40 }, 'light');
    const narrow = draw('button', { label: 'Ok', horizontal: 4 }, 'light');
    expect(widthOf(wide.root, 'conteúdo')).toBeGreaterThan(
      widthOf(narrow.root, 'conteúdo') ?? 0,
    );
    const tall = draw('button', { label: 'Ok', vertical: 20 }, 'light');
    const flat = draw('button', { label: 'Ok', vertical: 2 }, 'light');
    const h = (r: SceneNode) => named(r, 'conteúdo')?.height ?? 0;
    expect(h(tall.root)).toBeGreaterThan(h(flat.root));
  });

  it('divider: color muda a cor da linha', () => {
    const base = draw('divider', {}, 'light');
    const primary = draw('divider', { color: 'primary' }, 'light');
    expect(fillOf(primary.root, 'linha')).not.toBe(fillOf(base.root, 'linha'));
    expect(fillOf(primary.root, 'linha')).toBe('#6750A4');
  });

  it('surface: borderWidth, borderColor e shadowElevation aparecem no desenho', () => {
    const base = draw('surface', {}, 'light');
    const border = draw('surface', { borderWidth: 2, borderColor: 'primary' }, 'light');
    const shadow = draw('surface', { shadowElevation: 6 }, 'light');
    expect(base.root.stroke?.width ?? 0).toBe(0);
    expect(border.root.stroke?.width).toBe(2);
    expect(solid(border.root.stroke?.paints ?? [])).toBe('#6750A4');
    // a sombra é desenhada pelo nó do nível que a elevação alcança (6 dp: nível 3)
    expect(named(base.root, 'sombra nível 3')).toBeUndefined();
    expect(named(shadow.root, 'sombra nível 3')?.effects.length).toBeGreaterThan(0);
    expect(
      named(draw('surface', { shadowElevation: 1 }, 'light').root, 'sombra nível 1'),
    ).toBeDefined();
  });

  it('top-app-bar: subtitle desenha um texto a mais, e as cores mudam o fundo e o título', () => {
    const base = draw('top-app-bar', { title: 'Título', style: 'small' }, 'light');
    const sub = draw(
      'top-app-bar',
      { title: 'Título', style: 'small', subtitle: 'Sub' },
      'light',
    );
    expect(allText(sub.root)).toContain('Sub');
    expect(allText(base.root)).not.toContain('Sub');
    const colored = draw(
      'top-app-bar',
      { title: 'Título', containerColor: 'primary', titleContentColor: 'onPrimary' },
      'light',
    );
    expect(solid(colored.root.fills)).toBe('#6750A4');
    expect(textColor(colored.root, 'título')).not.toBe(textColor(base.root, 'título'));
    for (const mode of ['light', 'dark'] as const) {
      expect(
        draw('top-app-bar', { title: 'T', subtitle: 'S' }, mode).warnings,
        mode,
      ).toEqual([]);
    }
  });

  it('radio-button e switch: as cores mudam o desenho', () => {
    const radio = draw('radio-button', { selected: 'true' }, 'light');
    const radioColored = draw(
      'radio-button',
      { selected: 'true', selectedColor: 'error' },
      'light',
    );
    expect(fillOf(radioColored.root, 'ponto')).not.toBe(fillOf(radio.root, 'ponto'));
    const ring = (r: SceneNode): string | undefined => {
      const paints = named(r, 'anel')?.stroke?.paints;
      return paints === undefined ? undefined : solid(paints);
    };
    const radioOff = draw(
      'radio-button',
      { selected: 'false', unselectedColor: 'error' },
      'light',
    );
    expect(ring(radioOff.root)).toBeDefined();
    expect(ring(radioOff.root)).not.toBe(
      ring(draw('radio-button', { selected: 'false' }, 'light').root),
    );
    const sw = draw('switch', { checked: 'true' }, 'light');
    const swColored = draw(
      'switch',
      { checked: 'true', checkedTrackColor: 'tertiary', checkedThumbColor: 'error' },
      'light',
    );
    expect(fillOf(swColored.root, 'trilho')).not.toBe(fillOf(sw.root, 'trilho'));
    expect(fillOf(swColored.root, 'alça')).not.toBe(fillOf(sw.root, 'alça'));
    const swOff = draw(
      'switch',
      { checked: 'false', uncheckedTrackColor: 'error' },
      'light',
    );
    expect(fillOf(swOff.root, 'trilho')).not.toBe(
      fillOf(draw('switch', { checked: 'false' }, 'light').root, 'trilho'),
    );
  });

  it('text-field: prefix e suffix desenham os textos (e o secure-text-field também)', () => {
    for (const id of ['text-field', 'secure-text-field']) {
      // o `text-field` mostra o texto digitado (`value`); o `secure-text-field`, as bolinhas (`hasText`)
      const typed = id === 'text-field' ? { value: 'abc' } : { hasText: 'true' };
      const base = draw(id, typed, 'light');
      const both = draw(id, { ...typed, prefix: 'R$', suffix: 'kg' }, 'light');
      expect(allText(both.root), id).toEqual(expect.arrayContaining(['R$', 'kg']));
      expect(allText(base.root), id).not.toContain('R$');
      expect(both.warnings, id).toEqual([]);
    }
  });

  it('todo exemplo dos tipos tocados desenha sem aviso em light e dark', () => {
    for (const id of [
      'button',
      'surface',
      'top-app-bar',
      'radio-button',
      'switch',
      'divider',
      'text-field',
      'secure-text-field',
    ]) {
      const entry = findEntry(catalog, id)!;
      for (const mode of ['light', 'dark'] as const) {
        for (const ex of entry.type.examples ?? []) {
          const drawing = drawIn(catalog, entry, ex.values as never, mode);
          expect(drawing.warnings, `${id} ${mode} ${ex.name}`).toEqual([]);
        }
      }
    }
  });
});
