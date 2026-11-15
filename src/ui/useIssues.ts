import type { AnnotationIssue } from '../model';
import { useEditor } from './EditorContext';

const NO_ISSUES: readonly AnnotationIssue[] = [];

/**
 * The pending items of the project in view, per annotation: the model's plus the ones only the drawing
 * knows (`component-overflow`, `slot-not-accepted`, `slot-full`; decision 7 of #1080). The Details, the
 * summary and the field read this map, the same one the Incomplete window and the list read.
 */
export function useIssues(): ReadonlyMap<string, readonly AnnotationIssue[]> {
  return useEditor().derived.issues.value;
}

/** The pending items of one annotation (empty when it has none). */
export function useIssuesOf(annotationId: string): readonly AnnotationIssue[] {
  return useIssues().get(annotationId) ?? NO_ISSUES;
}
