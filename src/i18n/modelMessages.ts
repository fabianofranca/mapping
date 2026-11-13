// Mensagens do modelo que a interface traduz (`ModelMessage`: código + parâmetros; ver
// `src/model/modelMessage.ts`). A chave é `model.<código>`. Entram nos dicionários por
// `...modelMessagesPtBR` / `...modelMessagesEnUS`. Mesmas chaves e mesmos {parâmetros} nos dois
// idiomas; o pt-BR é idêntico ao `text` que o modelo devolve (o que o MCP segue emitindo).

import {
  MODEL_MESSAGE_TEMPLATES,
  type ModelMessageTemplateCode,
} from '../model/messages';
import type { libraryMessages } from '../model/messages/library';
import type { specMessages } from '../model/messages/spec';
import type { versionMessages } from '../model/messages/versions';
import { engineEnUS } from './modelMessagesEngine';
import { componentEnUS, iconsFileEnUS, originsEnUS } from './modelMessagesComponent';

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
  'model.catalog.invalidProblem': '{at}{reason}',
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
  'model.components.invalid': '{typeId}: {at}{reason}',
  'model.components.invalidFallback': '{typeId}: componente inválido',
  'model.icons.outsideLibrary': 'icons: caminho fora da biblioteca: {path}',
  'model.icons.fileMissing': 'icons: arquivo ausente ({path})',
  'model.icons.invalid': 'icons: {at}{reason}',
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
  'model.library.paramOutsideSignature': 'parameter outside the signature: "{name}"',
  'model.library.signatureNotRead': 'file could not be read: {path}',
  'model.library.signatureInvalid': '{reason}',
  'model.library.signatureNotCode':
    'the signature of a code entry must be a code signature',
  'model.library.signatureNotDesign':
    'the signature must be a design signature of the system "{system}"',
  'model.library.signaturePlatformMismatch':
    'the signature is for the platform "{found}", but the code is for the platform "{expected}"',
  'model.library.signatureSymbolMismatch':
    'the signature symbol ("{found}") differs from the code symbol ("{expected}")',
  'model.library.signaturePathMismatch':
    'the signature file ("{found}") differs from the code path ("{expected}")',
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
    'type "{typeId}", the default values, initial size {size}: {reason}',
  'model.library.draw.defaultsMode':
    'type "{typeId}", the default values, mode {mode}, initial size {size}: {reason}',
  'model.library.draw.preview':
    'type "{typeId}", the preview, initial size {size}: {reason}',
  'model.library.draw.previewMode':
    'type "{typeId}", the preview, mode {mode}, initial size {size}: {reason}',
  'model.library.draw.example':
    'type "{typeId}", the example "{name}", initial size {size}: {reason}',
  'model.library.draw.exampleMode':
    'type "{typeId}", the example "{name}", mode {mode}, initial size {size}: {reason}',
  'model.library.drawFitted.defaults':
    'type "{typeId}", the default values, fitted size {size}: {reason}',
  'model.library.drawFitted.defaultsMode':
    'type "{typeId}", the default values, mode {mode}, fitted size {size}: {reason}',
  'model.library.drawFitted.preview':
    'type "{typeId}", the preview, fitted size {size}: {reason}',
  'model.library.drawFitted.previewMode':
    'type "{typeId}", the preview, mode {mode}, fitted size {size}: {reason}',
  'model.library.drawFitted.example':
    'type "{typeId}", the example "{name}", fitted size {size}: {reason}',
  'model.library.drawFitted.exampleMode':
    'type "{typeId}", the example "{name}", mode {mode}, fitted size {size}: {reason}',
  'model.library.drawFailed': 'failed to draw: {error}',
  'model.library.buildFailed':
    'could not build the library to prove the external system examples: {reason}',
  'model.library.buildFailedUnknown':
    'could not build the library to prove the external system examples: unknown reason',
  'model.library.systemExample': 'example "{name}" of the system "{system}": {reason}',
  'model.library.systemExampleType':
    'example "{name}" of the system "{system}": the node matches the type "{found}", not "{typeId}"',
  'model.library.originScreen':
    'example screen "{name}" of the system "{system}": {reason}',
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
  'model.spec.urlInvalid': 'must start with http:// or https://, without spaces',
  'model.spec.urlTemplateNeedsPath': 'must contain {path}',
  'model.spec.repoIdInvalid': 'invalid repository id; use [a-z0-9-]+',
  'model.spec.mustBeNumber': 'must be a number',
  'model.spec.mustBeInteger': 'must be an integer',
  'model.spec.minOne': 'must be >= 1',
  'model.spec.containerSideMax': 'must be <= {max}',
  'model.spec.containerIdInvalid': 'invalid container id; use [a-z0-9-]+',
  'model.spec.fontWeightInvalid':
    'invalid weight; use an integer from {min} to {max} or a range "100 900" (the first smaller than the second)',
  'model.spec.fontStyleInvalid': 'invalid style; use "normal" or "italic"',
  'model.spec.mustBeTextOrNumber': 'must be text or a number',
  'model.spec.migrationModeRemoveType': 'use "convert" or "delete"',
  'model.spec.migrationModeRemoveRole': 'use "clear" or "unlink"',
  'model.spec.migrationOpInvalid':
    'invalid "op"; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role" or "set-role"',
  'model.spec.notEmptyList': 'cannot be empty',
  'model.spec.formatInvalid': 'must be "{format}"',
  'model.spec.formatVersionInvalid': 'must be {versions} or {last}',
  'model.spec.onlyFormat': 'only allowed with formatVersion {version}',
  'model.spec.sourceOnlyOrigins': 'only allowed in a system declared in origins',
  'model.spec.sourcePathRequired': 'required in a system declared in origins',
  'model.spec.sourceNameRequired': 'required in a system that is not in origins',
  'model.spec.fieldPathEmptySegment': 'invalid path "{path}" (empty segment)',
  'model.spec.fieldPathMissingBracket': 'invalid path "{path}" (missing "]")',
  'model.spec.fieldPathBadIndex': 'invalid path "{path}" (invalid index: [{index}])',
  'model.spec.fieldPathBadChar': 'invalid path "{path}" (unexpected character: {char})',
  'model.spec.fieldPathWildcard':
    'invalid path "{path}" ("[*]" is only valid in roots[].path of an origin)',
  'model.spec.ignoreRepeated': '"{prop}" repeated',
  'model.spec.likeNotField': '"{like}" is not a field of a type in the specialization',
  'model.spec.formatNeedsPlaceholder': 'the template must contain {placeholder}',
  'model.spec.modelTypeInvalid': '"{value}" is invalid; use "number", "string" or "enum"',
  'model.spec.optionsNotTextList': 'must be a list of non-empty texts',
  'model.spec.optionsRequiredInEnum': 'required in enum',
  'model.spec.expandParamsRequired':
    'declare at least one parameter (name → type in the source)',
  'model.spec.mustBeNonEmptyText': 'must be non-empty text',
  'model.spec.modelFormRequired': 'declare a form: "like", "type", "expand" or "ignore"',
  'model.spec.modelFormsConflict': 'use only one form: {forms}',
  'model.spec.mustBeTrue': 'must be true',
  'model.spec.callNotDeclared': '"{call}" is not in calls',
  'model.spec.exampleSystemUndeclared': 'system "{system}" is not declared in origins',
  'model.spec.fontRepeated': 'font "{family}" (weight {weight}, {style}) repeated',
  'model.spec.fontRepeatedNoWeight': 'font "{family}" (no weight, {style}) repeated',
  'model.spec.platformUndeclared': 'platform "{id}" is not declared in platforms',
  'model.spec.codeNeedsPlatforms':
    'only allowed in specializations that declare platforms',
  'model.spec.typeIdRepeated': 'id "{id}" repeated in the specialization',
  'model.spec.migrationFromRepeated': 'there is already a migration from version {from}',
  'model.spec.migrationToGreater': 'must be greater than "from" ({from})',
  'model.spec.migrationToMax': 'cannot exceed "version" ({version})',
  'model.spec.migrationColumnNotEnum': '"{key}" must be an enum column of the table',
  'model.spec.fieldRefManyDots':
    '"{ref}" has more than one dot; use "field" or "table.column"',
  'model.spec.fieldRefEmptyPart':
    '"{ref}" has an empty part; use "field" or "table.column"',
  'model.spec.roleNotOfType': '"{role}" is not a role of the type "{typeId}"',
  'model.spec.roleStillExists':
    'role "{role}" still exists in the type "{typeId}" in this version',
  'model.spec.typeNotInVersion': 'type "{typeId}" does not exist in this version',
  'model.spec.typeNoRoles':
    'the type "{typeId}" has no roles (childRoles) in this version',
  'model.spec.typeStillExists': 'type "{typeId}" still exists in this version',
  'model.spec.notFieldOfType': '"{key}" is not a field of the type "{typeId}"',
  'model.spec.notTableOfType': '"{key}" is not a table of the type "{typeId}"',
  'model.spec.notColumnOfTable':
    '"{key}" is not a column of the table "{table}" of the type "{typeId}"',
  'model.spec.fieldStillExists':
    'field "{key}" still exists in the type "{typeId}" in this version',
  'model.spec.columnStillExists':
    'column "{column}" still exists in the table "{table}" of the type "{typeId}" in this version',
  'model.spec.layerNotFound': 'layer "{layer}" does not exist in the specialization',
  'model.spec.layerIsOwn':
    'layer "{layer}" is the type\'s own layer; children must be in another layer',
  'model.spec.groupNotInLayer': 'group "{group}" does not exist in the layer "{layer}"',
  'model.spec.typeNotFound': 'type "{typeId}" does not exist in the specialization',
  'model.spec.typeSameLayer':
    'type "{typeId}" is in the same layer; children must be in another layer',
  'model.spec.docRepoUndeclared': 'repository "{repo}" is not declared in docRepos',
  'model.spec.ownerNoneLists':
    '"{typeId}" requires an owner, but no type lists it in allowedChildren',
  'model.spec.ownerOnlySelf':
    '"{typeId}" requires an owner, but no other type accepts it as a child (only itself lists it in allowedChildren)',
  'model.spec.tokensShape': 'must be an object with modes and values',
  'model.spec.tokenKeyUnknown': 'unknown key: {key}',
  'model.spec.tokenModesEmpty': 'must be a list with at least one mode',
  'model.spec.tokenModeInvalid': 'invalid mode; use [a-z0-9][a-z0-9-]*',
  'model.spec.tokenModeRepeated': 'mode "{mode}" repeated',
  'model.spec.tokenNameInvalid': 'invalid name; use [a-z0-9][a-z0-9-]*',
  'model.spec.tokenValueShape': 'must be text, a number or one value per mode',
  'model.spec.tokenModeMissing': 'missing the mode {modes}',
  'model.spec.tokenModeExtra': 'mode not declared in modes: {modes}',
  'model.spec.tokenModeValueShape': 'each mode must have text or a number',
  'model.spec.tokenModesSameType':
    'the modes of a token must have the same type (text or number)',
  'model.spec.iconsPathShape': 'must be the path of a .json file in the package',
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

