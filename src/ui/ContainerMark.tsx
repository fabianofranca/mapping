import type { JSX } from 'preact';
import { t } from '../i18n';
import { Tooltip } from './controls/Tooltip';
import { Icon } from './icons';

/**
 * Marker of "this type is a container": a discreet icon, with no pill. The word comes in the
 * hint (hover and focus) and in the accessible name (`role="img"`).
 */
export function ContainerMark(): JSX.Element {
  const label = t('library.container');
  return (
    <Tooltip label={label}>
      <span class="container-mark" role="img" aria-label={label}>
        <Icon name="containerMark" />
      </span>
    </Tooltip>
  );
}
