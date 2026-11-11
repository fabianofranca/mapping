import { it } from 'vitest';
import { files } from '../support/material3Library';
import { instantiateOptions } from '../support/material3Library';
import { buildCatalog } from '../../src/model/catalog';
import { instantiate } from '../../src/model/components/instantiate';
import { defaultValues } from '../../src/model/libraryDrawing';

function dump(n: any, d: number, out: string[]) {
  const t = n.transform;
  out.push(`${'  '.repeat(d)}${n.name ?? n.type} ${n.type} ${Math.round(t[4]*100)/100},${Math.round(t[5]*100)/100} ${Math.round(n.width*100)/100}x${Math.round(n.height*100)/100}${n.visible===false?' (hidden)':''}`);
  for (const c of n.children ?? []) dump(c, d + 1, out);
}
it('x', () => {
  const only = process.env.ONLY;
  const full = !!process.env.FULL;
  const catalog = buildCatalog(files);
  const seen = new Set<string>();
  for (const entry of (catalog as any).layers.flatMap((l: any) => l.entries)) {
    if (only && entry.type.id !== only) continue;
    if (!entry.component) continue;
    const c: any = entry.component;
    const cases: any[] = [{ name: 'preview', values: { ...defaultValues(entry.type), ...(c.preview ?? {}) } }];
    (entry.type.examples ?? []).forEach((e: any) => e.values && cases.push({ name: e.name, values: { ...defaultValues(entry.type), ...e.values } }));
    for (const cs of cases) {
      for (const mode of ['light', 'dark'] as const) {
        const r: any = instantiate(c, cs.values, { x: 0, y: 0, ...c.size }, instantiateOptions(catalog, mode));
        if ((r.overflowWarnings ?? []).length) {
          const key = entry.type.id + cs.name + JSON.stringify(r.shortfalls);
          if (seen.has(key)) continue; seen.add(key);
          const out: string[] = [];
          if (full || only) dump(r.root, 0, out);
          console.log(`### ${entry.type.id} / ${cs.name} [${mode}] ${c.size.width}x${c.size.height} ${JSON.stringify(r.shortfalls)}\n${out.join('\n')}`);
        }
      }
    }
  }
});
