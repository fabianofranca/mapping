// Specialization messages (`src/model/spec.ts`): code → template of today's pt-BR text, with
// `{parameters}`. `parseSpec` finds the code of a fixed message by its exact text (the entries
// without `{}`), of one with a parameter by `params.messageCode` in `addIssue`, and gives zod's default
// texts the code `spec.zod.<zod code>` (their template is a translation, not the `message`).
// A text belongs to a single code among the fixed entries.

export const specMessages = {
  // Text, format and values
  'spec.required': 'obrigatório',
  'spec.mustBeText': 'deve ser texto',
  'spec.mustBeBoolean': 'deve ser true ou false',
  'spec.mustBeObject': 'deve ser um objeto',
  'spec.notEmpty': 'não pode ser vazio',
  'spec.colorInvalid': 'cor inválida; use o formato #RRGGBB',
  'spec.tagInvalid': 'etiqueta inválida; use [a-z0-9-]+',
  'spec.keyInvalid': 'chave inválida; use apenas [A-Za-z0-9_], sem espaços',
  'spec.keyReserved': 'chave não pode começar com "_" (reservado)',
  'spec.platformIdInvalid': 'id de plataforma inválido; use [a-z0-9-]+',
  'spec.fieldTypeInvalid':
    '"{value}" inválido; use "string", "number", "date", "enum", "table" ou "ref"',
  'spec.dateInvalid': 'data inválida; use AAAA-MM-DD',
  'spec.dateNonexistent': 'data inexistente',
  'spec.packagePathInvalid':
    'caminho inválido: use um caminho relativo à pasta da especialização, com "/", sem "." nem ".." e sem unidade (ex: components/button.json)',
  'spec.invalidExtension': 'extensão inválida: esperava {exts}',
  'spec.unknownKeys': 'propriedade desconhecida: {keys}',
  // Sources, acceptance and notices
  'spec.typeSourceNeedsIdOrName': 'precisa de "id" ou "name"',
  'spec.acceptsAnnotationsEmpty':
    'não pode ser vazio; tire a chave ou liste ao menos um item',
  'spec.acceptsNeedsOne':
    'precisa de pelo menos uma etiqueta, "free": true ou "annotations"',
  'spec.noticeKindInvalid':
    '"{value}" inválido; use "removed", "deprecated", "diverges" ou "pending"',
  'spec.noticeKindShape': 'deve ser "removed", "deprecated", "diverges" ou "pending"',
  'spec.noticeRepeated': 'aviso repetido',
  // Field values
  'spec.valueMustBeNumber': 'deve ser número',
  'spec.valueMustBeDate': 'deve ser uma data AAAA-MM-DD válida',
  'spec.valueMustBeOption': 'deve ser uma das options',
  'spec.valueNotForTable': 'não existe para table',
  'spec.valueNotForRef': 'não existe para ref',
  // Suggestions
  'spec.suggestionsEmpty':
    'não pode ser vazio; tire a chave ou liste ao menos uma sugestão',
  'spec.suggestionsMax': 'no máximo {max} sugestões',
  'spec.suggestionsBlank': 'sugestões não podem ser vazias',
  'spec.suggestionsTrim': 'sugestões não podem ter espaço no começo nem no fim',
  'spec.suggestionsRepeated': 'sugestões repetidas',
  // Fields and columns
  'spec.columnTypeNotAllowed':
    '"{type}" não é permitido dentro de table; use "string", "number", "date", "enum" ou "ref"',
  'spec.optionsRequired': 'obrigatório e não vazio em enum',
  'spec.optionsBlank': 'opções não podem ser vazias',
  'spec.optionsRepeated': 'opções repetidas',
  'spec.optionsOnlyEnum': 'só é permitido em enum',
  'spec.onlyStringField': 'só é permitido em campo ou coluna string',
  'spec.notTypeField': '"{key}" não é um campo do tipo',
  'spec.linkedRefNotColumn': '"{key}" não é uma coluna da tabela',
  'spec.linkedRefNotRefField': '"{key}" deve ser um campo ref',
  'spec.linkedRefNotRefColumn': '"{key}" deve ser uma coluna ref',
  'spec.onlyTable': 'só é permitido em table',
  'spec.onlyRef': 'só é permitido em ref',
  'spec.notAllowedForFieldType': 'não é permitido neste tipo de campo',
  'spec.acceptsRequired': 'obrigatório em ref',
  'spec.refNoTags': 'ref não pode ter etiquetas',
  'spec.valuesOnlyEnum': 'só é permitido em campos enum',
  'spec.notInOptions': '"{value}" não está nas options',
  'spec.columnNoTags': 'colunas não têm etiquetas; use "tags" na table',
  'spec.keyRepeated': 'chave "{key}" repetida',
  'spec.columnsRequired': 'obrigatório e não vazio em table',
  'spec.rowLabelRequired': 'obrigatório em table com tags',
  'spec.rowLabelNotStringColumn': '"{key}" deve ser uma coluna string da tabela',
  // Instantiation code (`code`)
  'spec.codePathInvalid':
    'caminho inválido: use um caminho relativo à raiz do repositório, com "/", sem "." nem ".." e sem unidade (ex: app/src/Main.kt)',
  'spec.codeFieldNotEnum': '"{key}" deve ser um campo enum do tipo',
  'spec.notInOptionsOf': '"{value}" não está nas options de "{field}"',
  'spec.variantsNoCases': 'declare ao menos um caso',
  'spec.variantsEmptyCase': 'caso vazio: declare symbol, path, params, values ou notes',
  // Examples
  'spec.exampleValueShape':
    'deve ser texto, número ou null (ou uma lista de linhas, num campo table)',
  'spec.exampleNameRepeated': 'nome "{name}" repetido',
  'spec.exampleBothModes':
    'use "values" ou "system" com "file", não os dois modos juntos',
  'spec.exampleNoMode': 'precisa de "values" ou de "system" com "file"',
  'spec.requiredWithFile': 'obrigatório com "file"',
  'spec.requiredWithSystem': 'obrigatório com "system"',
  'spec.exampleRefNoValue': 'campo "ref" não aceita valor em exemplo',
  'spec.exampleTableNeedsRows': 'campo "table" aceita só a lista de linhas',
  'spec.exampleRowNotObject': 'deve ser um objeto (coluna → valor)',
  'spec.exampleNotColumn': '"{key}" não é coluna de "{field}"',
  'spec.exampleRefCell': 'coluna "ref" não aceita valor em exemplo',
  // Where it applies
  'spec.appliesToEmpty': 'não pode ser vazio; use "marking", "arrow" ou os dois',
  'spec.repeatedValues': 'valores repetidos',
  'spec.arrowOnlyNoComponent': 'um tipo só de seta não pode ter component',
  'spec.arrowOnlyNoFloating': 'um tipo só de seta não pode ter floating',
  'spec.appliesToInvalid': '"{value}" inválido; use "marking" ou "arrow"',
  'spec.appliesToShape': 'deve ser "marking" ou "arrow"',
  // Allowed children, documents, roles and groups
  'spec.groupsEmpty': 'não pode ser vazio; tire a chave ou liste ao menos um grupo',
  'spec.groupsList': 'deve ser uma lista de ids de grupo',
  'spec.allowedChildShape':
    'deve ser um id de tipo (texto) ou uma cláusula { layer, groups }',
  'spec.docShape': 'deve ser texto (arquivo do pacote) ou um objeto { repo, path }',
  'spec.docPathInvalid':
    'caminho inválido: use um caminho relativo à raiz do repositório, com "/", sem "." nem ".." e sem unidade (ex: components/button.md)',
  'spec.docAnchor': 'não pode ter "#" (âncora)',
  'spec.childRolesLabelNeedsRoles': 'só é permitido com childRoles',
  'spec.childRolesNeedsChildren': 'só é permitido em tipo com allowedChildren',
  'spec.childRolesEmpty': 'não pode ser vazio; tire a chave ou declare ao menos um papel',
  'spec.idRepeated': 'id "{id}" repetido',
  'spec.groupRepeated': 'grupo "{group}" repetido',
  // Types
  'spec.structuralNoComponent': 'um tipo estrutural não desenha: não pode ter component',
  'spec.labelFieldNotString': '"{key}" deve ser um campo string do tipo',
  // Repositories, platforms, containers, sources and migrations (file shapes)
  'spec.urlInvalid': 'deve começar com http:// ou https://, sem espaços',
  'spec.urlTemplateNeedsPath': 'deve conter {path}',
  'spec.repoIdInvalid': 'id de repositório inválido; use [a-z0-9-]+',
  'spec.mustBeNumber': 'deve ser um número',
  'spec.mustBeInteger': 'deve ser inteiro',
  'spec.minOne': 'deve ser >= 1',
  'spec.containerSideMax': 'deve ser <= {max}',
  'spec.containerIdInvalid': 'id de container inválido; use [a-z0-9-]+',
  'spec.fontWeightInvalid':
    'peso inválido; use um inteiro de {min} a {max} ou uma faixa "100 900" (o primeiro menor que o segundo)',
  'spec.fontStyleInvalid': 'estilo inválido; use "normal" ou "italic"',
  'spec.mustBeTextOrNumber': 'deve ser texto ou número',
  'spec.migrationModeRemoveType': 'use "convert" ou "delete"',
  'spec.migrationModeRemoveRole': 'use "clear" ou "unlink"',
  'spec.migrationOpInvalid':
    '"op" inválido; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role" ou "set-role"',
  'spec.notEmptyList': 'não pode ser vazia',
  'spec.formatInvalid': 'deve ser "{format}"',
  'spec.formatVersionInvalid': 'deve ser {versions} ou {last}',
  // Format version, external sources and fonts (typefaces)
  'spec.onlyFormat': 'só é permitido com formatVersion {version}',
  'spec.sourceOnlyOrigins': 'só é permitido em sistema declarado em origins',
  'spec.sourcePathRequired': 'obrigatório em sistema declarado em origins',
  'spec.sourceNameRequired': 'obrigatório em sistema que não está em origins',
  'spec.fieldPathEmptySegment': 'caminho inválido "{path}" (segmento vazio)',
  'spec.fieldPathMissingBracket': 'caminho inválido "{path}" (faltou "]")',
  'spec.fieldPathBadIndex': 'caminho inválido "{path}" (índice inválido: [{index}])',
  'spec.fieldPathBadChar': 'caminho inválido "{path}" (caractere inesperado: {char})',
  'spec.fieldPathWildcard':
    'caminho inválido "{path}" ("[*]" só vale em roots[].path de uma origem)',
  'spec.ignoreRepeated': '"{prop}" repetido',
  // Field templates, calls and formats (formatVersion 16, `specSignature.ts`)
  'spec.likeNotField': '"{like}" não é um campo de um tipo da especialização',
  'spec.formatNeedsPlaceholder': 'o molde precisa conter {placeholder}',
  'spec.modelTypeInvalid': '"{value}" inválido; use "number", "string" ou "enum"',
  'spec.optionsNotTextList': 'deve ser uma lista de textos não vazios',
  'spec.optionsRequiredInEnum': 'obrigatório em enum',
  'spec.expandParamsRequired': 'declare ao menos um parâmetro (nome → tipo na fonte)',
  'spec.mustBeNonEmptyText': 'deve ser texto não vazio',
  'spec.modelFormRequired': 'declare uma forma: "like", "type", "expand" ou "ignore"',
  'spec.modelFormsConflict': 'use só uma forma: {forms}',
  'spec.mustBeTrue': 'deve ser true',
  'spec.callNotDeclared': '"{call}" não está em calls',
  'spec.exampleSystemUndeclared': 'sistema "{system}" não declarado em origins',
  'spec.fontRepeated': 'fonte "{family}" (peso {weight}, {style}) repetida',
  'spec.fontRepeatedNoWeight': 'fonte "{family}" (sem peso, {style}) repetida',
  'spec.platformUndeclared': 'plataforma "{id}" não declarada em platforms',
  'spec.codeNeedsPlatforms': 'só é permitido em especializações que declaram platforms',
  'spec.typeIdRepeated': 'id "{id}" repetido na especialização',
  // Migrations
  'spec.migrationFromRepeated': 'já existe uma migração a partir da versão {from}',
  'spec.migrationToGreater': 'deve ser maior que "from" ({from})',
  'spec.migrationToMax': 'não pode passar de "version" ({version})',
  'spec.migrationColumnNotEnum': '"{key}" deve ser uma coluna enum da tabela',
  'spec.fieldRefManyDots': '"{ref}" tem mais de um ponto; use "campo" ou "tabela.coluna"',
  'spec.fieldRefEmptyPart': '"{ref}" tem uma parte vazia; use "campo" ou "tabela.coluna"',
  'spec.roleNotOfType': '"{role}" não é um papel do tipo "{typeId}"',
  'spec.roleStillExists': 'papel "{role}" ainda existe no tipo "{typeId}" nesta versão',
  'spec.typeNotInVersion': 'tipo "{typeId}" não existe nesta versão',
  'spec.typeNoRoles': 'o tipo "{typeId}" não tem papéis (childRoles) nesta versão',
  'spec.typeStillExists': 'tipo "{typeId}" ainda existe nesta versão',
  'spec.notFieldOfType': '"{key}" não é um campo do tipo "{typeId}"',
  'spec.notTableOfType': '"{key}" não é uma tabela do tipo "{typeId}"',
  'spec.notColumnOfTable':
    '"{key}" não é uma coluna da tabela "{table}" do tipo "{typeId}"',
  'spec.fieldStillExists': 'campo "{key}" ainda existe no tipo "{typeId}" nesta versão',
  'spec.columnStillExists':
    'coluna "{column}" ainda existe na tabela "{table}" do tipo "{typeId}" nesta versão',
  // Allowed children, groups, document repositories and owner
  'spec.layerNotFound': 'camada "{layer}" não existe na especialização',
  'spec.layerIsOwn':
    'camada "{layer}" é a do próprio tipo; filhos devem estar em outra camada',
  'spec.groupNotInLayer': 'grupo "{group}" não existe na camada "{layer}"',
  'spec.typeNotFound': 'tipo "{typeId}" não existe na especialização',
  'spec.typeSameLayer':
    'tipo "{typeId}" está na mesma camada; filhos devem estar em outra camada',
  'spec.docRepoUndeclared': 'repositório "{repo}" não declarado em docRepos',
  'spec.ownerNoneLists':
    '"{typeId}" exige dono, mas nenhum tipo o lista em allowedChildren',
  'spec.ownerOnlySelf':
    '"{typeId}" exige dono, mas nenhum outro tipo o aceita como filho (só ele mesmo o lista em allowedChildren)',
  // Tokens and icons
  'spec.tokensShape': 'deve ser um objeto com modes e values',
  'spec.tokenKeyUnknown': 'chave desconhecida: {key}',
  'spec.tokenModesEmpty': 'deve ser uma lista com ao menos um modo',
  'spec.tokenModeInvalid': 'modo inválido; use [a-z0-9][a-z0-9-]*',
  'spec.tokenModeRepeated': 'modo "{mode}" repetido',
  'spec.tokenNameInvalid': 'nome inválido; use [a-z0-9][a-z0-9-]*',
  'spec.tokenValueShape': 'deve ser texto, número ou um valor por modo',
  'spec.tokenModeMissing': 'falta o modo {modes}',
  'spec.tokenModeExtra': 'modo não declarado em modes: {modes}',
  'spec.tokenModeValueShape': 'cada modo deve ter texto ou número',
  'spec.tokenModesSameType':
    'os modos de um token devem ter o mesmo tipo (texto ou número)',
  'spec.iconsPathShape': 'deve ser o caminho de um arquivo .json do pacote',
  // zod's default texts (translation; the `message` follows zod's, in English)
  'spec.zod.invalid_type': 'tipo inválido: esperava {expected}, recebeu {received}',
  'spec.zod.unrecognized_keys': 'propriedade desconhecida: {keys}',
  'spec.zod.too_small': 'valor pequeno demais: o mínimo é {minimum}',
  'spec.zod.too_big': 'valor grande demais: o máximo é {maximum}',
  'spec.zod.invalid_value': 'valor inválido: esperava um destes: {values}',
  'spec.zod.invalid_format': 'formato de texto inválido',
  'spec.zod.invalid_union': 'valor inválido: não serve para nenhuma das formas aceitas',
  'spec.zod.invalid_key': 'chave inválida',
  'spec.zod.invalid_element': 'item inválido',
  'spec.zod.not_multiple_of': 'número inválido: deve ser múltiplo de {divisor}',
} as const;
