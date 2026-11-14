import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  imageCanvasRect,
  right,
  type Annotation,
  type Arrow,
  type InvariantCode,
  type Marking,
  type Project,
} from '../../src/model';
import { cadastroProject } from './specFixtures';

// One inconsistent `mapping.json` per invariant class (`tests/fixtures/invalid/`), all
// generated from the project of script 13.9 (`cadastroProject`) with one manual change.
// `invalidFixtures.test.ts` checks that each file is still equal to the one generated here; to
// rewrite: `UPDATE_FIXTURES=1 npx vitest run tests/model/invalidFixtures.test.ts`.

export const INVALID_FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures', 'invalid');

export interface InvalidCase {
  /** File name, without `.json`. */
  readonly name: string;
  /** Invariant that the file violates. */
  readonly code: InvariantCode;
  /** The app offers "Repair and open" (all the problems have a mechanical repair). */
  readonly repairable: boolean;
  readonly build: (p: Project) => Project;
}

const markings = (p: Project, update: (m: Marking) => Marking): Project => ({
  ...p,
  markings: p.markings.map(update),
});

const annotations = (p: Project, update: (a: Annotation) => Annotation): Project => ({
  ...p,
  annotations: p.annotations.map(update),
});

const extraMarking = (p: Project, marking: Partial<Marking>): Project => ({
  ...p,
  markings: [
    ...p.markings,
    {
      id: 'MX',
      containerId: 'I1',
      parentId: null,
      name: 'Extra',
      rect: { x: 100, y: 1500, width: 200, height: 100 },
      needsReview: false,
      locked: false,
      floating: false,
      source: null,
      ...marking,
    },
  ],
});

const freeAnnotation = (p: Project, annotation: Partial<Annotation>): Project => ({
  ...p,
  annotations: [
    ...p.annotations,
    {
      id: 'AX',
      markingId: 'MN',
      layerId: 'LM',
      name: 'Extra',
      parentAnnotationId: null,
      parentRole: null,
      type: null,
      values: null,
      entries: [{ id: 'EX', key: 'campo', value: 'texto' }],
      ...annotation,
    },
  ],
});

/** Arrow `AR` from the Title (MT) to the Name (MN), with a free annotation of it, and `arrow` on top. */
const arrowWithNote = (p: Project, arrow: Partial<Arrow>): Project =>
  freeAnnotation(
    {
      ...p,
      arrows: [
        ...p.arrows,
        {
          id: 'AR',
          from: 'MT',
          to: 'MN',
          fromSide: null,
          toSide: null,
          points: [],
          style: 'curve',
          name: null,
          locked: false,
          ...arrow,
        },
      ],
    },
    { markingId: 'AR' },
  );

/** Second image (500×500); without `at`, to the right of the first and without overlapping. */
const secondImage = (p: Project, at?: { x: number; y: number }): Project => {
  const first = p.containers[0];
  if (!first) throw new Error('fixture without an image');
  const firstRect = imageCanvasRect(first, first.placement);
  return {
    ...p,
    containers: [
      ...p.containers,
      {
        ...first,
        id: 'I2',
        name: 'Segunda',
        file: 'images/segunda.png',
        width: 500,
        height: 500,
        placement: { ...(at ?? { x: right(firstRect) + 100, y: 0 }), scale: 1 },
      },
    ],
  };
};

