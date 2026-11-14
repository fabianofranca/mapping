import { vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { sampleProject } from '../model/fixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { createHarness, type Harness } from './harness';

// Test project of the palette, the Details and the Tidy up: the photos of the `sampleProject` (I1, I2)
// with the Material 3 library actually applied (the catalog comes from the session).

export interface LibraryHarness extends Harness {
  /** Fake canvas controller: `viewportCenter` is whatever the test chooses. */
  readonly canvas: {
    viewportCenter: ReturnType<typeof vi.fn>;
    centerSelection: ReturnType<typeof vi.fn>;
    revealSelection: ReturnType<typeof vi.fn>;
  };
}

interface Options {
  /** Changes the package before applying (e.g. removing a component). */
  readonly mutate?: (files: Map<string, string | Blob>) => void;
  readonly readOnly?: boolean;
  /** Applies the library (default: yes). */
  readonly apply?: boolean;
}

export async function libraryHarness(options: Options = {}): Promise<LibraryHarness> {
  const harness = createHarness(sampleProject());
  if (options.apply !== false) {
    const files = material3Package();
    options.mutate?.(files);
    const result = harness.actions.applySpecialization(material3Spec(), files);
    if (!result.ok) throw new Error(`applying the library failed: ${result.error}`);
    await harness.context.session.components.whenIdle();
  }
  if (options.readOnly) harness.store.load(harness.project(), { readOnly: true });

  // View center: inside I1 by default (its placement on the canvas).
  const image = harness.project().containers[0];
  const canvas = {
    viewportCenter: vi.fn(() => ({
      x: (image?.placement.x ?? 0) + 200,
      y: (image?.placement.y ?? 0) + 150,
    })),
    centerSelection: vi.fn(),
    revealSelection: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  return Object.assign(harness, { canvas });
}
