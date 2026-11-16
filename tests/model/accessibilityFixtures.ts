import {
  applySpecialization,
  parseSpec,
  type Annotation,
  type JsonValue,
  type Marking,
  type Project,
} from '../../src/model';
import { idGen, layerOf } from './specFixtures';

const A11Y_SPEC_ID = 'a11y-perf';

const text = (key: string) => ({ key, type: 'string' });

/**
 * Test specialization with `accessibility` on the root (touch target), on a type (role + label) and on
 * parts (a field part and two table parts), for the audit's performance and growth tests.
 */
function a11ySpec() {
  const parsed = parseSpec({
    format: 'mapping-spec',
    formatVersion: 18,
    id: A11Y_SPEC_ID,
    name: 'A11y perf',
    version: 1,
    accessibility: { touchTarget: { width: 44, height: 44, mode: 'visual' } },
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [text('label'), text('alt')],
            accessibility: { role: 'button', label: { fields: ['label', 'alt'] } },
          },
          {
            id: 'bar',
            name: 'Bar',
            fields: [
              text('title'),
              text('badge'),
              {
                key: 'items',
                type: 'table',
                columns: [text('name'), text('hint')],
              },
            ],
            accessibility: {
              parts: [
                { id: 'close', when: 'badge', label: { fields: ['title'] } },
                { id: 'row', when: 'items', label: { fields: ['items.name'] } },
                { id: 'cell', when: 'items.hint', label: { fields: ['items.name'] } },
              ],
            },
          },
        ],
      },
    ],
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Every `STEP`-th label is left empty, so the audit has pending items to report. */
const STEP = 5;

function accessibleAnnotations(
  layerId: string,
  markings: readonly Marking[],
): Annotation[] {
  const annotation = (
    id: string,
    markingId: string,
    typeId: string,
    values: Record<string, JsonValue>,
  ): Annotation => ({
    id,
    markingId,
    layerId,
    name: null,
    parentAnnotationId: null,
    parentRole: null,
    type: { specId: A11Y_SPEC_ID, typeId },
    values,
    entries: [],
  });
  return markings.map((m, i) => {
    const id = `AX${i}`;
    if (i % 2 === 0) {
      return annotation(id, m.id, 'button', {
        label: i % STEP === 0 ? '' : `Button ${i}`,
        alt: '',
      });
    }
    return annotation(id, m.id, 'bar', {
      title: `Bar ${i}`,
      badge: i % 3 === 0 ? '' : '1',
      items: [
        { _id: `${id}-r1`, name: `Row ${i}`, hint: 'hint' },
        { _id: `${id}-r2`, name: '', hint: '' },
      ],
    });
  });
}

/**
 * Shrinks the leaf markings that carry a button (the large fixtures draw huge rectangles, so nothing would
 * be below the touch minimum): 100 px is enough at density 1 and too small at 3x; every fourth is below both.
 */
function shrinkButtonLeaves(p: Project): Marking[] {
  const parents = new Set<string>();
  for (const m of p.markings) if (m.parentId !== null) parents.add(m.parentId);
  for (const c of p.containers) if (c.parentId !== null) parents.add(c.parentId);
  return p.markings.map((m, i) => {
    if (i % 2 !== 0 || parents.has(m.id) || m.parentId === null) return m;
    const size = i % 4 === 0 ? 40 : 100;
    return { ...m, rect: { ...m.rect, width: size, height: size } };
  });
}

/**
 * Adds the accessibility specialization to `p` and annotates **every** marking with a typed annotation
 * (half buttons, half bars with table rows). Half of the containers (the odd positions) get density 3.
 */
export function withAccessibility(p: Project): Project {
  const applied = applySpecialization(p, a11ySpec(), { newId: idGen('AXL') });
  const layerId = layerOf(applied, A11Y_SPEC_ID, 'ui');
  const markings = shrinkButtonLeaves(applied);
  return {
    ...applied,
    markings,
    containers: applied.containers.map((c, i) =>
      i % 2 === 1 ? { ...c, density: 3 } : c,
    ),
    annotations: [...applied.annotations, ...accessibleAnnotations(layerId, markings)],
  };
}
