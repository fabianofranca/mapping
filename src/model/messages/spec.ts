// Mensagens da especialização (`src/model/spec.ts`): código → modelo do texto pt-BR de hoje, com
// `{parâmetros}`. O `parseSpec` acha o código de uma mensagem fixa pelo texto exato (as entradas
// sem `{}`), de uma com parâmetro por `params.messageCode` no `addIssue` e dá aos textos padrão
// do zod o código `spec.zod.<código do zod>` (o modelo deles é uma tradução, não o `message`).
// Um texto é de um código só entre as entradas fixas.

export const specMessages = {
  // Texto, formato e valores
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
  // Fontes, aceitação e avisos
  'spec.typeSourceNeedsIdOrName': 'precisa de "id" ou "name"',
  'spec.acceptsAnnotationsEmpty':
    'não pode ser vazio; tire a chave ou liste ao menos um item',
  'spec.acceptsNeedsOne':
    'precisa de pelo menos uma etiqueta, "free": true ou "annotations"',
  'spec.noticeKindInvalid':
    '"{value}" inválido; use "removed", "deprecated", "diverges" ou "pending"',
  'spec.noticeKindShape': 'deve ser "removed", "deprecated", "diverges" ou "pending"',
  'spec.noticeRepeated': 'aviso repetido',
  // Valores de campo
  'spec.valueMustBeNumber': 'deve ser número',
  'spec.valueMustBeDate': 'deve ser uma data AAAA-MM-DD válida',
  'spec.valueMustBeOption': 'deve ser uma das options',
  'spec.valueNotForTable': 'não existe para table',
  'spec.valueNotForRef': 'não existe para ref',
  // Sugestões
  'spec.suggestionsEmpty':
    'não pode ser vazio; tire a chave ou liste ao menos uma sugestão',
  'spec.suggestionsMax': 'no máximo {max} sugestões',
  'spec.suggestionsBlank': 'sugestões não podem ser vazias',
  'spec.suggestionsTrim': 'sugestões não podem ter espaço no começo nem no fim',
  'spec.suggestionsRepeated': 'sugestões repetidas',
  // Campos e colunas
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
  // Código de instanciação (`code`)
  'spec.codePathInvalid':
    'caminho inválido: use um caminho relativo à raiz do repositório, com "/", sem "." nem ".." e sem unidade (ex: app/src/Main.kt)',
  'spec.codeFieldNotEnum': '"{key}" deve ser um campo enum do tipo',
  'spec.notInOptionsOf': '"{value}" não está nas options de "{field}"',
  'spec.variantsNoCases': 'declare ao menos um caso',
  'spec.variantsEmptyCase': 'caso vazio: declare symbol, path, params, values ou notes',
  // Exemplos
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
  // Onde se aplica
  'spec.appliesToEmpty': 'não pode ser vazio; use "marking", "arrow" ou os dois',
  'spec.repeatedValues': 'valores repetidos',
  'spec.arrowOnlyNoComponent': 'um tipo só de seta não pode ter component',
  'spec.arrowOnlyNoFloating': 'um tipo só de seta não pode ter floating',
  'spec.appliesToInvalid': '"{value}" inválido; use "marking" ou "arrow"',
  'spec.appliesToShape': 'deve ser "marking" ou "arrow"',
  // Filhos permitidos, documentos, papéis e grupos
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
  // Tipos
  'spec.structuralNoComponent': 'um tipo estrutural não desenha: não pode ter component',
  'spec.labelFieldNotString': '"{key}" deve ser um campo string do tipo',
  'spec.onlyFormat15': 'só é permitido com formatVersion 15',
  'spec.onlyFormat10': 'só é permitido com formatVersion 10',
  // Textos padrão do zod (tradução; o `message` segue o do zod, em inglês)
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
