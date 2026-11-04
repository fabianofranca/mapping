import type { JSX } from 'preact';
import { t } from '../i18n';
import { Tooltip } from './controls/Tooltip';
import { Icon } from './icons';

/**
 * Marcador de "este tipo é um container": um ícone discreto, sem pílula. A palavra vem na
 * dica (hover e foco) e no nome acessível (`role="img"`).
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
