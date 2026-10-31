import { t } from '../i18n';
import { ancestorsOf, type Marking, type Project, type ProjectContainer } from '../model';
import { resolveSelection, type Selection } from '../store/ui';
import { selectionProject } from '../store/shownSelection';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { arrowText, imageLabel, markingLabel } from './labels';

// Caminho da seleção acima do canvas (B11): Imagem › Marcação › Marcação. Clicar num
// nível seleciona aquele item; Alt+↑ e Alt+↓ andam no caminho (ver `app/shortcuts.ts`).

interface Crumb {
  /** O que o clique seleciona; `null` no nível Canvas, que só rotula. */
  readonly selection: Selection;
  readonly label: string;
  readonly name: string;
}

function imageCrumb(image: ProjectContainer): Crumb {
  const name = imageLabel(image);
  return {
    selection: { kind: 'image', id: image.id },
    name,
    label: t('crumbs.image', { name }),
  };
}

function markingCrumb(project: Project, marking: Marking): Crumb {
  const name = markingLabel(project, marking);
  return {
    selection: { kind: 'marking', id: marking.id },
    name,
    label: t('crumbs.marking', { name }),
  };
}

function canvasCrumb(): Crumb {
  return { selection: null, name: t('canvas.name'), label: t('crumbs.canvas') };
}

/** Marcações do canvas que contêm o container, da mais externa à mais interna. */
function canvasChain(project: Project, parentId: string | null): Marking[] {
  if (parentId === null) return [];
  return [
    ...ancestorsOf(project, parentId).reverse(),
    project.markings.find((m) => m.id === parentId),
  ].filter((m): m is Marking => m !== undefined);
}

/**
 * Caminho da seleção: Canvas › marcações do canvas › container › marcações. O primeiro nível
 * (Canvas) só rotula: não há item do canvas para selecionar.
 */
export function crumbsOf(project: Project | null, selection: Selection): Crumb[] {
  const resolved = resolveSelection(project, selection);
  if (!project || !resolved) return [];
  // A seta é uma folha: o caminho dela é "Origem → Destino" (o nome, se houver).
  if (resolved.kind === 'arrow') {
    const name = arrowText(project, resolved.arrow);
    return [
      canvasCrumb(),
      {
        selection: { kind: 'arrow', id: resolved.arrow.id },
        name,
        label: t('crumbs.arrow', { name }),
      },
    ];
  }
  if (resolved.kind === 'image') {
    return [
      canvasCrumb(),
      ...canvasChain(project, resolved.image.parentId).map((m) =>
        markingCrumb(project, m),
      ),
      imageCrumb(resolved.image),
    ];
  }
  const chain = [
    ...ancestorsOf(project, resolved.marking.id).reverse(),
    resolved.marking,
  ];
  if (resolved.image === null)
    return [canvasCrumb(), ...chain.map((m) => markingCrumb(project, m))];
  return [
    canvasCrumb(),
    ...canvasChain(project, resolved.image.parentId).map((m) => markingCrumb(project, m)),
    imageCrumb(resolved.image),
    ...chain.map((m) => markingCrumb(project, m)),
  ];
}

export function Breadcrumbs({
  onSelect,
}: {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const { review, ui } = useEditor();
  // O projeto à vista: na visão Proposto da revisão, o item que só existe na proposta
  // também tem caminho (fase 8.2, P1), e o de uma criação rejeitada, pela prévia sem decisões.
  const selection = ui.selection.value;
  const crumbs = crumbsOf(selectionProject(review, selection), selection);
  return (
    <nav class="crumbs" aria-label={t('crumbs.label')}>
      {crumbs.length === 0 && (
        <span class="crumbs-empty">{t('panel.nothingSelected')}</span>
      )}
      {crumbs.map((crumb, i) => {
        const { selection: target } = crumb;
        return (
          <span
            class="crumb-item"
            key={target ? `${target.kind}:${target.id}` : 'canvas'}
          >
            {i > 0 && (
              <span class="crumb-sep" aria-hidden="true">
                ›
              </span>
            )}
            {target ? (
              <button
                type="button"
                class="crumb"
                aria-label={crumb.label}
                aria-current={i === crumbs.length - 1 ? 'location' : undefined}
                onClick={() => onSelect(target)}
              >
                <Icon
                  name={
                    target.kind === 'image'
                      ? 'image'
                      : target.kind === 'arrow'
                        ? 'arrow'
                        : 'marking'
                  }
                />
                <span class="crumb-name" title={crumb.name}>
                  {crumb.name}
                </span>
              </button>
            ) : (
              <span class="crumb crumb-static" aria-label={crumb.label}>
                <span class="crumb-name" title={crumb.name}>
                  {crumb.name}
                </span>
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
