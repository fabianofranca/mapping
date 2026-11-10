// Mensagens do conjunto de ícones (`icons.ts`, formato `mapping-icons`): código → modelo do texto
// pt-BR de hoje, com `{parâmetros}`. O prefixo é `iconsFile.` para não colidir com os
// `icons.*` escritos à mão (carga dos componentes). O JSON inválido usa `library.invalidJson`.

export const iconsFileMessages = {
  'iconsFile.expectedObject': 'esperava um objeto',
  'iconsFile.expectedObjectShort': 'esperava objeto',
  'iconsFile.expectedViewBox': 'esperava [largura, altura] com números maiores que 0',
  'iconsFile.expectedPaint': 'esperava true, false ou uma cor (texto)',
  'iconsFile.expectedOneOf': 'esperava um de: {options}',
  'iconsFile.expectedWidth': 'esperava número maior ou igual a 0',
  'iconsFile.unknownKey': 'chave desconhecida: {key}',
  'iconsFile.expectedPathData': 'esperava os dados do caminho (texto)',
  'iconsFile.expectedPaths': 'esperava lista não vazia de caminhos',
  'iconsFile.formatInvalid': 'deve ser "{format}"',
  'iconsFile.formatVersionInvalid': 'deve ser {version} (a única versão do formato)',
  'iconsFile.required': 'campo obrigatório',
  'iconsFile.expectedIcons': 'esperava um objeto com ao menos um ícone',
  'iconsFile.nameInvalid': 'nome inválido; use [a-z0-9][a-z0-9-_]*',
} as const;
