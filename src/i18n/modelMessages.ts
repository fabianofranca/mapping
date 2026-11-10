// Mensagens do modelo que a interface traduz (`ModelMessage`: código + parâmetros; ver
// `src/model/modelMessage.ts`). A chave é `model.<código>`. Entram nos dicionários por
// `...modelMessagesPtBR` / `...modelMessagesEnUS`. Mesmas chaves e mesmos {parâmetros} nos dois
// idiomas; o pt-BR é idêntico ao `text` que o modelo devolve (o que o MCP segue emitindo).

import { libraryMessages } from '../model/messages/library';
import { specMessages } from '../model/messages/spec';
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

/** en-US dos códigos do catálogo `spec` (termos do formato, chaves, ids e caminhos não se traduzem). */
const specEnUS: { readonly [C in keyof typeof specMessages as `model.${C}`]: string } = {
  'model.spec.required': 'required',
  'model.spec.mustBeText': 'must be text',
  'model.spec.mustBeBoolean': 'must be true or false',
  'model.spec.mustBeObject': 'must be an object',
  'model.spec.notEmpty': 'cannot be empty',
  'model.spec.colorInvalid': 'invalid color; use the format #RRGGBB',
  'model.spec.tagInvalid': 'invalid tag; use [a-z0-9-]+',
  'model.spec.keyInvalid': 'invalid key; use only [A-Za-z0-9_], without spaces',
  'model.spec.keyReserved': 'a key cannot start with "_" (reserved)',
  'model.spec.platformIdInvalid': 'invalid platform id; use [a-z0-9-]+',
  'model.spec.fieldTypeInvalid':
    '"{value}" is invalid; use "string", "number", "date", "enum", "table" or "ref"',
  'model.spec.dateInvalid': 'invalid date; use YYYY-MM-DD',
  'model.spec.dateNonexistent': 'nonexistent date',
  'model.spec.packagePathInvalid':
    'invalid path: use a path relative to the specialization folder, with "/", without "." or ".." and without a drive (e.g. components/button.json)',
  'model.spec.invalidExtension': 'invalid extension: expected {exts}',
  'model.spec.unknownKeys': 'unknown property: {keys}',
  'model.spec.typeSourceNeedsIdOrName': 'needs "id" or "name"',
  'model.spec.acceptsAnnotationsEmpty':
    'cannot be empty; remove the key or list at least one item',
  'model.spec.acceptsNeedsOne': 'needs at least one tag, "free": true or "annotations"',
  'model.spec.noticeKindInvalid':
    '"{value}" is invalid; use "removed", "deprecated", "diverges" or "pending"',
  'model.spec.noticeKindShape':
    'must be "removed", "deprecated", "diverges" or "pending"',
  'model.spec.noticeRepeated': 'repeated notice',
  'model.spec.valueMustBeNumber': 'must be a number',
  'model.spec.valueMustBeDate': 'must be a valid date YYYY-MM-DD',
  'model.spec.valueMustBeOption': 'must be one of the options',
  'model.spec.valueNotForTable': 'does not exist for table',
  'model.spec.valueNotForRef': 'does not exist for ref',
  'model.spec.suggestionsEmpty':
    'cannot be empty; remove the key or list at least one suggestion',
  'model.spec.suggestionsMax': 'at most {max} suggestions',
  'model.spec.suggestionsBlank': 'suggestions cannot be empty',
  'model.spec.suggestionsTrim': 'suggestions cannot have spaces at the start or the end',
  'model.spec.suggestionsRepeated': 'repeated suggestions',
  'model.spec.columnTypeNotAllowed':
    '"{type}" is not allowed inside a table; use "string", "number", "date", "enum" or "ref"',
  'model.spec.optionsRequired': 'required and not empty in an enum',
  'model.spec.optionsBlank': 'options cannot be empty',
  'model.spec.optionsRepeated': 'repeated options',
  'model.spec.optionsOnlyEnum': 'only allowed in an enum',
  'model.spec.onlyStringField': 'only allowed in a string field or column',
  'model.spec.notTypeField': '"{key}" is not a field of the type',
  'model.spec.linkedRefNotColumn': '"{key}" is not a column of the table',
  'model.spec.linkedRefNotRefField': '"{key}" must be a ref field',
  'model.spec.linkedRefNotRefColumn': '"{key}" must be a ref column',
  'model.spec.onlyTable': 'only allowed in a table',
  'model.spec.onlyRef': 'only allowed in a ref',
  'model.spec.notAllowedForFieldType': 'not allowed in this field type',
  'model.spec.acceptsRequired': 'required in a ref',
  'model.spec.refNoTags': 'a ref cannot have tags',
  'model.spec.valuesOnlyEnum': 'only allowed in enum fields',
  'model.spec.notInOptions': '"{value}" is not in the options',
  'model.spec.columnNoTags': 'columns have no tags; use "tags" on the table',
  'model.spec.keyRepeated': 'key "{key}" repeated',
  'model.spec.columnsRequired': 'required and not empty in a table',
  'model.spec.rowLabelRequired': 'required in a table with tags',
  'model.spec.rowLabelNotStringColumn': '"{key}" must be a string column of the table',
  'model.spec.codePathInvalid':
    'invalid path: use a path relative to the repository root, with "/", without "." or ".." and without a drive (e.g. app/src/Main.kt)',
  'model.spec.codeFieldNotEnum': '"{key}" must be an enum field of the type',
  'model.spec.notInOptionsOf': '"{value}" is not in the options of "{field}"',
  'model.spec.variantsNoCases': 'declare at least one case',
  'model.spec.variantsEmptyCase':
    'empty case: declare symbol, path, params, values or notes',
  'model.spec.exampleValueShape':
    'must be text, a number or null (or a list of rows, in a table field)',
  'model.spec.exampleNameRepeated': 'name "{name}" repeated',
  'model.spec.exampleBothModes':
    'use "values" or "system" with "file", not both modes together',
  'model.spec.exampleNoMode': 'needs "values" or "system" with "file"',
  'model.spec.requiredWithFile': 'required with "file"',
  'model.spec.requiredWithSystem': 'required with "system"',
  'model.spec.exampleRefNoValue': 'a "ref" field takes no value in an example',
  'model.spec.exampleTableNeedsRows': 'a "table" field takes only the list of rows',
  'model.spec.exampleRowNotObject': 'must be an object (column → value)',
  'model.spec.exampleNotColumn': '"{key}" is not a column of "{field}"',
  'model.spec.exampleRefCell': 'a "ref" column takes no value in an example',
  'model.spec.appliesToEmpty': 'cannot be empty; use "marking", "arrow" or both',
  'model.spec.repeatedValues': 'repeated values',
  'model.spec.arrowOnlyNoComponent': 'an arrow-only type cannot have a component',
  'model.spec.arrowOnlyNoFloating': 'an arrow-only type cannot have floating',
  'model.spec.appliesToInvalid': '"{value}" is invalid; use "marking" or "arrow"',
  'model.spec.appliesToShape': 'must be "marking" or "arrow"',
  'model.spec.groupsEmpty': 'cannot be empty; remove the key or list at least one group',
  'model.spec.groupsList': 'must be a list of group ids',
  'model.spec.allowedChildShape':
    'must be a type id (text) or a clause { layer, groups }',
  'model.spec.docShape': 'must be text (a package file) or an object { repo, path }',
  'model.spec.docPathInvalid':
    'invalid path: use a path relative to the repository root, with "/", without "." or ".." and without a drive (e.g. components/button.md)',
  'model.spec.docAnchor': 'cannot have "#" (anchor)',
  'model.spec.childRolesLabelNeedsRoles': 'only allowed with childRoles',
  'model.spec.childRolesNeedsChildren': 'only allowed in a type with allowedChildren',
  'model.spec.childRolesEmpty':
    'cannot be empty; remove the key or declare at least one role',
  'model.spec.idRepeated': 'id "{id}" repeated',
  'model.spec.groupRepeated': 'group "{group}" repeated',
  'model.spec.structuralNoComponent':
    'a structural type does not draw: it cannot have a component',
  'model.spec.labelFieldNotString': '"{key}" must be a string field of the type',
  'model.spec.onlyFormat15': 'only allowed with formatVersion 15',
  'model.spec.onlyFormat10': 'only allowed with formatVersion 10',
  // Textos padrão do zod, no inglês do zod
  'model.spec.zod.invalid_type':
    'Invalid input: expected {expected}, received {received}',
  'model.spec.zod.unrecognized_keys': 'Unrecognized keys: {keys}',
  'model.spec.zod.too_small': 'Too small: the minimum is {minimum}',
  'model.spec.zod.too_big': 'Too big: the maximum is {maximum}',
  'model.spec.zod.invalid_value': 'Invalid value: expected one of {values}',
  'model.spec.zod.invalid_format': 'Invalid text format',
  'model.spec.zod.invalid_union': 'Invalid input: matches none of the accepted shapes',
  'model.spec.zod.invalid_key': 'Invalid key',
  'model.spec.zod.invalid_element': 'Invalid item',
  'model.spec.zod.not_multiple_of': 'Invalid number: must be a multiple of {divisor}',
};

export const modelMessagesEnUS: Record<keyof typeof modelMessagesPtBR, string> = {
  ...libraryEnUS,
  ...specEnUS,
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