/** en-US dos códigos do catálogo `versions` (avisos da especialização e quebras sem migração). */
const versionsEnUS: {
  readonly [C in keyof typeof versionMessages as `model.${C}`]: string;
} = {
  'model.versions.ignoredField':
    'the field "{key}" of the type "{typeId}" is "{removed}", which was removed from the format: it was ignored (its values are not saved); remove it from the file',
  'model.versions.manyChildrenIds':
    '{count} types listed one by one; a { layer, groups } clause covers the layer or the groups',
  'model.versions.unusedGroup':
    'the group "{group}" of the layer "{layer}" is declared, but no type is in it',
  'model.versions.unusedDocRepo':
    'the repository "{repo}" in docRepos is declared, but no `doc` uses it',
  'model.versions.legacyFormat':
    '"{legacy}" is the old name of the format; use "mapping-spec"',
  'model.versions.typeWithoutCode':
    'the type "{typeId}" has no `code`: no platform says how to create an instance of it',
  'model.versions.unusedPlatform':
    'the platform "{id}" is declared, but no type uses it in `code`',
  'model.versions.pathWithoutRepo':
    'the platform "{id}" has types with `path` ({count}), but does not declare `repo`: the agent does not know which repository holds those files; declare `repo` (formatVersion 5)',
  'model.versions.fieldNew': 'the field "{key}" of the type "{typeId}" is new',
  'model.versions.columnNew':
    'the column "{key}" of the field "{table}" of the type "{typeId}" is new',
  'model.versions.fieldNewRequired':
    'the field "{key}" of the type "{typeId}" is new and already required; declare a "fill-field" step in migrations',
  'model.versions.columnNewRequired':
    'the column "{key}" of the field "{table}" of the type "{typeId}" is new and already required; declare a "fill-field" step in migrations with field "{ref}"',
  'model.versions.fieldTypeChanged':
    'the field "{key}" of the type "{typeId}" changed type ("{from}" to "{to}"); declare a "fill-field" step in migrations',
  'model.versions.columnTypeChanged':
    'the column "{key}" of the field "{table}" of the type "{typeId}" changed type ("{from}" to "{to}"); declare a "fill-field" step in migrations with field "{ref}"',
  'model.versions.fieldBecameRequired':
    'the field "{key}" of the type "{typeId}" became required; declare a "fill-field" step in migrations',
  'model.versions.columnBecameRequired':
    'the column "{key}" of the field "{table}" of the type "{typeId}" became required; declare a "fill-field" step in migrations with field "{ref}"',
  'model.versions.fieldOptionAdded':
    'the field "{key}" of the type "{typeId}" gained the option "{option}"',
  'model.versions.columnOptionAdded':
    'the column "{key}" of the field "{table}" of the type "{typeId}" gained the option "{option}"',
  'model.versions.fieldRemoved':
    'the field "{key}" of the type "{typeId}" was removed; declare a "remove-field" or "rename-field" step in migrations',
  'model.versions.columnRemoved':
    'the column "{key}" of the field "{table}" of the type "{typeId}" was removed; declare a "remove-field" or "rename-field" step in migrations with field "{ref}"',
  'model.versions.fieldOptionRemoved':
    'the option "{option}" of the field "{key}" of the type "{typeId}" was removed; declare a "map-values" step with "{option}" in values in migrations',
  'model.versions.columnOptionRemoved':
    'the option "{option}" of the column "{key}" of the field "{table}" of the type "{typeId}" was removed; declare a "map-values" step with "{option}" in values in migrations with field "{ref}"',
  'model.versions.rolesRequired':
    'the type "{typeId}" now has roles; declare a "set-role" step in migrations (formatVersion 12)',
  'model.versions.roleAdded': 'the type "{typeId}" gained the role "{role}"',
  'model.versions.roleRemoved':
    'the role "{role}" of the type "{typeId}" was removed; declare a "rename-role" or "remove-role" step in migrations (formatVersion 12)',
  'model.versions.typeNew': 'the type "{typeId}" is new',
  'model.versions.componentAdded':
    'the type "{typeId}" gained the component "{component}"',
  'model.versions.componentChanged':
    'the component of the type "{typeId}" changed from "{from}" to "{to}"',
  'model.versions.appliesToChanged':
    'the type "{typeId}" now applies to: {now} (before: {before}); annotations that no longer apply become pending',
  'model.versions.docAdded': 'the type "{typeId}" gained the document "{doc}"',
  'model.versions.exampleAdded': 'the type "{typeId}" gained the example "{name}"',
  'model.versions.fontNew': 'the font "{family}" is new',
  'model.versions.typeRemoved':
    'the type "{typeId}" was removed; declare a "remove-type" or "rename-type" step in migrations',
};

