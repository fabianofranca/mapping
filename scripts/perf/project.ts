// Project for `npm run perf:canvas`: the same recipe as the "whole project in view" scenario of the tests
// (tests/model/scenarioProject.ts), with background containers without a file, so the app opens the folder without
// images. Bundled by esbuild into `scripts/perf/canvas.mjs`.
import { serialize, type Project } from '../../src/model';
import { material3Files, scenarioProject } from '../../tests/model/scenarioProject';

export interface PerfOptions {
  /** Number of arrows (default: half the markings). */
  readonly arrows?: number;
  /** Adds the `M3_SCREEN` screen to each container. */
  readonly components?: boolean;
}

export function perfProject(size: number, options: PerfOptions = {}): Project {
  return scenarioProject({ size, backgrounds: true, ...options });
}

/** The project's `mapping.json`, with the revision 1 that the app expects from an already saved file. */
export function perfMappingJson(size: number, options: PerfOptions = {}): string {
  return serialize({ ...perfProject(size, options), revision: 1 });
}

/** Material 3 library files (`specs/material3/...`), in base64, to be written to the folder. */
export function perfLibraryFiles(): { path: string; base64: string }[] {
  return material3Files().map((f) => ({
    path: f.path,
    base64: Buffer.from(f.bytes).toString('base64'),
  }));
}
