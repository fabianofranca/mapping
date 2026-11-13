// M5 da etapa "Material 3 fiel": os 9 componentes de superfícies e seletores no formato 4.
// Os valores de cada componente contra os `.kt` ficam nos arquivos `material3ComposeM5*.test.ts`.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  SPEC_FILE,
  unknownWarnings,
  drawIn,
  files,
  text,
  v1WithEstados,
  COMPOSE_SIZES,
} from '../support/material3Library';
import v1 from '../fixtures/material3-m5-v1.json';

const M5 = [
  'alert-dialog',
  'bottom-sheet',
  'snackbar',
  'tooltip',
  'date-picker',
  'time-picker',
  'carousel',
  'pull-to-refresh',
  'swipe-to-dismiss',
];
const BAD_WARNING =
  /não cabe|texto maior que a caixa|ícone desconhecido|ícone esticado|token inexistente|token desconhecido/i;

type Rec = Record<string, unknown>;
const rawSpec = JSON.parse(text(SPEC_FILE)) as { layers: { annotationTypes: Rec[] }[] };
const rawTypes: Record<string, Rec> = Object.fromEntries(
  rawSpec.layers.flatMap((l) => l.annotationTypes).map((t) => [t.id as string, t]),
);
const component = (id: string): Rec => JSON.parse(text(`components/${id}.json`)) as Rec;

/** O catálogo se monta uma vez, na coleta: montá-lo dentro do teste passava de 5 s com a cobertura ligada no CI. */
const shared = buildCatalog(files);

describe('M5 — superfícies e seletores no formato 4', () => {
  it.each(M5)('%s é formato 4, sem cor literal e sem family literal', (id) => {
    const raw = text(`components/${id}.json`);
    expect(component(id).formatVersion).toBe(4);
    expect(raw).not.toMatch(/"family"/);
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(raw).not.toMatch(/rgba?\(/);
  });

  it.each(M5)('%s não repete caminho SVG de ícone escolhido', (id) => {
    expect(text(`components/${id}.json`)).not.toMatch(/"M\d[^"]{40,}"/);
  });

  it.each(M5)('%s: campos, exemplos, preview, minSize e size iguais aos da v1', (id) => {
    const before = (v1.components as Record<string, Rec>)[id]!;
    const type = rawTypes[id]!;
    const now = component(id);
    const { actual, expected } = v1WithEstados(id, type, before);
    expect(actual).toEqual(expected);
    expect(now.preview).toEqual(before.preview);
    expect(now.minSize).toEqual(before.minSize);
    expect(now.size).toEqual(COMPOSE_SIZES[id] ?? before.size);
  });

  it.each(M5)('%s: o padrão e os exemplos desenham sem aviso em light e dark', (id) => {
    const catalog = shared;
    const entry = findEntry(catalog, id)!;
    const cases = [{}, ...(entry.examples ?? []).map((e) => e.values)];
    for (const mode of ['light', 'dark'] as const) {
      for (const values of cases) {
        const drawing = drawIn(catalog, entry, values ?? {}, mode);
        expect(drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
      }
    }
  });

  it('a biblioteca valida com 0 erros e só os avisos conhecidos (provisório, #1774)', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
  }, 30_000);

  it('todos os 50 componentes são formato 4, sem cor literal e sem family literal', () => {
    const ids = files
      .map((f) => /^components\/([^/]+)\.json$/.exec(f.path)?.[1])
      .filter((id): id is string => id !== undefined);
    expect(ids).toHaveLength(50);
    for (const id of ids) {
      const raw = text(`components/${id}.json`);
      expect(component(id).formatVersion, id).toBe(4);
      expect(raw, id).not.toMatch(/"family"/);
      expect(raw, id).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(raw, id).not.toMatch(/rgba?\(/);
    }
  });
});
