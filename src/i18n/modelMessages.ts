// Mensagens do modelo que a interface traduz (`ModelMessage`: código + parâmetros; ver
// `src/model/modelMessage.ts`). A chave é `model.<código>`. Entram nos dicionários por
// `...modelMessagesPtBR` / `...modelMessagesEnUS`. Mesmas chaves e mesmos {parâmetros} nos dois
// idiomas; o pt-BR é idêntico ao `text` que o modelo devolve (o que o MCP segue emitindo).

import { libraryMessages } from '../model/messages/library';
import {
  MODEL_MESSAGE_TEMPLATES,
  type ModelMessageTemplateCode,
} from '../model/messages';

/** As chaves `model.<código>` do catálogo do modelo, com o texto pt-BR dele (sem repetir o texto). */
const templatePtBR = Object.fromEntries(
  Object.entries(MODEL_MESSAGE_TEMPLATES).map(([code, text]) => [`model.${code}`, text]),
) as { readonly [C in ModelMessageTemplateCode as `model.${C}`]: string };

export const modelMessagesPtBR = {
  ...templatePtBR,
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

/** en-US dos códigos do catálogo `library` (termos do formato, ids e caminhos não se traduzem). */
const libraryEnUS: {
  readonly [C in keyof typeof libraryMessages as `model.${C}`]: string;
} = {
  'model.library.notReferenced': 'file not referenced by the specialization',
  'model.library.emptyDoc': 'empty document',
  'model.library.fileNotFound': 'file not found: {path}',
  'model.library.notRead': 'the file content was not read (expected the text)',
  'model.library.invalidJson': 'invalid JSON: {detail}',
  'model.library.specFileNotFound': 'specialization file not found: {path}',
  'model.library.specNotFound':
    'no specialization found: the package needs a .json file with "format": "mapping-spec"',
  'model.library.specAmbiguous':
    'there are {count} specializations in the package ({files}): say which one to validate',
  'model.library.componentAlreadyUsed':
    'the file {path} is already the component of the type "{typeId}"',
  'model.library.noSlot': 'the component {path} has no slot',
  'model.library.slotMismatch':
    'the slot of the component {path} is "{slot}", not "{expected}"',
  'model.library.fieldUndeclared':
    'the drawing uses the field "{key}", which the type "{typeId}" does not declare',
  'model.library.fieldUnused':
    'the field "{key}" of the type "{typeId}" is not used by the drawing of the component {path}',
  'model.library.previewNoField': 'the type "{typeId}" has no field "{key}"',
  'model.library.previewNotTable':
    '"{key}" is not a table of the type "{typeId}"; its preview must be a simple value',
  'model.library.previewTableNotList':
    '"{key}" is a table of the type "{typeId}"; its preview must be a list of rows',
  'model.library.previewColumnUnknown':
    '"{column}" is not a column of the table "{key}" of the type "{typeId}"',
  'model.library.repeatNotTable':
    'the repeat repeats the rows of "{key}", which is a {fieldType} field of the type "{typeId}", not a table',
  'model.library.repeatRowUnknownColumn':
    'the row drawing uses "{name}", which is neither a column of the table "{key}" nor a field of the type "{typeId}"',
  'model.library.repeatRowUnknown':
    'the row drawing uses "{name}", which the type "{typeId}" does not declare',
  'model.library.rowsNotTable':
    '$rows counts the rows of "{key}", which is a {fieldType} field of the type "{typeId}", not a table',
  'model.library.imageColumnNotString':
    'the image src reads the column "{key}" of the table "{table}" of the type "{typeId}", which is {fieldType}, not string',
  'model.library.imageFieldNotString':
    'the image src reads "{key}", which is a {fieldType} field of the type "{typeId}", not string',
  'model.library.fontMissing':
    'file of the font "{family}" not found: {path}; the drawing uses the system font',
  'model.library.scrimMissing':
    'the type "{typeId}" does not exist in the specialization',
  'model.library.tokenMissing':
    'the token "{name}" does not exist in the specialization tokens',
  'model.library.tokenWrongKind.color.number':
    'the token "{name}" is a color, but a number is expected here',
  'model.library.tokenWrongKind.color.family':
    'the token "{name}" is a color, but a font family is expected here',
  'model.library.tokenWrongKind.number.color':
    'the token "{name}" is a number, but a color is expected here',
  'model.library.tokenWrongKind.number.family':
    'the token "{name}" is a number, but a font family is expected here',
  'model.library.tokenWrongKind.family.color':
    'the token "{name}" is a font family, but a color is expected here',
  'model.library.tokenWrongKind.family.number':
    'the token "{name}" is a font family, but a number is expected here',
  'model.library.versionOtherSpec':
    'the previous version is of the specialization "{previous}", not "{id}"',
  'model.library.versionNotGrown':
    'the version did not grow: the previous one is {previous} and this one is {version}',
  'model.library.typeNotInVersion':
    'the type "{typeId}" did not exist in version {version}',
  'model.library.roleNotInVersion':
    'the role "{role}" of the type "{typeId}" did not exist in version {version}',
  'model.library.fieldNotInVersion':
    'the field "{key}" of the type "{typeId}" did not exist in version {version}',
  'model.library.optionNotInVersion':
    '"{value}" was not an option of the field "{field}" in version {version}',
  'model.library.iconMissing':
    'the icon "{name}" does not exist in the icon set ({path})',
  'model.library.iconUnverifiable':
    'the icon "{name}" cannot be checked: the specialization does not declare icons',
  'model.library.iconOptionMissing':
    'the option "{option}" of the field "{key}" is not in the icon set; the drawing falls back to the placeholder',
  'model.library.draw.defaults':
    'type "{typeId}", the default values, initial size {size}: {detail}',
  'model.library.draw.defaultsMode':
    'type "{typeId}", the default values, mode {mode}, initial size {size}: {detail}',
  'model.library.draw.preview':
    'type "{typeId}", the preview, initial size {size}: {detail}',
  'model.library.draw.previewMode':
    'type "{typeId}", the preview, mode {mode}, initial size {size}: {detail}',
  'model.library.draw.example':
    'type "{typeId}", the example "{name}", initial size {size}: {detail}',
  'model.library.draw.exampleMode':
    'type "{typeId}", the example "{name}", mode {mode}, initial size {size}: {detail}',
  'model.library.drawFailed': 'failed to draw: {error}',
  'model.library.buildFailed':
    'could not build the library to prove the external system examples: {reason}',
  'model.library.buildFailedUnknown':
    'could not build the library to prove the external system examples: unknown reason',
  'model.library.systemExample': 'example "{name}" of the system "{system}": {detail}',
  'model.library.systemExampleType':
    'example "{name}" of the system "{system}": the node matches the type "{found}", not "{typeId}"',
  'model.library.originScreen':
    'example screen "{name}" of the system "{system}": {detail}',
};

export const modelMessagesEnUS: Record<keyof typeof modelMessagesPtBR, string> = {
  ...libraryEnUS,
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
