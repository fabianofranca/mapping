import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { isSectionCollapsed, toggleSection, type DetailsSection } from '../store/ui';
import { useDetailsExtension } from './DetailsExtension';
import { useEditor } from './EditorContext';
import { Icon } from './icons';

// Collapsible Details section (B15): Marking, Image and Annotations. Collapsed, it shows
// a summary in the header and does not mount the content.

interface SectionProps {
  readonly section: DetailsSection;
  readonly title: string;
  /** Summary shown when collapsed (e.g. "X 112 · Y 236 · 346 × 84 px"). */
  readonly summary?: string;
  /** Count beside the title (e.g. number of annotations). */
  readonly count?: number;
  /** Actions on the right of the header (e.g. "+ Annotation"). */
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
  const extra = useDetailsExtension()?.sectionSummary(section) ?? null;
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
          {collapsed && extra && <span class="details-section-changes">{extra}</span>}
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
