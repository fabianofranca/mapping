import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import type { CiteCandidate, CiteGroup } from '../../model';
import { place } from '../Popover';

// O seletor do `@` no compositor (etapa Comentários, CM5, decisão 31): uma lista flutuante de
// opções agrupadas ("aqui" primeiro), ancorada ao editor. O foco fica no editor, que aponta a
// opção ativa por `aria-activedescendant`; aqui só se desenha e se escolhe com o mouse.

/** Id da opção `index` da lista `listId` (o editor o usa em `aria-activedescendant`). */
export const optionId = (listId: string, index: number): string => `${listId}-${index}`;

interface CitePickerProps {
  readonly id: string;
  /** O editor: a lista fica embaixo dele, com a largura dele no mínimo. */
  readonly anchor: HTMLElement | null;
  readonly candidates: readonly CiteCandidate[];
  readonly active: number;
  readonly onPick: (candidate: CiteCandidate) => void;
  readonly onClose: () => void;
}

interface Section {
  readonly group: CiteGroup;
  readonly items: readonly {
    readonly candidate: CiteCandidate;
    readonly index: number;
  }[];
}

/** As candidatas, já na ordem dos grupos, em seções seguidas; guarda o índice global. */
function sectionsOf(candidates: readonly CiteCandidate[]): Section[] {
  const sections: { group: CiteGroup; items: Section['items'][number][] }[] = [];
  candidates.forEach((candidate, index) => {
    const current = sections.at(-1);
    if (current?.group === candidate.group) current.items.push({ candidate, index });
    else sections.push({ group: candidate.group, items: [{ candidate, index }] });
  });
  return sections;
}

export function CitePicker({
  id,
  anchor,
  candidates,
  active,
  onPick,
  onClose,
}: CitePickerProps) {
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!anchor || !el) return;
    el.style.minWidth = `${anchor.offsetWidth}px`;
    place(anchor, el, 'start');
    const follow = () => place(anchor, el, 'start');
    document.addEventListener('scroll', follow, true);
    globalThis.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('scroll', follow, true);
      globalThis.removeEventListener('resize', onClose);
    };
    // `onClose` só avisa o editor; o posicionamento depende do tamanho da lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, candidates.length]);

  useLayoutEffect(() => {
    const option = panel.current?.querySelector('[aria-selected="true"]');
    if (option && 'scrollIntoView' in option) option.scrollIntoView({ block: 'nearest' });
  }, [active, candidates]);

  return (
    <div
      class="popover suggestions cite-picker"
      id={id}
      role="listbox"
      aria-label={t('citation.picker')}
      ref={panel}
      // Sem tirar o foco do editor.
      onMouseDown={(e) => e.preventDefault()}
    >
      {sectionsOf(candidates).map((section) => {
        const headingId = `${id}-g-${section.group}`;
        return (
          <div key={section.group} role="group" aria-labelledby={headingId}>
            <div id={headingId} class="cite-picker-group" role="presentation">
              {t(`citation.group.${section.group}`)}
            </div>
            {section.items.map(({ candidate, index }) => (
              <div
                key={index}
                id={optionId(id, index)}
                role="option"
                aria-selected={index === active}
                class="suggestion"
                onClick={() => onPick(candidate)}
              >
                <span class="suggestion-label">{candidate.label}</span>
                {candidate.detail !== '' && (
                  <span class="suggestion-detail">{candidate.detail}</span>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
