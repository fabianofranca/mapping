import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { t } from '../i18n';
import type { DisplayFieldLike, DisplayItem } from '../model/specFieldDisplay';
import { Button, HelpTip } from './controls';
import { Icon } from './icons';

// Field groups of a typed annotation (stage #2918, FG3; decisions 7 and 8): a collapsible subheading
// as a full-width row inside the `PropertyGrid`, and the "<n> hidden fields · Show" line. The state
// (collapsed groups, Show) belongs to the caller: the Details keeps it in `ui.collapsed` and in
// `TypedBody`, the Catalog Playground in local state. Nothing here changes the project.

interface FieldGroupProps {
  readonly name: string;
  readonly description: string | undefined;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  /** The group's fields (rows of the grid), shown only while it is open. */
  readonly children: ComponentChildren;
}

/** The subheading row and, while open, the group's rows (`display: contents`, so the grid holds). */
export function FieldGroup({
  name,
  description,
  collapsed,
  onToggle,
  children,
}: FieldGroupProps) {
  const bodyId = useId();
  return (
    <>
      <div class="field-group-head">
        <Button
          variant="ghost"
          size="sm"
          class="field-group-toggle"
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : bodyId}
          aria-label={t('typed.fieldGroup.toggle', { name })}
          onClick={onToggle}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} />
          <span class="field-group-name">{name}</span>
        </Button>
        {description !== undefined && <HelpTip name={name} text={description} />}
      </div>
      {!collapsed && (
        <div id={bodyId} class="field-group-body">
          {children}
        </div>
      )}
    </>
  );
}

interface FieldDisplayItemsProps<F extends DisplayFieldLike> {
  readonly items: readonly DisplayItem<F>[];
  readonly isCollapsed: (groupId: string) => boolean;
  readonly onToggle: (groupId: string) => void;
  readonly renderField: (field: F) => ComponentChildren;
}

/** The items of `fieldDisplay`: fields in place and each group as a subheading with its fields. */
export function FieldDisplayItems<F extends DisplayFieldLike>({
  items,
  isCollapsed,
  onToggle,
  renderField,
}: FieldDisplayItemsProps<F>) {
  return (
    <>
      {items.map((item) =>
        item.kind === 'field' ? (
          renderField(item.field)
        ) : (
          <FieldGroup
            key={`group:${item.group.id}`}
            name={item.group.name}
            description={item.group.description}
            collapsed={isCollapsed(item.group.id)}
            onToggle={() => onToggle(item.group.id)}
          >
            {item.fields.map(renderField)}
          </FieldGroup>
        ),
      )}
    </>
  );
}

interface HiddenFieldsLineProps {
  /** How many fields the conditions leave out. */
  readonly count: number;
  /** Whether **Show** is on (every hidden field is listed). */
  readonly shown: boolean;
  readonly onToggle: () => void;
}

/** "<n> hidden fields · Show": a full-width row at the end of the typed fields. */
export function HiddenFieldsLine({ count, shown, onToggle }: HiddenFieldsLineProps) {
  return (
    <div class="hidden-fields-line">
      <span class="hidden-fields-text">
        {count === 1 ? t('typed.hiddenFieldsOne') : t('typed.hiddenFields', { count })}
      </span>
      <Button variant="ghost" size="sm" aria-expanded={shown} onClick={onToggle}>
        {shown ? t('typed.hideHiddenFields') : t('typed.showHiddenFields')}
      </Button>
    </div>
  );
}
