import {
  formatCheckIssues,
  type FormatCheckPackage,
  type PackageReader as ModelPackageReader,
} from '../src/model';
import type { LibraryIssue } from '../src/model/library';
import { builtinFontBook, measurerFor } from './image/textMeasurer';
import { quickJsRunner } from './pluginRunner';

// `validate_library` for the file formats of a specialization (stage #1923, FP4, decision 17). The
// rules live in the model (`src/model/formatChecks.ts`, stage #2035, decision 13), shared with the
// app; here they run with the QuickJS executor and the built-in font book.

export type FormatPackage = FormatCheckPackage;

/** Reads a file of the package by its path in the package; `null` when there is none. */
export type PackageReader = ModelPackageReader;

/**
 * The problems of the specialization's file formats at level 2 (the plugin loads and defines a
 * function) and, with `level` 3, of their examples. Only for a package that passed level 1.
 */
export function pluginIssues(
  pkg: FormatPackage,
  read: PackageReader,
  level: 2 | 3,
): Promise<LibraryIssue[]> {
  return formatCheckIssues(pkg, read, level, {
    run: quickJsRunner,
    measure: measurerFor(builtinFontBook()),
  });
}
