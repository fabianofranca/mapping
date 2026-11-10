// Mensagens da leitura da declaração das origens (`origin.ts`, `parseOrigins`): código → modelo
// do texto pt-BR de hoje, com `{parâmetros}`. O caminho vem à parte (`origins[0].screen…`); aqui
// fica só a mensagem. O caminho de pacote (`examples[].file`) usa as mensagens do catálogo `spec`.

export const originMessages = {
  'origins.expectedList': 'esperava uma lista',
  'origins.expectedObject': 'esperava um objeto',
  'origins.expectedPath': 'esperava um caminho (texto não vazio)',
  'origins.wildcardOnlyRoots': '"[*]" só vale em roots[].path',
  'origins.expectedMap': 'esperava um objeto (origem → destino)',
  'origins.expectedText': 'esperava texto',
  'origins.expectedLiteralOrPath': 'esperava um literal ou { path }',
  'origins.expectedTextOrNumber': 'esperava texto ou número',
  'origins.anchorInvalid': 'âncora inválida: {anchor}; use {anchors}',
  'origins.marginNeedsAnchor': 'margin só vale com anchor',
  'origins.expectedScrim': 'esperava o id de um tipo (texto não vazio)',
  'origins.expectedRoots': 'esperava uma lista com pelo menos uma raiz',
  'origins.expectedBooleans': 'esperava { "true": texto, "false": texto }',
  'origins.expectedNonEmptyText': 'esperava texto não vazio',
  'origins.expectedKind': 'esperava um de: {kinds}',
  'origins.expectedNode': 'esperava um objeto com type, props e children',
  'origins.requiredKeyName': 'obrigatório (nome da chave, texto não vazio)',
  'origins.expectedExampleFile': 'esperava o caminho de um arquivo .json do pacote',
  'origins.systemRepeated': 'origem repetida: {system}',
  'origins.needsIdOrName': 'precisa de id ou name',
  'origins.expectedTextList': 'esperava uma lista de textos',
  'origins.needsNameOrPath': 'precisa de name ou path',
} as const;
