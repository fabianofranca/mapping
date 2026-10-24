import { useId, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  ancestorsOf,
  projectIndex,
  canDeleteMarking,
  canEditMarkingGeometry,
  siblingPosition,
  type Marking,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../model';
import type { ActionResult } from '../store/history';
import { showLayer, type AnnotationLocation } from '../store/ui';
import { AnnotationsPanel } from './AnnotationsPanel';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import { Button, Choice, IconButton, TextField } from './controls';
import { CopyButtons } from './CopyActions';
import { useDetailsExtension } from './DetailsExtension';
import { DetailsIdentity } from './DetailsIdentity';
import { Section } from './DetailsSection';
import { arrangeMarking, canArrangeMarking } from './arrange';
import { useEditor } from './EditorContext';
import { imageLabel, markingErrorMessage, markingLabel } from './labels';
import { MarkingPicker } from './MarkingPicker';
import { Property, PropertyGrid } from './PropertyGrid';

interface MarkingPanelProps {
  readonly project: Project;
  readonly marking: Marking;
  /** Container da marcação; `null` na marcação do canvas (v13). */
  readonly image: ProjectContainer | null;
  readonly readOnly: boolean;
  readonly onDelete: (marking: Marking) => void;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** Resumo da seção Marcação recolhida: "X 112 · Y 236 · 346 × 84 px". */
export function rectSummary(rect: Rect): string {
  return t('marking.rectSummary', {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

/**
 * Detalhes da marcação: identidade, seção Marcação (nome, pai, posição e tamanho),
 * revisão, anotações por camada e exclusão.
 */
export function MarkingPanel({
  project,
  marking,
  image,
  readOnly,
  onDelete,
  onGoToAnnotation,
}: MarkingPanelProps) {
  const editor = useEditor();
  const { actions, ui, derived } = editor;
  const ext = useDetailsExtension();
  // O Editor recria o painel (via `key`) ao trocar de marcação, o que limpa o erro.
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  // "Ligar a…": o seletor de marcações; escolher cria a seta e a seleciona.
  const [linking, setLinking] = useState(false);
  const linkButton = useRef<HTMLButtonElement>(null);

  const report = (result: ActionResult): boolean => {
    setError(result.ok ? null : markingErrorMessage(result.error));
    return result.ok;
  };

  const commitRect = (key: keyof Rect, text: string): boolean => {
    const value = Number(text.trim());
    if (text.trim() === '' || !Number.isInteger(value)) {
      setError(markingErrorMessage('rect-not-integer'));
      return false;
    }
    // Fora dos limites, o valor é ajustado ao limite; o campo mostra o valor gravado.
    report(actions.adjustMarkingRect(marking.id, key, value));
    return false;
  };

  // Trava: própria ou herdada de um ancestral (descendentes trancados não impedem nada).
  const ancestors = ancestorsOf(project, marking.id);
  const lockedAncestor = ancestors.find((a) => a.locked) ?? null;
  const geometryEditable = canEditMarkingGeometry(project, marking.id);
  const deletable = canDeleteMarking(project, marking.id);
  const lockNotice = marking.locked
    ? t('lock.markingNotice')
    : lockedAncestor
      ? t('lock.inheritedNotice', { parent: markingLabel(project, lockedAncestor) })
      : null;

  const rectField = (key: keyof Rect, short: string, label: string) => (
    <label class="props-pair-item" title={label}>
      <span class="props-pair-label" aria-hidden="true">
        {short}
      </span>
      <TextField
        size="sm"
        type="number"
        inputMode="numeric"
        step={1}
        {...(image ? { min: 0 } : {})}
        aria-label={label}
        disabled={readOnly || !geometryEditable}
        value={String(marking.rect[key])}
        onCommit={(text) => commitRect(key, text)}
      />
    </label>
  );

  // Pertencimento é resolvido pela geometria (só leitura): o pai assentado, se houver.
  const parent =
    marking.parentId === null
      ? null
      : (projectIndex(project).markings.get(marking.parentId) ?? null);
  const containerName = image ? imageLabel(image) : t('canvas.name');
  const identity = ext?.identity(marking.id) ?? null;
  const order = siblingPosition(project, marking.id);
  const arrangeable = canArrangeMarking(editor, marking.id);
  // Posição e tamanho são uma mudança só (`rect`): com um marcador, as duas linhas viram
  // uma, com o rótulo de duas linhas e um colchete (HANDOFF-REVIEW-DETAILS 2.2).
  const rectMark =
    ext?.mark(marking.id, 'rect') || ext?.mark(marking.id, 'space') || null;
  const rectBelow = ext?.below(marking.id, 'rect') ?? ext?.below(marking.id, 'space');
  const position = (
    <div class="props-pair">
      {rectField('x', t('marking.x'), t('marking.x'))}
      {rectField('y', t('marking.y'), t('marking.y'))}
    </div>
  );
  const size = (
    <div class="props-pair">
      {rectField('width', t('marking.widthShort'), t('marking.width'))}
      {rectField('height', t('marking.heightShort'), t('marking.height'))}
    </div>
  );
  const where = [
    containerName,
    ...ancestorsOf(project, marking.id)
      .reverse()
      .map((m) => markingLabel(project, m)),
  ].join(t('marking.pathSeparator'));

  return (
    <div class="panel-details">
      <DetailsIdentity
        icon="marking"
        name={markingLabel(project, marking)}
        sub={t('marking.inImage', { file: where })}
        id={marking.id}
        flags={identity?.flags}
        struck={identity?.struck}
        actions={
          <>
            <CopyButtons target={{ kind: 'm', id: marking.id }} />
            <IconButton
              icon={marking.locked ? 'lock' : 'unlock'}
              label={t('lock.markingLock')}
              tooltip={t(marking.locked ? 'lock.markingUnlock' : 'lock.markingLock')}
              shortcut={SHORTCUT_LABELS.toggleLock}
              pressed={marking.locked}
              disabled={readOnly}
              onClick={() =>
                report(actions.setMarkingLocked(marking.id, !marking.locked))
              }
            />
          </>
        }
      />

      {ext?.header(marking.id)}

      {lockNotice && (
        <p class="notice notice-info" role="status">
          {lockNotice}
        </p>
      )}

      {marking.needsReview && (
        <div class="notice" role="status">
          <strong>⚠ {t('marking.needsReview')}</strong>
          <p>{t('marking.reviewMessage')}</p>
          <Button
            variant="primary"
            disabled={readOnly}
            onClick={() => report(actions.confirmMarkingReview(marking.id))}
          >
            {t('marking.confirmReview')}
          </Button>
        </div>
      )}

      <Section
        section={{ kind: 'marking' }}
        title={t('marking.section')}
        summary={rectSummary(marking.rect)}
      >
        <PropertyGrid>
          <Property
            label={t('marking.name')}
            for={nameId}
            mark={ext?.mark(marking.id, 'name')}
            below={ext?.below(marking.id, 'name')}
          >
            <TextField
              id={nameId}
              size="sm"
              value={marking.name ?? ''}
              placeholder={t('marking.namePlaceholder')}
              disabled={readOnly}
              onCommit={(text) => {
                // Espaços em volta não contam como alteração.
                if ((text.trim() || null) === marking.name) return false;
                return report(actions.renameMarking(marking.id, text));
              }}
            />
          </Property>
          <Property label={t('marking.container')}>
            <span class="props-text">{containerName}</span>
          </Property>
          <Property label={t('marking.parent')}>
            <span class="props-text">
              {parent ? markingLabel(project, parent) : t('marking.noParent')}
            </span>
          </Property>
          {/* Qualquer marcação pode virar flutuante: sai do container e passa ao canvas (decisão 10). */}
          <Property
            label={t('marking.floating')}
            hint={t('marking.floatingHint')}
            mark={ext?.mark(marking.id, 'floating')}
            below={ext?.below(marking.id, 'floating')}
          >
            <Choice
              checked={marking.floating}
              label={t('marking.floating')}
              disabled={readOnly}
              onChange={(e) =>
                report(actions.setMarkingFloating(marking.id, e.currentTarget.checked))
              }
            />
          </Property>
          <Property label={t('marking.order')} hint={t('marking.orderHint')}>
            <div class="order-field">
              <span class="props-text order-field-value">
                {t('marking.orderValue', { index: order.index + 1, count: order.count })}
              </span>
              <IconButton
                icon="arrowDown"
                size="sm"
                label={t('marking.orderBack')}
                disabled={readOnly || order.index <= 0}
                onClick={() =>
                  report(actions.reorderMarking(marking.id, order.index - 1))
                }
              />
              <IconButton
                icon="arrowUp"
                size="sm"
                label={t('marking.orderFront')}
                disabled={readOnly || order.index >= order.count - 1}
                onClick={() =>
                  report(actions.reorderMarking(marking.id, order.index + 1))
                }
              />
            </div>
          </Property>
          {rectMark ? (
            <Property
              label={
                <span class="props-label-rect">
                  <span>{t('marking.position')}</span>
                  <span>{t('marking.size')}</span>
                </span>
              }
              hint={t('marking.pixelsHint')}
              mark={<span class="props-rect-bracket">{rectMark}</span>}
              below={rectBelow}
            >
              {position}
              {size}
            </Property>
          ) : (
            <>
              <Property label={t('marking.position')} hint={t('marking.pixelsHint')}>
                {position}
              </Property>
              <Property label={t('marking.size')} hint={t('marking.pixelsHint')}>
                {size}
              </Property>
            </>
          )}
        </PropertyGrid>
      </Section>

      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}

      <AnnotationsPanel
        project={project}
        marking={marking}
        layers={derived.visibleLayers.value}
        activeLayer={derived.activeLayer.value}
        readOnly={readOnly}
        onShowLayer={(layerId) => showLayer(ui, layerId)}
        onGoToAnnotation={onGoToAnnotation}
        focusAnnotation={ui.focusAnnotation.value}
        onFocusDone={() => (ui.focusAnnotation.value = null)}
      />

      {ext?.others(marking.id)}

      <div class="row">
        {arrangeable && (
          <IconButton
            icon="arrange"
            label={t('arrange.action')}
            text={t('arrange.action')}
            tooltip={t('arrange.hint')}
            shortcut={SHORTCUT_LABELS.arrange}
            disabled={readOnly}
            onClick={() => arrangeMarking(editor, marking.id)}
          />
        )}
        <Button
          buttonRef={linkButton}
          title={t('arrow.linkToHint')}
          disabled={readOnly}
          onClick={() => setLinking(true)}
        >
          {t('arrow.linkTo')}
        </Button>
        <Button
          variant="danger"
          disabled={readOnly || !deletable}
          title={deletable ? undefined : t('lock.deleteBlocked')}
          onClick={() => onDelete(marking)}
        >
          {t('marking.delete')}
        </Button>
      </div>

      {linking && (
        <MarkingPicker
          project={project}
          source={marking}
          returnFocus={() => linkButton.current}
          onClose={() => setLinking(false)}
          onPick={(target) => {
            setLinking(false);
            const result = actions.addArrow(marking.id, target.id);
            if (result.ok) ui.selection.value = { kind: 'arrow', id: result.value };
            else report(result);
          }}
        />
      )}
    </div>
  );
}
