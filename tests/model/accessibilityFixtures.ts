import {
  applySpecialization,
  parseSpec,
  type Annotation,
  type JsonValue,
  type Marking,
  type Project,
  type Rect,
} from '../../src/model';
import { idGen, layerOf } from './specFixtures';

const A11Y_SPEC_ID = 'a11y-perf';

const text = (key: string) => ({ key, type: 'string' });

/**
 * Test specialization with `accessibility` on the root (touch target), on a type (role + label), on an `expanded`
 * type (the `icon`, whose touch area grows to 48 and overlaps its neighbor's) and on parts (a field part and two
 * table parts), for the audit's performance and growth tests.
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
            id: 'icon',
            name: 'Icon',
            fields: [text('label')],
            accessibility: {
              role: 'button',
              label: { fields: ['label'] },
              touchTarget: { width: 48, height: 48, mode: 'expanded' },
            },
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
  icons: ReadonlySet<string>,
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
    if (icons.has(m.id)) return annotation(id, m.id, 'icon', { label: `Icon ${i}` });
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

/** Side of an icon and the gap between the two of a pair, in image pixels: their touch areas (48 units) overlap. */
const ICON_SIDE = 40;
const ICON_GAP = 4;

/**
 * Two sibling leaves of every other parent become a pair of `icon`s 4 px apart (40 x 40 each, at the first one's
 * corner, still inside the parent): `touch-target-overlap` between neighbors, in density 1 and in the 3x containers.
 * Returns their new rectangles by marking id.
 */
function iconPairs(markings: readonly Marking[]): Map<string, Rect> {
  const parents = new Set(markings.map((m) => m.parentId));
  const children = new Map<string, Marking[]>();
  for (const m of markings) {
    if (m.parentId === null || m.containerId === null || parents.has(m.id)) continue;
    const list = children.get(m.parentId);
    if (list) list.push(m);
    else children.set(m.parentId, [m]);
  }
  const rects = new Map<string, Rect>();
  let n = 0;
  for (const [, [first, second]] of children) {
    if (first === undefined || second === undefined || n++ % 2 === 1) continue;
    const { x, y } = first.rect;
    rects.set(first.id, { x, y, width: ICON_SIDE, height: ICON_SIDE });
    rects.set(second.id, {
      x: x + ICON_SIDE + ICON_GAP,
      y,
      width: ICON_SIDE,
      height: ICON_SIDE,
    });
  }
  return rects;
}

/**
 * Adds the accessibility specialization to `p` and annotates **every** marking with a typed annotation
 * (half buttons, half bars with table rows), and puts `expanded` icon pairs 4 px apart in the containers. Half of the
 * containers (the odd positions) get density 3.
 */
export function withAccessibility(p: Project): Project {
  const applied = applySpecialization(p, a11ySpec(), { newId: idGen('AXL') });
  const layerId = layerOf(applied, A11Y_SPEC_ID, 'ui');
  const shrunk = shrinkButtonLeaves(applied);
  const icons = iconPairs(shrunk);
  const markings = shrunk.map((m) => {
    const rect = icons.get(m.id);
    return rect === undefined ? m : { ...m, rect };
  });
  return {
    ...applied,
    markings,
    containers: applied.containers.map((c, i) =>
      i % 2 === 1 ? { ...c, density: 3 } : c,
    ),
    annotations: [
      ...applied.annotations,
      ...accessibleAnnotations(layerId, markings, new Set(icons.keys())),
    ],
  };
}
