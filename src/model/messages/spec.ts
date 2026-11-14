// Specialization messages (`src/model/spec.ts`): code → template of today's pt-BR text, with
// `{parameters}`. `parseSpec` finds the code of a fixed message by its exact text (the entries
// without `{}`), of one with a parameter by `params.messageCode` in `addIssue`, and gives zod's default
// texts the code `spec.zod.<zod code>` (their template is a translation, not the `message`).
// A text belongs to a single code among the fixed entries.

export const specMessages = {
  // Text, format and values
  'spec.required': 'required',
  'spec.mustBeText': 'must be text',
  'spec.mustBeBoolean': 'must be true or false',
  'spec.mustBeObject': 'must be an object',
  'spec.notEmpty': 'cannot be empty',
  'spec.colorInvalid': 'invalid color; use the format #RRGGBB',
  'spec.tagInvalid': 'invalid tag; use [a-z0-9-]+',
  'spec.keyInvalid': 'invalid key; use only [A-Za-z0-9_], without spaces',
  'spec.keyReserved': 'a key cannot start with "_" (reserved)',
  'spec.platformIdInvalid': 'invalid platform id; use [a-z0-9-]+',
  'spec.fieldTypeInvalid':
    '"{value}" is invalid; use "string", "number", "date", "enum", "table" or "ref"',
  'spec.dateInvalid': 'invalid date; use YYYY-MM-DD',
  'spec.dateNonexistent': 'nonexistent date',
  'spec.packagePathInvalid':
    'invalid path: use a path relative to the specialization folder, with "/", without "." or ".." and without a drive (e.g. components/button.json)',
  'spec.invalidExtension': 'invalid extension: expected {exts}',
  'spec.unknownKeys': 'unknown property: {keys}',
  // Sources, acceptance and notices
  'spec.typeSourceNeedsIdOrName': 'needs "id" or "name"',
  'spec.acceptsAnnotationsEmpty':
    'cannot be empty; remove the key or list at least one item',
  'spec.acceptsNeedsOne': 'needs at least one tag, "free": true or "annotations"',
  'spec.noticeKindInvalid':
    '"{value}" is invalid; use "removed", "deprecated", "diverges" or "pending"',
  'spec.noticeKindShape': 'must be "removed", "deprecated", "diverges" or "pending"',
  'spec.noticeRepeated': 'repeated notice',
  // Field values
  'spec.valueMustBeNumber': 'the value must be a number',
  'spec.valueMustBeDate': 'must be a valid date YYYY-MM-DD',
  'spec.valueMustBeOption': 'must be one of the options',
  'spec.valueNotForTable': 'does not exist for table',
  'spec.valueNotForRef': 'does not exist for ref',
  // Suggestions
  'spec.suggestionsEmpty':
    'cannot be empty; remove the key or list at least one suggestion',
  'spec.suggestionsMax': 'at most {max} suggestions',
  'spec.suggestionsBlank': 'suggestions cannot be empty',
  'spec.suggestionsTrim': 'suggestions cannot have spaces at the start or the end',
  'spec.suggestionsRepeated': 'repeated suggestions',
  // Fields and columns
  'spec.columnTypeNotAllowed':
    '"{type}" is not allowed inside a table; use "string", "number", "date", "enum" or "ref"',
  'spec.optionsRequired': 'required and not empty in an enum',
  'spec.optionsBlank': 'options cannot be empty',
  'spec.optionsRepeated': 'repeated options',
  'spec.optionsOnlyEnum': 'only allowed in an enum',
  'spec.onlyStringField': 'only allowed in a string field or column',
  'spec.notTypeField': '"{key}" is not a field of the type',
  'spec.linkedRefNotColumn': '"{key}" is not a column of the table',
  'spec.linkedRefNotRefField': '"{key}" must be a ref field',
  'spec.linkedRefNotRefColumn': '"{key}" must be a ref column',
  'spec.onlyTable': 'only allowed in a table',
  'spec.onlyRef': 'only allowed in a ref',
  'spec.notAllowedForFieldType': 'not allowed in this field type',
  'spec.acceptsRequired': 'required in a ref',
  'spec.refNoTags': 'a ref cannot have tags',
  'spec.valuesOnlyEnum': 'only allowed in enum fields',
  'spec.notInOptions': '"{value}" is not in the options',
  'spec.columnNoTags': 'columns have no tags; use "tags" on the table',
  'spec.keyRepeated': 'key "{key}" repeated',
  'spec.columnsRequired': 'required and not empty in a table',
  'spec.rowLabelRequired': 'required in a table with tags',
  'spec.rowLabelNotStringColumn': '"{key}" must be a string column of the table',
  // Instantiation code (`code`)
  'spec.codePathInvalid':
    'invalid path: use a path relative to the repository root, with "/", without "." or ".." and without a drive (e.g. app/src/Main.kt)',
  'spec.codeFieldNotEnum': '"{key}" must be an enum field of the type',
  'spec.notInOptionsOf': '"{value}" is not in the options of "{field}"',
  'spec.variantsNoCases': 'declare at least one case',
  'spec.variantsEmptyCase': 'empty case: declare symbol, path, params, values or notes',
  // Examples
  'spec.exampleValueShape':
    'must be text, a number or null (or a list of rows, in a table field)',
  'spec.exampleNameRepeated': 'name "{name}" repeated',
  'spec.exampleBothModes':
    'use "values" or "system" with "file", not both modes together',
  'spec.exampleNoMode': 'needs "values" or "system" with "file"',
  'spec.requiredWithFile': 'required with "file"',
  'spec.requiredWithSystem': 'required with "system"',
  'spec.exampleRefNoValue': 'a "ref" field takes no value in an example',
  'spec.exampleTableNeedsRows': 'a "table" field takes only the list of rows',
  'spec.exampleRowNotObject': 'must be an object (column → value)',
  'spec.exampleNotColumn': '"{key}" is not a column of "{field}"',
  'spec.exampleRefCell': 'a "ref" column takes no value in an example',
  // Where it applies
  'spec.appliesToEmpty': 'cannot be empty; use "marking", "arrow" or both',
  'spec.repeatedValues': 'repeated values',
  'spec.arrowOnlyNoComponent': 'an arrow-only type cannot have a component',
  'spec.arrowOnlyNoFloating': 'an arrow-only type cannot have floating',
  'spec.appliesToInvalid': '"{value}" is invalid; use "marking" or "arrow"',
  'spec.appliesToShape': 'must be "marking" or "arrow"',
  // Allowed children, documents, roles and groups
  'spec.groupsEmpty': 'cannot be empty; remove the key or list at least one group',
  'spec.groupsList': 'must be a list of group ids',
  'spec.allowedChildShape': 'must be a type id (text) or a clause { layer, groups }',
  'spec.docShape': 'must be text (a package file) or an object { repo, path }',
  'spec.docPathInvalid':
    'invalid path: use a path relative to the repository root, with "/", without "." or ".." and without a drive (e.g. components/button.md)',
  'spec.docAnchor': 'cannot have "#" (anchor)',
  'spec.childRolesLabelNeedsRoles': 'only allowed with childRoles',
  'spec.childRolesNeedsChildren': 'only allowed in a type with allowedChildren',
  'spec.childRolesEmpty': 'cannot be empty; remove the key or declare at least one role',
  'spec.idRepeated': 'id "{id}" repeated',
  'spec.groupRepeated': 'group "{group}" repeated',
  // Types
  'spec.structuralNoComponent':
    'a structural type does not draw: it cannot have a component',
  'spec.labelFieldNotString': '"{key}" must be a string field of the type',
  // Repositories, platforms, containers, sources and migrations (file shapes)
  'spec.urlInvalid': 'must start with http:// or https://, without spaces',
  'spec.urlTemplateNeedsPath': 'must contain {path}',
  'spec.repoIdInvalid': 'invalid repository id; use [a-z0-9-]+',
  'spec.mustBeNumber': 'must be a number',
  'spec.mustBeInteger': 'must be an integer',
  'spec.minOne': 'must be >= 1',
  'spec.containerSideMax': 'must be <= {max}',
  'spec.containerIdInvalid': 'invalid container id; use [a-z0-9-]+',
  'spec.fontWeightInvalid':
    'invalid weight; use an integer from {min} to {max} or a range "100 900" (the first smaller than the second)',
  'spec.fontStyleInvalid': 'invalid style; use "normal" or "italic"',
  'spec.mustBeTextOrNumber': 'must be text or a number',
  'spec.migrationModeRemoveType': 'use "convert" or "delete"',
  'spec.migrationModeRemoveRole': 'use "clear" or "unlink"',
  'spec.migrationOpInvalid':
    'invalid "op"; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role" or "set-role"',
  'spec.notEmptyList': 'cannot be an empty list',
  'spec.formatInvalid': 'must be "{format}"',
  'spec.formatVersionInvalid': 'must be {versions} or {last}',
  // Format version, external sources and fonts (typefaces)
  'spec.onlyFormat': 'only allowed with formatVersion {version}',
  'spec.sourceOnlyOrigins': 'only allowed in a system declared in origins',
  'spec.sourcePathRequired': 'required in a system declared in origins',
  'spec.sourceNameRequired': 'required in a system that is not in origins',
  'spec.fieldPathEmptySegment': 'invalid path "{path}" (empty segment)',
  'spec.fieldPathMissingBracket': 'invalid path "{path}" (missing "]")',
  'spec.fieldPathBadIndex': 'invalid path "{path}" (invalid index: [{index}])',
  'spec.fieldPathBadChar': 'invalid path "{path}" (unexpected character: {char})',
  'spec.fieldPathWildcard':
    'invalid path "{path}" ("[*]" is only valid in roots[].path of an origin)',
  'spec.ignoreRepeated': '"{prop}" repeated',
  // Field templates, calls and formats (formatVersion 16, `specSignature.ts`)
  'spec.likeNotField': '"{like}" is not a field of a type in the specialization',
  'spec.formatNeedsPlaceholder': 'the template must contain {placeholder}',
  'spec.modelTypeInvalid': '"{value}" is invalid; use "number", "string" or "enum"',
  'spec.optionsNotTextList': 'must be a list of non-empty texts',
  'spec.optionsRequiredInEnum': 'required in enum',
  'spec.expandParamsRequired':
    'declare at least one parameter (name → type in the source)',
  'spec.mustBeNonEmptyText': 'must be non-empty text',
  'spec.modelFormRequired': 'declare a form: "like", "type", "expand" or "ignore"',
  'spec.modelFormsConflict': 'use only one form: {forms}',
  'spec.mustBeTrue': 'must be true',
  'spec.callNotDeclared': '"{call}" is not in calls',
  'spec.exampleSystemUndeclared': 'system "{system}" is not declared in origins',
  'spec.fontRepeated': 'font "{family}" (weight {weight}, {style}) repeated',
  'spec.fontRepeatedNoWeight': 'font "{family}" (no weight, {style}) repeated',
  'spec.platformUndeclared': 'platform "{id}" is not declared in platforms',
  'spec.codeNeedsPlatforms': 'only allowed in specializations that declare platforms',
  'spec.typeIdRepeated': 'id "{id}" repeated in the specialization',
  // Migrations
  'spec.migrationFromRepeated': 'there is already a migration from version {from}',
  'spec.migrationToGreater': 'must be greater than "from" ({from})',
  'spec.migrationToMax': 'cannot exceed "version" ({version})',
  'spec.migrationColumnNotEnum': '"{key}" must be an enum column of the table',
  'spec.fieldRefManyDots': '"{ref}" has more than one dot; use "field" or "table.column"',
  'spec.fieldRefEmptyPart': '"{ref}" has an empty part; use "field" or "table.column"',
  'spec.roleNotOfType': '"{role}" is not a role of the type "{typeId}"',
  'spec.roleStillExists':
    'role "{role}" still exists in the type "{typeId}" in this version',
  'spec.typeNotInVersion': 'type "{typeId}" does not exist in this version',
  'spec.typeNoRoles': 'the type "{typeId}" has no roles (childRoles) in this version',
  'spec.typeStillExists': 'type "{typeId}" still exists in this version',
  'spec.notFieldOfType': '"{key}" is not a field of the type "{typeId}"',
  'spec.notTableOfType': '"{key}" is not a table of the type "{typeId}"',
  'spec.notColumnOfTable':
    '"{key}" is not a column of the table "{table}" of the type "{typeId}"',
  'spec.fieldStillExists':
    'field "{key}" still exists in the type "{typeId}" in this version',
  'spec.columnStillExists':
    'column "{column}" still exists in the table "{table}" of the type "{typeId}" in this version',
  // Allowed children, groups, document repositories and owner
  'spec.layerNotFound': 'layer "{layer}" does not exist in the specialization',
  'spec.layerIsOwn':
    'layer "{layer}" is the type\'s own layer; children must be in another layer',
  'spec.groupNotInLayer': 'group "{group}" does not exist in the layer "{layer}"',
  'spec.typeNotFound': 'type "{typeId}" does not exist in the specialization',
  'spec.typeSameLayer':
    'type "{typeId}" is in the same layer; children must be in another layer',
  'spec.docRepoUndeclared': 'repository "{repo}" is not declared in docRepos',
  'spec.ownerNoneLists':
    '"{typeId}" requires an owner, but no type lists it in allowedChildren',
  'spec.ownerOnlySelf':
    '"{typeId}" requires an owner, but no other type accepts it as a child (only itself lists it in allowedChildren)',
  // Tokens and icons
  'spec.tokensShape': 'must be an object with modes and values',
  'spec.tokenKeyUnknown': 'unknown key: {key}',
  'spec.tokenModesEmpty': 'must be a list with at least one mode',
  'spec.tokenModeInvalid': 'invalid mode; use [a-z0-9][a-z0-9-]*',
  'spec.tokenModeRepeated': 'mode "{mode}" repeated',
  'spec.tokenNameInvalid': 'invalid name; use [a-z0-9][a-z0-9-]*',
  'spec.tokenValueShape': 'must be text, a number or one value per mode',
  'spec.tokenModeMissing': 'missing the mode {modes}',
  'spec.tokenModeExtra': 'mode not declared in modes: {modes}',
  'spec.tokenModeValueShape': 'each mode must have text or a number',
  'spec.tokenModesSameType':
    'the modes of a token must have the same type (text or number)',
  'spec.iconsPathShape': 'must be the path of a .json file in the package',
  // zod's default texts (translation; the `message` follows zod's, in English)
  'spec.zod.invalid_type': 'Invalid input: expected {expected}, received {received}',
  'spec.zod.unrecognized_keys': 'Unrecognized keys: {keys}',
  'spec.zod.too_small': 'Too small: the minimum is {minimum}',
  'spec.zod.too_big': 'Too big: the maximum is {maximum}',
  'spec.zod.invalid_value': 'Invalid value: expected one of {values}',
  'spec.zod.invalid_format': 'Invalid text format',
  'spec.zod.invalid_union': 'Invalid input: matches none of the accepted shapes',
  'spec.zod.invalid_key': 'Invalid key',
  'spec.zod.invalid_element': 'Invalid item',
  'spec.zod.not_multiple_of': 'Invalid number: must be a multiple of {divisor}',
} as const;
