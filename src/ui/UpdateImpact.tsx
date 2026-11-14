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
import { specIssueText } from './specIssueText';
import { annotationDisplayName } from './typedText';

/** Losses listed per step; the rest becomes "+N". */
const MAX_LOSSES_PER_STEP = 5;
const MAX_VALUE_CHARS = 40;

type RoleStep = Extract<
  SpecMigrationStep,
  { op: 'rename-role' | 'remove-role' | 'set-role' }
>;

const isRoleStep = (step: SpecMigrationStep): step is RoleStep =>
  step.op === 'rename-role' || step.op === 'remove-role' || step.op === 'set-role';

/** Label of the link's role steps. */
function roleStepLabel(step: RoleStep): string {
  switch (step.op) {
    case 'rename-role':
      return t('spec.impact.op.renameRole', {
        type: step.type,
        from: step.from,
        to: step.to,
      });
    case 'remove-role':
      return t(
        step.mode === 'unlink'
          ? 'spec.impact.op.removeRoleUnlink'
          : 'spec.impact.op.removeRoleClear',
        { type: step.type, role: step.role },
      );
    case 'set-role':
      return step.childType === undefined
        ? t('spec.impact.op.setRole', { type: step.type, role: step.role })
        : t('spec.impact.op.setRoleOf', {
            type: step.type,
            role: step.role,
            child: step.childType,
          });
  }
}

/** Readable label of a declared migration step. */
export function stepLabel(step: SpecMigrationStep): string {
  if (isRoleStep(step)) return roleStepLabel(step);
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

/** Counts of a step ("3 annotations, 5 values"), or the notice that nothing changes. */
function stepCounts(report: MigrationStepReport): string {
  const parts: string[] = [];
  if (report.annotations > 0)
    parts.push(t('spec.impact.annotations', { count: report.annotations }));
  if (report.values > 0) parts.push(t('spec.impact.values', { count: report.values }));
  if (report.converted > 0)
    parts.push(t('spec.impact.converted', { count: report.converted }));
  if (report.deleted > 0) parts.push(t('spec.impact.deleted', { count: report.deleted }));
  if (report.refs > 0) parts.push(t('spec.impact.refs', { count: report.refs }));
  if (report.unlinked > 0)
    parts.push(t('spec.impact.unlinked', { count: report.unlinked }));
  return parts.length > 0 ? parts.join(', ') : t('spec.impact.nothing');
}

/** "Marking › Annotation" of the loss's annotation, with the labels the rest of the interface uses. */
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
  if (loss.reason === 'cleared-role' || loss.reason === 'unlinked') {
    return t(
      loss.reason === 'unlinked'
        ? 'spec.impact.lossUnlinked'
        : 'spec.impact.lossClearedRole',
      { target, role: loss.role ?? '' },
    );
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
 * Impact of a specialization update: additive (one line), with migration (steps,
 * counts, highlighted losses and pending items) or refused (what is left to migrate).
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
  const lostLinks = impact.losses.filter((l) => l.reason === 'unlinked').length;
  const lostValues = impact.losses.length - lostAnnotations - lostLinks;
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
                {specIssueText({
                  code: m.messageCode,
                  params: m.messageParams,
                  message: m.message,
                })}
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
          {t(lostLinks > 0 ? 'spec.impact.lossTotalLinks' : 'spec.impact.lossTotal', {
            values: lostValues,
            annotations: lostAnnotations,
            links: lostLinks,
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
