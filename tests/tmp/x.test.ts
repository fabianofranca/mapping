import { it } from 'vitest';
import { spec, text, types, files } from '../support/material3Library';
import { parseComponentText } from '../../src/model/components/parseComponent';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { buildCatalog } from '../../src/model/catalog';

function dump(n: any, d: number, out: string[], hl: string) {
  const t = n.transform;
  out.push(`${'  '.repeat(d)}${n.name ?? n.type} ${n.type} ${Math.round(t[4]*100)/100},${Math.round(t[5]*100)/100} ${Math.round(n.width*100)/100}x${Math.round(n.height*100)/100}${n.visible===false?' (hidden)':''}`);
  for (const c of n.children ?? []) dump(c, d + 1, out, hl);
}
it('x', () => {
  const only = process.env.ONLY;
  for (const type of types) {
    if (!type.component) continue;
    if (only && type.id !== only) continue;
    const file = files.find((f) => f.path.endsWith(type.component!.replace('./', '')));
    const comp = parseComponentText(file!.text!);
    if (!('component' in comp) || !comp.component) { console.log('parse fail', type.id); continue; }
    const c: any = comp.component;
    const cases: any[] = [{ name: 'preview', values: { ...defaultValues(type), ...(c.preview ?? {}) } }];
    (type.examples ?? []).forEach((e) => e.values && cases.push({ name: e.name, values: { ...defaultValues(type), ...e.values } }));
    for (const cs of cases) {
      for (const mode of ['light']) {
        const r: any = instantiate(c, cs.values, { x: 0, y: 0, ...c.size }, { measure: approximateMeasurer });
        if ((r.overflowWarnings ?? []).length) {
          const out: string[] = [];
          dump(r.root, 0, out, '');
          console.log(`### ${type.id} / ${cs.name} ${c.size.width}x${c.size.height}\n${JSON.stringify(r.shortfalls)}\n${out.join('\n')}`);
        }
      }
    }
  }
});
