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
 * Test specialization with `accessibility` on the root (touch target, with the WCAG 2.5.8 `spacing` on: the circle
 * of every undersized `button` is audited against its neighbors), on a type (role + label), on an `expanded` type
 * (the `icon`, whose touch area grows to 48 and overlaps its neighbor's), on a `visual` type of its own without
 * `spacing` (the `chip`, undersized like the buttons, whose circle blocks theirs) and on parts (a field part and
 * two table parts), for the audit's performance and growth tests.
 */
function a11ySpec() {
  const parsed = parseSpec({
    format: 'mapping-spec',
    formatVersion: 27,
    id: A11Y_SPEC_ID,
    name: 'A11y perf',
    version: 1,
    accessibility: {
      touchTarget: { width: 44, height: 44, mode: 'visual', spacing: true },
    },
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
            id: 'chip',
            name: 'Chip',
            fields: [text('label')],
            accessibility: {
              role: 'button',
              label: { fields: ['label'] },
              touchTarget: { width: 44, height: 44, mode: 'visual' },
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
  forced: ReadonlyMap<string, 'icon' | 'button' | 'chip'>,
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
    const typeId = forced.get(m.id);
    if (typeId !== undefined)
      return annotation(id, m.id, typeId, { label: `Label ${i}` });
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
/** Side of the undersized `visual` pair and its gap: the circles (the minimum's 44) of the two go deep into each other. */
const CLOSE_SIDE = 20;
const CLOSE_GAP = 4;

/**
 * Two sibling leaves of every other parent (the even ones for `0`, the odd ones for `1`) become a pair of `side` x
 * `side` rectangles `gap` apart, at the first one's corner (still inside the parent), in density 1 and in the 3x
 * containers. Returns their new rectangles by marking id, the first of each pair before the second.
 */
function leafPairs(
  markings: readonly Marking[],
  parity: 0 | 1,
  side: number,
  gap: number,
): Map<string, Rect> {
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
    if (first === undefined || second === undefined || n++ % 2 !== parity) continue;
    const { x, y } = first.rect;
    rects.set(first.id, { x, y, width: side, height: side });
    rects.set(second.id, { x: x + side + gap, y, width: side, height: side });
  }
  return rects;
}

/** The type of each marking of the pairs: `expanded` icons, and a `button` (with `spacing`) next to a `chip` (without). */
function pairTypes(
  icons: ReadonlyMap<string, Rect>,
  close: ReadonlyMap<string, Rect>,
): Map<string, 'icon' | 'button' | 'chip'> {
  const types = new Map<string, 'icon' | 'button' | 'chip'>();
  for (const id of icons.keys()) types.set(id, 'icon');
  let first = true;
  for (const id of close.keys()) {
    types.set(id, first ? 'button' : 'chip');
    first = !first;
  }
  return types;
}

/**
 * Adds the accessibility specialization to `p` and annotates **every** marking with a typed annotation
 * (half buttons, half bars with table rows), puts `expanded` icon pairs 4 px apart in the containers and, in the other
 * parents, pairs of undersized `visual` targets (a `button` with the WCAG 2.5.8 `spacing` next to a `chip` without it)
 * whose circles overlap. Half of the containers (the odd positions) get density 3.
 */
export function withAccessibility(p: Project): Project {
  const applied = applySpecialization(p, a11ySpec(), { newId: idGen('AXL') });
  const layerId = layerOf(applied, A11Y_SPEC_ID, 'ui');
  const shrunk = shrinkButtonLeaves(applied);
  const icons = leafPairs(shrunk, 0, ICON_SIDE, ICON_GAP);
  const close = leafPairs(shrunk, 1, CLOSE_SIDE, CLOSE_GAP);
  const markings = shrunk.map((m) => {
    const rect = icons.get(m.id) ?? close.get(m.id);
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
      ...accessibleAnnotations(layerId, markings, pairTypes(icons, close)),
    ],
  };
}
