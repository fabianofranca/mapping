import { t } from '../i18n';
import {
  projectIndex,
  type JsonValue,
  type MigrationLoss,
  type MigrationStepReport,
  type Project,
  type SpecMigrationStep,
  type SpecUpdateImpact,
} from '../model';
import { markingPath } from './labels';
import { annotationDisplayName } from './typedText';

/** Perdas listadas por passo; o resto vira "+N". */
const MAX_LOSSES_PER_STEP = 5;
const MAX_VALUE_CHARS = 40;

/** Rótulo legível de um passo declarado da migração. */
export function stepLabel(step: SpecMigrationStep): string {
  switch (step.op) {
    case 'rename-type':
      return t('spec.impact.op.renameType', { from: step.from, to: step.to });
    case 'remove-type':
      return t(
        step.mode === 'convert'
          ? 'spec.impact.op.removeTypeConvert'
          : 'spec.impact.op.removeTypeDelete',
        { type: step.type },
      );
    case 'rename-field':
      return t('spec.impact.op.renameField', {
        type: step.type,
        from: step.from,
        to: step.to,
      });
    case 'remove-field':
      return t('spec.impact.op.removeField', { type: step.type, field: step.field });
    case 'map-values':
      return t('spec.impact.op.mapValues', {
        type: step.type,
        field: step.field,
        pairs: Object.entries(step.values)
          .map(([a, b]) => `${a} → ${b}`)
          .join(', '),
      });
    case 'fill-field':
      return t('spec.impact.op.fillField', {
        type: step.type,
        field: step.field,
        value: String(step.default),
      });
  }
}

function shortValue(value: JsonValue | undefined): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

/** Contagens de um passo ("3 anotações, 5 valores"), ou o aviso de que nada muda. */
function stepCounts(report: MigrationStepReport): string {
  const parts: string[] = [];
  if (report.annotations > 0)
    parts.push(t('spec.impact.annotations', { count: report.annotations }));
  if (report.values > 0) parts.push(t('spec.impact.values', { count: report.values }));
  if (report.converted > 0)
    parts.push(t('spec.impact.converted', { count: report.converted }));
  if (report.deleted > 0) parts.push(t('spec.impact.deleted', { count: report.deleted }));
  if (report.refs > 0) parts.push(t('spec.impact.refs', { count: report.refs }));
  return parts.length > 0 ? parts.join(', ') : t('spec.impact.nothing');
}

/** "Marcação › Anotação" da anotação da perda, com os rótulos que o resto da interface usa. */
function lossTarget(project: Project, loss: MigrationLoss): string {
  const index = projectIndex(project);
  const annotation = index.annotations.get(loss.annotationId);
  const marking = index.markings.get(loss.markingId);
  const name = annotation
    ? annotationDisplayName(project, annotation)
    : loss.annotationId;
  return marking
    ? t('spec.impact.lossTarget', { marking: markingPath(project, marking), name })
    : name;
}

function lossText(project: Project, loss: MigrationLoss): string {
  const target = lossTarget(project, loss);
  if (loss.reason === 'removed-type') {
    return t('spec.impact.lossDeleted', { target });
  }
  return t(
    loss.reason === 'removed-field'
      ? 'spec.impact.lossRemovedField'
      : loss.reason === 'replaced-value'
        ? 'spec.impact.lossReplaced'
        : 'spec.impact.lossOverwritten',
    { target, field: loss.field ?? '', value: shortValue(loss.value) },
  );
}

/**
 * Impacto de uma atualização de especialização: aditiva (uma linha), com migração (passos,
 * contagens, perdas em destaque e pendências) ou recusada (o que falta migrar).
 */
export function UpdateImpact({
  project,
  impact,
  current,
  next,
}: {
  readonly project: Project;
  readonly impact: SpecUpdateImpact;
  readonly current: number;
  readonly next: number;
}) {
  const lostAnnotations = impact.losses.filter((l) => l.reason === 'removed-type').length;
  const lostValues = impact.losses.length - lostAnnotations;
  const additive = impact.additive && impact.steps.length === 0;
  return (
    <>
      <p>{t('spec.updateMessage', { current, next })}</p>
      {additive && <p>{t('spec.impact.additive')}</p>}
      {impact.addedLayers.length > 0 && (
        <p>
          {t('spec.updateAdded', {
            names: impact.addedLayers.map((l) => l.name).join(', '),
          })}
        </p>
      )}
      {impact.freedLayers.length > 0 && (
        <p>
          {t('spec.updateFreed', {
            names: impact.freedLayers.map((l) => l.name).join(', '),
          })}
        </p>
      )}
      {!additive &&
        impact.addedLayers.length === 0 &&
        impact.freedLayers.length === 0 && <p>{t('spec.updateNoLayerChange')}</p>}
      {impact.refused && (
        <div class="notice notice-error" role="alert">
          <p>{t('spec.impact.refused')}</p>
          <ul>
            {impact.missingMigrations.map((m, i) => (
              <li key={i} class="wrap-anywhere">
                {m.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!impact.refused && impact.steps.length > 0 && (
        <>
          <p>
            <strong>{t('spec.impact.stepsTitle')}</strong>
          </p>
          <ol class="spec-impact-steps">
            {impact.steps.map((report) => (
              <li key={`${report.from}-${report.index}`}>
                <div>{stepLabel(report.step)}</div>
                <small class="muted">{stepCounts(report)}</small>
                {report.losses.length > 0 && (
                  <ul>
                    {report.losses.slice(0, MAX_LOSSES_PER_STEP).map((loss, i) => (
                      <li key={i} class="wrap-anywhere">
                        {lossText(project, loss)}
                      </li>
                    ))}
                    {report.losses.length > MAX_LOSSES_PER_STEP && (
                      <li>
                        {t('spec.impact.lossMore', {
                          count: report.losses.length - MAX_LOSSES_PER_STEP,
                        })}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {!impact.refused && impact.losses.length > 0 && (
        <p class="notice notice-error" role="alert">
          {t('spec.impact.lossTotal', {
            values: lostValues,
            annotations: lostAnnotations,
          })}
        </p>
      )}
      {!impact.refused && impact.pending.length > 0 && (
        <p>{t('spec.impact.pending', { count: impact.pending.length })}</p>
      )}
      {!additive &&
        !impact.refused &&
        impact.losses.length === 0 &&
        impact.steps.length === 0 && <p class="muted">{t('spec.updateKeep')}</p>}
      {impact.brokenRefs > 0 && (
        <p class="notice notice-error">
          {t('spec.updateBroken', { count: impact.brokenRefs })}
        </p>
      )}
    </>
  );
}
