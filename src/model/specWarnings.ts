import {
  LEGACY_SPEC_FORMAT,
  REMOVED_FIELD_TYPE,
  type IgnoredSpecField,
  type Spec,
  type SpecCode,
} from './spec';
import { templateMessage, type ModelMessageTemplateCode } from './messages';

// Warnings of a valid specialization (stage 4): things that do not prevent the import, but
// are usually an oversight of whoever writes the file, or fields read and ignored (stage 9). Pure:
// used by `validate_specialization` (MCP), in the "generate, validate, fix" cycle of an agent
// that creates specializations, and by the app's import (only the ignored fields).

export type SpecWarningCode =
  /** Platform declared in `platforms` that no type uses in `code`. */
  | 'unused-platform'
  /** Type without `code` in a specialization that declares platforms. */
  | 'type-without-code'
  /**
   * Platform declared without `repo` in which some type has `code.<platform>.path`: the agent
   * does not know in which repository those files are (any `formatVersion`; v5 declares it).
   */
  | 'path-without-repo'
  /** The old `format` (`mapeador-spec`), still accepted on import. */
  | 'legacy-format'
  /** Field of a type that left the format (`REMOVED_FIELD_TYPE`): read and ignored. */
  | 'ignored-field'
  /** `allowedChildren` with many text ids: a `{ layer, groups }` clause covers the same. */
  | 'many-children-ids'
  /** Group of `layers[].groups` that no type of the layer uses. */
  | 'unused-group'
  /** Repository of `docRepos` that no `doc` uses. */
  | 'unused-doc-repo';

export interface SpecWarning {
  readonly code: SpecWarningCode;
  /** Path in the same format as the errors (e.g. `layers[0].annotationTypes[2]`). */
  readonly path: string;
  readonly message: string;
  /** Message code in the `versions` catalog (the interface translates it); `message` stays in pt-BR. */
  readonly messageCode: ModelMessageTemplateCode;
  /** The `{parameters}` of the `messageCode`. */
  readonly messageParams: Readonly<Record<string, string | number>>;
}

/** The warning with the catalog message (`message` is the usual pt-BR text). */
function warning(
  code: SpecWarningCode,
  path: string,
  messageCode: ModelMessageTemplateCode,
  params: Readonly<Record<string, string | number>>,
): SpecWarning {
  return {
    code,
    path,
    message: templateMessage(messageCode, params).text,
    messageCode,
    messageParams: params,
  };
}

/** Warning for each field ignored on reading (`parseSpec` returns the list in `ignored`). */
export function ignoredFieldWarnings(
  ignored: readonly IgnoredSpecField[],
): SpecWarning[] {
  return ignored.map((field) =>
    warning('ignored-field', field.path, 'versions.ignoredField', {
      key: field.key,
      typeId: field.typeId,
      removed: REMOVED_FIELD_TYPE,
    }),
  );
}

/** How many text ids in a type's `allowedChildren` are enough to suggest a clause. */
const MANY_CHILD_IDS = 20;

/** `many-children-ids`: types with 20 or more text ids in `allowedChildren`. */
function manyChildIdsWarnings(spec: Spec): SpecWarning[] {
  const warnings: SpecWarning[] = [];
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const ids = (type.allowedChildren ?? []).filter((c) => typeof c === 'string');
      if (ids.length < MANY_CHILD_IDS) return;
      warnings.push(
        warning(
          'many-children-ids',
          `layers[${li}].annotationTypes[${ti}].allowedChildren`,
          'versions.manyChildrenIds',
          { count: ids.length },
        ),
      );
    });
  });
  return warnings;
}

/** `unused-group`: groups declared in a layer that no type of it uses. */
function unusedGroupWarnings(spec: Spec): SpecWarning[] {
  const warnings: SpecWarning[] = [];
  spec.layers.forEach((layer, li) => {
    const used = new Set(layer.annotationTypes.flatMap((type) => type.groups ?? []));
    (layer.groups ?? []).forEach((group, gi) => {
      if (used.has(group.id)) return;
      warnings.push(
        warning('unused-group', `layers[${li}].groups[${gi}]`, 'versions.unusedGroup', {
          group: group.id,
          layer: layer.id,
        }),
      );
    });
  });
  return warnings;
}

/** `unused-doc-repo`: `docRepos` repositories that no object `doc` cites. */
function unusedDocRepoWarnings(spec: Spec): SpecWarning[] {
  const used = new Set<string>();
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      if (typeof type.doc === 'object') used.add(type.doc.repo);
    }
  }
  const warnings: SpecWarning[] = [];
  (spec.docRepos ?? []).forEach((repo, i) => {
    if (used.has(repo.id)) return;
    warnings.push(
      warning('unused-doc-repo', `docRepos[${i}]`, 'versions.unusedDocRepo', {
        repo: repo.id,
      }),
    );
  });
  return warnings;
}

/** How many `path`s the `code` entry declares: its own and that of each case of `variants`. */
function codePathCount(entry: SpecCode): number {
  const cases = Object.values(entry.variants?.cases ?? {});
  return (
    (entry.path !== undefined ? 1 : 0) + cases.filter((c) => c.path !== undefined).length
  );
}

/**
 * Warnings of the specialization (already validated), in file order (the type ones, then
 * `unused-platform` and `path-without-repo`, per platform, and finally the v11 ones:
 * `many-children-ids`, `unused-group` and `unused-doc-repo`); `ignored` are the fields
 * ignored on reading (`parseSpec`), which come right after the old format.
 */
export function specWarnings(
  spec: Spec,
  ignored: readonly IgnoredSpecField[] = [],
): SpecWarning[] {
  const warnings: SpecWarning[] = [];
  if (spec.format === LEGACY_SPEC_FORMAT) {
    warnings.push(
      warning('legacy-format', 'format', 'versions.legacyFormat', {
        legacy: LEGACY_SPEC_FORMAT,
      }),
    );
  }

  warnings.push(...ignoredFieldWarnings(ignored));

  const platforms = spec.platforms ?? [];
  const used = new Set<string>();
  /** platform id → how many types have `code.<platform>.path`. */
  const withPath = new Map<string, number>();
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      for (const [platform, entry] of Object.entries(type.code ?? {})) {
        used.add(platform);
        const paths = codePathCount(entry);
        if (paths > 0) withPath.set(platform, (withPath.get(platform) ?? 0) + paths);
      }
      if (platforms.length > 0 && Object.keys(type.code ?? {}).length === 0) {
        warnings.push(
          warning(
            'type-without-code',
            `layers[${li}].annotationTypes[${ti}]`,
            'versions.typeWithoutCode',
            { typeId: type.id },
          ),
        );
      }
    });
  });
  platforms.forEach((platform, i) => {
    if (used.has(platform.id)) return;
    warnings.push(
      warning('unused-platform', `platforms[${i}]`, 'versions.unusedPlatform', {
        id: platform.id,
      }),
    );
  });
  platforms.forEach((platform, i) => {
    const count = withPath.get(platform.id) ?? 0;
    if (platform.repo !== undefined || count === 0) return;
    warnings.push(
      warning('path-without-repo', `platforms[${i}]`, 'versions.pathWithoutRepo', {
        id: platform.id,
        count,
      }),
    );
  });
  warnings.push(
    ...manyChildIdsWarnings(spec),
    ...unusedGroupWarnings(spec),
    ...unusedDocRepoWarnings(spec),
  );
  return warnings;
}
