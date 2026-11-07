import { t } from '../i18n';
import {
  arrowLinksOf,
  perspectiveRootOf,
  perspectiveRootSet,
  projectIndex,
  type Annotation,
  type ArrowLink,
  type Layer,
  type Marking,
  type Project,
} from '../model';
import { AnnotationLines, AnnotationTitle } from './AnnotationSummary';
import { PagedList } from './AnnotationsPanel';
import { Button, IconButton } from './controls';
import { useDetailsExtension } from './DetailsExtension';
import { Section } from './DetailsSection';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { arrowEndLabel, arrowText } from './labels';

/** A outra ponta está fora da perspectiva aberta? (decisão 16; na Principal nunca) */
function useOutsidePerspective(otherId: string): boolean {
  const { session, store } = useEditor();
  const project = store.project.value;
  const openId = session.perspective.id.value;
  const open = project?.perspectives.find((x) => x.id === openId);
  if (!project || !open) return false;
  const root = perspectiveRootOf(project, otherId);
  return root !== null && !perspectiveRootSet(open).has(root);
}

// Seção "Ligado por seta" dos Detalhes da marcação (etapa #658): uma linha por seta que sai ou
// chega, com a outra ponta e as anotações dela (e as da própria seta) nas camadas visíveis. É só
// leitura: para editar, a pessoa vai à outra ponta ou à seta, pelos botões da linha.

interface LayerGroupData {
  readonly layer: Layer;
  readonly annotations: readonly Annotation[];
}

/** As anotações do dono por camada visível (na ordem das camadas); camada sem anotação não entra. */
function annotationGroups(
  project: Project,
  ownerId: string,
  layers: readonly Layer[],
): LayerGroupData[] {
  const own = projectIndex(project).annotationsByMarking.get(ownerId) ?? [];
  if (own.length === 0) return [];
  const byLayer = new Map<string, Annotation[]>();
  for (const annotation of own) {
    const list = byLayer.get(annotation.layerId);
    if (list) list.push(annotation);
    else byLayer.set(annotation.layerId, [annotation]);
  }
  return layers.flatMap((layer) => {
    const annotations = byLayer.get(layer.id);
    return annotations ? [{ layer, annotations }] : [];
  });
}

function LayerAnnotations({
  project,
  groups,
}: {
  readonly project: Project;
  readonly groups: readonly LayerGroupData[];
}) {
  return (
    <>
      {groups.map(({ layer, annotations }) => (
        <div
          key={layer.id}
          class="arrow-link-layer"
          style={{ '--layer-color': layer.color }}
          data-layer={layer.id}
        >
          <div class="arrow-link-layer-head">
            <span class="layer-dot" aria-hidden="true" />
            <strong class="arrow-link-layer-name" title={layer.name}>
              {layer.name}
            </strong>
          </div>
          {annotations.map((annotation) => (
            <div key={annotation.id} class="arrow-link-annotation">
              <AnnotationTitle
                project={project}
                annotation={annotation}
                class="arrow-link-title"
              />
              <AnnotationLines
                project={project}
                annotation={annotation}
                lineClass="arrow-link-line"
                keyClass="arrow-link-key"
              />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

interface ArrowLinkRowProps {
  readonly project: Project;
  readonly link: ArrowLink;
  readonly layers: readonly Layer[];
}

/** A outra ponta: botão que a seleciona; a marcação que não existe mais vira texto neutro. */
function OtherEnd({
  project,
  other,
}: {
  readonly project: Project;
  readonly other: Marking | undefined;
}) {
  const { ui } = useEditor();
  const text = arrowEndLabel(project, other);
  if (!other) return <span class="props-text muted arrow-link-end">{text}</span>;
  const name = t('arrow.select', { name: text });
  return (
    <Button
      size="sm"
      variant="ghost"
      class="arrow-link-end"
      title={name}
      aria-label={name}
      onClick={() => (ui.selection.value = { kind: 'marking', id: other.id })}
    >
      {text}
    </Button>
  );
}

function ArrowLinkRow({ project, link, layers }: ArrowLinkRowProps) {
  const { ui } = useEditor();
  const { arrow, direction, otherId } = link;
  const other = projectIndex(project).markings.get(otherId);
  const direct = other ? annotationGroups(project, otherId, layers) : [];
  const onArrow = annotationGroups(project, arrow.id, layers);
  const outside = useOutsidePerspective(otherId);
  const directionLabel = t(direction === 'out' ? 'arrowLinks.out' : 'arrowLinks.in');
  return (
    <li class="arrow-link" data-arrow={arrow.id}>
      <div class="arrow-link-head">
        <span
          class="arrow-link-direction"
          role="img"
          aria-label={directionLabel}
          title={directionLabel}
        >
          <Icon name={direction === 'out' ? 'arrowRight' : 'arrowLeft'} />
        </span>
        <OtherEnd project={project} other={other} />
        {outside && (
          <span class="arrow-link-outside muted">{t('perspective.arrow.outside')}</span>
        )}
        {arrow.name !== null && (
          <span class="arrow-link-name muted" title={arrow.name}>
            {arrow.name}
          </span>
        )}
        <IconButton
          icon="arrow"
          size="sm"
          label={t('arrowLinks.selectArrow')}
          tooltip={arrowText(project, arrow)}
          onClick={() => (ui.selection.value = { kind: 'arrow', id: arrow.id })}
        />
      </div>
      <LayerAnnotations project={project} groups={direct} />
      {onArrow.length > 0 && (
        <div class="arrow-link-on-arrow">
          <span class="arrow-link-on-arrow-label">{t('arrowLinks.onArrow')}</span>
          <LayerAnnotations project={project} groups={onArrow} />
        </div>
      )}
      {direct.length === 0 && onArrow.length === 0 && (
        <p class="arrow-link-empty muted">{t('arrowLinks.empty')}</p>
      )}
    </li>
  );
}

/**
 * Seção "Ligado por seta": só existe quando a marcação tem seta. A lista usa a paginação dos
 * Detalhes (`annotationPage` da revisão), sem limite próprio.
 */
export function ArrowLinksSection({
  project,
  marking,
}: {
  readonly project: Project;
  readonly marking: Marking;
}) {
  const { derived, session, store } = useEditor();
  const ext = useDetailsExtension();
  // Com perspectiva aberta, `project` é o recorte dela, que descarta as setas cuja outra ponta
  // está fora (decisão 16: elas aparecem como "Sai para…" com o selo): consulta o projeto inteiro.
  const whole = session.perspective.id.value !== null ? store.project.value : null;
  const source = whole ?? project;
  const links = arrowLinksOf(source, marking.id);
  if (links.length === 0) return null;
  const layers = derived.visibleLayers.value;
  const items = links.map((link) => ({
    key: link.arrow.id,
    node: <ArrowLinkRow project={source} link={link} layers={layers} />,
  }));
  return (
    <Section
      section={{ kind: 'arrowLinks' }}
      title={t('arrowLinks.section')}
      count={links.length}
    >
      <ul class="arrow-links">
        <PagedList items={items} page={ext?.annotationPage ?? null} />
      </ul>
    </Section>
  );
}
