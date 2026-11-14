// pt-BR text of the model message templates (`src/model/messages/`), keyed `model.<code>`. The model
// catalogs hold the English text (what the MCP and the model tests read); this table is the pt-BR
// side of the same codes and carries the same {parameters}.

import type { ModelMessageTemplateCode } from '../model/messages';

export const templatePtBR: {
  readonly [C in ModelMessageTemplateCode as `model.${C}`]: string;
} = {
  'model.library.notReferenced': 'arquivo não referenciado pela especialização',
  'model.library.emptyDoc': 'documento vazio',
  'model.library.fileNotFound': 'arquivo não encontrado: {path}',
  'model.library.notRead': 'o conteúdo do arquivo não foi lido (esperava o texto)',
  'model.library.invalidJson': 'JSON inválido: {detail}',
  'model.library.specFileNotFound': 'arquivo da especialização não encontrado: {path}',
  'model.library.specNotFound':
    'nenhuma especialização encontrada: o pacote precisa de um arquivo .json com "format": "mapping-spec"',
  'model.library.specAmbiguous':
    'há {count} especializações no pacote ({files}): indique qual validar',
  'model.library.paramOutsideSignature': 'parâmetro fora da ficha: "{name}"',
  'model.library.signatureNotRead': 'arquivo não pôde ser lido: {path}',
  'model.library.signatureInvalid': '{reason}',
  'model.library.signatureNotCode': 'a ficha do code precisa ser de código',
  'model.library.signatureNotDesign':
    'a ficha precisa ser de design do sistema "{system}"',
  'model.library.signaturePlatformMismatch':
    'a ficha é da plataforma "{found}", mas o code é da plataforma "{expected}"',
  'model.library.signatureSymbolMismatch':
    'o símbolo da ficha ("{found}") difere do symbol do code ("{expected}")',
  'model.library.signaturePathMismatch':
    'o arquivo da ficha ("{found}") difere do path do code ("{expected}")',
  'model.library.componentAlreadyUsed':
    'o arquivo {path} já é o componente do tipo "{typeId}"',
  'model.library.noSlot': 'o componente {path} não tem slot',
  'model.library.slotMismatch':
    'o slot do componente {path} é "{slot}", não "{expected}"',
  'model.library.fieldUndeclared':
    'o desenho usa o campo "{key}", que o tipo "{typeId}" não declara',
  'model.library.fieldUnused':
    'o campo "{key}" do tipo "{typeId}" não é usado pelo desenho do componente {path}',
  'model.library.previewNoField': 'o tipo "{typeId}" não tem o campo "{key}"',
  'model.library.previewNotTable':
    '"{key}" não é uma table do tipo "{typeId}"; o preview dele deve ser um valor simples',
  'model.library.previewTableNotList':
    '"{key}" é uma table do tipo "{typeId}"; o preview dele deve ser uma lista de linhas',
  'model.library.previewColumnUnknown':
    '"{column}" não é coluna da table "{key}" do tipo "{typeId}"',
  'model.library.repeatNotTable':
    'o repeat repete as linhas de "{key}", que é um campo {fieldType} do tipo "{typeId}", não uma table',
  'model.library.repeatRowUnknownColumn':
    'o desenho da linha usa "{name}", que não é coluna da table "{key}" nem campo do tipo "{typeId}"',
  'model.library.repeatRowUnknown':
    'o desenho da linha usa "{name}", que o tipo "{typeId}" não declara',
  'model.library.rowsNotTable':
    '$rows conta as linhas de "{key}", que é um campo {fieldType} do tipo "{typeId}", não uma table',
  'model.library.imageColumnNotString':
    'o src da imagem lê a coluna "{key}" da table "{table}" do tipo "{typeId}", que é {fieldType}, não string',
  'model.library.imageFieldNotString':
    'o src da imagem lê "{key}", que é um campo {fieldType} do tipo "{typeId}", não string',
  'model.library.fontMissing':
    'arquivo da fonte "{family}" não encontrado: {path}; o desenho usa a fonte do sistema',
  'model.library.scrimMissing': 'o tipo "{typeId}" não existe na especialização',
  'model.library.tokenMissing':
    'o token "{name}" não existe nos tokens da especialização',
  'model.library.tokenWrongKind.color.number':
    'o token "{name}" é cor, mas aqui se espera número',
  'model.library.tokenWrongKind.color.family':
    'o token "{name}" é cor, mas aqui se espera família de fonte',
  'model.library.tokenWrongKind.number.color':
    'o token "{name}" é número, mas aqui se espera cor',
  'model.library.tokenWrongKind.number.family':
    'o token "{name}" é número, mas aqui se espera família de fonte',
  'model.library.tokenWrongKind.family.color':
    'o token "{name}" é família de fonte, mas aqui se espera cor',
  'model.library.tokenWrongKind.family.number':
    'o token "{name}" é família de fonte, mas aqui se espera número',
  'model.library.versionOtherSpec':
    'a versão anterior é da especialização "{previous}", não "{id}"',
  'model.library.versionNotGrown':
    'a versão não cresceu: a anterior é {previous} e esta é {version}',
  'model.library.typeNotInVersion': 'o tipo "{typeId}" não existia na versão {version}',
  'model.library.roleNotInVersion':
    'o papel "{role}" do tipo "{typeId}" não existia na versão {version}',
  'model.library.fieldNotInVersion':
    'o campo "{key}" do tipo "{typeId}" não existia na versão {version}',
  'model.library.optionNotInVersion':
    '"{value}" não era opção do campo "{field}" na versão {version}',
  'model.library.iconMissing':
    'o ícone "{name}" não existe no conjunto de ícones ({path})',
  'model.library.iconUnverifiable':
    'o ícone "{name}" não pode ser conferido: a especialização não declara icons',
  'model.library.iconOptionMissing':
    'a opção "{option}" do campo "{key}" não está no conjunto de ícones; o desenho cai no reservado',
  'model.library.draw.defaults':
    'tipo "{typeId}", os valores padrão, tamanho inicial {size}: {reason}',
  'model.library.draw.defaultsMode':
    'tipo "{typeId}", os valores padrão, modo {mode}, tamanho inicial {size}: {reason}',
  'model.library.draw.preview':
    'tipo "{typeId}", o preview, tamanho inicial {size}: {reason}',
  'model.library.draw.previewMode':
    'tipo "{typeId}", o preview, modo {mode}, tamanho inicial {size}: {reason}',
  'model.library.draw.example':
    'tipo "{typeId}", o exemplo "{name}", tamanho inicial {size}: {reason}',
  'model.library.draw.exampleMode':
    'tipo "{typeId}", o exemplo "{name}", modo {mode}, tamanho inicial {size}: {reason}',
  'model.library.drawFitted.defaults':
    'tipo "{typeId}", os valores padrão, tamanho ajustado {size}: {reason}',
  'model.library.drawFitted.defaultsMode':
    'tipo "{typeId}", os valores padrão, modo {mode}, tamanho ajustado {size}: {reason}',
  'model.library.drawFitted.preview':
    'tipo "{typeId}", o preview, tamanho ajustado {size}: {reason}',
  'model.library.drawFitted.previewMode':
    'tipo "{typeId}", o preview, modo {mode}, tamanho ajustado {size}: {reason}',
  'model.library.drawFitted.example':
    'tipo "{typeId}", o exemplo "{name}", tamanho ajustado {size}: {reason}',
  'model.library.drawFitted.exampleMode':
    'tipo "{typeId}", o exemplo "{name}", modo {mode}, tamanho ajustado {size}: {reason}',
  'model.library.drawFailed': 'falha ao desenhar: {error}',
  'model.library.buildFailed':
    'não foi possível montar a biblioteca para provar os exemplos de sistema externo: {reason}',
  'model.library.buildFailedUnknown':
    'não foi possível montar a biblioteca para provar os exemplos de sistema externo: motivo desconhecido',
  'model.library.systemExample': 'exemplo "{name}" do sistema "{system}": {reason}',
  'model.library.systemExampleType':
    'exemplo "{name}" do sistema "{system}": o nó corresponde ao tipo "{found}", não a "{typeId}"',
  'model.library.originScreen':
    'tela de exemplo "{name}" do sistema "{system}": {reason}',
  'model.spec.required': 'obrigatório',
  'model.spec.mustBeText': 'deve ser texto',
  'model.spec.mustBeBoolean': 'deve ser true ou false',
  'model.spec.mustBeObject': 'deve ser um objeto',
  'model.spec.notEmpty': 'não pode ser vazio',
  'model.spec.colorInvalid': 'cor inválida; use o formato #RRGGBB',
  'model.spec.tagInvalid': 'etiqueta inválida; use [a-z0-9-]+',
  'model.spec.keyInvalid': 'chave inválida; use apenas [A-Za-z0-9_], sem espaços',
  'model.spec.keyReserved': 'chave não pode começar com "_" (reservado)',
  'model.spec.platformIdInvalid': 'id de plataforma inválido; use [a-z0-9-]+',
  'model.spec.fieldTypeInvalid':
    '"{value}" inválido; use "string", "number", "date", "enum", "table" ou "ref"',
  'model.spec.dateInvalid': 'data inválida; use AAAA-MM-DD',
  'model.spec.dateNonexistent': 'data inexistente',
  'model.spec.packagePathInvalid':
    'caminho inválido: use um caminho relativo à pasta da especialização, com "/", sem "." nem ".." e sem unidade (ex: components/button.json)',
  'model.spec.invalidExtension': 'extensão inválida: esperava {exts}',
  'model.spec.unknownKeys': 'propriedade desconhecida: {keys}',
  'model.spec.typeSourceNeedsIdOrName': 'precisa de "id" ou "name"',
  'model.spec.acceptsAnnotationsEmpty':
    'não pode ser vazio; tire a chave ou liste ao menos um item',
  'model.spec.acceptsNeedsOne':
    'precisa de pelo menos uma etiqueta, "free": true ou "annotations"',
  'model.spec.noticeKindInvalid':
    '"{value}" inválido; use "removed", "deprecated", "diverges" ou "pending"',
  'model.spec.noticeKindShape':
    'deve ser "removed", "deprecated", "diverges" ou "pending"',
  'model.spec.noticeRepeated': 'aviso repetido',
  'model.spec.valueMustBeNumber': 'deve ser número',
  'model.spec.valueMustBeDate': 'deve ser uma data AAAA-MM-DD válida',
  'model.spec.valueMustBeOption': 'deve ser uma das options',
  'model.spec.valueNotForTable': 'não existe para table',
  'model.spec.valueNotForRef': 'não existe para ref',
  'model.spec.suggestionsEmpty':
    'não pode ser vazio; tire a chave ou liste ao menos uma sugestão',
  'model.spec.suggestionsMax': 'no máximo {max} sugestões',
  'model.spec.suggestionsBlank': 'sugestões não podem ser vazias',
  'model.spec.suggestionsTrim': 'sugestões não podem ter espaço no começo nem no fim',
  'model.spec.suggestionsRepeated': 'sugestões repetidas',
  'model.spec.columnTypeNotAllowed':
    '"{type}" não é permitido dentro de table; use "string", "number", "date", "enum" ou "ref"',
  'model.spec.optionsRequired': 'obrigatório e não vazio em enum',
  'model.spec.optionsBlank': 'opções não podem ser vazias',
  'model.spec.optionsRepeated': 'opções repetidas',
  'model.spec.optionsOnlyEnum': 'só é permitido em enum',
  'model.spec.onlyStringField': 'só é permitido em campo ou coluna string',
  'model.spec.notTypeField': '"{key}" não é um campo do tipo',
  'model.spec.linkedRefNotColumn': '"{key}" não é uma coluna da tabela',
  'model.spec.linkedRefNotRefField': '"{key}" deve ser um campo ref',
  'model.spec.linkedRefNotRefColumn': '"{key}" deve ser uma coluna ref',
  'model.spec.onlyTable': 'só é permitido em table',
  'model.spec.onlyRef': 'só é permitido em ref',
  'model.spec.notAllowedForFieldType': 'não é permitido neste tipo de campo',
  'model.spec.acceptsRequired': 'obrigatório em ref',
  'model.spec.refNoTags': 'ref não pode ter etiquetas',
  'model.spec.valuesOnlyEnum': 'só é permitido em campos enum',
  'model.spec.notInOptions': '"{value}" não está nas options',
  'model.spec.columnNoTags': 'colunas não têm etiquetas; use "tags" na table',
  'model.spec.keyRepeated': 'chave "{key}" repetida',
  'model.spec.columnsRequired': 'obrigatório e não vazio em table',
  'model.spec.rowLabelRequired': 'obrigatório em table com tags',
  'model.spec.rowLabelNotStringColumn': '"{key}" deve ser uma coluna string da tabela',
  'model.spec.codePathInvalid':
    'caminho inválido: use um caminho relativo à raiz do repositório, com "/", sem "." nem ".." e sem unidade (ex: app/src/Main.kt)',
  'model.spec.codeFieldNotEnum': '"{key}" deve ser um campo enum do tipo',
  'model.spec.notInOptionsOf': '"{value}" não está nas options de "{field}"',
  'model.spec.variantsNoCases': 'declare ao menos um caso',
  'model.spec.variantsEmptyCase':
    'caso vazio: declare symbol, path, params, values ou notes',
  'model.spec.exampleValueShape':
    'deve ser texto, número ou null (ou uma lista de linhas, num campo table)',
  'model.spec.exampleNameRepeated': 'nome "{name}" repetido',
  'model.spec.exampleBothModes':
    'use "values" ou "system" com "file", não os dois modos juntos',
  'model.spec.exampleNoMode': 'precisa de "values" ou de "system" com "file"',
  'model.spec.requiredWithFile': 'obrigatório com "file"',
  'model.spec.requiredWithSystem': 'obrigatório com "system"',
  'model.spec.exampleRefNoValue': 'campo "ref" não aceita valor em exemplo',
  'model.spec.exampleTableNeedsRows': 'campo "table" aceita só a lista de linhas',
  'model.spec.exampleRowNotObject': 'deve ser um objeto (coluna → valor)',
  'model.spec.exampleNotColumn': '"{key}" não é coluna de "{field}"',
  'model.spec.exampleRefCell': 'coluna "ref" não aceita valor em exemplo',
  'model.spec.appliesToEmpty': 'não pode ser vazio; use "marking", "arrow" ou os dois',
  'model.spec.repeatedValues': 'valores repetidos',
  'model.spec.arrowOnlyNoComponent': 'um tipo só de seta não pode ter component',
  'model.spec.arrowOnlyNoFloating': 'um tipo só de seta não pode ter floating',
  'model.spec.appliesToInvalid': '"{value}" inválido; use "marking" ou "arrow"',
  'model.spec.appliesToShape': 'deve ser "marking" ou "arrow"',
  'model.spec.groupsEmpty': 'não pode ser vazio; tire a chave ou liste ao menos um grupo',
  'model.spec.groupsList': 'deve ser uma lista de ids de grupo',
  'model.spec.allowedChildShape':
    'deve ser um id de tipo (texto) ou uma cláusula { layer, groups }',
  'model.spec.docShape': 'deve ser texto (arquivo do pacote) ou um objeto { repo, path }',
  'model.spec.docPathInvalid':
    'caminho inválido: use um caminho relativo à raiz do repositório, com "/", sem "." nem ".." e sem unidade (ex: components/button.md)',
  'model.spec.docAnchor': 'não pode ter "#" (âncora)',
  'model.spec.childRolesLabelNeedsRoles': 'só é permitido com childRoles',
  'model.spec.childRolesNeedsChildren': 'só é permitido em tipo com allowedChildren',
  'model.spec.childRolesEmpty':
    'não pode ser vazio; tire a chave ou declare ao menos um papel',
  'model.spec.idRepeated': 'id "{id}" repetido',
  'model.spec.groupRepeated': 'grupo "{group}" repetido',
  'model.spec.structuralNoComponent':
    'um tipo estrutural não desenha: não pode ter component',
  'model.spec.labelFieldNotString': '"{key}" deve ser um campo string do tipo',
  'model.spec.urlInvalid': 'deve começar com http:// ou https://, sem espaços',
  'model.spec.urlTemplateNeedsPath': 'deve conter {path}',
  'model.spec.repoIdInvalid': 'id de repositório inválido; use [a-z0-9-]+',
  'model.spec.mustBeNumber': 'deve ser um número',
  'model.spec.mustBeInteger': 'deve ser inteiro',
  'model.spec.minOne': 'deve ser >= 1',
  'model.spec.containerSideMax': 'deve ser <= {max}',
  'model.spec.containerIdInvalid': 'id de container inválido; use [a-z0-9-]+',
  'model.spec.fontWeightInvalid':
    'peso inválido; use um inteiro de {min} a {max} ou uma faixa "100 900" (o primeiro menor que o segundo)',
  'model.spec.fontStyleInvalid': 'estilo inválido; use "normal" ou "italic"',
  'model.spec.mustBeTextOrNumber': 'deve ser texto ou número',
  'model.spec.migrationModeRemoveType': 'use "convert" ou "delete"',
  'model.spec.migrationModeRemoveRole': 'use "clear" ou "unlink"',
  'model.spec.migrationOpInvalid':
    '"op" inválido; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role" ou "set-role"',
  'model.spec.notEmptyList': 'não pode ser vazia',
  'model.spec.formatInvalid': 'deve ser "{format}"',
  'model.spec.formatVersionInvalid': 'deve ser {versions} ou {last}',
  'model.spec.onlyFormat': 'só é permitido com formatVersion {version}',
  'model.spec.sourceOnlyOrigins': 'só é permitido em sistema declarado em origins',
  'model.spec.sourcePathRequired': 'obrigatório em sistema declarado em origins',
  'model.spec.sourceNameRequired': 'obrigatório em sistema que não está em origins',
  'model.spec.fieldPathEmptySegment': 'caminho inválido "{path}" (segmento vazio)',
  'model.spec.fieldPathMissingBracket': 'caminho inválido "{path}" (faltou "]")',
  'model.spec.fieldPathBadIndex':
    'caminho inválido "{path}" (índice inválido: [{index}])',
  'model.spec.fieldPathBadChar':
    'caminho inválido "{path}" (caractere inesperado: {char})',
  'model.spec.fieldPathWildcard':
    'caminho inválido "{path}" ("[*]" só vale em roots[].path de uma origem)',
  'model.spec.ignoreRepeated': '"{prop}" repetido',
  'model.spec.likeNotField': '"{like}" não é um campo de um tipo da especialização',
  'model.spec.formatNeedsPlaceholder': 'o molde precisa conter {placeholder}',
  'model.spec.modelTypeInvalid': '"{value}" inválido; use "number", "string" ou "enum"',
  'model.spec.optionsNotTextList': 'deve ser uma lista de textos não vazios',
  'model.spec.optionsRequiredInEnum': 'obrigatório em enum',
  'model.spec.expandParamsRequired':
    'declare ao menos um parâmetro (nome → tipo na fonte)',
  'model.spec.mustBeNonEmptyText': 'deve ser texto não vazio',
  'model.spec.modelFormRequired':
    'declare uma forma: "like", "type", "expand" ou "ignore"',
  'model.spec.modelFormsConflict': 'use só uma forma: {forms}',
  'model.spec.mustBeTrue': 'deve ser true',
  'model.spec.callNotDeclared': '"{call}" não está em calls',
  'model.spec.exampleSystemUndeclared': 'sistema "{system}" não declarado em origins',
  'model.spec.fontRepeated': 'fonte "{family}" (peso {weight}, {style}) repetida',
  'model.spec.fontRepeatedNoWeight': 'fonte "{family}" (sem peso, {style}) repetida',
  'model.spec.platformUndeclared': 'plataforma "{id}" não declarada em platforms',
  'model.spec.codeNeedsPlatforms':
    'só é permitido em especializações que declaram platforms',
  'model.spec.typeIdRepeated': 'id "{id}" repetido na especialização',
  'model.spec.migrationFromRepeated': 'já existe uma migração a partir da versão {from}',
  'model.spec.migrationToGreater': 'deve ser maior que "from" ({from})',
  'model.spec.migrationToMax': 'não pode passar de "version" ({version})',
  'model.spec.migrationColumnNotEnum': '"{key}" deve ser uma coluna enum da tabela',
  'model.spec.fieldRefManyDots':
    '"{ref}" tem mais de um ponto; use "campo" ou "tabela.coluna"',
  'model.spec.fieldRefEmptyPart':
    '"{ref}" tem uma parte vazia; use "campo" ou "tabela.coluna"',
  'model.spec.roleNotOfType': '"{role}" não é um papel do tipo "{typeId}"',
  'model.spec.roleStillExists':
    'papel "{role}" ainda existe no tipo "{typeId}" nesta versão',
  'model.spec.typeNotInVersion': 'tipo "{typeId}" não existe nesta versão',
  'model.spec.typeNoRoles': 'o tipo "{typeId}" não tem papéis (childRoles) nesta versão',
  'model.spec.typeStillExists': 'tipo "{typeId}" ainda existe nesta versão',
  'model.spec.notFieldOfType': '"{key}" não é um campo do tipo "{typeId}"',
  'model.spec.notTableOfType': '"{key}" não é uma tabela do tipo "{typeId}"',
  'model.spec.notColumnOfTable':
    '"{key}" não é uma coluna da tabela "{table}" do tipo "{typeId}"',
  'model.spec.fieldStillExists':
    'campo "{key}" ainda existe no tipo "{typeId}" nesta versão',
  'model.spec.columnStillExists':
    'coluna "{column}" ainda existe na tabela "{table}" do tipo "{typeId}" nesta versão',
  'model.spec.layerNotFound': 'camada "{layer}" não existe na especialização',
  'model.spec.layerIsOwn':
    'camada "{layer}" é a do próprio tipo; filhos devem estar em outra camada',
  'model.spec.groupNotInLayer': 'grupo "{group}" não existe na camada "{layer}"',
  'model.spec.typeNotFound': 'tipo "{typeId}" não existe na especialização',
  'model.spec.typeSameLayer':
    'tipo "{typeId}" está na mesma camada; filhos devem estar em outra camada',
  'model.spec.docRepoUndeclared': 'repositório "{repo}" não declarado em docRepos',
  'model.spec.ownerNoneLists':
    '"{typeId}" exige dono, mas nenhum tipo o lista em allowedChildren',
  'model.spec.ownerOnlySelf':
    '"{typeId}" exige dono, mas nenhum outro tipo o aceita como filho (só ele mesmo o lista em allowedChildren)',
  'model.spec.tokensShape': 'deve ser um objeto com modes e values',
  'model.spec.tokenKeyUnknown': 'chave desconhecida: {key}',
  'model.spec.tokenModesEmpty': 'deve ser uma lista com ao menos um modo',
  'model.spec.tokenModeInvalid': 'modo inválido; use [a-z0-9][a-z0-9-]*',
  'model.spec.tokenModeRepeated': 'modo "{mode}" repetido',
  'model.spec.tokenNameInvalid': 'nome inválido; use [a-z0-9][a-z0-9-]*',
  'model.spec.tokenValueShape': 'deve ser texto, número ou um valor por modo',
  'model.spec.tokenModeMissing': 'falta o modo {modes}',
  'model.spec.tokenModeExtra': 'modo não declarado em modes: {modes}',
  'model.spec.tokenModeValueShape': 'cada modo deve ter texto ou número',
  'model.spec.tokenModesSameType':
    'os modos de um token devem ter o mesmo tipo (texto ou número)',
  'model.spec.iconsPathShape': 'deve ser o caminho de um arquivo .json do pacote',
  'model.spec.zod.invalid_type': 'tipo inválido: esperava {expected}, recebeu {received}',
  'model.spec.zod.unrecognized_keys': 'propriedade desconhecida: {keys}',
  'model.spec.zod.too_small': 'valor pequeno demais: o mínimo é {minimum}',
  'model.spec.zod.too_big': 'valor grande demais: o máximo é {maximum}',
  'model.spec.zod.invalid_value': 'valor inválido: esperava um destes: {values}',
  'model.spec.zod.invalid_format': 'formato de texto inválido',
  'model.spec.zod.invalid_union':
    'valor inválido: não serve para nenhuma das formas aceitas',
  'model.spec.zod.invalid_key': 'chave inválida',
  'model.spec.zod.invalid_element': 'item inválido',
  'model.spec.zod.not_multiple_of': 'número inválido: deve ser múltiplo de {divisor}',
  'model.versions.ignoredField':
    'o campo "{key}" do tipo "{typeId}" é "{removed}", que saiu do formato: foi ignorado (os valores dele não são gravados); remova-o do arquivo',
  'model.versions.manyChildrenIds':
    '{count} tipos listados um a um; uma cláusula { layer, groups } cobre a camada ou os grupos',
  'model.versions.unusedGroup':
    'o grupo "{group}" da camada "{layer}" é declarado, mas nenhum tipo está nele',
  'model.versions.unusedDocRepo':
    'o repositório "{repo}" de docRepos é declarado, mas nenhum `doc` o usa',
  'model.versions.legacyFormat':
    '"{legacy}" é o nome antigo do formato; use "mapping-spec"',
  'model.versions.typeWithoutCode':
    'o tipo "{typeId}" não tem `code`: nenhuma plataforma diz como criar uma instância dele',
  'model.versions.unusedPlatform':
    'a plataforma "{id}" é declarada, mas nenhum tipo a usa em `code`',
  'model.versions.pathWithoutRepo':
    'a plataforma "{id}" tem tipos com `path` ({count}), mas não declara `repo`: o agente não sabe em que repositório estão esses arquivos; declare `repo` (formatVersion 5)',
  'model.versions.fieldNew': 'o campo "{key}" do tipo "{typeId}" é novo',
  'model.versions.columnNew':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" é nova',
  'model.versions.fieldNewRequired':
    'o campo "{key}" do tipo "{typeId}" é novo e já obrigatório; declare um passo "fill-field" em migrations',
  'model.versions.columnNewRequired':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" é nova e já obrigatória; declare um passo "fill-field" em migrations com field "{ref}"',
  'model.versions.fieldTypeChanged':
    'o campo "{key}" do tipo "{typeId}" mudou de tipo ("{from}" para "{to}"); declare um passo "fill-field" em migrations',
  'model.versions.columnTypeChanged':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" mudou de tipo ("{from}" para "{to}"); declare um passo "fill-field" em migrations com field "{ref}"',
  'model.versions.fieldBecameRequired':
    'o campo "{key}" do tipo "{typeId}" passou a ser obrigatório; declare um passo "fill-field" em migrations',
  'model.versions.columnBecameRequired':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" passou a ser obrigatória; declare um passo "fill-field" em migrations com field "{ref}"',
  'model.versions.fieldOptionAdded':
    'o campo "{key}" do tipo "{typeId}" ganhou a opção "{option}"',
  'model.versions.columnOptionAdded':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" ganhou a opção "{option}"',
  'model.versions.fieldRemoved':
    'o campo "{key}" do tipo "{typeId}" foi removido; declare um passo "remove-field" ou "rename-field" em migrations',
  'model.versions.columnRemoved':
    'a coluna "{key}" do campo "{table}" do tipo "{typeId}" foi removida; declare um passo "remove-field" ou "rename-field" em migrations com field "{ref}"',
  'model.versions.fieldOptionRemoved':
    'a opção "{option}" do campo "{key}" do tipo "{typeId}" foi removida; declare um passo "map-values" com "{option}" em values em migrations',
  'model.versions.columnOptionRemoved':
    'a opção "{option}" da coluna "{key}" do campo "{table}" do tipo "{typeId}" foi removida; declare um passo "map-values" com "{option}" em values em migrations com field "{ref}"',
  'model.versions.rolesRequired':
    'o tipo "{typeId}" passou a ter papéis; declare um passo "set-role" em migrations (formatVersion 12)',
  'model.versions.roleAdded': 'o tipo "{typeId}" ganhou o papel "{role}"',
  'model.versions.roleRemoved':
    'o papel "{role}" do tipo "{typeId}" foi removido; declare um passo "rename-role" ou "remove-role" em migrations (formatVersion 12)',
  'model.versions.typeNew': 'o tipo "{typeId}" é novo',
  'model.versions.componentAdded': 'o tipo "{typeId}" ganhou o componente "{component}"',
  'model.versions.componentChanged':
    'o componente do tipo "{typeId}" passou de "{from}" para "{to}"',
  'model.versions.appliesToChanged':
    'o tipo "{typeId}" passou a se aplicar a: {now} (antes: {before}); anotações que deixaram de se aplicar viram pendência',
  'model.versions.docAdded': 'o tipo "{typeId}" ganhou o documento "{doc}"',
  'model.versions.exampleAdded': 'o tipo "{typeId}" ganhou o exemplo "{name}"',
  'model.versions.fontNew': 'a fonte "{family}" é nova',
  'model.versions.typeRemoved':
    'o tipo "{typeId}" foi removido; declare um passo "remove-type" ou "rename-type" em migrations',
  'model.component.unknownKey': 'chave desconhecida: {key}',
  'model.component.expectedBoolean': 'esperava booleano',
  'model.component.expectedNumber': 'esperava número',
  'model.component.expectedNonNegative': 'esperava número maior ou igual a 0',
  'model.component.expectedUnit': 'esperava número entre 0 e 1',
  'model.component.expectedWeight': 'esperava peso entre 100 e 900',
  'model.component.expectedText': 'esperava texto',
  'model.component.expectedTextOrNumber': 'esperava texto ou número',
  'model.component.expectedColor': 'esperava cor (texto não vazio)',
  'model.component.expectedOneOf': 'esperava um de: {options}',
  'model.component.expectedRadius':
    'esperava número maior ou igual a 0 ou lista de 4 números',
  'model.component.expectedFill': 'esperava cor ou gradiente',
  'model.component.expectedLinear': 'esperava "linear"',
  'model.component.expectedStops': 'esperava lista de paradas',
  'model.component.expectedTwoStops': 'esperava ao menos 2 paradas',
  'model.component.expectedObject': 'esperava objeto',
  'model.component.expectedCondition': 'esperava condição (objeto)',
  'model.component.conditionNoOperator': 'condição sem operador ({ops})',
  'model.component.conditionManyOperators': 'condição com mais de um operador: {ops}',
  'model.component.expectedFieldKey': 'esperava chave de campo (texto não vazio)',
  'model.component.expectedFieldValue':
    'esperava lista [campo, valor] com campo texto e valor texto ou número',
  'model.component.expectedConditions': 'esperava lista de condições',
  'model.component.mustBeNumber': 'precisa ser número',
  'model.component.needsOneOperand': 'precisa de 1 operando',
  'model.component.expectedOperands': 'esperava lista de operandos',
  'model.component.needsOperands': 'precisa de {min} operandos',
  'model.component.needsOperandsOrMore': 'precisa de {min} ou mais operandos',
  'model.component.opOnlyNumber': '{op} só vale onde se espera número',
  'model.component.expectedWidthHeight': 'esperava "width" ou "height"',
  'model.component.tokenOnlyWhere':
    '$token só vale onde se espera cor, número ou família de fonte',
  'model.component.expectedTokenName': 'esperava nome de token ([a-z0-9][a-z0-9-]*)',
  'model.component.alphaOnlyColor': 'alpha só vale em $token de cor',
  'model.component.exprManyOperators': 'expressão com mais de um operador: {ops}',
  'model.component.required': 'campo obrigatório',
  'model.component.expectedCases': 'esperava objeto de casos',
  'model.component.expectedParts': 'esperava lista de partes',
  'model.component.expectedSize':
    'esperava número maior ou igual a 0, "fill", "hug", "min-content", "max-content" ou "<número>%"',
  'model.component.imageNoHug':
    'o nó image não aceita hug: a arrumação não depende da imagem baixada',
  'model.component.imageNoIntrinsic':
    'o nó image não aceita min-content nem max-content: a arrumação não depende da imagem baixada',
  'model.component.notGreaterThan': 'não pode ser maior que {max}',
  'model.component.expectedSides': 'esperava lista de lados',
  'model.component.expectedOneSide': 'esperava ao menos um lado',
  'model.component.repeatedSide': 'lado repetido: {side}',
  'model.component.expectedNumbers': 'esperava lista de números',
  'model.component.sidesOnlyFrameRect': 'só vale em frame e rect (este é {nodeType})',
  'model.component.offsetOnlyShapes':
    'só vale em frame, rect e ellipse (este é {nodeType})',
  'model.component.expectedInteger1': 'esperava inteiro maior ou igual a 1',
  'model.component.expectedPadding':
    'esperava número, lista de 2 ou lista de 4 números (maiores ou iguais a 0)',
  'model.component.expectedGap':
    'esperava número ou lista [vertical, horizontal] de números (maiores ou iguais a 0)',
  'model.component.expectedLayoutFlow': 'esperava "none", "row", "column" ou "grid"',
  'model.component.expectedViewBox': 'esperava [largura, altura] com números positivos',
  'model.component.expectedRunObject': 'esperava objeto (trecho)',
  'model.component.expectedRuns': 'esperava lista não vazia de trechos',
  'model.component.textAndRuns': 'text e runs juntos: use um ou outro',
  'model.component.expectedNodeObject': 'esperava objeto (nó)',
  'model.component.nodeTypeUnknown': 'tipo de nó desconhecido: {type} (esperava {types})',
  'model.component.onlyFrameAccepts':
    'só nós do tipo frame aceitam {key} (este é {type})',
  'model.component.notInRepeat': 'não vale em repeat; o desenho é do template ({key})',
  'model.component.expectedNodes': 'esperava lista de nós',
  'model.component.expectedHttps': 'esperava URL https:// absoluta ({reason})',
  'model.component.srcOnlyLiteral':
    'src só aceita texto literal ou { "$field": "<campo>" }',
  'model.component.expectedInteger0': 'esperava inteiro maior ou igual a 0',
  'model.component.countOrField': 'use count ou field, não os dois',
  'model.component.repeatTemplateFrame':
    'o template de uma linha deve ser do tipo "frame"',
  'model.component.notAllowedInRepeat': '{type} não é permitido dentro de um repeat',
  'model.component.overOnlyColor': 'over só vale em $token de cor',
  'model.component.expectedTokenOrColor': 'esperava nome de token ou cor',
  'model.component.expectedTokenNameOrColor':
    'esperava nome de token ([a-z0-9][a-z0-9-]*) ou cor',
  'model.component.emptyName': 'nome vazio',
  'model.component.providedOnlyColor': '$provided só vale onde se espera cor',
  'model.component.expectedProvidedName':
    'esperava nome da cor oferecida (texto não vazio)',
  'model.component.gapNotWithSides': 'gap não vale com sides',
  'model.component.expectedShadowCount': 'esperava de 1 a {max} sombras',
  'model.component.gapNodeNotFound': 'nó não encontrado: {name}',
  'model.component.gapNotInRepeat': 'stroke.gap não pode ser usado dentro de um repeat',
  'model.component.gapNotSelf': 'stroke.gap.node não pode citar o próprio nó: {name}',
  'model.component.gapNotInsideRepeat':
    'stroke.gap.node não pode citar um nó dentro de um repeat: {name}',
  'model.component.baselineOnlyRow': 'baseline só vale em row',
  'model.component.baselineNotWithVerticalAlign': 'não combina com verticalAlign',
  'model.component.expectedNodeName': 'esperava nome de um nó text (texto não vazio)',
  'model.component.linesNodeMissing': 'nó text "{name}" não existe',
  'model.component.linesNodeRepeated': 'mais de um nó text "{name}"',
  'model.component.linesInsideRepeat': 'nó text "{name}" está dentro de um repeat',
  'model.component.linesSelf': 'o nó não pode depender das próprias linhas',
  'model.component.sizingNoSize': '$size não vale em sizing',
  'model.component.sizingNoLines': '$lines não vale em sizing',
  'model.component.onlyWithWrap': 'só vale com wrap',
  'model.component.gridTracksExactlyOne':
    'layout: informe exatamente uma entre columns, minColumnWidth, rows e minRowHeight',
  'model.component.expectedGreaterThanZero': 'esperava número maior que 0',
  'model.component.trackOnlyGrid': 'só vale em layout grid',
  'model.component.notInGrid': 'não vale em layout grid',
  'model.component.spanOnlyInGrid': 'span: só vale em filho de layout grid',
  'model.component.anchorStartLeft': 'não combina com left',
  'model.component.anchorEndRight': 'não combina com right',
  'model.component.weightOnlyFill':
    'weight: só vale em filho fill no eixo principal de row ou column',
  'model.component.repeatLayoutConflict':
    'repeat.layout: não combina com direction nem gap',
  'model.component.distributeNotGrid': 'distribute: não vale com layout grid',
  'model.component.repeatLayoutUseKey':
    'repeat.layout: a chave vai dentro de layout ({key})',
  'model.component.repeatLayoutNotNone': 'repeat.layout: use row, column ou grid',
  'model.component.v4Only': 'só é permitido com formatVersion 4',
  'model.component.anchorFieldUnknown': 'campo não existe: {name}',
  'model.component.indexOnlyInRepeat': '$index só vale dentro de um repeat',
  'model.component.repeatOnlyV2': 'o nó repeat só existe na formatVersion 2',
  'model.component.imageOnlyV3': 'o nó image só existe na formatVersion 3',
  'model.component.expectedVariableName': 'esperava nome de variável ([a-z][a-zA-Z0-9]*)',
  'model.component.variableUndefined': 'variável não definida: {name}',
  'model.component.variableCycle': 'ciclo de variáveis: {cycle}',
  'model.component.variablesTooBig':
    'expansão das variáveis grande demais (mais de {max} nós)',
  'model.component.expectedSizeObject': 'esperava objeto { width, height }',
  'model.component.expectedPositive': 'esperava número positivo',
  'model.component.expectedSizingObject': 'esperava objeto { width?, height? }',
  'model.component.expectedSizing':
    'esperava número maior ou igual a 0, "fill", "hug", "min-content" ou "max-content"',
  'model.component.formatInvalid': 'esperava "mapping-component"',
  'model.component.formatVersionInvalid': 'esperava {versions} ou {last}',
  'model.component.idInvalid': 'esperava texto no padrão ^[a-z0-9][a-z0-9-_]*$',
  'model.component.expectedName': 'esperava texto não vazio',
  'model.component.rootNotFrame': 'a raiz do template deve ser do tipo "frame"',
  'model.component.rootNoRotation': 'não vale na raiz',
  'model.component.expectedPreviewValue':
    'esperava texto, número ou null (ou uma lista de linhas, num campo table)',
  'model.component.expectedRow': 'esperava objeto (uma linha)',
  'model.component.expectedCell': 'esperava texto, número ou null',
  'model.component.fontFamilyInvalid':
    'família de fonte inválida para o CSS ({family}): o texto cai em sans-serif',
  'model.iconsFile.expectedObject': 'esperava um objeto',
  'model.iconsFile.expectedObjectShort': 'esperava objeto',
  'model.iconsFile.expectedViewBox':
    'esperava [largura, altura] com números maiores que 0',
  'model.iconsFile.expectedPaint': 'esperava true, false ou uma cor (texto)',
  'model.iconsFile.expectedOneOf': 'esperava um de: {options}',
  'model.iconsFile.expectedWidth': 'esperava número maior ou igual a 0',
  'model.iconsFile.unknownKey': 'chave desconhecida: {key}',
  'model.iconsFile.expectedPathData': 'esperava os dados do caminho (texto)',
  'model.iconsFile.expectedPaths': 'esperava lista não vazia de caminhos',
  'model.iconsFile.formatInvalid': 'deve ser "{format}"',
  'model.iconsFile.formatVersionInvalid': 'deve ser 1 ou 2',
  'model.iconsFile.v2Only': 'só é permitido com formatVersion 2',
  'model.iconsFile.expectedBoolean': 'esperava true ou false',
  'model.iconsFile.required': 'campo obrigatório',
  'model.iconsFile.expectedIcons': 'esperava um objeto com ao menos um ícone',
  'model.iconsFile.nameInvalid': 'nome inválido; use [a-z0-9][a-z0-9-_]*',
  'model.origins.expectedList': 'esperava uma lista',
  'model.origins.expectedObject': 'esperava um objeto',
  'model.origins.expectedPath': 'esperava um caminho (texto não vazio)',
  'model.origins.wildcardOnlyRoots': '"[*]" só vale em roots[].path',
  'model.origins.expectedMap': 'esperava um objeto (origem → destino)',
  'model.origins.expectedText': 'esperava texto',
  'model.origins.expectedLiteralOrPath': 'esperava um literal ou { path }',
  'model.origins.expectedTextOrNumber': 'esperava texto ou número',
  'model.origins.anchorInvalid': 'âncora inválida: {anchor}; use {anchors}',
  'model.origins.marginNeedsAnchor': 'margin só vale com anchor',
  'model.origins.expectedScrim': 'esperava o id de um tipo (texto não vazio)',
  'model.origins.expectedRoots': 'esperava uma lista com pelo menos uma raiz',
  'model.origins.expectedBooleans': 'esperava { "true": texto, "false": texto }',
  'model.origins.expectedNonEmptyText': 'esperava texto não vazio',
  'model.origins.expectedKind': 'esperava um de: {kinds}',
  'model.origins.expectedNode': 'esperava um objeto com type, props e children',
  'model.origins.requiredKeyName': 'obrigatório (nome da chave, texto não vazio)',
  'model.origins.expectedExampleFile': 'esperava o caminho de um arquivo .json do pacote',
  'model.origins.systemRepeated': 'origem repetida: {system}',
  'model.origins.needsIdOrName': 'precisa de id ou name',
  'model.origins.expectedTextList': 'esperava uma lista de textos',
  'model.origins.needsNameOrPath': 'precisa de name ou path',
  'model.origins.draw.notScalar': '{path}: esperava valor simples',
  'model.origins.draw.optionOutside': '{path}: valor fora das opções de {key}: {value}',
  'model.origins.draw.nodeInvalid': '{path}: nó inválido (esperava objeto)',
  'model.origins.draw.typeMissing': '{path}: tipo ausente',
  'model.origins.draw.typeUnknown': '{path}: tipo externo sem tipo de anotação: {name}',
  'model.origins.draw.expectedObject': '{path}: esperava objeto',
  'model.origins.draw.expectedList': '{path}: esperava lista',
  'model.origins.draw.unknownProp': '{path}: propriedade desconhecida em {name}',
  'model.origins.draw.anchorInvalid':
    '{path}: âncora inválida: {value}; usando top-start',
  'model.origins.draw.marginInvalid': '{path}: esperava número maior ou igual a 0',
  'model.origins.draw.rectInvalid': '{path}: esperava { x, y, width, height } numéricos',
  'model.origins.draw.nodeUntyped': '{path}: nó sem tipo de anotação ({label}); ignorado',
  'model.origins.draw.nodeUntypedBare':
    '{path}: nó sem tipo de anotação (sem type); ignorado',
  'model.origins.error.systemUndeclared':
    'origem não declarada na especialização: {system}',
  'model.origins.error.noOrigins': 'a especialização não declara origens',
  'model.origins.error.onlyMeasured':
    'a especialização só declara origens measured (que não geram tela); passe o system da origem',
  'model.origins.error.widthInvalid': 'largura da tela ausente ou inválida ({source})',
  'model.origins.error.heightInvalid': 'altura da tela ausente ou inválida ({source})',
  'model.origins.error.noResult': 'tradução sem resultado',
  'model.origins.draw.emptyRect': '{path}: retângulo vazio ({width}×{height}); ignorado',
  'model.engine.fieldMissing': 'campo não informado: {key}',
  'model.engine.textZeroWidth': 'texto medido com largura 0: {name}',
  'model.engine.invalidValue': 'valor inválido em {label}: {value}',
  'model.engine.fillInHug': 'fill dentro de hug vira 0',
  'model.engine.iconStretched': 'ícone esticado: escala diferente nos dois eixos',
  'model.engine.iconUnknown': 'ícone desconhecido: {name}',
  'model.engine.contentTooBig': 'conteúdo maior que a caixa: {name}',
  'model.engine.textTooBig': 'texto maior que a caixa: {name}',
  'model.engine.repeatLimited': 'repeat limitado a {limit} linhas: {name}',
  'model.engine.typeNoComponent': '{path}: tipo sem componente: {typeId}',
  'model.engine.childrenIgnored': '{path}: filhos ignorados (componente sem slot)',
  'model.engine.fillInHugUsing': '{path}: fill dentro de hug: usando hug',
  'model.engine.slotInvisible': '{path}: slot invisível: filhos ignorados',
  'model.engine.childrenOutsideMaxLines': '{count} filhos fora de maxLines: {name}',
  'model.engine.linesUnstable': '$lines instável: {name}',
  'model.engine.screenTooTall': 'tela: conteúdo maior que a altura da tela',
  'model.engine.approximate': '{reason} (aproximado)',
  'model.engine.inRtl': 'em rtl: {reason}',
};
