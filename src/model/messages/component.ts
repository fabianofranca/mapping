// Mensagens do componente (`parseComponent.ts`): código → modelo do texto pt-BR de hoje, com
// `{parâmetros}`. O JSON inválido usa `library.invalidJson`. O texto que o parser monta é o
// mesmo de antes; o código sai da busca pelo texto (`textLookup.ts`).

export const componentMessages = {
  // Literais
  'component.unknownKey': 'chave desconhecida: {key}',
  'component.expectedBoolean': 'esperava booleano',
  'component.expectedNumber': 'esperava número',
  'component.expectedNonNegative': 'esperava número maior ou igual a 0',
  'component.expectedUnit': 'esperava número entre 0 e 1',
  'component.expectedWeight': 'esperava peso entre 100 e 900',
  'component.expectedText': 'esperava texto',
  'component.expectedTextOrNumber': 'esperava texto ou número',
  'component.expectedColor': 'esperava cor (texto não vazio)',
  'component.expectedOneOf': 'esperava um de: {options}',
  'component.expectedRadius': 'esperava número maior ou igual a 0 ou lista de 4 números',
  'component.expectedFill': 'esperava cor ou gradiente',
  'component.expectedLinear': 'esperava "linear"',
  'component.expectedStops': 'esperava lista de paradas',
  'component.expectedTwoStops': 'esperava ao menos 2 paradas',
  'component.expectedObject': 'esperava objeto',
  // Condições e expressões
  'component.expectedCondition': 'esperava condição (objeto)',
  'component.conditionNoOperator': 'condição sem operador ({ops})',
  'component.conditionManyOperators': 'condição com mais de um operador: {ops}',
  'component.expectedFieldKey': 'esperava chave de campo (texto não vazio)',
  'component.expectedFieldValue':
    'esperava lista [campo, valor] com campo texto e valor texto ou número',
  'component.expectedConditions': 'esperava lista de condições',
  'component.mustBeNumber': 'precisa ser número',
  'component.needsOneOperand': 'precisa de 1 operando',
  'component.expectedOperands': 'esperava lista de operandos',
  'component.needsOperands': 'precisa de {min} operandos',
  'component.needsOperandsOrMore': 'precisa de {min} ou mais operandos',
  'component.opOnlyNumber': '{op} só vale onde se espera número',
  'component.expectedWidthHeight': 'esperava "width" ou "height"',
  'component.tokenOnlyWhere':
    '$token só vale onde se espera cor, número ou família de fonte',
  'component.expectedTokenName': 'esperava nome de token ([a-z0-9][a-z0-9-]*)',
  'component.alphaOnlyColor': 'alpha só vale em $token de cor',
  'component.exprManyOperators': 'expressão com mais de um operador: {ops}',
  'component.required': 'campo obrigatório',
  'component.expectedCases': 'esperava objeto de casos',
  'component.expectedParts': 'esperava lista de partes',
  // Tamanho, lados, traço, sombra, fonte, layout
  'component.expectedSize':
    'esperava número maior ou igual a 0, "fill", "hug" ou "<número>%"',
  'component.imageNoHug':
    'o nó image não aceita hug: a arrumação não depende da imagem baixada',
  'component.notGreaterThan': 'não pode ser maior que {max}',
  'component.expectedSides': 'esperava lista de lados',
  'component.expectedOneSide': 'esperava ao menos um lado',
  'component.repeatedSide': 'lado repetido: {side}',
  'component.expectedNumbers': 'esperava lista de números',
  'component.sidesOnlyFrameRect': 'só vale em frame e rect (este é {nodeType})',
  'component.offsetOnlyShapes': 'só vale em frame, rect e ellipse (este é {nodeType})',
  'component.expectedInteger1': 'esperava inteiro maior ou igual a 1',
  'component.expectedPadding':
    'esperava número, lista de 2 ou lista de 4 números (maiores ou iguais a 0)',
  'component.expectedGap':
    'esperava número ou lista [vertical, horizontal] de números (maiores ou iguais a 0)',
  'component.expectedLayoutFlow': 'esperava "none", "row", "column" ou "grid"',
  'component.expectedViewBox': 'esperava [largura, altura] com números positivos',
  // Texto e nós
  'component.expectedRunObject': 'esperava objeto (trecho)',
  'component.expectedRuns': 'esperava lista não vazia de trechos',
  'component.textAndRuns': 'text e runs juntos: use um ou outro',
  'component.expectedNodeObject': 'esperava objeto (nó)',
  'component.nodeTypeUnknown': 'tipo de nó desconhecido: {type} (esperava {types})',
  'component.onlyFrameAccepts': 'só nós do tipo frame aceitam {key} (este é {type})',
  'component.notInRepeat': 'não vale em repeat; o desenho é do template ({key})',
  'component.expectedNodes': 'esperava lista de nós',
  'component.expectedHttps': 'esperava URL https:// absoluta ({reason})',
  'component.srcOnlyLiteral': 'src só aceita texto literal ou { "$field": "<campo>" }',
  'component.expectedInteger0': 'esperava inteiro maior ou igual a 0',
  'component.countOrField': 'use count ou field, não os dois',
  'component.repeatTemplateFrame': 'o template de uma linha deve ser do tipo "frame"',
  'component.notAllowedInRepeat': '{type} não é permitido dentro de um repeat',
  // Formato 4: over, provide, stroke.gap e lista de sombras
  'component.overOnlyColor': 'over só vale em $token de cor',
  'component.expectedTokenOrColor': 'esperava nome de token ou cor',
  'component.expectedTokenNameOrColor':
    'esperava nome de token ([a-z0-9][a-z0-9-]*) ou cor',
  'component.emptyName': 'nome vazio',
  'component.providedOnlyColor': '$provided só vale onde se espera cor',
  'component.expectedProvidedName': 'esperava nome da cor oferecida (texto não vazio)',
  'component.gapNotWithSides': 'gap não vale com sides',
  'component.expectedShadowCount': 'esperava de 1 a {max} sombras',
  'component.gapNodeNotFound': 'nó não encontrado: {name}',
  'component.gapNotInRepeat': 'stroke.gap não pode ser usado dentro de um repeat',
  'component.gapNotSelf': 'stroke.gap.node não pode citar o próprio nó: {name}',
  'component.gapNotInsideRepeat':
    'stroke.gap.node não pode citar um nó dentro de um repeat: {name}',
  // Linha de base
  'component.baselineOnlyRow': 'baseline só vale em row',
  'component.baselineNotWithVerticalAlign': 'não combina com verticalAlign',
  // $lines e sizing por expressão
  'component.expectedNodeName': 'esperava nome de um nó text (texto não vazio)',
  'component.linesNodeMissing': 'nó text "{name}" não existe',
  'component.linesNodeRepeated': 'mais de um nó text "{name}"',
  'component.linesInsideRepeat': 'nó text "{name}" está dentro de um repeat',
  'component.linesSelf': 'o nó não pode depender das próprias linhas',
  'component.sizingNoSize': '$size não vale em sizing',
  'component.sizingNoLines': '$lines não vale em sizing',
  'component.onlyWithWrap': 'só vale com wrap',
  // Versão do formato
  'component.v4Only': 'só é permitido com formatVersion 4',
  'component.indexOnlyInRepeat': '$index só vale dentro de um repeat',
  'component.repeatOnlyV2': 'o nó repeat só existe na formatVersion 2',
  'component.imageOnlyV3': 'o nó image só existe na formatVersion 3',
  // Dimensões, tela e arquivo
  'component.expectedSizeObject': 'esperava objeto { width, height }',
  'component.expectedPositive': 'esperava número positivo',
  'component.expectedSizingObject': 'esperava objeto { width?, height? }',
  'component.expectedSizing': 'esperava número maior ou igual a 0, "fill" ou "hug"',
  'component.formatInvalid': 'esperava "mapping-component"',
  'component.formatVersionInvalid': 'esperava {versions} ou {last}',
  'component.idInvalid': 'esperava texto no padrão ^[a-z0-9][a-z0-9-_]*$',
  'component.expectedName': 'esperava texto não vazio',
  'component.rootNotFrame': 'a raiz do template deve ser do tipo "frame"',
  'component.rootNoRotation': 'não vale na raiz',
  'component.expectedPreviewValue':
    'esperava texto, número ou null (ou uma lista de linhas, num campo table)',
  'component.expectedRow': 'esperava objeto (uma linha)',
  'component.expectedCell': 'esperava texto, número ou null',
  // Aviso
  'component.fontFamilyInvalid':
    'família de fonte inválida para o CSS ({family}): o texto cai em sans-serif',
} as const;
