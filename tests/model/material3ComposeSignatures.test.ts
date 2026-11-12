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
import { SPEC_FILE, drawIn, files, solid, spec, text, typeOf, types } from '../support/material3Library';

const COMMIT = '5113b82a4ed6416d6344efa50e41db8cb65928ff';

/** Todo caminho de ficha que a especialização cita: o do tipo e o de cada caso de `variants`. */
const cited = types.flatMap((type) => {
  const code = type.code?.compose;
  const base = [{ id: type.id, variant: undefined as string | undefined, path: code?.signature }];
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
  if (!parsed.ok) throw new Error(`${path}: ${parsed.issues[0]?.message ?? 'ficha inválida'}`);
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

  it('reimportar cada ficha não muda a especialização (idempotência)', () => {
    for (const { id, variant, path } of cited) {
      const name = `${id}${variant === undefined ? '' : `/${variant}`}`;
      const signature = readSignature(path as string);
      const result = planSignatureImport(spec, {
        type: id,
        target: { platform: 'compose' },
        ...(variant === undefined ? {} : { variant }),
        signature,
        previous: signature,
      });
      expect(result.ok, name).toBe(true);
      if (!result.ok) continue;
      expect(result.plan.spec, name).toEqual(spec);
      expect(result.plan.changes, name).toEqual([]);
      expect(result.plan.versionBump, name).toBe(false);
    }
  });

  it('o fieldModels.compose traz os modelos da prova (decisão 14)', () => {
    const models = (spec as Spec & { fieldModels?: Record<string, Record<string, unknown>> })
      .fieldModels?.compose;
    expect(models).toMatchObject({
      Color: { like: 'surface.color' },
      Shape: { like: 'surface.shape' },
      Dp: { type: 'number', format: '{value}.dp' },
      TextUnit: { type: 'number', format: '{value}.sp' },
      PaddingValues: { expand: { params: { horizontal: 'Dp', vertical: 'Dp' } } },
      BorderStroke: { expand: { params: { width: 'Dp', color: 'Color' } } },
      '@Composable () -> Unit': { type: 'string', format: '{ Text(<value>) }' },
      '(@Composable () -> Unit)?': { type: 'string', format: '{ Text(<value>) }' },
    });
    expect((models as Record<string, { options?: string[] }>).boolean?.options).toEqual([
      'true',
      'false',
    ]);
  });

  it('os parâmetros que a prova de aceite lista viraram campos, sem modelagem à mão', () => {
    const wanted: Record<string, string[]> = {
      button: ['shape', 'contentPadding', 'containerColor', 'contentColor'],
      'radio-button': ['selectedColor', 'unselectedColor'],
      switch: ['checkedThumbColor', 'checkedTrackColor', 'uncheckedThumbColor'],
      divider: ['color'],
      surface: ['shadowElevation', 'border'],
      'top-app-bar': ['subtitle', 'containerColor', 'titleContentColor'],
      'text-field': ['prefix', 'suffix'],
    };
    for (const [id, keys] of Object.entries(wanted)) {
      const type = typeOf(id);
      for (const key of keys) {
        const key2 = type.fields.find((f) => f.key === key || f.key.startsWith(`${key}`))?.key;
        expect(key2, `${id}.${key}`).toBeDefined();
      }
    }
  });

  it('o button expande o shape, o contentPadding e as cores nos argumentos do código', () => {
    const code = typeOf('button').code?.compose;
    expect(code?.calls).toMatchObject({ colors: 'androidx.compose.material3.ButtonDefaults.buttonColors' });
    expect(code?.variants?.cases.outlined?.calls).toMatchObject({
      colors: 'androidx.compose.material3.ButtonDefaults.outlinedButtonColors',
    });
    expect(code?.params).toMatchObject({ shape: 'shape' });
    expect(code?.params?.containerColor).toBe('colors.containerColor');
    expect(code?.formats?.contentPaddingHorizontal ?? code?.formats?.horizontal).toBeDefined();
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
function allSolids(node: SceneNode, acc: string[] = []): string[] {
  if ('fills' in node) {
    const color = solid(node.fills as never);
    if (color !== undefined) acc.push(color);
  }
  if ('children' in node) for (const c of node.children) allSolids(c, acc);
  return acc;
}

describe('Material 3 (Compose): o desenho segue os campos importados (decisão 14)', () => {
  const catalog = buildCatalog(files);
  const draw = (id: string, values: Record<string, unknown>, mode: 'light' | 'dark') =>
    drawIn(catalog, findEntry(catalog, id)!, values as never, mode);

  it('button: containerColor muda a cor do fundo, e o desabilitado vence', () => {
    for (const mode of ['light', 'dark'] as const) {
      const base = draw('button', { label: 'Ok' }, mode);
      const tertiary = draw('button', { label: 'Ok', containerColor: 'tertiary' }, mode);
      expect(solid(tertiary.root.fills), mode).not.toBe(solid(base.root.fills));
      expect(tertiary.warnings).toEqual([]);
    }
    const light = draw('button', { label: 'Ok', containerColor: 'tertiary' }, 'light');
    const dark = draw('button', { label: 'Ok', containerColor: 'tertiary' }, 'dark');
    expect(solid(light.root.fills)).not.toBe(solid(dark.root.fills));
    const off = draw('button', { label: 'Ok', containerColor: 'tertiary', enabled: 'false' }, 'light');
    expect(solid(off.root.fills)).not.toBe(solid(light.root.fills));
  });

  it('button: shape pequeno muda o raio e contentPadding muda a caixa do conteúdo', () => {
    const base = draw('button', { label: 'Ok' }, 'light');
    const small = draw('button', { label: 'Ok', shape: 'small' }, 'light');
    expect(JSON.stringify(small.root)).not.toBe(JSON.stringify(base.root));
    expect((small.root as { cornerRadius?: unknown }).cornerRadius).not.toEqual(
      (base.root as { cornerRadius?: unknown }).cornerRadius,
    );
    const wide = draw('button', { label: 'Ok', contentPaddingHorizontal: 40 }, 'light');
    const narrow = draw('button', { label: 'Ok', contentPaddingHorizontal: 4 }, 'light');
    expect(JSON.stringify(wide.root)).not.toBe(JSON.stringify(narrow.root));
  });

  it('divider: color muda a cor da linha', () => {
    const base = draw('divider', {}, 'light');
    const primary = draw('divider', { color: 'primary' }, 'light');
    expect(allSolids(primary.root)).not.toEqual(allSolids(base.root));
    expect(allSolids(primary.root)).toContain('#6750A4');
  });

  it('surface: border e shadowElevation aparecem no desenho', () => {
    const base = draw('surface', {}, 'light');
    const border = draw('surface', { border: 2 }, 'light');
    const shadow = draw('surface', { shadowElevation: 6 }, 'light');
    expect(JSON.stringify(border.root)).not.toBe(JSON.stringify(base.root));
    expect(JSON.stringify(shadow.root)).not.toBe(JSON.stringify(base.root));
  });

  it('top-app-bar: subtitle desenha um texto a mais, e as cores mudam o fundo e o título', () => {
    const base = draw('top-app-bar', { title: 'Título' }, 'light');
    const sub = draw('top-app-bar', { title: 'Título', subtitle: 'Sub' }, 'light');
    expect(allText(sub.root)).toContain('Sub');
    expect(allText(base.root)).not.toContain('Sub');
    const colored = draw('top-app-bar', { title: 'Título', containerColor: 'primary' }, 'light');
    expect(solid(colored.root.fills)).toBe('#6750A4');
  });

  it('radio-button e switch: as cores mudam o desenho', () => {
    const radio = draw('radio-button', { selected: 'true' }, 'light');
    const radioColored = draw('radio-button', { selected: 'true', selectedColor: 'error' }, 'light');
    expect(allSolids(radioColored.root)).not.toEqual(allSolids(radio.root));
    const sw = draw('switch', { checked: 'true' }, 'light');
    const swColored = draw('switch', { checked: 'true', checkedTrackColor: 'tertiary' }, 'light');
    expect(allSolids(swColored.root)).not.toEqual(allSolids(sw.root));
  });
});
