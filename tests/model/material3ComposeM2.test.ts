// M2 da etapa "Material 3 fiel": os 19 componentes de layout e ações no formato 4.
// Os valores de cada componente contra os `.kt` ficam nos arquivos `material3ComposeM2*.test.ts`.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  SPEC_FILE,
  drawIn,
  files,
  text,
  V1_NO_DEFAULT,
  v1WithEstados,
  COMPOSE_SIZES,
} from '../support/material3Library';
import v1 from '../fixtures/material3-m2-v1.json';

const M2 = [
  'scaffold',
  'box',
  'row',
  'column',
  'lazy-column',
  'lazy-row',
  'lazy-vertical-grid',
  'flow-row',
  'spacer',
  'horizontal-pager',
  'button',
  'fab',
  'extended-fab',
  'icon-button',
  'icon-toggle-button',
  'chip',
  'badge',
  'card',
  'image',
];
const BAD_WARNING =
  /não cabe|texto maior que a caixa|ícone desconhecido|ícone esticado|token inexistente|token desconhecido/i;

type Rec = Record<string, unknown>;
const rawSpec = JSON.parse(text(SPEC_FILE)) as { layers: { annotationTypes: Rec[] }[] };
const rawTypes: Record<string, Rec> = Object.fromEntries(
  rawSpec.layers.flatMap((l) => l.annotationTypes).map((t) => [t.id as string, t]),
);
const component = (id: string): Rec => JSON.parse(text(`components/${id}.json`)) as Rec;

describe('M2 — layout e ações no formato 4', () => {
  it.each(M2)('%s é formato 4, sem cor literal e sem family literal', (id) => {
    const raw = text(`components/${id}.json`);
    expect(component(id).formatVersion).toBe(4);
    expect(raw).not.toMatch(/"family"/);
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(raw).not.toMatch(/rgba?\(/);
  });

  it.each(M2)('%s não repete caminho SVG de ícone escolhido', (id) => {
    expect(text(`components/${id}.json`)).not.toMatch(/"M\d[^"]{40,}"/);
  });

  it.each(M2)('%s: campos, exemplos, preview, minSize e size iguais aos da v1', (id) => {
    const before = (v1.components as Record<string, Rec>)[id]!;
    const type = rawTypes[id]!;
    const now = component(id);
    const { actual, expected } = v1WithEstados(id, type, before);
    expect(actual).toEqual(expected);
    const dropped = V1_NO_DEFAULT[id];
    const previewBefore = { ...(before.preview as Rec) };
    if (dropped !== undefined) delete previewBefore[dropped];
    expect(now.preview).toEqual(previewBefore);
    expect(now.minSize).toEqual(before.minSize);
    expect(now.size).toEqual(COMPOSE_SIZES[id] ?? before.size);
  });

  it.each(M2)('%s: o padrão e os exemplos desenham sem aviso em light e dark', (id) => {
    const catalog = buildCatalog(files);
    const entry = findEntry(catalog, id)!;
    const cases = [{}, ...(entry.examples ?? []).map((e) => e.values)];
    for (const mode of ['light', 'dark'] as const) {
      for (const values of cases) {
        const drawing = drawIn(catalog, entry, values ?? {}, mode);
        expect(drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
      }
    }
  });

  it('a biblioteca valida com 0 erros e 0 avisos', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});
