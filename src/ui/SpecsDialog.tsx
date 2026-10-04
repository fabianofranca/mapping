import { useRef, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  checkSpecApply,
  parseSpecText,
  specializationRemovalImpact,
  specializationUpdateImpact,
  type Project,
  type ProjectSpecialization,
  type Spec,
  type SpecRemovalMode,
} from '../model';
import { Button, Choice } from './controls';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { labelTexts } from './typedText';
import { reportError } from '../utils/report';

const MAX_ERRORS = 8;

interface SpecsDialogProps {
  readonly project: Project;
  readonly readOnly: boolean;
  readonly onClose: () => void;
}

/** Resultado da última operação: sucesso (verde) ou erro (vermelho). */
interface Feedback {
  readonly tone: 'success' | 'error';
  readonly text: string;
}

type Step =
  | { readonly kind: 'info'; readonly title: string; readonly lines: readonly string[] }
  | { readonly kind: 'update'; readonly spec: Spec }
  | { readonly kind: 'remove'; readonly entry: ProjectSpecialization };

/** Sucesso com o texto dado; erro com o código da action. */
function feedback(
  result: { readonly ok: true } | { readonly ok: false; readonly error: string },
  success: string,
): Feedback {
  return result.ok
    ? { tone: 'success', text: success }
    : { tone: 'error', text: t('spec.failed', { code: result.error }) };
}

