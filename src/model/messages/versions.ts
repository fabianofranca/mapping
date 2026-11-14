// Messages of the specialization warnings (`specWarnings.ts`) and of the version contract
// (`specVersions.ts`): code → template of today's pt-BR text, with `{parameters}`. The phrases that
// agree in gender ("o campo" / "a coluna") are one code per variant, with the whole text in the
// template. `{ref}` is the `table.column` key that the migration step cites.

export const versionMessages = {
  // Specialization warnings (`specWarnings`)
  'versions.ignoredField':
    'the field "{key}" of the type "{typeId}" is "{removed}", which was removed from the format: it was ignored (its values are not saved); remove it from the file',
  'versions.manyChildrenIds':
    '{count} types listed one by one; a { layer, groups } clause covers the layer or the groups',
  'versions.unusedGroup':
    'the group "{group}" of the layer "{layer}" is declared, but no type is in it',
  'versions.unusedDocRepo':
    'the repository "{repo}" in docRepos is declared, but no `doc` uses it',
  'versions.legacyFormat': '"{legacy}" is the old name of the format; use "mapping-spec"',
  'versions.typeWithoutCode':
    'the type "{typeId}" has no `code`: no platform says how to create an instance of it',
  'versions.unusedPlatform':
    'the platform "{id}" is declared, but no type uses it in `code`',
  'versions.pathWithoutRepo':
    'the platform "{id}" has types with `path` ({count}), but does not declare `repo`: the agent does not know which repository holds those files; declare `repo` (formatVersion 5)',
  // New field
  'versions.fieldNew': 'the field "{key}" of the type "{typeId}" is new',
  'versions.columnNew':
    'the column "{key}" of the field "{table}" of the type "{typeId}" is new',
  'versions.fieldNewRequired':
    'the field "{key}" of the type "{typeId}" is new and already required; declare a "fill-field" step in migrations',
  'versions.columnNewRequired':
    'the column "{key}" of the field "{table}" of the type "{typeId}" is new and already required; declare a "fill-field" step in migrations with field "{ref}"',
  // Field type changed
  'versions.fieldTypeChanged':
    'the field "{key}" of the type "{typeId}" changed type ("{from}" to "{to}"); declare a "fill-field" step in migrations',
  'versions.columnTypeChanged':
    'the column "{key}" of the field "{table}" of the type "{typeId}" changed type ("{from}" to "{to}"); declare a "fill-field" step in migrations with field "{ref}"',
  // Became required
  'versions.fieldBecameRequired':
    'the field "{key}" of the type "{typeId}" became required; declare a "fill-field" step in migrations',
  'versions.columnBecameRequired':
    'the column "{key}" of the field "{table}" of the type "{typeId}" became required; declare a "fill-field" step in migrations with field "{ref}"',
  // New option
  'versions.fieldOptionAdded':
    'the field "{key}" of the type "{typeId}" gained the option "{option}"',
  'versions.columnOptionAdded':
    'the column "{key}" of the field "{table}" of the type "{typeId}" gained the option "{option}"',
  // Field and column removed
  'versions.fieldRemoved':
    'the field "{key}" of the type "{typeId}" was removed; declare a "remove-field" or "rename-field" step in migrations',
  'versions.columnRemoved':
    'the column "{key}" of the field "{table}" of the type "{typeId}" was removed; declare a "remove-field" or "rename-field" step in migrations with field "{ref}"',
  // Option removed
  'versions.fieldOptionRemoved':
    'the option "{option}" of the field "{key}" of the type "{typeId}" was removed; declare a "map-values" step with "{option}" in values in migrations',
  'versions.columnOptionRemoved':
    'the option "{option}" of the column "{key}" of the field "{table}" of the type "{typeId}" was removed; declare a "map-values" step with "{option}" in values in migrations with field "{ref}"',
  // Roles
  'versions.rolesRequired':
    'the type "{typeId}" now has roles; declare a "set-role" step in migrations (formatVersion 12)',
  'versions.roleAdded': 'the type "{typeId}" gained the role "{role}"',
  'versions.roleRemoved':
    'the role "{role}" of the type "{typeId}" was removed; declare a "rename-role" or "remove-role" step in migrations (formatVersion 12)',
  // Types, components, applicability, documents, examples and fonts

  'versions.typeNew': 'the type "{typeId}" is new',
  'versions.componentAdded': 'the type "{typeId}" gained the component "{component}"',
  'versions.componentChanged':
    'the component of the type "{typeId}" changed from "{from}" to "{to}"',
  'versions.appliesToChanged':
    'the type "{typeId}" now applies to: {now} (before: {before}); annotations that no longer apply become pending',
  'versions.docAdded': 'the type "{typeId}" gained the document "{doc}"',
  'versions.exampleAdded': 'the type "{typeId}" gained the example "{name}"',
  'versions.fontNew': 'the font "{family}" is new',
  'versions.typeRemoved':
    'the type "{typeId}" was removed; declare a "remove-type" or "rename-type" step in migrations',
} as const;
