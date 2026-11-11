import { appendFileSync } from 'node:fs';
import { it } from 'vitest';
import { fitComponentSize } from '../../src/model/components/sizing';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { catalog, entryOf } from '../support/material3Fitted';
const log = (...a: unknown[]) => appendFileSync('/tmp/claude-0/-home-user-mapping/27421de6-fa53-51b8-966d-f9a0f0bab20b/scratchpad/grupoC.out', a.join(' ') + '\n');
function fit(id: string, values: Record<string, unknown>, base?: {width:number;height:number}, auto?: {width?: boolean; height?: boolean}) {
  const entry = entryOf(id); const lib = catalog.library!;
  const opts = { measure: approximateMeasurer, tokens: resolveTokens(lib.tokens, {}, 'light'), ...(lib.icons === undefined ? {} : { icons: lib.icons }) };
  return fitComponentSize(entry.component!, { ...defaultValues(entry.type), ...values } as never, opts, { ...(base?{base}:{}), ...(auto?{auto}:{}) });
}
it('probe', () => {
  for (const id of ['button','extended-fab','chip','text-field','secure-text-field','search-bar']) {
    const e = entryOf(id);
    log(id, 'size', JSON.stringify(e.component!.size), 'min', JSON.stringify(e.component!.minSize), 'sizing', JSON.stringify(e.component!.sizing));
    for (const ex of e.examples) {
      log('  ', ex.name, JSON.stringify(fit(id, ex.values ?? {})), '| w136', JSON.stringify(fit(id, ex.values ?? {}, {width:e.component!.size.width,height:e.component!.size.height}, {width:false})));
    }
  }
});
