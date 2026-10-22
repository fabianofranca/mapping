import { useId, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { projectIndex, type Marking, type Project } from '../model';
import { IconButton } from './controls';
import { useFocusOrigin, useModal, type FocusReturn } from './focus';
import { Icon } from './icons';
import { imageLabel, markingLabel, markingPath } from './labels';

// Seletor de marcação ("Ligar a…"): o mesmo popup do `RefPicker` (busca, ↑↓, Enter escolhe,
// Esc fecha), mas a lista são as marcações do projeto, nunca as setas, sem a própria.

interface MarkingOption {
  readonly marking: Marking;
  readonly label: string;
  readonly context: string;
}

/** As marcações que podem ser destino, com o contexto "container › caminho". */
export function markingOptions(project: Project, excludeId: string): MarkingOption[] {
  const index = projectIndex(project);
  return project.markings
    .filter((m) => m.id !== excludeId)
    .map((marking) => {
      const container =
        marking.containerId === null
          ? undefined
          : index.containers.get(marking.containerId);
      const context = [
        container ? imageLabel(container) : t('canvas.name'),
        markingPath(project, marking),
      ].join(t('marking.pathSeparator'));
      return { marking, label: markingLabel(marking), context };
    });
}

interface MarkingPickerProps {
  readonly project: Project;
  /** A marcação de origem, que não aparece na lista; também dá o título. */
  readonly source: Marking;
  /** Esc, clique fora ou escolha feita. */
  readonly onClose: () => void;
  readonly onPick: (marking: Marking) => void;
  /** Alvo do foco ao fechar se quem abriu não estiver mais no DOM. */
  readonly returnFocus?: FocusReturn;
}

export function MarkingPicker({
  project,
  source,
  onClose,
  onPick,
  returnFocus,
}: MarkingPickerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const origin = useFocusOrigin();
  useModal(dialog, origin, returnFocus, () => input.current?.focus());

  const all = markingOptions(project, source.id);
  const needle = query.trim().toLocaleLowerCase();
  const options =
    needle === ''
      ? all
      : all.filter((o) => `${o.label} ${o.context}`.toLocaleLowerCase().includes(needle));
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

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
      const option = options[activeIndex];
      if (option) onPick(option.marking);
    }
  };

  return (
    <dialog
      ref={dialog}
      class="picker"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div class="picker-body">
        <div class="picker-head">
          <h2 id={titleId}>{t('arrow.pickerTitle', { name: markingLabel(source) })}</h2>
          <IconButton icon="close" label={t('common.close')} onClick={onClose} />
        </div>
        {all.length === 0 ? (
          <p class="notice notice-info picker-empty">{t('arrow.pickerEmpty')}</p>
        ) : (
          <>
            <div class="picker-search">
              <input
                ref={input}
                type="search"
                class="input"
                role="combobox"
                aria-label={t('arrow.pickerSearch')}
                placeholder={t('arrow.pickerSearch')}
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
            <div class="picker-list" role="listbox" id={listId} aria-labelledby={titleId}>
              {options.length === 0 && (
                <p class="muted picker-empty">{t('arrow.pickerNoMatches')}</p>
              )}
              {options.map((option, i) => (
                <div
                  key={option.marking.id}
                  id={optionId(i)}
                  role="option"
                  class="picker-option"
                  aria-selected={i === activeIndex}
                  onMouseMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => onPick(option.marking)}
                >
                  <Icon name="marking" />
                  <span class="picker-option-label" title={option.label}>
                    {option.label}
                  </span>
                  <span class="picker-option-tag" title={option.context}>
                    {option.context}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <div class="picker-foot" aria-hidden="true">
          <span>
            <kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> {t('ref.keyNavigate')}
          </span>
          <span>
            <kbd class="kbd">Enter</kbd> {t('ref.keyChoose')}
          </span>
          <span>
            <kbd class="kbd">Esc</kbd> {t('ref.keyClose')}
          </span>
        </div>
      </div>
    </dialog>
  );
}
