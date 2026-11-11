// en-US dos catálogos `component`, `iconsFile` e `origins` (etapa #1263, MB4). Termos do formato
// (`table`, `slot`, `repeat`, `formatVersion`, nomes de chave, ids e caminhos) não se traduzem.

import type { componentMessages } from '../model/messages/component';
import type { iconsFileMessages } from '../model/messages/icons';
import type { originMessages } from '../model/messages/origins';

export const componentEnUS: {
  readonly [C in keyof typeof componentMessages as `model.${C}`]: string;
} = {
  'model.component.unknownKey': 'unknown key: {key}',
  'model.component.expectedBoolean': 'expected a boolean',
  'model.component.expectedNumber': 'expected a number',
  'model.component.expectedNonNegative': 'expected a number greater than or equal to 0',
  'model.component.expectedUnit': 'expected a number between 0 and 1',
  'model.component.expectedWeight': 'expected a weight between 100 and 900',
  'model.component.expectedText': 'expected text',
  'model.component.expectedTextOrNumber': 'expected text or a number',
  'model.component.expectedColor': 'expected a color (non-empty text)',
  'model.component.expectedOneOf': 'expected one of: {options}',
  'model.component.expectedRadius':
    'expected a number greater than or equal to 0 or a list of 4 numbers',
  'model.component.expectedFill': 'expected a color or gradient',
  'model.component.expectedLinear': 'expected "linear"',
  'model.component.expectedStops': 'expected a list of stops',
  'model.component.expectedTwoStops': 'expected at least 2 stops',
  'model.component.expectedObject': 'expected an object',
  'model.component.expectedCondition': 'expected a condition (object)',
  'model.component.conditionNoOperator': 'condition without an operator ({ops})',
  'model.component.conditionManyOperators':
    'condition with more than one operator: {ops}',
  'model.component.expectedFieldKey': 'expected a field key (non-empty text)',
  'model.component.expectedFieldValue':
    'expected a list [field, value] with a text field and a text or number value',
  'model.component.expectedConditions': 'expected a list of conditions',
  'model.component.mustBeNumber': 'must be a number',
  'model.component.needsOneOperand': 'needs 1 operand',
  'model.component.expectedOperands': 'expected a list of operands',
  'model.component.needsOperands': 'needs {min} operands',
  'model.component.needsOperandsOrMore': 'needs {min} or more operands',
  'model.component.opOnlyNumber': '{op} is only valid where a number is expected',
  'model.component.expectedWidthHeight': 'expected "width" or "height"',
  'model.component.tokenOnlyWhere':
    '$token is only valid where a color, a number or a font family is expected',
  'model.component.expectedTokenName': 'expected a token name ([a-z0-9][a-z0-9-]*)',
  'model.component.alphaOnlyColor': 'alpha is only valid on a color $token',
  'model.component.exprManyOperators': 'expression with more than one operator: {ops}',
  'model.component.required': 'required field',
  'model.component.expectedCases': 'expected an object of cases',
  'model.component.expectedParts': 'expected a list of parts',
  'model.component.expectedSize':
    'expected a number greater than or equal to 0, "fill", "hug" or "<number>%"',
  'model.component.imageNoHug':
    'the image node does not accept hug: the layout does not depend on the downloaded image',
  'model.component.notGreaterThan': 'cannot be greater than {max}',
  'model.component.expectedSides': 'expected a list of sides',
  'model.component.expectedOneSide': 'expected at least one side',
  'model.component.repeatedSide': 'repeated side: {side}',
  'model.component.expectedNumbers': 'expected a list of numbers',
  'model.component.sidesOnlyFrameRect':
    'only valid in frame and rect (this is {nodeType})',
  'model.component.offsetOnlyShapes':
    'only valid in frame, rect and ellipse (this is {nodeType})',
  'model.component.overOnlyColor': 'over is only valid in a color $token',
  'model.component.expectedTokenOrColor': 'expected a token name or a color',
  'model.component.expectedTokenNameOrColor':
    'expected a token name ([a-z0-9][a-z0-9-]*) or a color',
  'model.component.emptyName': 'empty name',
  'model.component.providedOnlyColor':
    '$provided is only valid where a color is expected',
  'model.component.expectedProvidedName':
    'expected the name of the provided color (non-empty text)',
  'model.component.gapNotWithSides': 'gap is not valid with sides',
  'model.component.expectedShadowCount': 'expected 1 to {max} shadows',
  'model.component.gapNodeNotFound': 'node not found: {name}',
  'model.component.gapNotInRepeat': 'stroke.gap cannot be used inside a repeat',
  'model.component.gapNotSelf': 'stroke.gap.node cannot name the node itself: {name}',
  'model.component.gapNotInsideRepeat':
    'stroke.gap.node cannot name a node inside a repeat: {name}',
  'model.component.expectedInteger1': 'expected an integer greater than or equal to 1',
  'model.component.expectedPadding':
    'expected a number, a list of 2 or a list of 4 numbers (greater than or equal to 0)',
  'model.component.expectedGap':
    'expected a number or a list [vertical, horizontal] of numbers (greater than or equal to 0)',
  'model.component.expectedLayoutFlow': 'expected "none", "row" or "column"',
  'model.component.expectedViewBox': 'expected [width, height] with positive numbers',
  'model.component.expectedRunObject': 'expected an object (run)',
  'model.component.expectedRuns': 'expected a non-empty list of runs',
  'model.component.textAndRuns': 'text and runs together: use one or the other',
  'model.component.expectedNodeObject': 'expected an object (node)',
  'model.component.nodeTypeUnknown': 'unknown node type: {type} (expected {types})',
  'model.component.onlyFrameAccepts':
    'only nodes of type frame accept {key} (this is {type})',
  'model.component.notInRepeat':
    'not valid in a repeat; the drawing belongs to the template ({key})',
  'model.component.expectedNodes': 'expected a list of nodes',
  'model.component.expectedHttps': 'expected an absolute https:// URL ({reason})',
  'model.component.srcOnlyLiteral':
    'src only accepts literal text or { "$field": "<field>" }',
  'model.component.expectedInteger0': 'expected an integer greater than or equal to 0',
  'model.component.countOrField': 'use count or field, not both',
  'model.component.repeatTemplateFrame': 'the template of a row must be of type "frame"',
  'model.component.notAllowedInRepeat': '{type} is not allowed inside a repeat',
  'model.component.baselineOnlyRow': 'baseline is only valid in row',
  'model.component.baselineNotWithVerticalAlign': 'does not combine with verticalAlign',
  'model.component.expectedNodeName': 'expected the name of a text node (non-empty text)',
  'model.component.linesNodeMissing': 'text node "{name}" does not exist',
  'model.component.linesNodeRepeated': 'more than one text node "{name}"',
  'model.component.linesInsideRepeat': 'text node "{name}" is inside a repeat',
  'model.component.linesSelf': 'the node cannot depend on its own lines',
  'model.component.sizingNoSize': '$size is not valid in sizing',
  'model.component.sizingNoLines': '$lines is not valid in sizing',
  'model.component.onlyWithWrap': 'only valid with wrap',
  'model.component.v4Only': 'only allowed with formatVersion 4',
  'model.component.indexOnlyInRepeat': '$index is only valid inside a repeat',
  'model.component.repeatOnlyV2': 'the repeat node only exists in formatVersion 2',
  'model.component.imageOnlyV3': 'the image node only exists in formatVersion 3',
  'model.component.expectedSizeObject': 'expected an object { width, height }',
  'model.component.expectedPositive': 'expected a positive number',
  'model.component.expectedSizingObject': 'expected an object { width?, height? }',
  'model.component.expectedSizing':
    'expected a number greater than or equal to 0, "fill" or "hug"',
  'model.component.formatInvalid': 'expected "mapping-component"',
  'model.component.formatVersionInvalid': 'expected {versions} or {last}',
  'model.component.idInvalid': 'expected text matching ^[a-z0-9][a-z0-9-_]*$',
  'model.component.expectedName': 'expected non-empty text',
  'model.component.rootNotFrame': 'the root of the template must be of type "frame"',
  'model.component.rootNoRotation': 'not valid on the root',
  'model.component.expectedPreviewValue':
    'expected text, a number or null (or a list of rows, in a table field)',
  'model.component.expectedRow': 'expected an object (a row)',
  'model.component.expectedCell': 'expected text, a number or null',
  'model.component.fontFamilyInvalid':
    'font family not valid for CSS ({family}): the text falls back to sans-serif',
};