export const modelMessagesEnUS: Record<keyof typeof modelMessagesPtBR, string> = {
  ...libraryEnUS,
  ...specEnUS,
  ...versionsEnUS,
  ...componentEnUS,
  ...iconsFileEnUS,
  ...originsEnUS,
  ...engineEnUS,
  'model.catalog.fileMissing': 'missing file ({path})',
  'model.catalog.invalidComponent': 'invalid component',
  'model.catalog.typeOutside': 'type "{typeId}" is outside the specialization',
  'model.catalog.typeNoComponent': 'type "{typeId}" has no component',
  'model.catalog.invalidProblem': '{at}{reason}',
  'model.arrange.overflow': '{label}: content is larger than the container',
  'model.arrange.outside': '{label}: does not fit in {where}',
  'model.value.refBroken': 'broken reference: {key}',
  'model.value.refCycle': 'reference cycle: {key}',
  'model.value.refDeep': 'reference through more than one level: {key}',
  'model.components.outsideLibrary': '{typeId}: path outside the library: {path}',
  'model.components.fileMissing': '{typeId}: missing file ({path})',
  'model.components.invalid': '{typeId}: {at}{reason}',
  'model.components.invalidFallback': '{typeId}: invalid component',
  'model.icons.outsideLibrary': 'icons: path outside the library: {path}',
  'model.icons.fileMissing': 'icons: missing file ({path})',
  'model.icons.invalid': 'icons: {at}{reason}',
  'model.icons.invalidFallback': 'icons: invalid icon set',
};
