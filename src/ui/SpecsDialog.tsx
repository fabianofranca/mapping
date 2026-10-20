import { useRef, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  MAX_PACKAGE_BYTES,
  MAX_PACKAGE_FILES,
  REMOVED_FIELD_TYPE,
  checkSpecApply,
  parseSpecText,
  specializationRemovalImpact,
  specializationUpdateImpact,
  usesPackageFiles,
  type IgnoredSpecField,
  type Project,
  type ProjectSpecialization,
  type Spec,
  type SpecRemovalMode,
} from '../model';
import type { LibraryReport } from '../model/library';
import type { SpecPackageFiles } from '../store/project';
import { Button, Choice } from './controls';
import { Dialog } from './Dialog';
import { showToolWindow } from '../store/toolWindows';
import { useEditor } from './EditorContext';
import { LibraryIssueList } from './LibraryIssueList';
import { UpdateImpact } from './UpdateImpact';
import {
  canPickDirectory,
  pickPackageDirectory,
  readPackageFromDirectory,
  readPackageFromZip,
  readPackageSpec,
  validatePackage,
  type PackageReadResult,
} from './specPackageImport';
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
  | {
      readonly kind: 'update';
      readonly spec: Spec;
      readonly ignored: readonly IgnoredSpecField[];
    }
  | { readonly kind: 'remove'; readonly entry: ProjectSpecialization }
  | {
      readonly kind: 'package';
      /** `null`: o pacote não tem especialização legível (só erros). */
      readonly spec: Spec | null;
      readonly decision: 'apply' | 'update';
      readonly report: LibraryReport;
      readonly files: SpecPackageFiles;
    };

const MB = 1024 * 1024;

/** Deixa o navegador pintar o estado "validando" antes do trabalho síncrono do nível 3. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Mensagem de um pacote que não pôde ser lido. */
function readFailure(result: Extract<PackageReadResult, { ok: false }>): string {
  return result.reason === 'too-big'
    ? t('spec.packageTooBig', {
        files: MAX_PACKAGE_FILES,
        mb: Math.round(MAX_PACKAGE_BYTES / MB),
      })
    : t('spec.packageEmpty');
}

/** Sucesso com o texto dado; erro com o código da action. */
function feedback(
  result: { readonly ok: true } | { readonly ok: false; readonly error: string },
  success: string,
): Feedback {
  return result.ok ? { tone: 'success', text: success } : failureFeedback(result.error);
}

/** Erro da action: o código conhecido ganha texto próprio; os demais mostram o código. */
function failureFeedback(code: string): Feedback {
  return {
    tone: 'error',
    text:
      code === 'spec-missing-migrations'
        ? t('spec.impact.failedMissing')
        : t('spec.failed', { code }),
  };
}

/**
 * Aviso dos campos lidos e ignorados (tipo de campo que saiu do formato, etapa 9): a
 * especialização foi aplicada sem eles. `null` sem campos ignorados.
 */
function ignoredText(ignored: readonly IgnoredSpecField[]): string | null {
  if (ignored.length === 0) return null;
  return t('spec.ignoredFields', {
    type: REMOVED_FIELD_TYPE,
    fields: ignored.map((f) => `${f.typeId}.${f.key}`).join(', '),
  });
}

