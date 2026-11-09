// Etapa Material 3 com estados de interação (#869), fase ME1 (#912): tokens de estado, últimos literais
// como token, o campo `interaction` do `button` (padrão das fases seguintes) e a atualização aditiva da
// biblioteca. Referência: Compose `material3` 1.4.0, commit 5113b82a… (`tokens/StateTokens.kt`).
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import type { Spec } from '../../src/model/spec';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { missingMigrations } from '../../src/model/specVersions';
import { SPEC_FILE, drawIn, files, spec, typeOf } from '../support/material3Library';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../support/material3Library';

const tokenValues = (spec.tokens?.values ?? {}) as Record<string, unknown>;

/** Opções do `interaction` por tipo que já o recebeu (decisão 2 da #869); cresce a cada fase. */
const INTERACTION_OPTIONS: Record<string, string[]> = {
  button: ['none', 'hovered', 'focused', 'pressed'],
};

describe('tokens de estado (StateTokens.kt)', () => {
  it('tem state-hover, state-focus, state-pressed e state-dragged com os valores do commit', () => {
    expect(tokenValues['state-hover']).toBe(0.08);
    expect(tokenValues['state-focus']).toBe(0.1);
    expect(tokenValues['state-pressed']).toBe(0.1);
    expect(tokenValues['state-dragged']).toBe(0.16);
  });
});

type Json = unknown;
function collect(node: Json, key: string, out: Json[] = []): Json[] {
  if (Array.isArray(node)) node.forEach((n) => collect(n, key, out));
  else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, Json>)) {
      if (k === key) out.push(v);
      collect(v, key, out);
    }
  }
  return out;
}
function numbers(node: Json, out: number[] = []): number[] {
  if (typeof node === 'number') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => numbers(n, out));
  else if (node !== null && typeof node === 'object')
    Object.values(node as Record<string, Json>).forEach((n) => numbers(n, out));
  return out;
}

const componentsDir = join(ROOT, 'components');
const templates = readdirSync(componentsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    id: f.replace(/\.json$/, ''),
    template: (
      JSON.parse(readFileSync(join(componentsDir, f), 'utf8')) as { template: Json }
    ).template,
  }));

/** Literais que ficam como estão, com o motivo (decisão 8 da #869 só cobre o checkbox e o desabilitado). */
const OPACITY_ALLOWED: Record<string, string> = {
  surface: 'tabela da elevação tonal do Surface.kt (um valor por nível)',
  carousel: 'véu de 32% sobre a imagem (sem token de estado no Compose)',
};
const RADIUS_ALLOWED: Record<string, string> = {
  'bottom-sheet': 'quatro raios por lista: a lista não aceita token por item',
  slider: 'trilho com raios internos de 2 e externos de 8 (lista de quatro raios)',
};

describe('nenhum literal que o Material 3 nomeie', () => {
  it.each(templates)('$id: opacity literal só 0 ou 1', ({ id, template }) => {
    if (id in OPACITY_ALLOWED) return;
    const bad = collect(template, 'opacity').flatMap((v) =>
      numbers(v).filter((n) => n !== 0 && n !== 1),
    );
    expect(bad).toEqual([]);
  });

  it.each(templates)(
    '$id: cornerRadius literal não repete um corner-* nomeado',
    ({ id, template }) => {
      if (id in RADIUS_ALLOWED) return;
      const named = new Set(
        Object.entries(tokenValues)
          .filter(
            ([k, v]) =>
              k.startsWith('corner-') && typeof v === 'number' && v > 0 && v < 1000,
          )
          .map(([, v]) => v as number),
      );
      const literal = collect(template, 'cornerRadius').flatMap((v) =>
        typeof v === 'number' || Array.isArray(v) ? numbers(v) : [],
      );
      const bad = literal.filter((n) => n > 0 && n < 1000);
      // O raio de 2 do checkbox e o de 3 do indicador do tabs não têm nome no conjunto de formas, mas o
      // checkbox ganha token próprio (CheckboxTokens.ContainerShape): nenhum raio literal positivo sobra.
      expect(bad.filter((n) => named.has(n) || id === 'checkbox')).toEqual([]);
    },
  );

  it('o checkbox usa o token corner-checkbox (2) no lugar do literal', () => {
    expect(tokenValues['corner-checkbox']).toBe(2);
  });
});