export const INVALID_CASES: readonly InvalidCase[] = [
  // ---- Repairable ----
  {
    name: 'duplicate-entry-id',
    code: 'duplicate-entry-id',
    repairable: true,
    // Pair with the id `EN`, already used in another annotation (AU).
    build: (p) =>
      freeAnnotation(p, { entries: [{ id: 'EN', key: 'campo', value: 'x' }] }),
  },
  {
    name: 'rect-out-of-image',
    code: 'rect-out-of-image',
    repairable: true,
    // Title goes 100 px past the right edge: clipped to 800 → 900 wide.
    build: (p) =>
      markings(p, (m) =>
        m.id === 'MT' ? { ...m, rect: { ...m.rect, width: 1000 } } : m,
      ),
  },
  {
    name: 'rect-out-of-image-entirely',
    code: 'rect-out-of-image',
    repairable: true,
    // Entirely outside the image: once clipped it has no area and is removed.
    build: (p) =>
      extraMarking(p, { name: 'Fora', rect: { x: 1200, y: 100, width: 50, height: 50 } }),
  },
  {
    name: 'missing-image',
    code: 'missing-image',
    repairable: true,
    build: (p) => extraMarking(p, { name: 'Órfã', containerId: 'I9' }),
  },
  {
    name: 'missing-marking',
    code: 'missing-marking',
    repairable: true,
    build: (p) => freeAnnotation(p, { markingId: 'M9' }),
  },
  {
    name: 'missing-layer',
    code: 'missing-layer',
    repairable: true,
    build: (p) => freeAnnotation(p, { layerId: 'L9' }),
  },
  {
    name: 'missing-parent',
    code: 'missing-parent',
    repairable: true,
    build: (p) => markings(p, (m) => (m.id === 'MN' ? { ...m, parentId: 'M9' } : m)),
  },
  {
    name: 'arrow-endpoint-missing',
    code: 'arrow-endpoint-missing',
    repairable: true,
    // Arrow to a marking that does not exist: removed, with its annotation.
    build: (p) => arrowWithNote(p, { to: 'M9' }),
  },
  {
    name: 'arrow-self',
    code: 'arrow-self',
    repairable: true,
    // Arrow linked to itself: removed, with its annotation.
    build: (p) => arrowWithNote(p, { from: 'MN', to: 'MN' }),
  },
  {
    name: 'hierarchy-cycle',
    code: 'hierarchy-cycle',
    repairable: true,
    // Form › Name › Form.
    build: (p) => markings(p, (m) => (m.id === 'MF' ? { ...m, parentId: 'MN' } : m)),
  },
  {
    name: 'images-overlap',
    code: 'images-overlap',
    repairable: true,
    // The second image starts at the same point as the first.
    build: (p) => secondImage(p, p.containers[0]?.placement),
  },
  // ---- Refused (without an unambiguous mechanical repair) ----
  {
    name: 'duplicate-id',
    code: 'duplicate-id',
    repairable: false,
    build: (p) => extraMarking(p, { id: 'MT' }),
  },
  {
    name: 'duplicate-file',
    code: 'duplicate-file',
    repairable: false,
    build: (p) => {
      const q = secondImage(p);
      return {
        ...q,
        containers: q.containers.map((i) =>
          i.id === 'I2' ? { ...i, file: 'images/cadastro.png' } : i,
        ),
      };
    },
  },
  {
    name: 'parent-other-image',
    code: 'parent-other-image',
    repairable: false,
    build: (p) =>
      extraMarking(secondImage(p), {
        containerId: 'I2',
        parentId: 'MF',
        rect: { x: 10, y: 10, width: 100, height: 100 },
      }),
  },
  {
    name: 'rect-outside-parent',
    code: 'rect-outside-parent',
    repairable: false,
    // Name starts before the Form (x = 50).
    build: (p) =>
      markings(p, (m) => (m.id === 'MN' ? { ...m, rect: { ...m.rect, x: 20 } } : m)),
  },
  {
    name: 'missing-parent-annotation',
    code: 'missing-parent-annotation',
    repairable: false,
    build: (p) =>
      annotations(p, (a) => (a.id === 'AOC' ? { ...a, parentAnnotationId: 'A9' } : a)),
  },
  {
    name: 'annotation-parent-other-marking',
    code: 'annotation-parent-other-marking',
    repairable: false,
    build: (p) =>
      annotations(p, (a) => (a.id === 'AOC' ? { ...a, parentAnnotationId: 'AIN' } : a)),
  },
  {
    name: 'annotation-parent-same-layer',
    code: 'annotation-parent-same-layer',
    repairable: false,
    build: (p) =>
      // Only the free annotation violates the invariant (the typed one becomes the `owner-not-allowed` pending item).
      annotations(p, (a) =>
        a.id === 'AOC'
          ? { ...a, parentAnnotationId: 'AOH', type: null, values: null }
          : a,
      ),
  },
  {
    name: 'annotation-cycle',
    code: 'annotation-cycle',
    repairable: false,
    build: (p) =>
      annotations(p, (a) => (a.id === 'AB' ? { ...a, parentAnnotationId: 'AOC' } : a)),
  },
  {
    name: 'empty-key',
    code: 'empty-key',
    repairable: false,
    build: (p) =>
      annotations(p, (a) =>
        a.id === 'AU'
          ? {
              ...a,
              entries: a.entries.map((e) => (e.id === 'EA' ? { ...e, key: '' } : e)),
            }
          : a,
      ),
  },
  {
    name: 'duplicate-key',
    code: 'duplicate-key',
    repairable: false,
    build: (p) =>
      annotations(p, (a) =>
        a.id === 'AU'
          ? {
              ...a,
              entries: a.entries.map((e) => (e.id === 'EA' ? { ...e, key: 'name' } : e)),
            }
          : a,
      ),
  },
  {
    name: 'duplicate-spec-file',
    code: 'duplicate-spec-file',
    repairable: false,
    build: (p) => {
      const file = p.specializations[0]?.file ?? '';
      return {
        ...p,
        specializations: p.specializations.map((s, i) => (i === 1 ? { ...s, file } : s)),
      };
    },
  },
  {
    name: 'duplicate-row-id',
    code: 'duplicate-row-id',
    repairable: false,
    build: (p) =>
      annotations(p, (a) => {
        const rows = a.values?.atributos;
        if (a.id !== 'AC' || !Array.isArray(rows) || !a.values) return a;
        return { ...a, values: { ...a.values, atributos: [...rows, rows[0] ?? null] } };
      }),
  },
];

export function buildInvalidCase(c: InvalidCase): Project {
  return c.build(cadastroProject());
}

export function readInvalidFixture(name: string): string {
  return readFileSync(join(INVALID_FIXTURES_DIR, `${name}.json`), 'utf8');
}
