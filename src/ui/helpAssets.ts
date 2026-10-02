import schemaText from '../../docs/spec.schema.json?raw';
import modelText from '../../examples/specs/modelo-de-dados.json?raw';
import sduiText from '../../examples/specs/sdui.json?raw';
import { downloadFile } from '../storage/share';

export interface HelpAsset {
  readonly id: 'sdui' | 'data-model' | 'schema';
  readonly fileName: string;
  readonly text: string;
}

/** Arquivos embutidos no build (a app é um único index.html, sem rede). */
export const HELP_ASSETS: readonly HelpAsset[] = [
  { id: 'sdui', fileName: 'sdui.json', text: sduiText },
  { id: 'data-model', fileName: 'modelo-de-dados.json', text: modelText },
  { id: 'schema', fileName: 'spec.schema.json', text: schemaText },
];

export function downloadHelpAsset(asset: HelpAsset): void {
  downloadFile(new File([asset.text], asset.fileName, { type: 'application/json' }));
}
