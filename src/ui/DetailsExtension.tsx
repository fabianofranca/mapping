import type { ReadonlySignal } from '@preact/signals';
import { createContext, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import type { Entry, Layer } from '../model';
import type { DetailsSection } from '../store/ui';

// Details extension point (phase 9.5): the normal panels (`MarkingPanel`,
// `SelectionPanel`, `AnnotationsPanel`, `AnnotationEditor`, `TypedFields`,
// `KeyValueGrid`, `TableField`, `MarkingColorField`) ask here, field by field, what to
// draw beyond the control (a marker, a badge, a row that goes away), without knowing who
// answers. Outside a provider the value is `null` and the panel is the usual one: one context
// read per component, nothing more. Today the provider is the proposal review
// (`ui/review/ReviewItemPanel.tsx`).

/** A row that is no longer in the shown value, drawn where it was. */
export interface RemovedEntry {
  readonly entry: Entry;
  /** Position the pair had in the list. */
  readonly index: number;
}

/** An annotation that is no longer on the shown marking, with its drawing. */
export interface RemovedAnnotation {
  readonly id: string;
  /** Position the annotation had among those of the layer. */
  readonly index: number;
  readonly node: ComponentChildren;
}

/** Rows of a table that the shown value gained, and the note of those that went away. */
export interface TableRowsExtra {
  readonly added: ReadonlySet<string>;
  /** Name of the badge + the new rows ("New row"). */
  readonly addedLabel: string;
  /** Text below the table (e.g. the rows that go away); `null` with nothing to say. */
  readonly note: ComponentChildren;
}

export interface DetailsExtension {
  /**
   * What goes with the field `field` of the entity `entityId` (the marker), or `null`. The
   * fields are those of `Change.field` (`name`, `rect`, `parentId`, `file`, `markingColor`,
   * `parentAnnotationId`, `markingId`, `layerId`, `type`, `values.<key>`,
   * `entries.<id>`); `''` is the whole entity (the annotation header).
   */
  readonly mark: (entityId: string, field: string) => ComponentChildren;
  /**
   * Row below the field's control (the change note, the badge of the replaced proposal),
   * or `null`.
   */
  readonly below: (entityId: string, field: string) => ComponentChildren;
  /** Item header right below the identity (the decision and the warnings); `null` without it. */
  readonly header: (entityId: string) => ComponentChildren;
  /** Decision of the created or removed annotation (✓ ✕), in its header; `null` on the others. */
  readonly decision: (entityId: string) => ComponentChildren;
  /** "Other changes" section at the end of the item panel (what has no field), or `null`. */
  readonly others: (entityId: string) => ComponentChildren;
  /** Badges below the entity name, and whether the name is struck through. */
  readonly identity: (entityId: string) => {
    readonly flags: ComponentChildren;
    readonly struck: boolean;
  } | null;
  /** Extra summary in the header of a collapsible section ("3 changes"), or `null`. */
  readonly sectionSummary: (section: DetailsSection) => string | null;
  /** Layers whose groups the annotations panel shows, instead of the editor's visible ones. */
  readonly layers: (visible: readonly Layer[]) => readonly Layer[];
  /** Extra badge in the header of a layer's group. */
  readonly layerTag: (layerId: string) => ComponentChildren;
  /** Warning at the top of the marking's annotations. */
  readonly annotationsNotice: (markingId: string) => ComponentChildren;
  /** Annotations that left the marking in this layer, to draw where they were. */
  readonly removedAnnotations: (
    markingId: string,
    layerId: string,
  ) => readonly RemovedAnnotation[];
  /** Pairs that left the free annotation, to draw struck through where they were. */
  readonly removedEntries: (annotationId: string) => readonly RemovedEntry[];
  /** New rows and the note of those that went away from a table field, or `null`. */
  readonly tableRows: (annotationId: string, key: string) => TableRowsExtra | null;
  /**
   * Large groups: how many annotations to show at first and how many the "show
   * more" button adds each time, with the button text. `null`: all.
   */
  readonly annotationPage: {
    readonly first: number;
    readonly step: number;
    readonly label: (count: number) => string;
    /**
     * Id of the annotation that must be in view, even past "show more" (the change
     * selected in the Proposals window). A signal: only the group that reads it redoes.
     */
    readonly reveal: ReadonlySignal<string | null>;
  } | null;
  /** Name (screen reader only) of the grid column where the marker sits. */
  readonly markColumn: string;
}

export const DetailsExtensionContext = createContext<DetailsExtension | null>(null);

/** The Details extension in effect (`null` in the normal panel). */
export function useDetailsExtension(): DetailsExtension | null {
  return useContext(DetailsExtensionContext);
}