describe('button: campo interaction', () => {
  const button = typeOf('button');
  const field = button.fields.find((f) => f.key === 'interaction');

  it('é um enum opcional com as opções do Compose, padrão none, fora do code', () => {
    expect(field).toMatchObject({
      key: 'interaction',
      label: 'Interação',
      type: 'enum',
      default: 'none',
      options: INTERACTION_OPTIONS.button,
    });
    expect(field?.required).not.toBe(true);
    const code = JSON.stringify(button.code ?? {});
    expect(code).not.toContain('interaction');
  });

  it('a descrição diz que o desabilitado vence', () => {
    expect(field?.description).toMatch(/habilitado|enabled/i);
    expect(field?.description).toMatch(/desabilitad|false/i);
  });

  const catalog = buildCatalog(files);
  const entry = findEntry(catalog, 'button')!;
  const STYLES = ['filled', 'tonal', 'outlined', 'text', 'elevated'];
  const draw = (values: Record<string, string>, mode: 'light' | 'dark') =>
    drawIn(catalog, entry, { label: 'Salvar', ...values }, mode);

  it.each(['hovered', 'focused', 'pressed'])(
    'tem um exemplo para %s que desenha sem aviso nos dois modos',
    (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `exemplo de ${state}`).toBeDefined();
      for (const mode of ['light', 'dark'] as const) {
        const drawing = drawIn(catalog, entry, example?.values ?? {}, mode);
        expect(drawing.warnings, `${state} ${mode}`).toEqual([]);
      }
    },
  );

  it.each(
    STYLES.flatMap((s) => (['light', 'dark'] as const).map((m) => [s, m] as const)),
  )(
    '%s (%s): hovered, focused e pressed diferem de none (a camada existe)',
    (style, mode) => {
      const base = JSON.stringify(draw({ style, interaction: 'none' }, mode).root);
      for (const interaction of ['hovered', 'focused', 'pressed']) {
        const drawing = draw({ style, interaction }, mode);
        expect(drawing.warnings).toEqual([]);
        expect(JSON.stringify(drawing.root), `${style} ${interaction}`).not.toBe(base);
      }
    },
  );

  it.each(STYLES)('%s: com enabled false o interaction não desenha nada', (style) => {
    for (const mode of ['light', 'dark'] as const) {
      const off = JSON.stringify(
        draw({ style, enabled: 'false', interaction: 'none' }, mode).root,
      );
      for (const interaction of ['hovered', 'focused', 'pressed']) {
        expect(
          JSON.stringify(draw({ style, enabled: 'false', interaction }, mode).root),
          `${style} ${interaction}`,
        ).toBe(off);
      }
    }
  });

  it('pressed e hovered diferem entre si no elevated (a elevação muda por estado)', () => {
    const a = JSON.stringify(
      draw({ style: 'elevated', interaction: 'hovered' }, 'light').root,
    );
    const b = JSON.stringify(
      draw({ style: 'elevated', interaction: 'pressed' }, 'light').root,
    );
    expect(a).not.toBe(b);
  });
});

describe('atualização da versão anterior da biblioteca para a nova', () => {
  it('é aditiva: nenhum campo muda de chave, tipo ou opções, sem passos de migração', () => {
    const previous = JSON.parse(JSON.stringify(spec)) as Spec;
    (previous as { version: number }).version = 3;
    for (const layer of previous.layers)
      for (const type of layer.annotationTypes) {
        if (type.id in INTERACTION_OPTIONS)
          type.fields = type.fields.filter((f) => f.key !== 'interaction');
      }
    expect(spec.version).toBe(4);
    expect(missingMigrations(previous, spec)).toEqual([]);
    expect(spec.migrations ?? []).toEqual([]);
    const report = validateLibrary({ files, specPath: SPEC_FILE, previous });
    expect(report.errors).toEqual([]);
  });
});
