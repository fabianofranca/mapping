import { t } from '../i18n';
import { ancestorsOf, type Marking, type Project, type ProjectImage } from '../model';
import { resolveSelection, type Selection } from '../store/ui';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { imageLabel, markingLabel } from './labels';

// Caminho da seleção acima do canvas (B11): Imagem › Marcação › Marcação. Clicar num
// nível seleciona aquele item; Alt+↑ e Alt+↓ andam no caminho (ver `app/shortcuts.ts`).

interface Crumb {
  readonly selection: NonNullable<Selection>;
  readonly label: string;
  readonly name: string;
}

function imageCrumb(image: ProjectImage): Crumb {
  const name = imageLabel(image);
  return {
    selection: { kind: 'image', id: image.id },
    name,
    label: t('crumbs.image', { name }),
  };
}

function markingCrumb(marking: Marking): Crumb {
  const name = markingLabel(marking);
  return {
    selection: { kind: 'marking', id: marking.id },
    name,
    label: t('crumbs.marking', { name }),
  };
}

/** Caminho da seleção, da imagem até o item selecionado. */
export function crumbsOf(project: Project | null, selection: Selection): Crumb[] {
  const resolved = resolveSelection(project, selection);
  if (!project || !resolved) return [];
  if (resolved.kind === 'image') return [imageCrumb(resolved.image)];
  const chain = [
    ...ancestorsOf(project, resolved.marking.id).reverse(),
    resolved.marking,
  ];
  return [imageCrumb(resolved.image), ...chain.map(markingCrumb)];
}

export function Breadcrumbs({
  onSelect,
}: {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const { store, ui } = useEditor();
  const crumbs = crumbsOf(store.committed.value, ui.selection.value);
  return (
    <nav class="crumbs" aria-label={t('crumbs.label')}>
      {crumbs.length === 0 && (
        <span class="crumbs-empty">{t('panel.nothingSelected')}</span>
      )}
      {crumbs.map((crumb, i) => (
        <span class="crumb-item" key={`${crumb.selection.kind}:${crumb.selection.id}`}>
          {i > 0 && (
            <span class="crumb-sep" aria-hidden="true">
              ›
            </span>
          )}
          <button
            type="button"
            class="crumb"
            aria-label={crumb.label}
            aria-current={i === crumbs.length - 1 ? 'location' : undefined}
            onClick={() => onSelect(crumb.selection)}
          >
            <Icon name={crumb.selection.kind === 'image' ? 'image' : 'marking'} />
            <span class="crumb-name">{crumb.name}</span>
          </button>
        </span>
      ))}
    </nav>
  );
}
