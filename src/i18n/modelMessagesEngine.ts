// en-US do catálogo `engine` (etapa #1263, MB5): os avisos do motor de desenho. Termos do formato
// (`fill`, `hug`, `repeat`, `slot`), nomes de nó, ids e caminhos não se traduzem.

import type { engineMessages } from '../model/messages/engine';

export const engineEnUS: {
  readonly [C in keyof typeof engineMessages as `model.${C}`]: string;
} = {
  'model.engine.fieldMissing': 'field not provided: {key}',
  'model.engine.textZeroWidth': 'text measured with width 0: {name}',
  'model.engine.invalidValue': 'invalid value in {label}: {value}',
  'model.engine.fillInHug': 'fill inside hug becomes 0',
  'model.engine.iconStretched': 'stretched icon: different scale on the two axes',
  'model.engine.iconUnknown': 'unknown icon: {name}',
  'model.engine.contentTooBig': 'content larger than the box: {name}',
  'model.engine.textTooBig': 'text larger than the box: {name}',
  'model.engine.repeatLimited': 'repeat limited to {limit} rows: {name}',
  'model.engine.typeNoComponent': '{path}: type without a component: {typeId}',
  'model.engine.childrenIgnored': '{path}: children ignored (component without a slot)',
  'model.engine.fillInHugUsing': '{path}: fill inside hug: using hug',
  'model.engine.slotInvisible': '{path}: invisible slot: children ignored',
  'model.engine.screenTooTall': 'screen: content taller than the screen height',
  'model.engine.approximate': '{reason} (approximate)',
};
