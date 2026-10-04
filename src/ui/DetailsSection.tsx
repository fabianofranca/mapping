import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { isSectionCollapsed, toggleSection, type DetailsSection } from '../store/ui';
import { useEditor } from './EditorContext';
import { Icon } from './icons';

// Seção recolhível de Detalhes (B15): Marcação, Imagem e Anotações. Recolhida, mostra
// um resumo no cabeçalho e não monta o conteúdo.

interface SectionProps {
  readonly section: DetailsSection;
  readonly title: string;
  /** Resumo mostrado quando recolhida (ex.: "X 112 · Y 236 · 346 × 84 px"). */
  readonly summary?: string;
  /** Contagem ao lado do título (ex.: número de anotações). */
  readonly count?: number;
  /** Ações à direita do cabeçalho (ex.: "+ Anotação"). */
  readonly actions?: ComponentChildren;
  readonly children: ComponentChildren;
}

export function Section({
  section,
  title,
  summary,
  count,
  actions,
  children,
}: SectionProps) {
  const { ui } = useEditor();
  const collapsed = isSectionCollapsed(ui, section);
  const bodyId = useId();
  return (
    <section class="details-section" aria-label={title}>
      <div class="details-section-head">
        <button
          type="button"
          class="details-section-toggle"
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : bodyId}
          onClick={() => toggleSection(ui, section)}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} />
          <span class="details-section-title">{title}</span>
          {count !== undefined && <span class="details-section-count">{count}</span>}
          {collapsed && summary && <span class="details-section-summary">{summary}</span>}
        </button>
        {actions}
      </div>
      {!collapsed && (
        <div id={bodyId} class="details-section-body">
          {children}
        </div>
      )}
    </section>
  );
}
