// Etapa "formato 4" (#896), fase FX5 (#1012): a `material3-compose` sem os paliativos da decisão 24 —
// `$token` na sombra e nos raios por canto, `alpha` no véu do `carousel`, o `badge` sem altura fixa — e o
// anel de foco no `interaction: "focused"` dos tipos que o Compose desenha com anel (`FocusIndicatorColor`
// nos `*Tokens.kt` do commit fixado), pelo `stroke.offset`. A `version` sobe uma vez (4 → 5), de forma aditiva.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { FrameNode, SceneNode } from '../../src/model/components/scene';
import { validateLibrary } from '../../src/model/library';
import type { Spec } from '../../src/model/spec';
import { missingMigrations } from '../../src/model/specVersions';
import { SPEC_FILE, drawIn, files, spec, text, types } from '../support/material3Library';

type Json = unknown;
type Mode = 'light' | 'dark';
const MODES: Mode[] = ['light', 'dark'];
const catalog = buildCatalog(files);
const tokenValues = (spec.tokens?.values ?? {}) as Record<
  string,
  { light: string; dark: string } | number
>;
const secondary = (mode: Mode): string => {
  const v = tokenValues.secondary;
  return typeof v === 'object' ? v[mode].toLowerCase() : '';
};

const components = types.map((t) => ({
  id: t.id,
  json: JSON.parse(text(`components/${t.id}.json`)) as Json,
}));

