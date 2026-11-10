import { t } from '../i18n';
import { perspectiveContentCount, type Perspective, type Project } from '../model';

/** "1 container" ou "N containers". */
export const containersCountText = (count: number): string =>
  count === 1
    ? t('perspective.count.containersOne')
    : t('perspective.count.containers', { count });

/** "1 marcação" ou "N marcações". */
export const markingsCountText = (count: number): string =>
  count === 1
    ? t('perspective.count.markingsOne')
    : t('perspective.count.markings', { count });

/** "N containers · N marcações" de uma perspectiva (ou "vazia"). */
export function perspectiveContentText(p: Project, perspective: Perspective): string {
  const { containers, markings } = perspectiveContentCount(p, perspective);
  const parts: string[] = [];
  if (containers > 0) parts.push(containersCountText(containers));
  if (markings > 0) parts.push(markingsCountText(markings));
  return parts.length === 0 ? t('perspective.count.empty') : parts.join(' · ');
}
