import { t } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import type {
  RenderWarning,
  RenderWarningCode,
} from '../../canvas/components/renderWarnings';

/** The text key of each drawing warning (a `Record`: a new code without text breaks the typecheck). */
const KEYS: Record<RenderWarningCode, TranslationKey> = {
  'empty-group-shadow': 'catalog.drawWarning.empty-group-shadow',
  'inner-shadow': 'catalog.drawWarning.inner-shadow',
  'extra-shadows': 'catalog.drawWarning.extra-shadows',
  'unknown-node': 'catalog.drawWarning.unknown-node',
  'image-without-pixels': 'catalog.drawWarning.image-without-pixels',
  'image-decode-failed': 'catalog.drawWarning.image-decode-failed',
  'stroke-extra-paints': 'catalog.drawWarning.stroke-extra-paints',
  'stroke-align-centered': 'catalog.drawWarning.stroke-align-centered',
  'stroke-radial-first-color': 'catalog.drawWarning.stroke-radial-first-color',
  'stroke-image-gray': 'catalog.drawWarning.stroke-image-gray',
};

/** The text of a drawing warning (`renderScene`) in the app's language. */
export function drawWarningText({ code, params }: RenderWarning): string {
  return t(KEYS[code], params ? { ...params } : undefined);
}
