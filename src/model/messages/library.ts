// Messages of the library validator (`library.ts`, `libraryDrawing.ts`, `libraryIcons.ts`):
// code → template of today's pt-BR text, with `{parameters}`. The code is the key without the
// `model.` prefix that the interface uses. A phrase that varies by agreement or by case becomes one code per
// variant, with the whole text (never assembled from pieces).

export const libraryMessages = {
  // Package files
  'library.notReferenced': 'file not referenced by the specialization',
  'library.emptyDoc': 'empty document',
  'library.fileNotFound': 'file not found: {path}',
  'library.notRead': 'the file content was not read (expected the text)',
  'library.invalidJson': 'invalid JSON: {detail}',
  'library.specFileNotFound': 'specialization file not found: {path}',
  'library.specNotFound':
    'no specialization found: the package needs a .json file with "format": "mapping-spec"',
  'library.specAmbiguous':
    'there are {count} specializations in the package ({files}): say which one to validate',
  'library.paramOutsideSignature': 'parameter outside the signature: "{name}"',
  // `mapping-signature` sheets of the package (`librarySignature.ts`)
  'library.signatureNotRead': 'file could not be read: {path}',
  'library.signatureInvalid': '{reason}',
  'library.signatureNotCode': 'the signature of a code entry must be a code signature',
  'library.signatureNotDesign':
    'the signature must be a design signature of the system "{system}"',
  'library.signaturePlatformMismatch':
    'the signature is for the platform "{found}", but the code is for the platform "{expected}"',
  'library.signatureSymbolMismatch':
    'the signature symbol ("{found}") differs from the code symbol ("{expected}")',
  'library.signaturePathMismatch':
    'the signature file ("{found}") differs from the code path ("{expected}")',
  // Component and specialization
  'library.componentAlreadyUsed':
    'the file {path} is already the component of the type "{typeId}"',
  'library.noSlot': 'the component {path} has no slot',
  'library.slotMismatch':
    'the slot of the component {path} is "{slot}", not "{expected}"',
  'library.fieldUndeclared':
    'the drawing uses the field "{key}", which the type "{typeId}" does not declare',
  'library.fieldUnused':
    'the field "{key}" of the type "{typeId}" is not used by the drawing of the component {path}',
  'library.previewNoField': 'the type "{typeId}" has no field "{key}"',
  'library.previewNotTable':
    '"{key}" is not a table of the type "{typeId}"; its preview must be a simple value',
  'library.previewTableNotList':
    '"{key}" is a table of the type "{typeId}"; its preview must be a list of rows',
  'library.previewColumnUnknown':
    '"{column}" is not a column of the table "{key}" of the type "{typeId}"',
  'library.repeatNotTable':
    'the repeat repeats the rows of "{key}", which is a {fieldType} field of the type "{typeId}", not a table',
  'library.repeatRowUnknownColumn':
    'the row drawing uses "{name}", which is neither a column of the table "{key}" nor a field of the type "{typeId}"',
  'library.repeatRowUnknown':
    'the row drawing uses "{name}", which the type "{typeId}" does not declare',
  'library.rowsNotTable':
    '$rows counts the rows of "{key}", which is a {fieldType} field of the type "{typeId}", not a table',
  'library.imageColumnNotString':
    'the image src reads the column "{key}" of the table "{table}" of the type "{typeId}", which is {fieldType}, not string',
  'library.imageFieldNotString':
    'the image src reads "{key}", which is a {fieldType} field of the type "{typeId}", not string',
  'library.fontMissing':
    'file of the font "{family}" not found: {path}; the drawing uses the system font',
  'library.scrimMissing': 'the type "{typeId}" does not exist in the specialization',
  // Tokens: one code per pair (token type, expected type; `TOKEN_KIND_NAMES`)
  'library.tokenMissing':
    'the token "{name}" does not exist in the specialization tokens',
  'library.tokenWrongKind.color.number':
    'the token "{name}" is a color, but a number is expected here',
  'library.tokenWrongKind.color.family':
    'the token "{name}" is a color, but a font family is expected here',
  'library.tokenWrongKind.number.color':
    'the token "{name}" is a number, but a color is expected here',
  'library.tokenWrongKind.number.family':
    'the token "{name}" is a number, but a font family is expected here',
  'library.tokenWrongKind.family.color':
    'the token "{name}" is a font family, but a color is expected here',
  'library.tokenWrongKind.family.number':
    'the token "{name}" is a font family, but a number is expected here',
  // Version contract
  'library.versionOtherSpec':
    'the previous version is of the specialization "{previous}", not "{id}"',
  'library.versionNotGrown':
    'the version did not grow: the previous one is {previous} and this one is {version}',
  'library.typeNotInVersion': 'the type "{typeId}" did not exist in version {version}',
  'library.roleNotInVersion':
    'the role "{role}" of the type "{typeId}" did not exist in version {version}',
  'library.fieldNotInVersion':
    'the field "{key}" of the type "{typeId}" did not exist in version {version}',
  'library.optionNotInVersion':
    '"{value}" was not an option of the field "{field}" in version {version}',
  // Icons
  'library.iconMissing': 'the icon "{name}" does not exist in the icon set ({path})',
  'library.iconUnverifiable':
    'the icon "{name}" cannot be checked: the specialization does not declare icons',
  'library.iconOptionMissing':
    'the option "{option}" of the field "{key}" is not in the icon set; the drawing falls back to the placeholder',
  // Drawing proof: one code per case (default values, preview, example), with and without mode.
  // The inner message (the engine's warning, with a code) goes into `{reason}`.
  'library.draw.defaults':
    'type "{typeId}", the default values, initial size {size}: {reason}',
  'library.draw.defaultsMode':
    'type "{typeId}", the default values, mode {mode}, initial size {size}: {reason}',
  'library.draw.preview': 'type "{typeId}", the preview, initial size {size}: {reason}',
  'library.draw.previewMode':
    'type "{typeId}", the preview, mode {mode}, initial size {size}: {reason}',
  'library.draw.example':
    'type "{typeId}", the example "{name}", initial size {size}: {reason}',
  'library.draw.exampleMode':
    'type "{typeId}", the example "{name}", mode {mode}, initial size {size}: {reason}',
  // The same case at the size fitted to the content (the fit of decision 14 of #898).
  'library.drawFitted.defaults':
    'type "{typeId}", the default values, fitted size {size}: {reason}',
  'library.drawFitted.defaultsMode':
    'type "{typeId}", the default values, mode {mode}, fitted size {size}: {reason}',
  'library.drawFitted.preview':
    'type "{typeId}", the preview, fitted size {size}: {reason}',
  'library.drawFitted.previewMode':
    'type "{typeId}", the preview, mode {mode}, fitted size {size}: {reason}',
  'library.drawFitted.example':
    'type "{typeId}", the example "{name}", fitted size {size}: {reason}',
  'library.drawFitted.exampleMode':
    'type "{typeId}", the example "{name}", mode {mode}, fitted size {size}: {reason}',
  'library.drawFailed': 'failed to draw: {error}',
  'library.buildFailed':
    'could not build the library to prove the external system examples: {reason}',
  'library.buildFailedUnknown':
    'could not build the library to prove the external system examples: unknown reason',
  'library.systemExample': 'example "{name}" of the system "{system}": {reason}',
  'library.systemExampleType':
    'example "{name}" of the system "{system}": the node matches the type "{found}", not "{typeId}"',
  'library.originScreen': 'example screen "{name}" of the system "{system}": {reason}',
} as const;
