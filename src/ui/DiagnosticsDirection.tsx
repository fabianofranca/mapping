import { t } from '../i18n';
import { effectiveDirection, type Project } from '../model';
import { imageLabel } from './labels';
import { directionLabel } from './readingDirections';

/**
 * Reading direction (read-only): the project's and the containers that fix a direction different
 * from it. It only appears when the project or some container is `rtl`; in a project that is all
 * `ltr` there is nothing to show. The project comes from whoever mounts it (Diagnostics, which
 * reads the real project).
 */
export function DiagnosticsDirection({ project }: { readonly project: Project }) {
  const own = effectiveDirection(project, null);
  const differing = project.containers.filter(
    (c) => c.direction != null && c.direction !== own,
  );
  if (own === 'ltr' && !project.containers.some((c) => c.direction === 'rtl')) {
    return null;
  }
  return (
    <section class="diagnostics-modes" aria-label={t('diagnostics.direction')}>
      <h3>{t('diagnostics.direction')}</h3>
      <p class="muted">{t('diagnostics.directionHint')}</p>
      <p>{t('diagnostics.directionProject', { direction: directionLabel(own) })}</p>
      {differing.length > 0 && (
        <ul>
          {differing.map((c) => (
            <li key={c.id}>
              {t('diagnostics.directionContainer', {
                name: imageLabel(c),
                direction: directionLabel(c.direction ?? own),
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
