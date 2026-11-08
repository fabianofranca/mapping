import {
  openThread,
  type Annotation,
  type Arrow,
  type ArrowStyle,
  type Marking,
  type Perspective,
  type Project,
  type ProjectContainer,
  type Rect,
  type Thread,
} from '../../src/model';
import { typedAnnotations } from './largeTypedProject';
import { specProject } from './specFixtures';

interface ScaleProjectOptions {
  /** Total de marcações; múltiplo de 25 (um bloco). Os testes de escala usam 1.250 e 5.000. */
  readonly markings?: number;
}

/** Marcações por bloco: 4 do canvas (2 aninhadas, 1 flutuante, 1 solta) e 21 no container. */
const BLOCK = 25;
/** Setas por bloco: 0,4 por marcação. */
const ARROWS_PER_BLOCK = 10;
const CELL = 1500;
const STYLES: readonly ArrowStyle[] = ['straight', 'curve', 'elbow'];

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

function marking(
  id: string,
  containerId: string | null,
  r: Rect,
  extra: Partial<Marking> = {},
): Marking {
  return {
    id,
    containerId,
    parentId: null,
    name: null,
    rect: r,
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
    ...extra,
  };
}

/** Um bloco: ids e marcações do canvas e do container, no quadrado `CELL × CELL` de `(bx, by)`. */
function block(b: number, bx: number, by: number) {
  const g = `B${b}-g`;
  const g2 = `B${b}-g2`;
  const container = `K${b}`;
  const canvas = [
    // Marcação do canvas que cerca a segunda, que cerca o container (2 níveis, container com pai).
    marking(g, null, rect(bx, by, 1200, 1200), { name: `Grupo ${b}` }),
    marking(g2, null, rect(bx + 50, by + 50, 1100, 1100), { parentId: g }),
    marking(`B${b}-f`, null, rect(bx + 1250, by, 100, 100), { floating: true }),
    marking(`B${b}-h`, null, rect(bx + 1250, by + 200, 100, 100), { name: `Solta ${b}` }),
  ];
  const inside: Marking[] = [];
  for (let group = 0; group < 4; group++) {
    const gx = 50 + (group % 2) * 450;
    const gy = 50 + Math.floor(group / 2) * 450;
    const parentId = `B${b}-${group}`;
    inside.push(
      marking(parentId, container, rect(gx, gy, 400, 400), {
        name: `Item ${b}-${group}`,
      }),
    );
    for (let c = 0; c < 4; c++) {
      inside.push(
        marking(
          `${parentId}-${c}`,
          container,
          rect(gx + 10 + (c % 2) * 190, gy + 10 + Math.floor(c / 2) * 190, 180, 180),
          { parentId, needsReview: c === 3 && b % 7 === 0 },
        ),
      );
    }
  }
  // Origem externa (Figma) numa marcação por bloco e num container a cada três: `find_by_source` as acha.
  inside.push(
    marking(`B${b}-s`, container, rect(910, 910, 60, 60), {
      source: { system: 'figma', id: `N${b}`, url: null },
    }),
  );
  const placed: ProjectContainer = {
    id: container,
    name: b % 5 === 0 ? `Tela ${b}` : null,
    file: b % 2 === 0 ? `images/escala-${b}.jpg` : null,
    width: 1000,
    height: 1000,
    placement: { x: bx + 100, y: by + 100, scale: 1 },
    parentId: g2,
    markingColor: null,
    locked: false,
    source: b % 3 === 0 ? { system: 'figma', id: `F${b}`, url: null } : null,
    background: b % 2 === 0 ? null : '#FFFFFF',
  };
  return { canvas, inside, container: placed };
}

function arrowsOf(b: number, blocks: number, inside: readonly Marking[]): Arrow[] {
  return Array.from({ length: ARROWS_PER_BLOCK }, (_, k) => {
    const from = inside[(k * 2) % inside.length]!;
    // A última de cada bloco vai para o bloco seguinte (a perspectiva que não mostra os dois a esconde).
    const crossing = k === ARROWS_PER_BLOCK - 1 && b < blocks - 1;
    const to = crossing
      ? `B${b + 1}-s`
      : inside[(k * 2 + 3 + (k % 3)) % inside.length]!.id;
    return {
      id: `R${b}-${k}`,
      from: from.id,
      to,
      fromSide: k % 2 === 0 ? 'right' : null,
      toSide: k % 2 === 0 ? 'left' : null,
      points: [],
      style: STYLES[k % STYLES.length]!,
      name: k % 5 === 0 ? `Fluxo ${b}-${k}` : null,
      locked: false,
    };
  });
}

