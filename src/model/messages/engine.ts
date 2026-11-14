// Messages of the drawing engine (`instantiate.ts`, `layout.ts`, `repeat.ts`; stage #1263, MB5):
// code → template of today's pt-BR text, with `{parameters}`. The engine's text `warnings` are
// the `text` of these messages, letter for letter. The node path goes in `{path}`
// (`withoutNodePrefix` of `libraryDrawing.ts` cuts it off in the parameter, not in the text).

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
  // Library drawing proof: the engine warning with the approximate-measure suffix.
  'engine.approximate': '{reason} (aproximado)',
  // Drawing proof in `rtl`: the warning that only appears in that direction (`ltr` did not give it).
  'engine.inRtl': 'em rtl: {reason}',
} as const;
