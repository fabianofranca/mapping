import { t } from '../i18n';
import { effectiveDirection, type Project } from '../model';
import { imageLabel } from './labels';
import { directionLabel } from './readingDirections';

/**
 * Direção de leitura (somente leitura): a do projeto e os containers que fixam uma direção
 * diferente dela. Só aparece quando o projeto ou algum container está em `rtl`; num projeto
 * todo `ltr` não há nada a mostrar. O projeto vem de quem monta (o Diagnóstico, que lê o projeto real).
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