/** Percorre toda a árvore do componente e chama `visit` em cada objeto, com o caminho dele. */
function walk(
  value: Json,
  path: string,
  visit: (obj: Record<string, Json>, p: string) => void,
) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}/${i}`, visit));
  } else if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, Json>;
    visit(obj, path);
    for (const [k, v] of Object.entries(obj)) walk(v, `${path}/${k}`, visit);
  }
}

/** Os números literais (fora de `$token`) dentro de um valor, com o caminho. */
function literalNumbers(value: Json, path: string, out: string[] = []): string[] {
  if (typeof value === 'number') out.push(`${path}=${value}`);
  else if (Array.isArray(value))
    value.forEach((v, i) => literalNumbers(v, `${path}/${i}`, out));
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value as Record<string, Json>))
      if (k !== '$field' && k !== '$eq') literalNumbers(v, `${path}/${k}`, out);
  }
  return out;
}

describe('paliativos da Material 3 trocados pelas chaves novas (decisão 24)', () => {
  it('nenhuma sombra com x, y ou blur literal (todos têm token de elevação)', () => {
    const found: string[] = [];
    for (const c of components)
      walk(c.json, c.id, (obj, p) => {
        const shadow = obj.shadow;
        if (typeof shadow !== 'object' || shadow === null) return;
        for (const key of ['x', 'y', 'blur'] as const) {
          const v = (shadow as Record<string, Json>)[key];
          if (typeof v === 'number') found.push(`${p}/shadow/${key}=${v}`);
        }
      });
    expect(found).toEqual([]);
  });

  it('nenhum raio por canto literal diferente de 0 (cada valor vem de um token)', () => {
    const found: string[] = [];
    for (const c of components)
      walk(c.json, c.id, (obj, p) => {
        if (!('cornerRadius' in obj)) return;
        // só as listas de raios por canto (A2); um raio uniforme em número é outro assunto
        const lits = literalNumbers(obj.cornerRadius, `${p}/cornerRadius`)
          .filter((s) => /\/cornerRadius(\/[a-z]+)*\/\d+=/.test(s))
          .filter((s) => !s.endsWith('=0'));
        found.push(...lits);
      });
    expect(found).toEqual([]);
  });

  it('nenhuma opacidade fixa entre 0 e 1: a cor leva o `alpha` do token (o véu do carousel é um degradê)', () => {
    const found: string[] = [];
    for (const c of components)
      walk(c.json, c.id, (obj, p) => {
        const o = obj.opacity;
        if (typeof o === 'number' && o > 0 && o < 1) found.push(`${p}/opacity=${o}`);
      });
    expect(found).toEqual([]);
    const carousel = JSON.stringify(components.find((c) => c.id === 'carousel')?.json);
    expect(carousel).toContain('"alpha":0.32');
    expect(carousel).toContain('"alpha":0');
  });

  it('o contador do badge não fixa a altura (a prova de desenho usa os tokens do modo)', () => {
    const badge = JSON.stringify(
      (components.find((c) => c.id === 'badge')?.json as { template: Json }).template,
    );
    expect(badge).not.toMatch(/"height":\s*16/);
  });

  it('valida sem erro e sem aviso nos três níveis, em todos os modos', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});

/** Tipos com `interaction: "focused"` e `FocusIndicatorColor` no `*Tokens.kt` do commit fixado, e o desenho a conferir. */
const RING: { id: string; values: Record<string, unknown>; node?: string }[] = [
  { id: 'chip', values: { style: 'assist' } },
  { id: 'chip', values: { style: 'filter' } },
  { id: 'chip', values: { style: 'input' } },
  { id: 'chip', values: { style: 'suggestion' } },
  { id: 'card', values: { style: 'filled' } },
  { id: 'card', values: { style: 'elevated' } },
  { id: 'list-item', values: {} },
  { id: 'search-bar', values: { style: 'bar' } },
  { id: 'search-bar', values: { style: 'docked' } },
  { id: 'switch', values: {} },
  {
    id: 'dropdown-menu',
    values: {
      style: 'menu',
      expanded: 'true',
      items: [
        {
          text: 'Editar',
          leadingIcon: 'Edit',
          trailingIcon: '',
          enabled: 'true',
          selected: 'true',
        },
        { text: 'Excluir', leadingIcon: 'Delete', trailingIcon: '', enabled: 'true' },
      ],
    },
  },
  { id: 'navigation-drawer', values: { style: 'modal', headline: 'Mapping' } },
];

function rings(node: SceneNode, out: SceneNode[] = []): SceneNode[] {
  if (!node.visible) return out;
  if (node.name === 'anel de foco') out.push(node);
  if ('children' in node) node.children.forEach((c) => rings(c, out));
  return out;
}
const entryOf = (id: string) => {
  const e = findEntry(catalog, id);
  if (e === undefined) throw new Error(`entrada ${id} ausente`);
  return e;
};
const rgba = (c: string): string => c.toLowerCase().slice(0, 7);

describe('anel de foco no interaction: focused (A15, pelo stroke.offset)', () => {
  for (const { id, values } of RING) {
    const label = `${id} ${JSON.stringify(values).slice(0, 40)}`;
    it(`${label}: o anel secondary de 3, afastado 2, por fora da forma em focused, e nenhum em none`, () => {
      for (const mode of MODES) {
        const base = { ...(entryOf(id).previewValues ?? {}), ...values };
        const none = drawIn(catalog, entryOf(id), { ...base, interaction: 'none' }, mode);
        expect(rings(none.root), `${label} ${mode} none`).toEqual([]);
        const focused = drawIn(
          catalog,
          entryOf(id),
          { ...base, interaction: 'focused' },
          mode,
        );
        const found = rings(focused.root);
        expect(found.length, `${label} ${mode} focused`).toBeGreaterThanOrEqual(1);
        for (const ring of found) {
          const stroke = 'stroke' in ring ? ring.stroke : undefined;
          const paint = stroke?.paints[0];
          expect(stroke?.width).toBe(3);
          expect(stroke?.align).toBe('outside');
          expect(stroke?.offset).toBe(2);
          expect(paint?.type === 'solid' ? rgba(paint.color) : undefined).toBe(
            rgba(secondary(mode)),
          );
          expect('fills' in ring ? ring.fills : []).toEqual([]);
        }
      }
    });
  }

  it('o recorte da raiz alarga 5 de cada lado em focused quando a raiz recorta, e não alarga em none', () => {
    for (const id of ['card', 'list-item']) {
      const none = drawIn(
        catalog,
        entryOf(id),
        { style: 'filled', interaction: 'none' },
        'light',
      );
      const focused = drawIn(
        catalog,
        entryOf(id),
        { style: 'filled', interaction: 'focused' },
        'light',
      );
      const box = (
        n: SceneNode,
      ): { w: number; h: number; clip?: FrameNode['clipBox'] } => ({
        w: n.width,
        h: n.height,
        clip: n.type === 'frame' ? n.clipBox : undefined,
      });
      const a = box(none.root);
      const b = box(focused.root);
      expect(b.clip, id).toBeDefined();
      const clip = b.clip;
      if (clip === undefined) continue;
      expect(clip.x).toBeLessThanOrEqual(-5);
      expect(clip.y).toBeLessThanOrEqual(-5);
      expect(clip.x + clip.width).toBeGreaterThanOrEqual(b.w + 5);
      expect(clip.y + clip.height).toBeGreaterThanOrEqual(b.h + 5);
      if (a.clip !== undefined) expect(a.clip.x).toBeGreaterThan(-5);
    }
  });
});

describe('atualização da biblioteca (version 4 → 5)', () => {
  it('sobe a version uma vez, de 4 para 5', () => {
    expect(spec.version).toBe(5);
  });

  it('é aditiva: troca o desenho sem mudar campo, sem passos de migração', () => {
    const previous = JSON.parse(JSON.stringify(spec)) as Spec;
    (previous as { version: number }).version = 4;
    expect(missingMigrations(previous, spec)).toEqual([]);
    expect(spec.migrations ?? []).toEqual([]);
    const report = validateLibrary({ files, specPath: SPEC_FILE, previous });
    expect(report.errors).toEqual([]);
  });
});
