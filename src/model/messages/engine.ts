// Messages of the drawing engine (`instantiate.ts`, `layout.ts`, `repeat.ts`; stage #1263, MB5):
// code → template of today's pt-BR text, with `{parameters}`. The engine's text `warnings` are
// the `text` of these messages, letter for letter. The node path goes in `{path}`
// (`withoutNodePrefix` of `libraryDrawing.ts` cuts it off in the parameter, not in the text).

export const engineMessages = {
  'engine.fieldMissing': 'field not provided: {key}',
  'engine.textZeroWidth': 'text measured with width 0: {name}',
  'engine.invalidValue': 'invalid value in {label}: {value}',
  'engine.fillInHug': 'fill inside hug becomes 0',
  'engine.iconStretched': 'stretched icon: different scale on the two axes',
  'engine.iconUnknown': 'unknown icon: {name}',
  'engine.contentTooBig': 'content larger than the box: {name}',
  'engine.textTooBig': 'text larger than the box: {name}',
  'engine.repeatLimited': 'repeat limited to {limit} rows: {name}',
  'engine.typeNoComponent': '{path}: type without a component: {typeId}',
  'engine.childrenIgnored': '{path}: children ignored (component without a slot)',
  'engine.fillInHugUsing': '{path}: fill inside hug: using hug',
  'engine.slotInvisible': '{path}: invisible slot: children ignored',
  'engine.childrenOutsideMaxLines': '{count} children outside maxLines: {name}',
  'engine.linesUnstable': '$lines unstable: {name}',
  'engine.screenTooTall': 'screen: content taller than the screen height',
  // Library drawing proof: the engine warning with the approximate-measure suffix.
  'engine.approximate': '{reason} (approximate)',
  // Drawing proof in `rtl`: the warning that only appears in that direction (`ltr` did not give it).
  'engine.inRtl': 'in rtl: {reason}',
} as const;
