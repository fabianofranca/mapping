// Texts the viewer hands over with the drawing: the missing-type box and the warnings.
// The `ScreenRenderer` has no text of its own; the viewer passes its own (without the app's `t()`).
import type { ScreenRendererLabels } from '../src/canvas/components/screenRenderer';
import type { RenderWarning } from '../src/canvas/components/renderWarnings';

function drawWarning({ code, params }: RenderWarning): string {
  switch (code) {
    case 'empty-group-shadow':
      return 'shadow on an empty group was ignored';
    case 'inner-shadow':
      return 'inner shadow does not exist on the 2D canvas: ignored';
    case 'extra-shadows':
      return 'only the first shadow applies to this node: the list and the spread were ignored';
    case 'unknown-node':
      return `node not drawn (${params?.type ?? ''}): box only`;
    case 'image-without-pixels':
      return 'image without pixels drawn as a placeholder';
    case 'image-decode-failed':
      return 'an embedded image could not be decoded';
    case 'stroke-extra-paints':
      return 'only the first fill of the stroke was used';
    case 'stroke-align-centered':
      return 'inside/outside stroke on a path or line was centered';
    case 'stroke-radial-first-color':
      return 'stroke with a radial gradient drawn with the first color';
    case 'stroke-image-gray':
      return 'stroke with an image drawn in gray';
  }
}

export const VIEWER_LABELS: ScreenRendererLabels = {
  typeWithoutComponent: (typeName) => `${typeName}\n(no component)`,
  unknownType: (typeId) => `${typeId}\n(unknown type)`,
  warningTypeWithoutComponent: 'type has no component in the specialization',
  warningUnknownType: 'type does not exist in the specialization',
  drawWarning,
};
