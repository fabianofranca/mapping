// Large project of the "whole project in view" scenario (stage canvas-performance, CD1): used by the
// canvas tests (`tests/canvas/wholeProjectScenario.ts`), by the growth test (`tests/scale/app/canvasGrowth.scale.ts`)
// and by `npm run perf:canvas` (`scripts/perf/project.ts`). Node and model only: no DOM.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  addComponentMarking,
  applySpecialization,
  createArrow,
  loadSpecComponents,
  parseSpecText,
  type ComponentCatalog,
  type Project,
  type Spec,
} from '../../src/model';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { M3_SCREEN } from '../../viewer/samples/samplesMaterial3';
import { buildLargeProject } from './largeProject';

// Relative to the repository root (the cwd of vitest and of `npm run perf:canvas`): esbuild bundles this file as ESM.
const MATERIAL3_DIR = join(process.cwd(), 'tests/fixtures/material3');
const MATERIAL3_SPEC_FILE = 'specs/material3/material3.spec.json';
/** Where the components screen goes in each container (below the recipe markings, which take up to 90% of the height). */
const SCREEN_ORIGIN = { x: 20, y: 3020 };
const CONTAINER_HEIGHT_WITH_COMPONENTS = 4000;

export interface ScenarioOptions {
  /** Number of markings of the recipe (a multiple of `perImage`). */
  readonly size: number;
  /** Markings per container; default 100 (above that the recipe generates markings of width 0). */
  readonly perImage?: number;
  /** Number of arrows; default half of the markings. */
  readonly arrows?: number;
  /** Adds, in each container, the 21 instances of the `M3_SCREEN` screen (Material 3 library). */
  readonly components?: boolean;
  /** Containers with only a background color, no file (`perf:canvas` opens the folder without images). */
  readonly backgrounds?: boolean;
}

function material3Spec(): Spec {
  const parsed = parseSpecText(
    readFileSync(join(MATERIAL3_DIR, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('invalid material3.spec.json');
  return parsed.spec;
}

/** Material 3 component catalog, read from disk as the session reads from the project folder. */
export function material3Catalog(): ComponentCatalog {
  const loaded = loadSpecComponents(material3Spec(), MATERIAL3_SPEC_FILE, 1, (path) => {
    try {
      return readFileSync(
        join(MATERIAL3_DIR, path.slice('specs/material3/'.length)),
        'utf8',
      );
    } catch {
      return undefined;
    }
  });
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([['material3', loaded]]);
}

/** The files of the Material 3 library, with the path in the project folder (`specs/material3/...`). */
export function material3Files(): { path: string; bytes: Uint8Array }[] {
  const list = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? list(join(dir, e.name))
        : [relative(MATERIAL3_DIR, join(dir, e.name)).split('\\').join('/')],
    );
  return list(MATERIAL3_DIR)
    .sort()
    .map((path) => ({
      path: `specs/material3/${path}`,
      bytes: new Uint8Array(readFileSync(join(MATERIAL3_DIR, path))),
    }));
}

function withArrows(base: Project, count: number): Project {
  const roots = base.markings.filter((m) => m.parentId === null);
  let project = base;
  for (let i = 0; i < count; i++) {
    const from = roots[i % roots.length];
    const to = roots[(i + 3) % roots.length];
    if (from && to && from.id !== to.id) {
      project = createArrow(project, { id: `R${i}`, from: from.id, to: to.id });
    }
  }
  return project;
}

function withComponents(base: Project): Project {
  const catalog = material3Catalog();
  let n = 0;
  let project = applySpecialization(
    {
      ...base,
      containers: base.containers.map((c) => ({
        ...c,
        height: CONTAINER_HEIGHT_WITH_COMPONENTS,
      })),
    },
    material3Spec(),
    { newId: () => `S${++n}`, packageSpecName: 'material3.spec.json' },
  );
  for (const container of base.containers) {
    const id = (instanceId: string): string => `${container.id}-${instanceId}`;
    for (const instance of M3_SCREEN.instances) {
      const values = Object.fromEntries(
        Object.entries(instance.values).flatMap(([key, value]) =>
          typeof value === 'string' || typeof value === 'number' ? [[key, value]] : [],
        ),
      );
      project = addComponentMarking(
        project,
        catalog,
        {
          markingId: id(instance.id),
          annotationId: `A_${id(instance.id)}`,
          containerId: container.id,
          parentId: instance.parentId === undefined ? null : id(instance.parentId),
          specId: 'material3',
          typeId: instance.typeId,
          rect: {
            ...instance.box,
            x: instance.box.x + SCREEN_ORIGIN.x,
            y: instance.box.y + SCREEN_ORIGIN.y,
          },
          values,
        },
        approximateMeasurer,
      );
    }
  }
  return project;
}

/** Large project with `size` markings, `arrows` arrows between neighboring markings and, if requested, components. */
export function scenarioProject(options: ScenarioOptions): Project {
  const { size, perImage = 100, components = false, backgrounds = false } = options;
  const arrows = options.arrows ?? size / 2;
  const built = buildLargeProject({
    images: size / perImage,
    markingsPerImage: perImage,
  });
  const base: Project = backgrounds
    ? {
        ...built,
        containers: built.containers.map((c) => ({
          ...c,
          file: null,
          background: '#FFFFFF',
        })),
      }
    : built;
  const withLinks = withArrows(base, arrows);
  return components ? withComponents(withLinks) : withLinks;
}
