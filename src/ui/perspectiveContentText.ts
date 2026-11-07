import { t } from '../i18n';
import { perspectiveContentCount, type Perspective, type Project } from '../model';

/** "N containers · N marcações" de uma perspectiva (ou "vazia"). */
export function perspectiveContentText(p: Project, perspective: Perspective): string {
  const { containers, markings } = perspectiveContentCount(p, perspective);
  const parts: string[] = [];
  if (containers > 0)
    parts.push(t('perspective.count.containers', { count: containers }));
  if (markings > 0) parts.push(t('perspective.count.markings', { count: markings }));
  return parts.length === 0 ? t('perspective.count.empty') : parts.join(' · ');
}