/** Menu Especializações: aplicar, atualizar versão e remover (docs/history/PLAN-etapas-1-2.md 13.4). */
export function SpecsDialog({ project, readOnly, onClose }: SpecsDialogProps) {
  const { actions } = useEditor();
  const [step, setStep] = useState<Step | null>(null);
  const [message, setMessage] = useState<Feedback | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Especialização esperada ao escolher o arquivo (`null`: qualquer uma). */
  const expected = useRef<string | null>(null);

  const pick = (specId: string | null) => {
    expected.current = specId;
    setMessage(null);
    input.current?.click();
  };

  const info = (title: string, lines: string[]) =>
    setStep({ kind: 'info', title, lines });

  const onFile = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      reportError('spec.readFile', e);
      setMessage({ tone: 'error', text: t('spec.readFailed') });
      return;
    }
    const parsed = parseSpecText(text);
    if (!parsed.ok) {
      const shown = parsed.errors.slice(0, MAX_ERRORS);
      const rest = parsed.errors.length - shown.length;
      info(t('spec.invalidTitle'), [
        t('spec.invalidMessage'),
        ...shown,
        ...(rest > 0 ? [t('spec.moreErrors', { count: rest })] : []),
      ]);
      return;
    }
    const spec = parsed.spec;
    if (expected.current !== null && spec.id !== expected.current) {
      info(t('spec.invalidTitle'), [
        t('spec.otherId', { found: spec.id, expected: expected.current }),
      ]);
      return;
    }
    const decision = checkSpecApply(project, spec);
    if (decision === 'update') {
      setStep({ kind: 'update', spec });
    } else if (decision === 'not-newer') {
      const current = project.specializations.find((s) => s.id === spec.id);
      info(t('spec.notNewerTitle'), [
        t('spec.notNewer', {
          name: spec.name,
          current: current?.version ?? 0,
          next: spec.version,
        }),
      ]);
    } else {
      const result = actions.applySpecialization(spec);
      setMessage(
        feedback(
          result,
          t('spec.appliedMessage', { name: spec.name, layers: spec.layers.length }),
        ),
      );
    }
  };

  const confirmUpdate = (spec: Spec) => {
    setStep(null);
    const result = actions.updateSpecialization(spec, labelTexts());
    setMessage(
      feedback(
        result,
        t('spec.updatedMessage', { name: spec.name, version: spec.version }),
      ),
    );
  };

  const confirmRemove = (entry: ProjectSpecialization, mode: SpecRemovalMode) => {
    setStep(null);
    const result = actions.removeSpecialization(entry.id, mode, labelTexts());
    setMessage(
      feedback(result, t('spec.removedMessage', { name: entry.spec?.name ?? entry.id })),
    );
  };

  return (
    <>
      <Dialog
        title={t('spec.title')}
        size="md"
        onCancel={onClose}
        actions={<Button onClick={onClose}>{t('common.close')}</Button>}
      >
        <p class="muted">{t('spec.hint')}</p>
        {message && (
          <p
            class={
              message.tone === 'success' ? 'notice notice-success' : 'notice notice-error'
            }
            role={message.tone === 'success' ? 'status' : 'alert'}
          >
            {message.text}
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) void onFile(file);
          }}
        />
        <Button variant="primary" disabled={readOnly} onClick={() => pick(null)}>
          {t('spec.apply')}
        </Button>

        {project.specializations.length === 0 ? (
          <p class="muted">{t('spec.none')}</p>
        ) : (
          <ul class="spec-list">
            {project.specializations.map((entry) => (
              <li key={entry.id} class="spec-item">
                <strong>{entry.spec?.name ?? entry.id}</strong>
                <span class="muted">
                  {entry.spec
                    ? t('spec.item', {
                        version: entry.version,
                        layers: entry.spec.layers.length,
                      })
                    : t('spec.fileMissing')}
                </span>
                <div class="row">
                  <Button disabled={readOnly} onClick={() => pick(entry.id)}>
                    {t('spec.update')}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={readOnly || !entry.spec}
                    onClick={() => setStep({ kind: 'remove', entry })}
                  >
                    {t('spec.remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      {step?.kind === 'info' && (
        <Dialog
          title={step.title}
          onCancel={() => setStep(null)}
          actions={<Button onClick={() => setStep(null)}>{t('common.close')}</Button>}
        >
          {step.lines.map((line, i) => (
            <p key={i} class="wrap-anywhere">
              {line}
            </p>
          ))}
        </Dialog>
      )}

      {step?.kind === 'update' && (
        <UpdateConfirm
          project={project}
          spec={step.spec}
          onCancel={() => setStep(null)}
          onConfirm={() => confirmUpdate(step.spec)}
        />
      )}

      {step?.kind === 'remove' && (
        <RemoveDialog
          project={project}
          entry={step.entry}
          onCancel={() => setStep(null)}
          onConfirm={(mode) => confirmRemove(step.entry, mode)}
        />
      )}
    </>
  );
}

function UpdateConfirm({
  project,
  spec,
  onCancel,
  onConfirm,
}: {
  readonly project: Project;
  readonly spec: Spec;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const impact = specializationUpdateImpact(project, spec);
  const current = project.specializations.find((s) => s.id === spec.id);
  return (
    <Dialog
      title={t('spec.updateTitle', { name: spec.name })}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={onConfirm}>
            {t('spec.updateConfirm')}
          </Button>
        </>
      }
    >
      <p>
        {t('spec.updateMessage', { current: current?.version ?? 0, next: spec.version })}
      </p>
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
      {impact.addedLayers.length === 0 && impact.freedLayers.length === 0 && (
        <p>{t('spec.updateNoLayerChange')}</p>
      )}
      <p class="muted">{t('spec.updateKeep')}</p>
      {impact.brokenRefs > 0 && (
        <p class="notice notice-error">
          {t('spec.updateBroken', { count: impact.brokenRefs })}
        </p>
      )}
    </Dialog>
  );
}

function RemoveDialog({
  project,
  entry,
  onCancel,
  onConfirm,
}: {
  readonly project: Project;
  readonly entry: ProjectSpecialization;
  readonly onCancel: () => void;
  readonly onConfirm: (mode: SpecRemovalMode) => void;
}) {
  const [mode, setMode] = useState<SpecRemovalMode | null>(null);
  const name = entry.spec?.name ?? entry.id;
  const onlySpecLayers = project.layers.every((l) => l.spec?.specId === entry.id);
  const blocked = mode === 'delete' && onlySpecLayers;
  const modes: readonly SpecRemovalMode[] = ['delete', 'convert'];

  return (
    <Dialog
      title={t('spec.removeTitle', { name })}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button
            variant={mode === 'delete' ? 'danger' : 'primary'}
            disabled={mode === null || blocked}
            onClick={() => mode && onConfirm(mode)}
          >
            {mode === 'delete'
              ? t('spec.removeConfirmDelete')
              : t('spec.removeConfirmConvert')}
          </Button>
        </>
      }
    >
      <fieldset class="display-mode">
        <legend>{t('spec.removeChoose')}</legend>
        {modes.map((m) => (
          <Choice
            key={m}
            type="radio"
            name="spec-remove-mode"
            value={m}
            label={t(
              `spec.remove${m === 'delete' ? 'Delete' : 'Convert'}` satisfies TranslationKey,
            )}
            hint={t(
              `spec.remove${m === 'delete' ? 'Delete' : 'Convert'}Hint` satisfies TranslationKey,
            )}
            checked={mode === m}
            onChange={() => setMode(m)}
          />
        ))}
      </fieldset>
      {mode && !blocked && (
        <RemoveImpact project={project} specId={entry.id} mode={mode} />
      )}
      {blocked && <p class="notice notice-error">{t('spec.removeLastLayer')}</p>}
    </Dialog>
  );
}

function RemoveImpact({
  project,
  specId,
  mode,
}: {
  readonly project: Project;
  readonly specId: string;
  readonly mode: SpecRemovalMode;
}) {
  const impact = specializationRemovalImpact(project, specId, mode);
  const rows = project.layers
    .map((layer) => ({ layer, count: impact.byLayer.get(layer.id) ?? 0 }))
    .filter((r) => r.count > 0);
  return (
    <>
      {impact.annotations === 0 ? (
        <p>{t('spec.removeNoAnnotations')}</p>
      ) : (
        <>
          <p>{t('spec.removeCounts', { count: impact.annotations })}</p>
          <ul>
            {rows.map(({ layer, count }) => (
              <li key={layer.id}>
                {t('layer.deleteCount', { name: layer.name, count })}
              </li>
            ))}
          </ul>
        </>
      )}
      {impact.brokenRefs > 0 && (
        <p class="notice notice-error">
          {t('spec.removeBroken', { count: impact.brokenRefs })}
        </p>
      )}
    </>
  );
}