/** Menu Especializações: aplicar, atualizar versão e remover (docs/history/PLAN-etapas-1-2.md 13.4). */
export function SpecsDialog({ project, readOnly, onClose }: SpecsDialogProps) {
  const { actions } = useEditor();
  const [step, setStep] = useState<Step | null>(null);
  const [message, setMessage] = useState<Feedback | null>(null);
  /** Campos ignorados da última especialização aplicada ou atualizada. */
  const [ignored, setIgnored] = useState<string | null>(null);
  /** Conferindo um pacote (o nível 3 prova o desenho e pode levar um tempo). */
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  /** Especialização esperada ao escolher o arquivo (`null`: qualquer uma). */
  const expected = useRef<string | null>(null);
  const folders = canPickDirectory();

  const start = (specId: string | null) => {
    expected.current = specId;
    setMessage(null);
    setIgnored(null);
  };
  const pick = (specId: string | null) => {
    start(specId);
    input.current?.click();
  };
  const pickZip = (specId: string | null) => {
    start(specId);
    zipInput.current?.click();
  };

  /** Lê, valida (três níveis) e abre a revisão do pacote; nada muda no projeto ainda. */
  const reviewPackage = async (read: () => Promise<PackageReadResult>) => {
    setBusy(true);
    try {
      await nextFrame();
      let result: PackageReadResult;
      try {
        result = await read();
      } catch (e) {
        reportError('spec.readPackage', e);
        setMessage({ tone: 'error', text: t('spec.packageReadFailed') });
        return;
      }
      if (!result.ok) {
        setMessage({ tone: 'error', text: readFailure(result) });
        return;
      }
      const files = result.files;
      const spec = readPackageSpec(files);
      if (!spec) {
        setStep({
          kind: 'package',
          spec: null,
          decision: 'apply',
          report: validatePackage(files),
          files,
        });
        return;
      }
      if (expected.current !== null && spec.id !== expected.current) {
        info(t('spec.invalidTitle'), [
          t('spec.otherId', { found: spec.id, expected: expected.current }),
        ]);
        return;
      }
      const decision = checkSpecApply(project, spec);
      if (decision === 'not-newer') {
        const current = project.specializations.find((s) => s.id === spec.id);
        info(t('spec.notNewerTitle'), [
          t('spec.notNewer', {
            name: spec.name,
            current: current?.version ?? 0,
            next: spec.version,
          }),
        ]);
        return;
      }
      const previous =
        decision === 'update'
          ? (project.specializations.find((s) => s.id === spec.id)?.spec ?? undefined)
          : undefined;
      await nextFrame();
      setStep({
        kind: 'package',
        spec,
        decision,
        report: validatePackage(files, previous),
        files,
      });
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = async (specId: string | null) => {
    start(specId);
    let handle;
    try {
      handle = await pickPackageDirectory();
    } catch (e) {
      reportError('spec.pickFolder', e);
      setMessage({ tone: 'error', text: t('spec.packageReadFailed') });
      return;
    }
    if (handle) await reviewPackage(() => readPackageFromDirectory(handle));
  };

  const info = (title: string, lines: string[]) =>
    setStep({ kind: 'info', title, lines });

  const onFile = async (file: File) => {
    setIgnored(null);
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
    if (usesPackageFiles(spec)) {
      info(t('spec.invalidTitle'), [t('spec.v4NeedsPackage', { name: spec.name })]);
      return;
    }
    const decision = checkSpecApply(project, spec);
    if (decision === 'update') {
      setStep({ kind: 'update', spec, ignored: parsed.ignored });
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
      if (result.ok) setIgnored(ignoredText(parsed.ignored));
      setMessage(
        feedback(
          result,
          t('spec.appliedMessage', { name: spec.name, layers: spec.layers.length }),
        ),
      );
    }
  };

  /** Resultado de uma atualização: com pendências novas, abre Incompletas e conta quantas. */
  const updateFeedback = (
    result: ReturnType<typeof actions.updateSpecialization>,
    spec: Spec,
    pending: number,
  ): Feedback => {
    if (result.ok && pending > 0) showToolWindow('incomplete');
    if (!result.ok) return failureFeedback(result.error);
    return {
      tone: 'success',
      text:
        pending > 0
          ? t('spec.updatedPending', {
              name: spec.name,
              version: spec.version,
              count: pending,
            })
          : t('spec.updatedMessage', { name: spec.name, version: spec.version }),
    };
  };

  const confirmUpdate = (spec: Spec, ignoredFields: readonly IgnoredSpecField[]) => {
    setStep(null);
    const impact = specializationUpdateImpact(project, spec);
    if (impact.refused) {
      setMessage(failureFeedback('spec-missing-migrations'));
      return;
    }
    const result = actions.updateSpecialization(spec, labelTexts());
    if (result.ok) setIgnored(ignoredText(ignoredFields));
    setMessage(updateFeedback(result, spec, impact.pending.length));
  };

  const confirmPackage = (step: Extract<Step, { kind: 'package' }>) => {
    setStep(null);
    const { spec, decision, files } = step;
    if (!spec) return;
    setIgnored(null);
    if (decision === 'update') {
      const impact = specializationUpdateImpact(project, spec);
      if (impact.refused) {
        setMessage(failureFeedback('spec-missing-migrations'));
        return;
      }
      const result = actions.updateSpecialization(spec, labelTexts(), files);
      setMessage(updateFeedback(result, spec, impact.pending.length));
      return;
    }
    const result = actions.applySpecialization(spec, files);
    setMessage(
      feedback(
        result,
        t('spec.appliedMessage', { name: spec.name, layers: spec.layers.length }),
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
        <p class="muted">{t('spec.packageHint')}</p>
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
        {ignored && (
          <p class="notice wrap-anywhere" role="status">
            {ignored}
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
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) void reviewPackage(() => readPackageFromZip(file));
          }}
        />
        {busy && (
          <p class="muted" role="status">
            {t('spec.packageValidating')}
          </p>
        )}
        <div class="row">
          <Button
            variant="primary"
            disabled={readOnly || busy}
            onClick={() => pick(null)}
          >
            {t('spec.apply')}
          </Button>
          {folders && (
            <Button disabled={readOnly || busy} onClick={() => void pickFolder(null)}>
              {t('spec.applyFolder')}
            </Button>
          )}
          <Button disabled={readOnly || busy} onClick={() => pickZip(null)}>
            {t('spec.applyZip')}
          </Button>
        </div>

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
                {entry.spec?.platforms && entry.spec.platforms.length > 0 && (
                  <div class="spec-platforms">
                    <small class="muted">{t('spec.platforms')}</small>
                    <ul>
                      {entry.spec.platforms.map((platform) => (
                        <li key={platform.id}>
                          {platform.language
                            ? t('spec.platformItemLanguage', {
                                name: platform.name,
                                id: platform.id,
                                language: platform.language,
                              })
                            : t('spec.platformItem', {
                                name: platform.name,
                                id: platform.id,
                              })}
                          {platform.repo && (
                            <span class="spec-platform-repo muted">
                              <a
                                href={platform.repo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {platform.repo.url}
                              </a>
                              {platform.repo.ref && (
                                <span>{t('repos.ref', { ref: platform.repo.ref })}</span>
                              )}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div class="row">
                  <Button disabled={readOnly || busy} onClick={() => pick(entry.id)}>
                    {t('spec.update')}
                  </Button>
                  {folders && (
                    <Button
                      disabled={readOnly || busy}
                      onClick={() => void pickFolder(entry.id)}
                    >
                      {t('spec.updateFolder')}
                    </Button>
                  )}
                  <Button disabled={readOnly || busy} onClick={() => pickZip(entry.id)}>
                    {t('spec.updateZip')}
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
          onConfirm={() => confirmUpdate(step.spec, step.ignored)}
        />
      )}

      {step?.kind === 'package' && (
        <PackageReview
          project={project}
          step={step}
          onCancel={() => setStep(null)}
          onConfirm={() => confirmPackage(step)}
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
  const current = project.specializations.find((s) => s.id === spec.id)?.version ?? 0;
  return (
    <Dialog
      title={t('spec.updateTitle', { name: spec.name })}
      size="md"
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={impact.refused} onClick={onConfirm}>
            {t('spec.updateConfirm')}
          </Button>
        </>
      }
    >
      <UpdateImpact
        project={project}
        impact={impact}
        current={current}
        next={spec.version}
      />
    </Dialog>
  );
}

/**
 * Revisão de um pacote lido: resumo, erros (bloqueiam) e avisos (deixam aplicar). Numa
 * atualização, mostra também o efeito nas camadas, como a confirmação do arquivo único.
 */
function PackageReview({
  project,
  step,
  onCancel,
  onConfirm,
}: {
  readonly project: Project;
  readonly step: Extract<Step, { kind: 'package' }>;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { spec, report, decision } = step;
  const impact =
    spec && decision === 'update' ? specializationUpdateImpact(project, spec) : null;
  const current = project.specializations.find((s) => s.id === spec?.id)?.version ?? 0;
  const blocked = spec === null || report.errors.length > 0 || impact?.refused === true;
  const { summary } = report;
  return (
    <Dialog
      title={
        spec ? t('spec.packageTitle', { name: spec.name }) : t('spec.packageInvalidTitle')
      }
      size="md"
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={blocked} onClick={onConfirm}>
            {decision === 'update'
              ? t('spec.updateConfirm')
              : t('spec.packageApplyConfirm')}
          </Button>
        </>
      }
    >
      {spec ? (
        <>
          <p>
            {t('spec.packageSummary', {
              version: spec.version,
              types: summary.types,
              components: summary.components,
              docs: summary.docs,
              fonts: summary.fonts,
            })}
          </p>
          {impact && (
            <UpdateImpact
              project={project}
              impact={impact}
              current={current}
              next={spec.version}
            />
          )}
        </>
      ) : (
        <p class="notice notice-error" role="alert">
          {t('spec.packageNoSpec')}
        </p>
      )}
      <p
        class={report.errors.length > 0 ? 'notice notice-error' : 'muted'}
        role={report.errors.length > 0 ? 'alert' : 'status'}
      >
        {t('spec.packageCounts', {
          errors: report.errors.length,
          warnings: report.warnings.length,
        })}{' '}
        {report.errors.length > 0
          ? t('spec.packageBlocked')
          : report.warnings.length > 0
            ? t('spec.packageWarningsOk')
            : ''}
      </p>
      <LibraryIssueList issues={report.issues} />
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
      alert
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
