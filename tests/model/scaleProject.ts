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
  /** Total of markings; a multiple of 25 (one block). The scale tests use 1,250 and 5,000. */
  readonly markings?: number;
}

/** Markings per block: 4 on the canvas (2 nested, 1 floating, 1 loose) and 21 in the container. */
const BLOCK = 25;
/** Arrows per block: 0.4 per marking. */
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

/** One block: ids and markings of the canvas and of the container, in the `CELL × CELL` square at `(bx, by)`. */
function block(b: number, bx: number, by: number) {
  const g = `B${b}-g`;
  const g2 = `B${b}-g2`;
  const container = `K${b}`;
  const canvas = [
    // Canvas marking that surrounds the second one, which surrounds the container (2 levels, container with a parent).
    marking(g, null, rect(bx, by, 1200, 1200), { name: `Group ${b}` }),
    marking(g2, null, rect(bx + 50, by + 50, 1100, 1100), { parentId: g }),
    marking(`B${b}-f`, null, rect(bx + 1250, by, 100, 100), { floating: true }),
    marking(`B${b}-h`, null, rect(bx + 1250, by + 200, 100, 100), { name: `Loose ${b}` }),
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
  // External source (Figma) on one marking per block and on one container out of three: `find_by_source` finds them.
  inside.push(
    marking(`B${b}-s`, container, rect(910, 910, 60, 60), {
      source: { system: 'figma', id: `N${b}`, url: null },
    }),
  );
  const placed: ProjectContainer = {
    id: container,
    name: b % 5 === 0 ? `Screen ${b}` : null,
    file: b % 2 === 0 ? `images/scale-${b}.jpg` : null,
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
    // The last one of each block goes to the next block (a perspective that does not show both hides it).
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
      name: k % 5 === 0 ? `Flow ${b}-${k}` : null,
      locked: false,
    };
  });
}

/**
 * Scale project (#881), valid and already settled, with `markings` markings (a multiple of 25): per
 * block of 25, a canvas marking that surrounds another, which surrounds a container (container with a parent);
 * one floating and one loose; 21 markings in the container (4 groups of a parent and 4 children, plus one loose); 10
 * arrows (0.4 per marking); annotations in two layers (half typed, with references, like
 * `buildLargeTypedProject`) and 2 "For everyone" perspectives that split the roots (even and
 * odd blocks). It is assembled by hand and settled at once: no per-marking operation.
 */
export function buildScaleProject({
  markings = 1250,
}: ScaleProjectOptions = {}): Project {
  if (!Number.isInteger(markings) || markings <= 0 || markings % BLOCK !== 0) {
    throw new RangeError(`markings must be a multiple of ${BLOCK}: ${markings}`);
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
    // Block roots: the outer enclosure, the floating one and the loose one; the perspective changes their position.
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
      name: `Route ${i}`,
      parentAnnotationId: null,
      parentRole: null,
      type: null,
      values: null,
      entries: [{ id: `RA${i}-e1`, key: 'kind', value: 'flow' }],
    });
  });

  const perspectives: Perspective[] = [
    { id: 'PV1', name: 'Even', hiddenLayers: [], items: items[0] },
    { id: 'PV2', name: 'Odd', hiddenLayers: ['LM'], items: items[1] },
  ];
  return { ...spec, containers, markings: all, arrows, annotations, perspectives };
}

/** The instant `n` minutes after 2026-11-01T10:00Z. */
const minute = (n: number): string =>
  new Date(Date.parse('2026-11-01T10:00:00.000Z') + n * 60_000).toISOString();

/**
 * Threads of the scale project (#881), one per block of 25 markings, all open and waiting for the agent
 * (the last message is from a person): on the even ones, anchored to the loose marking of the container; on the odd ones, on a
 * point of the container. It is what `list_threads` reads from the `comments/` folder.
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
      author: { kind: 'human', name: 'Marina Alves', email: 'marina@example.com' },
      // pt-BR kept: shared fixture data asserted by tests/scale/mcp (mcpGrowth expects 'Dúvida')
      text: `Dúvida ${b}: esta área está certa?`,
      at: minute(b),
      messageId: `T${b}-m1`,
      proposal: null,
    }),
  );
}
