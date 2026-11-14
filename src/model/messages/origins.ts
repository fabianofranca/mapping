// Messages of the reading of the origins declaration (`origin.ts`, `parseOrigins`): code → template
// of today's pt-BR text, with `{parameters}`. The path comes separately (`origins[0].screen…`); only
// the message is here. The package path (`examples[].file`) uses the messages of the `spec` catalog.

export const originMessages = {
  'origins.expectedList': 'expected a list',
  'origins.expectedObject': 'expected an object',
  'origins.expectedPath': 'expected a path (non-empty text)',
  'origins.wildcardOnlyRoots': '"[*]" is only valid in roots[].path',
  'origins.expectedMap': 'expected an object (source → target)',
  'origins.expectedText': 'expected text',
  'origins.expectedLiteralOrPath': 'expected a literal or { path }',
  'origins.expectedTextOrNumber': 'expected text or a number',
  'origins.anchorInvalid': 'invalid anchor: {anchor}; use {anchors}',
  'origins.marginNeedsAnchor': 'margin is only valid with anchor',
  'origins.expectedScrim': 'expected the id of a type (non-empty text)',
  'origins.expectedRoots': 'expected a list with at least one root',
  'origins.expectedBooleans': 'expected { "true": text, "false": text }',
  'origins.expectedNonEmptyText': 'expected non-empty text',
  'origins.expectedKind': 'expected one of: {kinds}',
  'origins.expectedNode': 'expected an object with type, props and children',
  'origins.requiredKeyName': 'required (key name, non-empty text)',
  'origins.expectedExampleFile': 'expected the path of a .json file in the package',
  'origins.systemRepeated': 'repeated origin: {system}',
  'origins.needsIdOrName': 'needs id or name',
  'origins.expectedTextList': 'expected a list of texts',
  'origins.needsNameOrPath': 'needs name or path',
  // Drawing warnings (`translateSource`, `importMeasured`): `{path}` is the path of the value in the JSON.
  'origins.draw.notScalar': '{path}: expected a simple value',
  'origins.draw.optionOutside': '{path}: value outside the options of {key}: {value}',
  'origins.draw.nodeInvalid': '{path}: invalid node (expected an object)',
  'origins.draw.typeMissing': '{path}: missing type',
  'origins.draw.typeUnknown': '{path}: external type without an annotation type: {name}',
  'origins.draw.expectedObject': '{path}: expected an object',
  'origins.draw.expectedList': '{path}: expected a list',
  'origins.draw.unknownProp': '{path}: unknown property in {name}',
  'origins.draw.anchorInvalid': '{path}: invalid anchor: {value}; using top-start',
  'origins.draw.marginInvalid': '{path}: expected a number greater than or equal to 0',
  'origins.draw.rectInvalid': '{path}: expected numeric { x, y, width, height }',
  'origins.draw.nodeUntyped':
    '{path}: node without an annotation type ({label}); ignored',
  'origins.draw.nodeUntypedBare':
    '{path}: node without an annotation type (no type); ignored',
  // Errors that prevent translating the screen (`translateSource`, `screenFromSource`): `errorMessage`.
  'origins.error.systemUndeclared': 'origin not declared in the specialization: {system}',
  'origins.error.noOrigins': 'the specialization declares no origins',
  'origins.error.onlyMeasured':
    'the specialization only declares measured origins (which do not produce a screen); pass the origin system',
  'origins.error.widthInvalid': 'screen width missing or invalid ({source})',
  'origins.error.heightInvalid': 'screen height missing or invalid ({source})',
  'origins.error.noResult': 'translation produced no result',
  'origins.draw.emptyRect': '{path}: empty rectangle ({width}×{height}); ignored',
} as const;
