import { Fragment } from 'preact';
import { t } from '../i18n';
import { ancestorsOf, type Marking, type Project, type ProjectContainer } from '../model';
import { resolveSelection, type Selection } from '../store/ui';
import { drawHintVisible } from '../store/drawHint';
import { selectionProject } from '../store/shownSelection';
import { ActionMenu } from './ActionMenu';
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

/**
 * O "…" do caminho recolhido: o CSS esconde os trechos do meio e mostra este botão na barra
 * estreita (container query); o menu lista o caminho inteiro e cada nível seleciona o seu.
 */
function PathMenu({
  crumbs,
  onSelect,
}: {
  readonly crumbs: readonly Crumb[];
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const items = crumbs.map((crumb, i) => ({
    label: crumb.name,
    current: i === crumbs.length - 1,
    disabled: crumb.selection === null,
    onSelect: () => {
      if (crumb.selection) onSelect(crumb.selection);
    },
  }));
  return (
    <span class="crumb-more">
      <span class="crumb-sep" aria-hidden="true">
        ›
      </span>
      <ActionMenu
        icon="more"
        label={t('crumbs.showFull')}
        menuLabel={t('crumbs.menu')}
        items={items}
      />
    </span>
  );
}

function crumbIcon(kind: NonNullable<Selection>['kind']): 'image' | 'arrow' | 'marking' {
  if (kind === 'image') return 'image';
  return kind === 'arrow' ? 'arrow' : 'marking';
}

/** Um trecho do caminho; os do meio (nem o primeiro nem o último) saem na barra estreita. */
function CrumbItem({
  crumb,
  first,
  last,
  onSelect,
}: {
  readonly crumb: Crumb;
  readonly first: boolean;
  readonly last: boolean;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const { selection: target } = crumb;
  const name = (
    <span class="crumb-name" title={crumb.name}>
      {crumb.name}
    </span>
  );
  return (
    <span class={first || last ? 'crumb-item' : 'crumb-item crumb-mid'}>
      {!first && (
        <span class="crumb-sep" aria-hidden="true">
          ›
        </span>
      )}
      {target ? (
        <button
          type="button"
          class="crumb"
          aria-label={crumb.label}
          aria-current={last ? 'location' : undefined}
          onClick={() => onSelect(target)}
        >
          <Icon name={crumbIcon(target.kind)} />
          {name}
        </button>
      ) : (
        <span class="crumb crumb-static" aria-label={crumb.label}>
          {name}
        </span>
      )}
    </span>
  );
}

export function Breadcrumbs({
  onSelect,
}: {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const { review, store, ui } = useEditor();
  // O projeto à vista: na visão Proposto da revisão, o item que só existe na proposta
  // também tem caminho (fase 8.2, P1), e o de uma criação rejeitada, pela prévia sem decisões.
  const selection = ui.selection.value;
  const crumbs = crumbsOf(selectionProject(review, selection), selection);
  const hint = drawHintVisible({
    mode: ui.mode.value,
    locked: store.locked.value,
    selection,
    shownProject: review.derived.shownProject.value,
  });
  const emptyText = hint ? t('editor.drawHint') : t('panel.nothingSelected');
  return (
    <nav class="crumbs" aria-label={t('crumbs.label')}>
      {crumbs.length === 0 && (
        <span class="crumbs-empty" title={emptyText}>
          {emptyText}
        </span>
      )}
      {crumbs.map((crumb, i) => (
        <Fragment
          key={
            crumb.selection ? `${crumb.selection.kind}:${crumb.selection.id}` : 'canvas'
          }
        >
          {i === 1 && crumbs.length >= 3 && (
            <PathMenu crumbs={crumbs} onSelect={onSelect} />
          )}
          <CrumbItem
            crumb={crumb}
            first={i === 0}
            last={i === crumbs.length - 1}
            onSelect={onSelect}
          />
        </Fragment>
      ))}
    </nav>
  );
}
