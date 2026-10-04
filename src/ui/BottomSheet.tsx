import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { t } from '../i18n';
import { Icon } from './icons';

interface BottomSheetProps {
  readonly title: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ComponentChildren;
}

/** Gaveta inferior do celular: recolhida mostra só o título; expandida, o conteúdo. */
export function BottomSheet({ title, expanded, onToggle, children }: BottomSheetProps) {
  const contentId = useId();
  return (
    <section class={expanded ? 'sheet sheet-expanded' : 'sheet'}>
      <button
        type="button"
        class="sheet-header"
        aria-expanded={expanded}
        aria-controls={contentId}
        title={t(expanded ? 'panel.collapse' : 'panel.expand')}
        onClick={onToggle}
      >
        <span class="sheet-title">{title}</span>
        <Icon name="chevronUp" />
      </button>
      <div id={contentId} class="sheet-content" hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
