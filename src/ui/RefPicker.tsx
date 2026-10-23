import { useId, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  fieldLabel,
  findCellRefTargets,
  findRefTargets,
  parseRefValue,
  projectIndex,
  tableRows,
  type Annotation,
  type Project,
  type RefTarget,
  type SpecField,
  type SpecRefColumn,
} from '../model';
import { IconButton, Tabs, type TabItem } from './controls';
import { useFocusOrigin, useModal, type FocusReturn } from './focus';
import { Icon } from './icons';
import { imageLabel, markingPath } from './labels';
import { annotationSourceLabel, labelTexts } from './typedText';

// Seletor de referência no estilo "ir para símbolo" (B14): popup de 600px no topo,
// sem fundo escurecido, com busca, abas por etiqueta aceita
// (P5) e teclado: ↑↓ navegam, Enter escolhe, Ctrl+Enter escolhe e vai até o alvo,
// Esc fecha. Ao fechar (Esc, clique fora ou escolha), o foco volta a quem abriu, como no
// `Dialog`: depois de o seletor sair da tela, porque com ele aberto o resto é inerte.

/** Campo `ref` da anotação ou coluna `ref` de uma tabela: o seletor lê `key`, `label` e `accepts`. */
export type RefFieldDef = Extract<SpecField, { type: 'ref' }> | SpecRefColumn;

/** A célula que o seletor edita: a tabela do tipo e a linha (o `field` é a coluna). */
export interface RefCellTarget {
  readonly tableKey: string;
  readonly rowId: string;
}

/** Aba do filtro: todos, uma etiqueta aceita ou só as tuplas livres. */
type Filter =
  | { readonly kind: 'all' }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'free' };

interface TargetGroup {
  readonly annotation: Annotation;
  readonly context: string;
  readonly items: RefTarget[];
}

/** Agrupa os alvos por anotação, com o contexto "imagem › marcação". */
function groupTargets(project: Project, targets: readonly RefTarget[]): TargetGroup[] {
  const index = projectIndex(project);
  const groups = new Map<string, TargetGroup>();
  for (const target of targets) {
    const id = target.annotation.id;
    let group = groups.get(id);
    if (!group) {
      const marking = index.markings.get(target.annotation.markingId);
      const image =
        marking?.containerId != null
          ? index.containers.get(marking.containerId)
          : undefined;
      const context = [
        image ? imageLabel(image) : marking ? t('canvas.name') : '',
        marking ? markingPath(project, marking) : '',
      ]
        .filter((s) => s !== '')
        .join(t('marking.pathSeparator'));
      group = { annotation: target.annotation, context, items: [] };
      groups.set(id, group);
    }
    group.items.push(target);
  }
  return [...groups.values()];
}

function noTargetsMessage(field: RefFieldDef): string {
  const tags = (field.accepts.tags ?? []).join(', ');
  if (tags !== '' && field.accepts.free) return t('ref.noTargetsTagsFree', { tags });
  if (tags !== '') return t('ref.noTargetsTags', { tags });
  return t('ref.noTargetsFree');
}

/** "aceita: data-field e livres". */
function acceptsText(field: RefFieldDef): string {
  const parts = [...(field.accepts.tags ?? [])];
  if (field.accepts.free) parts.push(t('ref.free'));
  return t('ref.accepts', { what: parts.join(t('ref.acceptsJoin')) });
}

function matches(filter: Filter, target: RefTarget): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'free') return target.tags.length === 0;
  return target.tags.includes(filter.tag);
}

const filterId = (filter: Filter) =>
  filter.kind === 'tag' ? `tag:${filter.tag}` : filter.kind;

