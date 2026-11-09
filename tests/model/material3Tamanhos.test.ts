// ME2 (#913, etapa #869): os tamanhos dos cinco tipos são os do Compose (decisão 9) e o exemplo mais alto de cada
// um termina dentro do `size`; os exemplos dos limites (decisão 11) desenham sem aviso nos dois modos.
// Referência (commit fixado 5113b82a…, androidx/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3):
//  - top-app-bar: tokens/AppBarLargeTokens.kt `ContainerHeight` 152 (medium 112, small 64);
//  - date-picker: DatePicker.kt `RecommendedSizeForAccessibility` 48 × `MaxCalendarRows` 6 (linhas 2293 e 2303) → 512;
//  - time-picker: TimePicker.kt `ClockFaceBottomMargin` 24 (2069) + TimePickerDialog.kt (ações 48, `portActionsBottomPadding` 24) → 456 + 24 + 48;
//  - alert-dialog: botões de 48 (`minimumInteractiveComponentSize`, Surface.kt 219) → 240 + 8;
//  - slider: Slider.kt `minimumInteractiveComponentSize` 48 (o `SliderTokens` HandleHeight é 44).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { multiply, IDENTITY } from '../../src/model/components/scene';
import type { Matrix, SceneNode } from '../../src/model/components/scene';
import { COMPOSE_SIZES, drawIn, files, text } from '../support/material3Library';

/** Maior `y` (px, no espaço da raiz) que algum nó visível ocupa, pela caixa de cada nó. */
function bottomOf(node: SceneNode, parent: Matrix = IDENTITY, isRoot = true): number {
  if (!isRoot && !node.visible) return 0;
  const m = isRoot ? IDENTITY : multiply(parent, node.transform);
  let bottom = !isRoot ? m[5] + m[3] * node.height : 0;
  if ('children' in node) {
    for (const child of node.children)
      bottom = Math.max(bottom, bottomOf(child, m, false));
  }
  return bottom;
}

/** Altura do `sizing` de cada tipo (o `size` vem de `COMPOSE_SIZES`, a fonte única dos testes da biblioteca). */
const SIZING_HEIGHT: Record<string, number | 'hug'> = {
  'top-app-bar': 152,
  'date-picker': 'hug',
  'time-picker': 'hug',
  'alert-dialog': 'hug',
  slider: 48,
};

const catalog = buildCatalog(files);

describe.each(Object.keys(SIZING_HEIGHT))('%s: tamanho do Compose', (id) => {
  const entry = findEntry(catalog, id)!;
  const size = COMPOSE_SIZES[id]!;

  it('o size e o sizing são os do Compose', () => {
    expect(entry.component!.size).toEqual(size);
    expect(entry.component!.sizing?.height).toBe(SIZING_HEIGHT[id]);
  });

  it.each(['light', 'dark'] as const)(
    'todos os exemplos terminam dentro da altura (%s)',
    (mode) => {
      expect(entry.examples.length).toBeGreaterThan(0);
      for (const example of entry.examples) {
        const drawing = drawIn(catalog, entry, example.values ?? {}, mode);
        expect(drawing.warnings, example.name).toEqual([]);
        expect(
          bottomOf(drawing.root),
          `${example.name}: fundo do conteúdo (size ${size.height})`,
        ).toBeLessThanOrEqual(size.height);
      }
    },
  );
});

describe('exemplos dos limites (decisão 11)', () => {
  const LIMITS: { id: string; name: string; issue: string }[] = [
    { id: 'button', name: 'Rótulo longo', issue: '#898' },
    { id: 'time-picker', name: '24 horas, campos', issue: '#898' },
    { id: 'date-picker', name: 'Intervalo até o fim do mês', issue: '#897' },
  ];

  it.each(LIMITS)(
    '$id: "$name" existe, desenha sem aviso e a Fidelidade cita $issue',
    ({ id, name, issue }) => {
      const entry = findEntry(catalog, id)!;
      const example = entry.examples.find((e) => e.name === name);
      expect(example, `exemplo ${name}`).toBeDefined();
      for (const mode of ['light', 'dark'] as const) {
        const drawing = drawIn(catalog, entry, example!.values ?? {}, mode);
        expect(drawing.warnings, `${name} (${mode})`).toEqual([]);
      }
      const doc = text(`docs/${id}.md`);
      const fidelity = doc.slice(doc.indexOf('## Fidelidade'));
      expect(fidelity).toContain(issue);
      expect(doc.slice(0, doc.indexOf('## Fidelidade'))).toContain(name);
    },
  );
});
