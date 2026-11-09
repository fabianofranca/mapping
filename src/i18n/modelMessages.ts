// Mensagens do modelo que a interface traduz (`ModelMessage`: código + parâmetros; ver
// `src/model/modelMessage.ts`). A chave é `model.<código>`. Entram nos dicionários por
// `...modelMessagesPtBR` / `...modelMessagesEnUS`. Mesmas chaves e mesmos {parâmetros} nos dois
// idiomas; o pt-BR é idêntico ao `text` que o modelo devolve (o que o MCP segue emitindo).

export const modelMessagesPtBR = {
  // Catálogo (src/model/catalog.ts)
  'model.catalog.fileMissing': 'arquivo ausente ({path})',
  'model.catalog.invalidComponent': 'componente inválido',
  'model.catalog.typeOutside': 'tipo "{typeId}" fora da especialização',
  'model.catalog.typeNoComponent': 'tipo "{typeId}" sem componente',
  // Arrumar (src/model/componentArrange.ts)
  'model.arrange.overflow': '{label}: conteúdo maior que o container',
  'model.arrange.outside': '{label}: não cabe em {where}',
  // Referências nos valores do desenho (src/model/componentValues.ts)
  'model.value.refBroken': 'referência quebrada: {key}',
  'model.value.refCycle': 'referência em ciclo: {key}',
  'model.value.refDeep': 'referência em mais de um nível: {key}',
  // Carga dos componentes da especialização (src/model/componentCatalog.ts)
  'model.components.outsideLibrary': '{typeId}: caminho fora da biblioteca: {path}',
  'model.components.fileMissing': '{typeId}: arquivo ausente ({path})',
  'model.components.invalid': '{typeId}: {reason}',
  'model.components.invalidFallback': '{typeId}: componente inválido',
  'model.icons.outsideLibrary': 'icons: caminho fora da biblioteca: {path}',
  'model.icons.fileMissing': 'icons: arquivo ausente ({path})',
  'model.icons.invalid': 'icons: {reason}',
  'model.icons.invalidFallback': 'icons: conjunto de ícones inválido',
} as const;

/** Os códigos conhecidos (a chave sem o prefixo `model.`). */
export type ModelMessageCode = keyof typeof modelMessagesPtBR extends infer K
  ? K extends `model.${infer C}`
    ? C
    : never
  : never;

export const modelMessagesEnUS: Record<keyof typeof modelMessagesPtBR, string> = {
  'model.catalog.fileMissing': 'missing file ({path})',
  'model.catalog.invalidComponent': 'invalid component',
  'model.catalog.typeOutside': 'type "{typeId}" is outside the specialization',
  'model.catalog.typeNoComponent': 'type "{typeId}" has no component',
  'model.arrange.overflow': '{label}: content is larger than the container',
  'model.arrange.outside': '{label}: does not fit in {where}',
  'model.value.refBroken': 'broken reference: {key}',
  'model.value.refCycle': 'reference cycle: {key}',
  'model.value.refDeep': 'reference through more than one level: {key}',
  'model.components.outsideLibrary': '{typeId}: path outside the library: {path}',
  'model.components.fileMissing': '{typeId}: missing file ({path})',
  'model.components.invalid': '{typeId}: {reason}',
  'model.components.invalidFallback': '{typeId}: invalid component',
  'model.icons.outsideLibrary': 'icons: path outside the library: {path}',
  'model.icons.fileMissing': 'icons: missing file ({path})',
  'model.icons.invalid': 'icons: {reason}',
  'model.icons.invalidFallback': 'icons: invalid icon set',
};