/** Texto com o trecho buscado em `<mark>`. */
function Highlight({ text, needle }: { readonly text: string; readonly needle: string }) {
  const at = needle === '' ? -1 : text.toLocaleLowerCase().indexOf(needle);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

interface RefPickerProps {
  readonly project: Project;
  readonly annotation: Annotation;
  /** O campo `ref`; com `cell`, a coluna `ref` da tabela. */
  readonly field: RefFieldDef;
  /** Célula de uma coluna `ref` (variante da tabela): os alvos e o valor atual vêm da linha. */
  readonly cell?: RefCellTarget;
  /**
   * Versão compacta, para a célula de uma tabela: popup mais estreito e sem a barra de
   * atalhos (o teclado é o mesmo).
   */
  readonly compact?: boolean;
  /** Esc, clique fora ou escolha feita. */
  readonly onClose: () => void;
  /** Alvo escolhido; `goTo` = Ctrl+Enter (ou Ctrl+clique): também vai até ele. */
  readonly onPick: (target: RefTarget, goTo: boolean) => void;
  /** Alvo do foco ao fechar se quem abriu não estiver mais no DOM (o campo da referência). */
  readonly returnFocus?: FocusReturn;
}

export function RefPicker({
  project,
  annotation,
  field,
  cell,
  compact = false,
  onClose,
  onPick,
  returnFocus,
}: RefPickerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const targets = cell
    ? findCellRefTargets(project, annotation.id, cell.tableKey, field.key, labelTexts())
    : findRefTargets(project, annotation.id, field.key, labelTexts());
  const currentValue = cell
    ? tableRows(annotation.values?.[cell.tableKey]).find((r) => r._id === cell.rowId)?.[
        field.key
      ]
    : annotation.values?.[field.key];
  const current = parseRefValue(currentValue);
  const isCurrent = (target: RefTarget) =>
    current !== null && JSON.stringify(current) === JSON.stringify(target.ref);
  const [active, setActive] = useState(() => Math.max(0, targets.findIndex(isCurrent)));
  // Quem tinha o foco ao abrir (o campo da referência), guardado antes de o seletor pegá-lo.
  const origin = useFocusOrigin();
  useModal(dialog, origin, returnFocus, () => input.current?.focus());

  const filters: Filter[] = [
    ...(field.accepts.tags ?? []).map((tag) => ({ kind: 'tag', tag }) as const),
    ...(field.accepts.free ? [{ kind: 'free' } as const] : []),
  ];
  const tabs: TabItem<string>[] =
    filters.length > 1
      ? [{ kind: 'all' } as const, ...filters].map((f) => ({
          id: filterId(f),
          label:
            f.kind === 'all'
              ? t('ref.filterAll')
              : f.kind === 'free'
                ? t('ref.filterFree')
                : f.tag,
        }))
      : [];

  const needle = query.trim().toLocaleLowerCase();
  const groups = groupTargets(
    project,
    targets.filter((target) => matches(filter, target)),
  )
    .map((g) => ({
      ...g,
      items:
        needle === ''
          ? g.items
          : g.items.filter((i) =>
              `${i.label} ${g.context}`.toLocaleLowerCase().includes(needle),
            ),
    }))
    .filter((g) => g.items.length > 0);
  const options = groups.flatMap((g) => g.items);
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  const choose = (target: RefTarget | undefined, goTo: boolean) => {
    if (target) onPick(target, goTo);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = (activeIndex + step + options.length) % options.length;
      setActive(next);
      dialog.current
        ?.querySelector(`[id="${optionId(next)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(options[activeIndex], e.ctrlKey || e.metaKey);
    }
  };

  let n = 0;
  return (
    <dialog
      ref={dialog}
      class={compact ? 'picker picker-compact' : 'picker'}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clique fora do conteúdo (no fundo transparente) fecha.
        if (e.target === dialog.current) onClose();
      }}
    >
      <div class="picker-body">
        <div class="picker-head">
          <h2 id={titleId}>{t('ref.pickerTitle', { field: fieldLabel(field) })}</h2>
          <span class="picker-accepts">{acceptsText(field)}</span>
          <IconButton icon="close" label={t('common.close')} onClick={onClose} />
        </div>
        {targets.length === 0 ? (
          <p class="notice notice-info picker-empty">{noTargetsMessage(field)}</p>
        ) : (
          <>
            <div class="picker-search">
              <input
                ref={input}
                type="search"
                class="input"
                role="combobox"
                aria-label={t('ref.search')}
                placeholder={t('ref.search')}
                aria-controls={listId}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={
                  options.length > 0 ? optionId(activeIndex) : undefined
                }
                value={query}
                onInput={(e) => {
                  setQuery(e.currentTarget.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
              />
            </div>
            {tabs.length > 0 && (
              <div class="picker-tabs">
                <Tabs
                  label={t('ref.filterLabel')}
                  tabs={tabs}
                  value={filterId(filter)}
                  onChange={(id) => {
                    const next = [{ kind: 'all' } as const, ...filters].find(
                      (f) => filterId(f) === id,
                    );
                    if (next) setFilter(next);
                    setActive(0);
                    input.current?.focus();
                  }}
                />
              </div>
            )}
            <div class="picker-list" role="listbox" id={listId} aria-labelledby={titleId}>
              {options.length === 0 && (
                <p class="muted picker-empty">{t('ref.noMatches')}</p>
              )}
              {groups.map((group) => (
                <div
                  key={group.annotation.id}
                  role="group"
                  aria-label={annotationSourceLabel(project, group.annotation)}
                >
                  <div class="picker-group" aria-hidden="true">
                    <strong>{annotationSourceLabel(project, group.annotation)}</strong>
                    <span class="picker-context" title={group.context}>
                      {group.context}
                    </span>
                  </div>
                  {group.items.map((item) => {
                    const i = n++;
                    return (
                      <div
                        key={JSON.stringify(item.ref)}
                        id={optionId(i)}
                        role="option"
                        class="picker-option"
                        aria-selected={i === activeIndex}
                        onMouseMove={() => i !== activeIndex && setActive(i)}
                        onClick={(e) => choose(item, e.ctrlKey || e.metaKey)}
                      >
                        <Icon name="arrowRight" />
                        <span class="picker-option-label" title={item.label}>
                          <Highlight text={item.label} needle={needle} />
                        </span>
                        {isCurrent(item) && (
                          <span class="picker-current">{t('ref.current')}</span>
                        )}
                        <span class="picker-option-tag">
                          {item.tags.length > 0 ? item.tags.join(', ') : t('ref.freeTag')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
        {!compact && (
          <div class="picker-foot" aria-hidden="true">
            <span>
              <kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> {t('ref.keyNavigate')}
            </span>
            <span>
              <kbd class="kbd">Enter</kbd> {t('ref.keyChoose')}
            </span>
            <span>
              <kbd class="kbd">Ctrl+Enter</kbd> {t('ref.keyGoTo')}
            </span>
            <span>
              <kbd class="kbd">Esc</kbd> {t('ref.keyClose')}
            </span>
          </div>
        )}
      </div>
    </dialog>
  );
}
