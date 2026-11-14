// Messages of the specialization warnings (`specWarnings.ts`) and of the version contract
// (`specVersions.ts`): code → template of today's pt-BR text, with `{parameters}`. The phrases that
// agree in gender ("o campo" / "a coluna") are one code per variant, with the whole text in the
// template. `{ref}` is the `table.column` key that the migration step cites.

export const versionMessages = {
  // Specialization warnings (`specWarnings`)
  'versions.ignoredField':
    'o campo "{key}" do tipo "{typeId}" é "{removed}", que saiu do formato: foi ignorado (os valores dele não são gravados); remova-o do arquivo',
  'versions.manyChildrenIds':
    '{count} tipos listados um a um; uma cláusula { layer, groups } cobre a camada ou os grupos',
  'versions.unusedGroup':
    'o grupo "{group}" da camada "{layer}" é declarado, mas nenhum tipo está nele',
  'versions.unusedDocRepo':
    'o repositório "{repo}" de docRepos é declarado, mas nenhum `doc` o usa',
  'versions.legacyFormat': '"{legacy}" é o nome antigo do formato; use "mapping-spec"',
  'versions.typeWithoutCode':
    'o tipo "{typeId}" não tem `code`: nenhuma plataforma diz como criar uma instância dele',
  'versions.unusedPlatform':
    'a plataforma "{id}" é declarada, mas nenhum tipo a usa em `code`',
  'versions.pathWithoutRepo':
    'a plataforma "{id}" tem tipos com `path` ({count}), mas não declara `repo`: o agente não sabe em que repositório estão esses arquivos; declare `repo` (formatVersion 5)',
  // New field
  'versions.fieldNew': 'o campo "{key}" do tipo "{typeId}" é novo',
  'versions.columnNew': 'a coluna "{key}" do campo "{table}" do tipo "{typeId}" é nova',
  'versions.fieldNewRequired':
    'o campo "{key}" do tipo "{typeId}" é novo e já obrigatório; declare um passo "fill-field" em migrations',
  'versions.columnNewRequired':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" é nova e já obrigatória; declare um passo "fill-field" em migrations com field "{ref}"',
  // Field type changed
  'versions.fieldTypeChanged':
    'o campo "{key}" do tipo "{typeId}" mudou de tipo ("{from}" para "{to}"); declare um passo "fill-field" em migrations',
  'versions.columnTypeChanged':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" mudou de tipo ("{from}" para "{to}"); declare um passo "fill-field" em migrations com field "{ref}"',
  // Became required
  'versions.fieldBecameRequired':
    'o campo "{key}" do tipo "{typeId}" passou a ser obrigatório; declare um passo "fill-field" em migrations',
  'versions.columnBecameRequired':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" passou a ser obrigatória; declare um passo "fill-field" em migrations com field "{ref}"',
  // New option
  'versions.fieldOptionAdded':
    'o campo "{key}" do tipo "{typeId}" ganhou a opção "{option}"',
  'versions.columnOptionAdded':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" ganhou a opção "{option}"',
  // Field and column removed
  'versions.fieldRemoved':
    'o campo "{key}" do tipo "{typeId}" foi removido; declare um passo "remove-field" ou "rename-field" em migrations',
  'versions.columnRemoved':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" foi removida; declare um passo "remove-field" ou "rename-field" em migrations com field "{ref}"',
  // Option removed
  'versions.fieldOptionRemoved':
    'a opção "{option}" do campo "{key}" do tipo "{typeId}" foi removida; declare um passo "map-values" com "{option}" em values em migrations',
  'versions.columnOptionRemoved':
    'a opção "{option}" da coluna "{key}" do campo "{table}" do tipo "{typeId}" foi removida; declare um passo "map-values" com "{option}" em values em migrations com field "{ref}"',
  // Roles
  'versions.rolesRequired':
    'o tipo "{typeId}" passou a ter papéis; declare um passo "set-role" em migrations (formatVersion 12)',
  'versions.roleAdded': 'o tipo "{typeId}" ganhou o papel "{role}"',
  'versions.roleRemoved':
    'o papel "{role}" do tipo "{typeId}" foi removido; declare um passo "rename-role" ou "remove-role" em migrations (formatVersion 12)',
  // Types, components, applicability, documents, examples and fonts

  'versions.typeNew': 'o tipo "{typeId}" é novo',
  'versions.componentAdded': 'o tipo "{typeId}" ganhou o componente "{component}"',
  'versions.componentChanged':
    'o componente do tipo "{typeId}" passou de "{from}" para "{to}"',
  'versions.appliesToChanged':
    'o tipo "{typeId}" passou a se aplicar a: {now} (antes: {before}); anotações que deixaram de se aplicar viram pendência',
  'versions.docAdded': 'o tipo "{typeId}" ganhou o documento "{doc}"',
  'versions.exampleAdded': 'o tipo "{typeId}" ganhou o exemplo "{name}"',
  'versions.fontNew': 'a fonte "{family}" é nova',
  'versions.typeRemoved':
    'o tipo "{typeId}" foi removido; declare um passo "remove-type" ou "rename-type" em migrations',
} as const;
