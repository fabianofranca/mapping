import type { IconNodeRef, IconSet } from './components/icons';
import type { LibraryIssue } from './library';
import { libraryIssue } from './libraryIssue';
import type { SpecAnnotationType } from './spec';
import { isRecord } from './isRecord';

// Icon checks in the library (CF7). Pure; `library.ts` calls these functions with what it
// already read. Level 2: every LITERAL name of an `icon` node exists in the set declared in `icons`.
// Level 3: an `enum` field read by the `name` of the node whose `options` are not in the set warns.

/** An icon name written directly (text) in the `name` expression, with its path. */
export interface NameLiteral {
  readonly path: string;
  readonly value: string;
}

function branchLiterals(branches: readonly [unknown, string][]): NameLiteral[] {
  return branches.flatMap(([expr, at]) => nameLiterals(expr, at));
}

/** The literal texts the expression can produce (`then`/`else` of `$if`, `cases`/`default` of `$switch`). */
export function nameLiterals(expr: unknown, path: string): NameLiteral[] {
  if (typeof expr === 'string') return [{ path, value: expr }];
  if (!isRecord(expr)) return [];
  if ('$if' in expr)
    return branchLiterals([
      [expr.then, `${path}.then`],
      [expr.else, `${path}.else`],
    ]);
  if ('$switch' in expr) {
    const cases = isRecord(expr.cases) ? expr.cases : {};
    return branchLiterals([
      ...Object.entries(cases).map(([k, v]): [unknown, string] => [
        v,
        `${path}.cases.${k}`,
      ]),
      [expr.default, `${path}.default`],
    ]);
  }
  return [];
}

/** The fields the expression reads to produce the name (`$field`, direct or inside `$if`/`$switch`). */
export function nameFields(expr: unknown): string[] {
  if (!isRecord(expr)) return [];
  if (typeof expr.$field === 'string') return [expr.$field];
  const nested: unknown[] = [expr.then, expr.else, expr.default];
  if (isRecord(expr.cases)) nested.push(...Object.values(expr.cases));
  return nested.flatMap(nameFields);
}

/**
 * Level 2: every literal name of an `icon` node exists in the set. Without `icons` declared in the
 * specialization the name cannot be checked and the node would only draw a placeholder: an error too.
 */
export function iconLiteralIssues(
  file: string,
  nodes: readonly IconNodeRef[],
  set: IconSet | undefined,
  iconsPath: string | undefined,
): LibraryIssue[] {
  const out: LibraryIssue[] = [];
  for (const node of nodes) {
    for (const literal of nameLiterals(node.name, node.path)) {
      if (set !== undefined && Object.hasOwn(set.icons, literal.value)) continue;
      // Declared set but unreadable: the file's error was already given at level 1.
      if (iconsPath !== undefined && set === undefined) continue;
      out.push(
        iconsPath === undefined
          ? libraryIssue('error', file, literal.path, 'library.iconUnverifiable', {
              name: literal.value,
            })
          : libraryIssue('error', file, literal.path, 'library.iconMissing', {
              name: literal.value,
              path: iconsPath,
            }),
      );
    }
  }
  return out;
}

/** Level 3: an `enum` option read by the `name` of the `icon` node that is not in the icon set. */
export function iconOptionIssues(
  specPath: string,
  type: SpecAnnotationType,
  base: string,
  nodes: readonly IconNodeRef[],
  set: IconSet | undefined,
): LibraryIssue[] {
  if (set === undefined) return [];
  const read = new Set(nodes.flatMap((node) => nameFields(node.name)));
  const out: LibraryIssue[] = [];
  type.fields.forEach((field, fi) => {
    if (field.type !== 'enum' || !read.has(field.key)) return;
    (field.options ?? []).forEach((option, oi) => {
      if (Object.hasOwn(set.icons, option)) return;
      out.push(
        libraryIssue(
          'warning',
          specPath,
          `${base}.fields[${fi}].options[${oi}]`,
          'library.iconOptionMissing',
          { option, key: field.key },
        ),
      );
    });
  });
  return out;
}
