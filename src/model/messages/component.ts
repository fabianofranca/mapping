// Component messages (`parseComponent.ts`): code → template of today's default text, with
// `{parameters}`. Invalid JSON uses `library.invalidJson`. The text the parser builds is the
// same as before; the code comes out of the text lookup (`textLookup.ts`).

export const componentMessages = {
  // Literals
  'component.unknownKey': 'unknown key: {key}',
  'component.expectedBoolean': 'expected a boolean',
  'component.expectedNumber': 'expected a number',
  'component.expectedNonNegative': 'expected a number greater than or equal to 0',
  'component.expectedUnit': 'expected a number between 0 and 1',
  'component.expectedWeight': 'expected a weight between 100 and 900',
  'component.expectedText': 'expected text',
  'component.expectedTextOrNumber': 'expected text or a number',
  'component.expectedColor': 'expected a color (non-empty text)',
  'component.expectedOneOf': 'expected one of: {options}',
  'component.expectedRadius':
    'expected a number greater than or equal to 0 or a list of 4 numbers',
  'component.expectedFill': 'expected a color or gradient',
  'component.expectedLinear': 'expected "linear"',
  'component.expectedStops': 'expected a list of stops',
  'component.expectedTwoStops': 'expected at least 2 stops',
  'component.expectedObject': 'expected an object',
  // Conditions and expressions
  'component.expectedCondition': 'expected a condition (object)',
  'component.conditionNoOperator': 'condition without an operator ({ops})',
  'component.conditionManyOperators': 'condition with more than one operator: {ops}',
  'component.expectedFieldKey': 'expected a field key (non-empty text)',
  'component.expectedFieldValue':
    'expected a list [field, value] with a text field and a text or number value',
  'component.expectedConditions': 'expected a list of conditions',
  'component.mustBeNumber': 'must be a number',
  'component.needsOneOperand': 'needs 1 operand',
  'component.expectedOperands': 'expected a list of operands',
  'component.needsOperands': 'needs {min} operands',
  'component.needsOperandsOrMore': 'needs {min} or more operands',
  'component.opOnlyNumber': '{op} is only valid where a number is expected',
  'component.expectedWidthHeight': 'expected "width" or "height"',
  'component.tokenOnlyWhere':
    '$token is only valid where a color, a number or a font family is expected',
  'component.expectedTokenName': 'expected a token name ([a-z0-9][a-z0-9-]*)',
  'component.alphaOnlyColor': 'alpha is only valid on a color $token',
  'component.exprManyOperators': 'expression with more than one operator: {ops}',
  'component.required': 'required field',
  'component.expectedCases': 'expected an object of cases',
  'component.expectedParts': 'expected a list of parts',
  // Size, sides, stroke, shadow, font, layout
  'component.expectedSize':
    'expected a number greater than or equal to 0, "fill", "hug", "min-content", "max-content" or "<number>%"',
  'component.imageNoHug':
    'the image node does not accept hug: the layout does not depend on the downloaded image',
  'component.imageNoIntrinsic':
    'the image node does not accept min-content or max-content: the layout does not depend on the downloaded image',
  'component.notGreaterThan': 'cannot be greater than {max}',
  'component.expectedSides': 'expected a list of sides',
  'component.expectedOneSide': 'expected at least one side',
  'component.repeatedSide': 'repeated side: {side}',
  'component.expectedNumbers': 'expected a list of numbers',
  'component.sidesOnlyFrameRect': 'only valid in frame and rect (this is {nodeType})',
  'component.offsetOnlyShapes':
    'only valid in frame, rect and ellipse (this is {nodeType})',
  'component.expectedInteger1': 'expected an integer greater than or equal to 1',
  'component.expectedPadding':
    'expected a number, a list of 2 or a list of 4 numbers (greater than or equal to 0)',
  'component.expectedGap':
    'expected a number or a list [vertical, horizontal] of numbers (greater than or equal to 0)',
  'component.expectedLayoutFlow': 'expected "none", "row", "column" or "grid"',
  'component.expectedViewBox': 'expected [width, height] with positive numbers',
  // Text and nodes
  'component.expectedRunObject': 'expected an object (run)',
  'component.expectedRuns': 'expected a non-empty list of runs',
  'component.textAndRuns': 'text and runs together: use one or the other',
  'component.expectedNodeObject': 'expected an object (node)',
  'component.nodeTypeUnknown': 'unknown node type: {type} (expected {types})',
  'component.onlyFrameAccepts': 'only nodes of type frame accept {key} (this is {type})',
  'component.notInRepeat':
    'not valid in a repeat; the drawing belongs to the template ({key})',
  'component.expectedNodes': 'expected a list of nodes',
  'component.expectedHttps': 'expected an absolute https:// URL ({reason})',
  'component.srcOnlyLiteral': 'src only accepts literal text or { "$field": "<field>" }',
  'component.expectedInteger0': 'expected an integer greater than or equal to 0',
  'component.countOrField': 'use count or field, not both',
  'component.repeatTemplateFrame': 'the template of a row must be of type "frame"',
  'component.notAllowedInRepeat': '{type} is not allowed inside a repeat',
  // Format 4: over, provide, stroke.gap and shadow list
  'component.overOnlyColor': 'over is only valid in a color $token',
  'component.expectedTokenOrColor': 'expected a token name or a color',
  'component.expectedTokenNameOrColor':
    'expected a token name ([a-z0-9][a-z0-9-]*) or a color',
  'component.emptyName': 'empty name',
  'component.providedOnlyColor': '$provided is only valid where a color is expected',
  'component.expectedProvidedName':
    'expected the name of the provided color (non-empty text)',
  'component.gapNotWithSides': 'gap is not valid with sides',
  'component.expectedShadowCount': 'expected 1 to {max} shadows',
  'component.gapNodeNotFound': 'node not found: {name}',
  'component.gapNotInRepeat': 'stroke.gap cannot be used inside a repeat',
  'component.gapNotSelf': 'stroke.gap.node cannot name the node itself: {name}',
  'component.gapNotInsideRepeat':
    'stroke.gap.node cannot name a node inside a repeat: {name}',
  // Baseline
  'component.baselineOnlyRow': 'baseline is only valid in row',
  'component.baselineNotWithVerticalAlign': 'does not combine with verticalAlign',
  // $lines and sizing by expression
  'component.expectedNodeName': 'expected the name of a text node (non-empty text)',
  'component.linesNodeMissing': 'text node "{name}" does not exist',
  'component.linesNodeRepeated': 'more than one text node "{name}"',
  'component.linesInsideRepeat': 'text node "{name}" is inside a repeat',
  'component.linesSelf': 'the node cannot depend on its own lines',
  'component.sizingNoSize': '$size is not valid in sizing',
  'component.sizingNoLines': '$lines is not valid in sizing',
  'component.onlyWithWrap': 'only valid with wrap',
  // Grid, weights and repeat.layout (stage #1078, L3)
  'component.gridTracksExactlyOne':
    'layout: give exactly one of columns, minColumnWidth, rows and minRowHeight',
  'component.expectedGreaterThanZero': 'expected a number greater than 0',
  'component.trackOnlyGrid': 'only valid in a grid layout',
  'component.notInGrid': 'not valid in a grid layout',
  'component.spanOnlyInGrid': 'span: only valid on a child of a grid layout',
  'component.anchorStartLeft': 'does not combine with left',
  'component.anchorEndRight': 'does not combine with right',
  'component.weightOnlyFill':
    'weight: only valid on a fill child on the main axis of a row or column',
  'component.repeatLayoutConflict':
    'repeat.layout: does not combine with direction or gap',
  'component.distributeNotGrid': 'distribute: not valid with a grid layout',
  'component.repeatLayoutUseKey': 'repeat.layout: the key goes inside layout ({key})',
  'component.repeatLayoutNotNone': 'repeat.layout: use row, column or grid',
  // Format version
  'component.v4Only': 'only allowed with formatVersion 4',
  'component.anchorFieldUnknown': 'field does not exist: {name}',
  'component.indexOnlyInRepeat': '$index is only valid inside a repeat',
  'component.repeatOnlyV2': 'the repeat node only exists in formatVersion 2',
  'component.imageOnlyV3': 'the image node only exists in formatVersion 3',
  // Variables (`let` and `$var`, stage #1504)
  'component.expectedVariableName': 'expected a variable name ([a-z][a-zA-Z0-9]*)',
  'component.variableUndefined': 'undefined variable: {name}',
  'component.variableCycle': 'variable cycle: {cycle}',
  'component.variablesTooBig': 'variable expansion too large (more than {max} nodes)',
  // Dimensions, screen and file
  'component.expectedSizeObject': 'expected an object { width, height }',
  'component.expectedPositive': 'expected a positive number',
  'component.expectedSizingObject': 'expected an object { width?, height? }',
  'component.expectedSizing':
    'expected a number greater than or equal to 0, "fill", "hug", "min-content" or "max-content"',
  'component.formatInvalid': 'expected "mapping-component"',
  'component.formatVersionInvalid': 'expected {versions} or {last}',
  'component.idInvalid': 'expected text matching ^[a-z0-9][a-z0-9-_]*$',
  'component.expectedName': 'expected non-empty text',
  'component.rootNotFrame': 'the root of the template must be of type "frame"',
  'component.rootNoRotation': 'not valid on the root',
  'component.expectedPreviewValue':
    'expected text, a number or null (or a list of rows, in a table field)',
  'component.expectedRow': 'expected an object (a row)',
  'component.expectedCell': 'expected text, a number or null',
  // Warning
  'component.fontFamilyInvalid':
    'font family not valid for CSS ({family}): the text falls back to sans-serif',
} as const;
