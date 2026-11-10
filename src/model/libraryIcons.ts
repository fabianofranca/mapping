import type { IconNodeRef, IconSet } from './components/icons';
import type { LibraryIssue } from './library';
import { libraryIssue } from './libraryIssue';
import type { SpecAnnotationType } from './spec';
import { isRecord } from './isRecord';

// Conferência dos ícones na biblioteca (CF7). Puro; `library.ts` chama estas funções com o que
// já leu. Nível 2: todo nome LITERAL de um nó `icon` existe no conjunto declarado em `icons`.
// Nível 3: um campo `enum` lido pelo `name` do nó cujas `options` não estão no conjunto avisa.

/** Um nome de ícone escrito direto (texto) na expressão do `name`, com o caminho dele. */
export interface NameLiteral {
  readonly path: string;
  readonly value: string;
}

function branchLiterals(branches: readonly [unknown, string][]): NameLiteral[] {
  return branches.flatMap(([expr, at]) => nameLiterals(expr, at));
}

/** Os textos literais que a expressão pode produzir (`then`/`else` do `$if`, `cases`/`default` do `$switch`). */
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

/** Os campos que a expressão lê para produzir o nome (`$field`, direto ou dentro de `$if`/`$switch`). */
export function nameFields(expr: unknown): string[] {
  if (!isRecord(expr)) return [];
  if (typeof expr.$field === 'string') return [expr.$field];
  const nested: unknown[] = [expr.then, expr.else, expr.default];
  if (isRecord(expr.cases)) nested.push(...Object.values(expr.cases));
  return nested.flatMap(nameFields);
}

/**
 * Nível 2: cada nome literal de nó `icon` existe no conjunto. Sem `icons` declarado na
 * especialização o nome não pode ser conferido e o nó só desenharia reservado: erro também.
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
      // Conjunto declarado mas ilegível: o erro do arquivo já foi dado no nível 1.
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

/** Nível 3: opção de `enum` lida pelo `name` do nó `icon` que não está no conjunto de ícones. */
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
