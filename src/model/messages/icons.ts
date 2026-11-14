// Messages of the icon set (`icons.ts`, `mapping-icons` format): code → template of today's
// pt-BR text, with `{parameters}`. The prefix is `iconsFile.` so as not to collide with the
// hand-written `icons.*` (loading of the components). Invalid JSON uses `library.invalidJson`.

export const iconsFileMessages = {
  'iconsFile.expectedObject': 'expected an object',
  'iconsFile.expectedObjectShort': 'expected object',
  'iconsFile.expectedViewBox': 'expected [width, height] with numbers greater than 0',
  'iconsFile.expectedPaint': 'expected true, false or a color (text)',
  'iconsFile.expectedOneOf': 'expected one of: {options}',
  'iconsFile.expectedWidth': 'expected a number greater than or equal to 0',
  'iconsFile.unknownKey': 'unknown key: {key}',
  'iconsFile.expectedPathData': 'expected the path data (text)',
  'iconsFile.expectedPaths': 'expected a non-empty list of paths',
  'iconsFile.formatInvalid': 'must be "{format}"',
  'iconsFile.formatVersionInvalid': 'must be 1 or 2',
  'iconsFile.v2Only': 'only allowed with formatVersion 2',
  'iconsFile.expectedBoolean': 'expected true or false',
  'iconsFile.required': 'required field',
  'iconsFile.expectedIcons': 'expected an object with at least one icon',
  'iconsFile.nameInvalid': 'invalid name; use [a-z0-9][a-z0-9-_]*',
} as const;
