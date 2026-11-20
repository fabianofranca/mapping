// Messages of the SVG icon converter (`svgXml.ts`, `svgShapes.ts`, `svgIcon.ts`): code → template
// of the English text, with `{parameters}`. The code is the key without the `model.` prefix that
// the interface uses. A phrase that varies by case becomes one code per variant, with the whole
// text (never assembled from pieces).

export const svgIconMessages = {
  // XML reader
  'svgIcon.xmlTooLarge': 'the SVG is larger than {max} KB',
  'svgIcon.xmlTooDeep': 'the SVG nests more than {max} levels (line {line})',
  'svgIcon.xmlDoctype': 'DOCTYPE and ENTITY declarations are not supported (line {line})',
  'svgIcon.xmlEntity': 'unknown or invalid entity {entity} (line {line})',
  'svgIcon.xmlUnclosed': 'unclosed tag <{tag}> opened at line {line}',
  'svgIcon.xmlMismatch':
    'closing tag </{found}> at line {line} does not match the open tag <{expected}>',
  'svgIcon.xmlSyntax': 'invalid XML at line {line}',
  'svgIcon.xmlNoRoot': 'the XML has no root element',
  // Converter
  'svgIcon.notSvg': 'the root element is <{element}>, not <svg>',
  'svgIcon.unsupportedElement': 'unsupported in SVG: {element}',
  'svgIcon.unsupportedAttribute': 'unsupported in SVG: {element} {attribute}',
  'svgIcon.viewBoxOrigin':
    'unsupported in SVG: svg viewBox with an origin other than 0 0 ({value})',
  'svgIcon.invalidValue': 'invalid value in SVG: {element} {attribute}="{value}"',
  'svgIcon.noSize': 'the SVG has no viewBox and no numeric width and height',
  'svgIcon.noShape': 'the SVG has no shape',
  'svgIcon.nameInvalid': 'the icon name "{name}" is invalid; use [a-z0-9][a-z0-9-_]*',
} as const;