export const iconsFileEnUS: {
  readonly [C in keyof typeof iconsFileMessages as `model.${C}`]: string;
} = {
  'model.iconsFile.expectedObject': 'expected an object',
  'model.iconsFile.expectedObjectShort': 'expected an object',
  'model.iconsFile.expectedViewBox':
    'expected [width, height] with numbers greater than 0',
  'model.iconsFile.expectedPaint': 'expected true, false or a color (text)',
  'model.iconsFile.expectedOneOf': 'expected one of: {options}',
  'model.iconsFile.expectedWidth': 'expected a number greater than or equal to 0',
  'model.iconsFile.unknownKey': 'unknown key: {key}',
  'model.iconsFile.expectedPathData': 'expected the path data (text)',
  'model.iconsFile.expectedPaths': 'expected a non-empty list of paths',
  'model.iconsFile.formatInvalid': 'must be "{format}"',
  'model.iconsFile.formatVersionInvalid':
    'must be {version} (the only version of the format)',
  'model.iconsFile.required': 'required field',
  'model.iconsFile.expectedIcons': 'expected an object with at least one icon',
  'model.iconsFile.nameInvalid': 'invalid name; use [a-z0-9][a-z0-9-_]*',
};

export const originsEnUS: {
  readonly [C in keyof typeof originMessages as `model.${C}`]: string;
} = {
  'model.origins.expectedList': 'expected a list',
  'model.origins.expectedObject': 'expected an object',
  'model.origins.expectedPath': 'expected a path (non-empty text)',
  'model.origins.wildcardOnlyRoots': '"[*]" is only valid in roots[].path',
  'model.origins.expectedMap': 'expected an object (source → target)',
  'model.origins.expectedText': 'expected text',
  'model.origins.expectedLiteralOrPath': 'expected a literal or { path }',
  'model.origins.expectedTextOrNumber': 'expected text or a number',
  'model.origins.anchorInvalid': 'invalid anchor: {anchor}; use {anchors}',
  'model.origins.marginNeedsAnchor': 'margin is only valid with anchor',
  'model.origins.expectedScrim': 'expected the id of a type (non-empty text)',
  'model.origins.expectedRoots': 'expected a list with at least one root',
  'model.origins.expectedBooleans': 'expected { "true": text, "false": text }',
  'model.origins.expectedNonEmptyText': 'expected non-empty text',
  'model.origins.expectedKind': 'expected one of: {kinds}',
  'model.origins.expectedNode': 'expected an object with type, props and children',
  'model.origins.requiredKeyName': 'required (key name, non-empty text)',
  'model.origins.expectedExampleFile': 'expected the path of a .json file in the package',
  'model.origins.systemRepeated': 'repeated origin: {system}',
  'model.origins.needsIdOrName': 'needs id or name',
  'model.origins.expectedTextList': 'expected a list of texts',
  'model.origins.needsNameOrPath': 'needs name or path',
  'model.origins.draw.notScalar': '{path}: expected a simple value',
  'model.origins.draw.optionOutside':
    '{path}: value outside the options of {key}: {value}',
  'model.origins.draw.nodeInvalid': '{path}: invalid node (expected an object)',
  'model.origins.draw.typeMissing': '{path}: missing type',
  'model.origins.draw.typeUnknown':
    '{path}: external type without an annotation type: {name}',
  'model.origins.draw.expectedObject': '{path}: expected an object',
  'model.origins.draw.expectedList': '{path}: expected a list',
  'model.origins.draw.unknownProp': '{path}: unknown property in {name}',
  'model.origins.draw.anchorInvalid': '{path}: invalid anchor: {value}; using top-start',
  'model.origins.draw.marginInvalid':
    '{path}: expected a number greater than or equal to 0',
  'model.origins.draw.rectInvalid': '{path}: expected numeric { x, y, width, height }',
  'model.origins.draw.nodeUntyped':
    '{path}: node without an annotation type ({label}); ignored',
  'model.origins.draw.nodeUntypedBare':
    '{path}: node without an annotation type (no type); ignored',
  'model.origins.error.systemUndeclared':
    'origin not declared in the specialization: {system}',
  'model.origins.error.noOrigins': 'the specialization declares no origins',
  'model.origins.error.onlyMeasured':
    'the specialization only declares measured origins (which do not produce a screen); pass the origin system',
  'model.origins.error.widthInvalid': 'screen width missing or invalid ({source})',
  'model.origins.error.heightInvalid': 'screen height missing or invalid ({source})',
  'model.origins.error.noResult': 'translation produced no result',
  'model.origins.draw.emptyRect': '{path}: empty rectangle ({width}×{height}); ignored',
};
