import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  imageCanvasRect,
  right,
  type Annotation,
  type InvariantCode,
  type Marking,
  type Project,
} from '../../src/model';
import { cadastroProject } from './specFixtures';

// Um `mapping.json` inconsistente por classe de invariante (`tests/fixtures/invalid/`), todos
// gerados a partir do projeto do roteiro 13.9 (`cadastroProject`) com uma alteração à mão.
// `invalidFixtures.test.ts` confere que cada arquivo continua igual ao gerado aqui; para
// regravar: `UPDATE_FIXTURES=1 npx vitest run tests/model/invalidFixtures.test.ts`.

export const INVALID_FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures', 'invalid');

export interface InvalidCase {
  /** Nome do arquivo, sem `.json`. */
  readonly name: string;
  /** Invariante que o arquivo viola. */
  readonly code: InvariantCode;
  /** A app oferece "Reparar e abrir" (todos os problemas têm reparo mecânico). */
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
      imageId: 'I1',
      parentId: null,
      name: 'Extra',
      rect: { x: 100, y: 1500, width: 200, height: 100 },
      needsReview: false,
      locked: false,
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
      inherit: false,
      parentAnnotationId: null,
      type: null,
      values: null,
      entries: [{ id: 'EX', key: 'campo', value: 'texto' }],
      ...annotation,
    },
  ],
});

/** Segunda imagem (500×500); sem `at`, à direita da primeira e sem sobrepor. */
const secondImage = (p: Project, at?: { x: number; y: number }): Project => {
  const first = p.images[0];
  if (!first) throw new Error('fixture sem imagem');
  const firstRect = imageCanvasRect(first, first.placement);
  return {
    ...p,
    images: [
      ...p.images,
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
  // ---- Reparáveis ----
  {
    name: 'duplicate-entry-id',
    code: 'duplicate-entry-id',
    repairable: true,
    // Par com o id `EN`, já usado em outra anotação (AU).
    build: (p) =>
      freeAnnotation(p, { entries: [{ id: 'EN', key: 'campo', value: 'x' }] }),
  },
  {
    name: 'rect-out-of-image',
    code: 'rect-out-of-image',
    repairable: true,
    // Título passa 100 px da borda direita: recorta para 800 → 900 de largura.
    build: (p) =>
      markings(p, (m) =>
        m.id === 'MT' ? { ...m, rect: { ...m.rect, width: 1000 } } : m,
      ),
  },
  {
    name: 'rect-out-of-image-entirely',
    code: 'rect-out-of-image',
    repairable: true,
    // Inteira fora da imagem: recortada fica sem área e é removida.
    build: (p) =>
      extraMarking(p, { name: 'Fora', rect: { x: 1200, y: 100, width: 50, height: 50 } }),
  },
  {
    name: 'missing-image',
    code: 'missing-image',
    repairable: true,
    build: (p) => extraMarking(p, { name: 'Órfã', imageId: 'I9' }),
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
    name: 'hierarchy-cycle',
    code: 'hierarchy-cycle',
    repairable: true,
    // Formulário › Nome › Formulário.
    build: (p) => markings(p, (m) => (m.id === 'MF' ? { ...m, parentId: 'MN' } : m)),
  },
  {
    name: 'images-overlap',
    code: 'images-overlap',
    repairable: true,
    // A segunda imagem começa no mesmo ponto da primeira.
    build: (p) => secondImage(p, p.images[0]?.placement),
  },
  // ---- Recusados (sem reparo mecânico inequívoco) ----
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
        images: q.images.map((i) =>
          i.id === 'I2' ? { ...i, file: 'images/cadastro.png' } : i,
        ),
      };
    },
  },
  {
    name: 'rect-too-small',
    code: 'rect-too-small',
    repairable: false,
    build: (p) =>
      markings(p, (m) => (m.id === 'MT' ? { ...m, rect: { ...m.rect, height: 4 } } : m)),
  },
  {
    name: 'parent-other-image',
    code: 'parent-other-image',
    repairable: false,
    build: (p) =>
      extraMarking(secondImage(p), {
        imageId: 'I2',
        parentId: 'MF',
        rect: { x: 10, y: 10, width: 100, height: 100 },
      }),
  },
  {
    name: 'rect-outside-parent',
    code: 'rect-outside-parent',
    repairable: false,
    // Nome começa antes do Formulário (x = 50).
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
      annotations(p, (a) => (a.id === 'AOC' ? { ...a, parentAnnotationId: 'AOH' } : a)),
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
