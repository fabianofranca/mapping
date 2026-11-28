import { useId } from 'preact/hooks';
import { t } from '../i18n';
import {
  containerClassSets,
  effectiveContainerClasses,
  missingVariantTypes,
  projectIndex,
  typeKey,
  variantsOf,
  type Project,
  type ProjectContainer,
} from '../model';
import { Button } from './controls';
import { Section } from './DetailsSection';
import { useEditor, type EditorContextValue } from './EditorContext';
import { imageLabel } from './labels';
import { MenuPopover } from './MenuPopover';
import { navigateTo } from './pageNavigation';

// "Variants" section of the container Details (stage #2034, VR3, decision 12): the other containers that
// are the same screen in another size, with the way to go to each, to link and unlink, and what the
// variants map that this one does not (informative only).

/** "Window: Expanded, Platform: Android": the classes the container has, set name then class name. */
function classesText(p: Project, containerId: string): string {
  const has = effectiveContainerClasses(p, containerId);
  return containerClassSets(p)
    .flatMap((set) => {
      const found = set.classes.find((c) => c.id === has[set.id]);
      return found
        ? [t('variants.classEntry', { set: set.name, class: found.name })]
        : [];
    })
    .join(', ');
}

/** The row text: name, its classes and, on another page, the page name. */
function rowText(p: Project, image: ProjectContainer, variant: ProjectContainer): string {
  const classes = classesText(p, variant.id);
  const page = p.pages.find((g) => g.id === variant.pageId);
  const name = imageLabel(variant);
  const where =
    page !== undefined && variant.pageId !== image.pageId
      ? t('variants.onPage', { name, page: page.name })
      : name;
  return classes === '' ? where : `${where} · ${classes}`;
}

/** Goes to a variant: opens its page if needed, selects it and frames it. */
function goToVariant(editor: EditorContextValue, id: string): void {
  navigateTo(editor, { kind: 'container', id }, () => {
    editor.ui.selection.value = { kind: 'image', id };
  });
}

/** The containers that can still be linked: not this one nor any of its group; the open page first. */
function linkCandidates(
  p: Project,
  image: ProjectContainer,
  openPageId: string,
): ProjectContainer[] {
  const others = p.containers.filter(
    (c) =>
      c.id !== image.id &&
      (image.variantGroup == null || c.variantGroup !== image.variantGroup),
  );
  const here = others.filter((c) => c.pageId === openPageId);
  return [...here, ...others.filter((c) => c.pageId !== openPageId)];
}

function LinkMenu({
  image,
  project,
  readOnly,
}: {
  readonly image: ProjectContainer;
  readonly project: Project;
  readonly readOnly: boolean;
}) {
  const editor = useEditor();
  const hintId = useId();
  const candidates = linkCandidates(project, image, editor.session.page.openId());
  const label = t('variants.link');
  if (readOnly || candidates.length === 0) {
    return (
      <>
        <Button disabled aria-describedby={candidates.length === 0 ? hintId : undefined}>
          {label}
        </Button>
        {candidates.length === 0 && (
          <span id={hintId} class="muted page-move-hint">
            {t('variants.linkEmpty')}
          </span>
        )}
      </>
    );
  }
  return (
    <MenuPopover label={label} buttonLabel={label} class="menu-popover-control">
      {candidates.map((c) => (
        <Button
          key={c.id}
          role="menuitem"
          onClick={() => editor.actions.linkVariant(image.id, c.id)}
        >
          <span class="menu-item-name">{rowText(project, image, c)}</span>
        </Button>
      ))}
    </MenuPopover>
  );
}

function MissingTypes({
  project,
  image,
}: {
  readonly project: Project;
  readonly image: ProjectContainer;
}) {
  const missing = missingVariantTypes(project, image.id);
  if (missing.length === 0) return null;
  const { types, containers } = projectIndex(project);
  return (
    <div class="variants-missing-block">
      <span class="muted variants-missing-title">{t('variants.missing')}</span>
      <ul class="variants-missing">
        {missing.map((m) => {
          const name = types.get(typeKey(m.type.specId, m.type.typeId))?.type.name;
          const variants = m.variants
            .map((id) => {
              const found = containers.get(id);
              return found ? imageLabel(found) : id;
            })
            .join(', ');
          return (
            <li key={typeKey(m.type.specId, m.type.typeId)}>
              {t('variants.missingItem', {
                type: name ?? m.type.typeId,
                variant: variants,
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ContainerVariantsSection({
  image,
  readOnly,
}: {
  readonly image: ProjectContainer;
  readonly readOnly: boolean;
}) {
  const editor = useEditor();
  const project = editor.store.committed.value;
  if (!project) return null;
  const variants = variantsOf(project, image.id);
  return (
    <Section
      section={{ kind: 'variants' }}
      title={t('variants.section')}
      count={variants.length}
    >
      <div class="variants-section">
        {variants.length === 0 ? (
          <span class="muted">{t('variants.none')}</span>
        ) : (
          <ul class="variants-list">
            {variants.map((v) => (
              <li key={v.id}>
                <Button
                  class="variants-row"
                  variant="ghost"
                  onClick={() => goToVariant(editor, v.id)}
                >
                  {rowText(project, image, v)}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <MissingTypes project={project} image={image} />
        <div class="row page-move-row">
          <LinkMenu image={image} project={project} readOnly={readOnly} />
          {variants.length > 0 && (
            <Button
              disabled={readOnly}
              onClick={() => editor.actions.unlinkVariant(image.id)}
            >
              {t('variants.unlink')}
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