/**
 * Projeto de escala (#881), válido e já assentado, com `markings` marcações (múltiplo de 25): por
 * bloco de 25, uma marcação do canvas que cerca outra, que cerca um container (container com pai);
 * uma flutuante e uma solta; 21 marcações no container (4 grupos de mãe e 4 filhas, mais uma solta); 10
 * setas (0,4 por marcação); anotações em duas camadas (metade tipadas, com referências, como o
 * `buildLargeTypedProject`) e 2 perspectivas "Para todos" que dividem as raízes (blocos pares e
 * ímpares). É montado à mão e assentado de uma vez: nenhuma operação por marcação.
 */
export function buildScaleProject({
  markings = 1250,
}: ScaleProjectOptions = {}): Project {
  if (!Number.isInteger(markings) || markings <= 0 || markings % BLOCK !== 0) {
    throw new RangeError(`markings deve ser um múltiplo de ${BLOCK}: ${markings}`);
  }
  const blocks = markings / BLOCK;
  const cols = Math.ceil(Math.sqrt(blocks));
  const spec = specProject();

  const containers: ProjectContainer[] = [];
  const all: Marking[] = [];
  const arrows: Arrow[] = [];
  const items: [
    { root: string; x: number; y: number }[],
    { root: string; x: number; y: number }[],
  ] = [[], []];
  for (let b = 0; b < blocks; b++) {
    const bx = (b % cols) * CELL;
    const by = Math.floor(b / cols) * CELL;
    const { canvas, inside, container } = block(b, bx, by);
    containers.push(container);
    all.push(...canvas, ...inside);
    arrows.push(...arrowsOf(b, blocks, inside));
    // Raízes do bloco: a cerca de fora, a flutuante e a solta; a perspectiva muda a posição delas.
    const view = items[b % 2]!;
    const shift = b % 2 === 0 ? 50 : -50;
    for (const m of [canvas[0]!, canvas[2]!, canvas[3]!]) {
      view.push({ root: m.id, x: m.rect.x + shift, y: m.rect.y + shift });
    }
  }

  const annotations: Annotation[] = typedAnnotations(spec, all);
  arrows.forEach((a, i) => {
    if (i % 5 !== 0) return;
    annotations.push({
      id: `RA${i}`,
      markingId: a.id,
      layerId: 'L1',
      name: `Rota ${i}`,
      parentAnnotationId: null,
      parentRole: null,
      type: null,
      values: null,
      entries: [{ id: `RA${i}-e1`, key: 'tipo', value: 'fluxo' }],
    });
  });

  const perspectives: Perspective[] = [
    { id: 'PV1', name: 'Pares', hiddenLayers: [], items: items[0] },
    { id: 'PV2', name: 'Ímpares', hiddenLayers: ['LM'], items: items[1] },
  ];
  return { ...spec, containers, markings: all, arrows, annotations, perspectives };
}

/** Instante `n` minutos depois de 2026-11-01T10:00Z. */
const minute = (n: number): string =>
  new Date(Date.parse('2026-11-01T10:00:00.000Z') + n * 60_000).toISOString();

/**
 * Conversas do projeto de escala (#881), uma por bloco de 25 marcações, todas abertas e esperando o agente
 * (a última mensagem é de pessoa): nas pares, ancorada na marcação solta do container; nas ímpares, num
 * ponto do container. É o que `list_threads` lê da pasta `comments/`.
 */
export function buildScaleThreads(p: Project): Thread[] {
  const blocks = p.markings.length / BLOCK;
  return Array.from({ length: blocks }, (_, b) =>
    openThread({
      id: `T${b}`,
      anchor:
        b % 2 === 0
          ? { kind: 'marking', id: `B${b}-s` }
          : { kind: 'point', containerId: `K${b}`, x: 100, y: 100 },
      author: { kind: 'human', name: 'Marina Alves', email: 'marina@exemplo.com' },
      text: `Dúvida ${b}: esta área está certa?`,
      at: minute(b),
      messageId: `T${b}-m1`,
      proposal: null,
    }),
  );
}
