import type { HostFonts } from '../src/model/components/tokens';
import { tokenValue } from '../src/theme/tokens';

/**
 * The fonts the viewer draws with when the host passes none: the theme's `--font-sans` and `--font-mono`
 * stacks. `screenFromFormat` sizes the markings with the same ones, so the boxes it gives fit the drawing.
 */
export function viewerHostFonts(): HostFonts {
  return {
    sans: tokenValue('font-sans', 'light'),
    mono: tokenValue('font-mono', 'light'),
  };
}
