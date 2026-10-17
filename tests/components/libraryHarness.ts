import { vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { sampleProject } from '../model/fixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { createHarness, type Harness } from './harness';

// Projeto de teste da paleta, dos Detalhes e do Arrumar: as fotos do `sampleProject` (I1, I2)
// com a biblioteca do Material 3 aplicada de verdade (o catálogo vem da sessão).

export interface LibraryHarness extends Harness {
  /** Controller falso do canvas: `viewportCenter` é o que o teste escolher. */
  readonly canvas: {
    viewportCenter: ReturnType<typeof vi.fn>;
    centerSelection: ReturnType<typeof vi.fn>;
  };
}

interface Options {
  /** Muda o pacote antes de aplicar (ex.: tirar um componente). */
  readonly mutate?: (files: Map<string, string | Blob>) => void;
  readonly readOnly?: boolean;
  /** Aplica a biblioteca (padrão: sim). */
  readonly apply?: boolean;
}

export async function libraryHarness(options: Options = {}): Promise<LibraryHarness> {
  const harness = createHarness(sampleProject());
  if (options.apply !== false) {
    const files = material3Package();
    options.mutate?.(files);
    const result = harness.actions.applySpecialization(material3Spec(), files);
    if (!result.ok) throw new Error(`aplicar a biblioteca falhou: ${result.error}`);
    await harness.context.session.components.whenIdle();
  }
  if (options.readOnly) harness.store.load(harness.project(), { readOnly: true });

  // Centro da vista: dentro da I1 por padrão (placement dela no canvas).
  const image = harness.project().images[0];
  const canvas = {
    viewportCenter: vi.fn(() => ({
      x: (image?.placement.x ?? 0) + 200,
      y: (image?.placement.y ?? 0) + 150,
    })),
    centerSelection: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  return Object.assign(harness, { canvas });
}
