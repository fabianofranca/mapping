import { t } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import type {
  RenderWarning,
  RenderWarningCode,
} from '../../canvas/components/renderWarnings';

/** A chave do texto de cada aviso do desenho (um `Record`: código novo sem texto quebra o typecheck). */
const KEYS: Record<RenderWarningCode, TranslationKey> = {
  'empty-group-shadow': 'catalog.drawWarning.empty-group-shadow',
  'inner-shadow': 'catalog.drawWarning.inner-shadow',
  'unknown-node': 'catalog.drawWarning.unknown-node',
  'image-without-pixels': 'catalog.drawWarning.image-without-pixels',
  'image-decode-failed': 'catalog.drawWarning.image-decode-failed',
  'stroke-extra-paints': 'catalog.drawWarning.stroke-extra-paints',
  'stroke-align-centered': 'catalog.drawWarning.stroke-align-centered',
  'stroke-radial-first-color': 'catalog.drawWarning.stroke-radial-first-color',
  'stroke-image-gray': 'catalog.drawWarning.stroke-image-gray',
};

/** O texto de um aviso do desenho (`renderScene`) no idioma da app. */
export function drawWarningText({ code, params }: RenderWarning): string {
  return t(KEYS[code], params ? { ...params } : undefined);
}
