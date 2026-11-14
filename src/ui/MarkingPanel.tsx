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
import type { AnnotationLocation } from '../store/ui';
import { AnnotationsPanel } from './AnnotationsPanel';
import { ArrivalNotice } from './ArrivalNotice';
import { ArrowLinksSection } from './ArrowLinksSection';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import { Button, Choice, HelpTip, IconButton, TextField } from './controls';
import { ThreadsSection } from './comments/ThreadsSection';
import { CopyButtons } from './CopyActions';
import { useDetailsExtension } from './DetailsExtension';
import { DetailsIdentity } from './DetailsIdentity';
import { Section } from './DetailsSection';
import { arrangeHintKey, arrangeMarking, canArrangeMarking } from './arrange';
import { useEditor } from './EditorContext';
import { keepFocusAfterAction } from './focus';
import { imageLabel, markingErrorMessage, markingLabel } from './labels';
import { MarkingAnchorSection } from './MarkingAnchorSection';
import { MarkingPicker } from './MarkingPicker';
import { PerspectivesSection, usePrincipalOnly } from './PerspectivesSection';
import { Property, PropertyGrid } from './PropertyGrid';

interface MarkingPanelProps {
  readonly project: Project;
  readonly marking: Marking;
  /** Container of the marking; `null` for a canvas marking (v13). */
  readonly image: ProjectContainer | null;
  readonly readOnly: boolean;
  readonly onDelete: (marking: Marking) => void;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  /** Opens Settings (the notice about a thread without an identity leads there). */
  readonly onOpenSettings?: () => void;
}

/** Summary of the collapsed Marking section: "X 112 · Y 236 · 346 × 84 px". */
export function rectSummary(rect: Rect): string {
  return t('marking.rectSummary', {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

/**
 * Marking details: identity, Marking section (name, parent, position and size),
 * review, annotations per layer and deletion.
 */
export function MarkingPanel({
  project,
  marking,
  image,
  readOnly,
  onDelete,
  onGoToAnnotation,
  onOpenSettings,
}: MarkingPanelProps) {
  const editor = useEditor();
  const { actions, ui, derived, layers } = editor;
  const ext = useDetailsExtension();
  // The Editor recreates the panel (via `key`) when the marking changes, which clears the error.
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  // "Link to…": the marking picker; choosing creates the arrow and selects it.
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
    // Out of bounds, the value is clamped to the limit; the field shows the saved value.
    report(actions.adjustMarkingRect(marking.id, key, value));
    return false;
  };

  // Lock: its own or inherited from an ancestor (locked descendants block nothing).
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

  // Belonging is resolved by geometry (read-only): the settled parent, if any.
  const parent =
    marking.parentId === null
      ? null
      : (projectIndex(project).markings.get(marking.parentId) ?? null);
  const containerName = image ? imageLabel(image) : t('canvas.name');
  const identity = ext?.identity(marking.id) ?? null;
  const order = siblingPosition(project, marking.id);
  const arrangeable = canArrangeMarking(editor, marking.id);
  const arrangeBlocked = usePrincipalOnly('arrange');
  const deleteBlocked = usePrincipalOnly('delete', [marking.id]);
  // Position and size are a single change (`rect`): with a marker, the two rows become
  // one, with a two-line label and a bracket (HANDOFF-REVIEW-DETAILS 2.2).
  const spaceHint = t(image ? 'marking.pixelsHint' : 'marking.canvasUnitsHint');
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
    ...[...ancestors].reverse().map((m) => markingLabel(project, m)),
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
            <span class="identity-lock">
              {lockNotice && <HelpTip name={t('lock.helpName')} text={lockNotice} />}
              <IconButton
                icon={marking.locked ? 'lock' : 'unlock'}
                label={t('lock.markingLock')}
                shortcut={SHORTCUT_LABELS.toggleLock}
                pressed={marking.locked}
                disabled={readOnly}
                onClick={() =>
                  report(actions.setMarkingLocked(marking.id, !marking.locked))
                }
              />
            </span>
          </>
        }
      />

      {ext?.header(marking.id)}

      <ArrivalNotice itemId={marking.id} />

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
                // Surrounding spaces do not count as a change.
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
          {/* Any marking can become floating: leaves the container, moves to the canvas (decision 10). */}
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
                onClick={() => {
                  keepFocusAfterAction();
                  report(actions.reorderMarking(marking.id, order.index - 1));
                }}
              />
              <IconButton
                icon="arrowUp"
                size="sm"
                label={t('marking.orderFront')}
                disabled={readOnly || order.index >= order.count - 1}
                onClick={() => {
                  keepFocusAfterAction();
                  report(actions.reorderMarking(marking.id, order.index + 1));
                }}
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
              hint={spaceHint}
              hintName={`${t('marking.position')} / ${t('marking.size')}`}
              mark={<span class="props-rect-bracket">{rectMark}</span>}
              below={rectBelow}
            >
              {position}
              {size}
            </Property>
          ) : (
            <>
              <Property label={t('marking.position')} hint={spaceHint}>
                {position}
              </Property>
              <Property label={t('marking.size')} hint={spaceHint}>
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

      <MarkingAnchorSection project={project} marking={marking} readOnly={readOnly} />

      <AnnotationsPanel
        project={project}
        marking={marking}
        layers={derived.visibleLayers.value}
        readOnly={readOnly}
        onShowLayer={layers.show}
        onGoToAnnotation={onGoToAnnotation}
        focusAnnotation={ui.focusAnnotation.value}
        onFocusDone={() => (ui.focusAnnotation.value = null)}
      />

      <ThreadsSection
        itemId={marking.id}
        anchor={{ kind: 'marking', id: marking.id }}
        onOpenSettings={onOpenSettings}
      />

      <ArrowLinksSection project={project} marking={marking} />

      <PerspectivesSection itemId={marking.id} readOnly={readOnly} />

      {ext?.others(marking.id)}

      <div class="row">
        {arrangeable && (
          <IconButton
            icon="arrange"
            label={t('arrange.action')}
            text={t('arrange.action')}
            tooltip={t(
              arrangeBlocked
                ? 'perspective.principalOnly'
                : arrangeHintKey(editor, marking.id),
            )}
            shortcut={SHORTCUT_LABELS.arrange}
            disabled={readOnly || arrangeBlocked}
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
          disabled={readOnly || !deletable || deleteBlocked}
          title={
            deleteBlocked
              ? t('perspective.principalOnly')
              : deletable
                ? undefined
                : t('lock.deleteBlocked')
          }
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
