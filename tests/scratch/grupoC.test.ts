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
it.skip('probe', () => {
  for (const id of ['button','extended-fab','chip','text-field','secure-text-field','search-bar']) {
    const e = entryOf(id);
    log(id, 'size', JSON.stringify(e.component!.size), 'min', JSON.stringify(e.component!.minSize), 'sizing', JSON.stringify(e.component!.sizing));
    for (const ex of e.examples) {
      log('  ', ex.name, JSON.stringify(fit(id, ex.values ?? {})), '| w136', JSON.stringify(fit(id, ex.values ?? {}, {width:e.component!.size.width,height:e.component!.size.height}, {width:false})));
    }
  }
});
import { instantiate } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';
function dump(n: SceneNode, ind = 0): string {
  const base = `${' '.repeat(ind)}${n.type} ${'name' in n ? (n as {name?:string}).name ?? '' : ''} t=[${n.transform.map((x) => +x.toFixed(2)).join(',')}] ${n.width}x${n.height}${n.visible ? '' : ' (hidden)'}${n.type==='text'?' "'+(n as unknown as {lines?:{text:string}[]}).lines?.length+'"':''}`;
  return base + '\n' + ('children' in n ? n.children.map((c) => dump(c, ind + 2)).join('') : '');
}
export function draw(id: string, values: Record<string, unknown>, w: number, h: number, mode: 'light'|'dark'='light') {
  const entry = entryOf(id); const lib = catalog.library!;
  return instantiate(entry.component!, { ...defaultValues(entry.type), ...values } as never, {x:0,y:0,width:w,height:h}, { measure: approximateMeasurer, tokens: resolveTokens(lib.tokens, {}, mode), ...(lib.icons === undefined ? {} : { icons: lib.icons }) });
}

import type { ComponentFile } from '../../src/model/components/componentFormat';
function drawWith(comp: ComponentFile, values: Record<string, unknown>, w: number, h: number, mode: 'light'|'dark'='light') {
  const lib = catalog.library!;
  return instantiate(comp, values as never, {x:0,y:0,width:w,height:h}, { measure: approximateMeasurer, tokens: resolveTokens(lib.tokens, {}, mode), ...(lib.icons === undefined ? {} : { icons: lib.icons }) });
}
function variant(id: string, fn: (c: any) => void): ComponentFile {
  const c = structuredClone(entryOf(id).component!) as any; fn(c); return c;
}
function byName(n: any, name: string): any { if (n?.name === name && typeof n.type === 'string') return n; for (const k of n?.children ?? []) { const r = byName(k, name); if (r) return r; } return undefined; }

const opts = (mode: 'light'|'dark' = 'light') => ({ measure: approximateMeasurer, tokens: resolveTokens(catalog.library!.tokens, {}, mode), ...(catalog.library!.icons === undefined ? {} : { icons: catalog.library!.icons }) });
function report(c: ComponentFile, v: Record<string, unknown>, w = 136, h = 40) {
  log(dump(drawWith(c, v, w, h).root));
  log('warn', JSON.stringify(drawWith(c, v, w, h).warnings));
  log('fit w-kept', JSON.stringify(fitComponentSize(c, v as never, opts(), {base:{width:w,height:h}, auto:{width:false}})));
  log('fit hug', JSON.stringify(fitComponentSize(c, v as never, opts())));
}

it('exp3', () => {
  for (const id of ['text-field','search-bar']) {
    const c = variant(id, (c) => { c.sizing = {...c.sizing, width:'hug'}; c.template.minWidth = id==='text-field'?280:360; if(id==='search-bar') c.template.maxWidth=720; });
    const e = entryOf(id);
    for (const ex of e.examples) {
      const v = { ...defaultValues(e.type), ...(ex.values ?? {}) };
      log(id, ex.name, 'hug', JSON.stringify(fitComponentSize(c, v as never, opts())));
    }
    const v = { ...defaultValues(e.type), value: 'x'.repeat(200), query: 'x'.repeat(200) };
    log(id, 'longo', JSON.stringify(fitComponentSize(c, v as never, opts())));
  }
});
