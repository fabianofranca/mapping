// O medidor e o desenho usam a mesma função de família: o mesmo valor para a mesma entrada.
import { describe, expect, it, vi } from 'vitest';

const configs: Array<{ fontFamily?: string }> = [];
vi.mock('konva/lib/shapes/Text', () => ({
  Text: class {
    constructor(config: { fontFamily?: string }) {
      configs.push(config);
    }
    width = () => 10;
    height = () => 10;
    destroy = () => undefined;
  },
}));

import { konvaMeasurer } from '../../../src/canvas/components/konvaMeasurer';
import { canvasFontFamily } from '../../../src/model/components/fontFamily';

describe('konvaMeasurer', () => {
  it.each(['Roboto', 'system-ui', 'system-ui, "Segoe UI", sans-serif', '"Segoe UI, x'])(
    'mede com a família %s igual ao desenho',
    (family) => {
      configs.length = 0;
      konvaMeasurer(
        'Olá',
        {
          family,
          size: 14,
          weight: 400,
          italic: false,
          lineHeight: 20,
          letterSpacing: 0,
        },
        undefined,
      );
      expect(configs[0]?.fontFamily).toBe(canvasFontFamily(family));
    },
  );
});
