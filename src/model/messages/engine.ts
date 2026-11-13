// Mensagens do motor de desenho (`instantiate.ts`, `layout.ts`, `repeat.ts`; etapa #1263, MB5):
// código → modelo do texto pt-BR de hoje, com `{parâmetros}`. O `warnings` de texto do motor é o
// `text` destas mensagens, letra por letra. O caminho do nó vai em `{path}` (`withoutNodePrefix`
// de `libraryDrawing.ts` o recorta no parâmetro, não no texto).

export const engineMessages = {
  'engine.fieldMissing': 'campo não informado: {key}',
  'engine.textZeroWidth': 'texto medido com largura 0: {name}',
  'engine.invalidValue': 'valor inválido em {label}: {value}',
  'engine.fillInHug': 'fill dentro de hug vira 0',
  'engine.iconStretched': 'ícone esticado: escala diferente nos dois eixos',
  'engine.iconUnknown': 'ícone desconhecido: {name}',
  'engine.contentTooBig': 'conteúdo maior que a caixa: {name}',
  'engine.textTooBig': 'texto maior que a caixa: {name}',
  'engine.repeatLimited': 'repeat limitado a {limit} linhas: {name}',
  'engine.typeNoComponent': '{path}: tipo sem componente: {typeId}',
  'engine.childrenIgnored': '{path}: filhos ignorados (componente sem slot)',
  'engine.fillInHugUsing': '{path}: fill dentro de hug: usando hug',
  'engine.slotInvisible': '{path}: slot invisível: filhos ignorados',
  'engine.childrenOutsideMaxLines': '{count} filhos fora de maxLines: {name}',
  'engine.linesUnstable': '$lines instável: {name}',
  'engine.screenTooTall': 'tela: conteúdo maior que a altura da tela',
  // Prova de desenho da biblioteca: o aviso do motor com o sufixo de medida aproximada.
  'engine.approximate': '{reason} (aproximado)',
  // Prova de desenho em `rtl`: o aviso que só aparece nesse sentido (o `ltr` não o deu).
  'engine.inRtl': 'em rtl: {reason}',
} as const;
