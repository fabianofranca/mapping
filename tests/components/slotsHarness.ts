import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { addContainer, parseSpecText, type Spec } from '../../src/model';
import { emptyProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';

// Test project of the named-slots phase (#1080, SL6): one screen with a `bar` (`tests/fixtures/slots`: the
// `navigationIcon` slot takes one `pin`, the `actions` slot takes three) and the library actually applied
// (the catalog comes from the session, as in `libraryHarness`).

const DIR = join(__dirname, '../fixtures/slots');
const FILES = ['slots.spec.json', ...['bar', 'pin', 'rounded-bar'].map(componentPath)];

function componentPath(id: string): string {
  return `components/${id}.json`;
}

/** The `slots` library as the app receives it: path relative to the folder -> text. */
export function slotsPackage(): Map<string, string | Blob> {
  return new Map(FILES.map((path) => [path, readFileSync(join(DIR, path), 'utf8')]));
}

export function slotsSpec(): Spec {
  const parsed = parseSpecText(readFileSync(join(DIR, 'slots.spec.json'), 'utf8'));
  if (!parsed.ok) throw new Error('slots.spec.json invalid');
  return parsed.spec;
}

export interface SlotsHarness extends Harness {
  readonly canvas: {
    viewportCenter: ReturnType<typeof vi.fn>;
    centerSelection: ReturnType<typeof vi.fn>;
    revealSelection: ReturnType<typeof vi.fn>;
  };
}

/** A project with the screen `I1` (1000 × 800) and the `slots` library applied; no markings yet. */
export async function slotsHarness(): Promise<SlotsHarness> {
  const harness = createHarness(
    addContainer(emptyProject(), {
      id: 'I1',
      file: 'images/screen.png',
      width: 1000,
      height: 800,
    }),
  );
  const applied = harness.actions.applySpecialization(slotsSpec(), slotsPackage());
  if (!applied.ok) throw new Error(`applying the library failed: ${applied.error}`);
  await harness.context.session.components.whenIdle();
  const canvas = {
    viewportCenter: vi.fn(() => ({ x: 500, y: 400 })),
    centerSelection: vi.fn(),
    revealSelection: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  return Object.assign(harness, { canvas });
}
