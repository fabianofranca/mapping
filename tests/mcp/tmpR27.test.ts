import { it, expect } from 'vitest';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeImage } from '../../mcp/image/codecs';
import { acceptAllAndApply, ok, propose } from './proposalSupport';
import { connect } from './workspace';

it('r27', async () => {
  const root = '/tmp/claude-0/-home-user-mapping/c9c40767-3041-56a6-be89-5e98e3274e16/scratchpad/ws/design/mapeamentos';
  const mcp = await connect([root], { cwd: '/tmp/claude-0/-home-user-mapping/c9c40767-3041-56a6-be89-5e98e3274e16/scratchpad/ws' });
  ok(await mcp.call('create_project', { path: 'rtl', name: 'rtl', notes: false }));
  const dir = join(root, 'rtl');
  let pr = await propose(mcp, 'rtl', [{ op: 'apply_specialization', file: 'm3-rtl' }]);
  acceptAllAndApply(dir, pr.proposal.id);
  pr = await propose(mcp, 'rtl', [
    { op: 'add_container', as: '$c', name: 'Direção', width: 400, height: 260, background: '#DDEEFF' },
    { op: 'create_marking', as: '$s', container: '$c', rect: { x: 20, y: 190, width: 100, height: 30 }, annotation: { type: 'material3-compose/spacer', values: {} } },
  ]);
  console.log(JSON.stringify(pr.errors), JSON.stringify(pr.created));
  acceptAllAndApply(dir, pr.proposal.id);
  const proj = ok(await mcp.call<any>('get_project', { project: 'rtl' }));
  const ref = pr.created.find((c) => c.kind === 'marking')!.ref!;
  for (const direction of [undefined, 'rtl']) {
    const out = await mcp.client.callTool({ name: 'render_marking', arguments: { ref, zoom: 1, padding: 0, ...(direction ? { direction } : {}) } });
    const c = out.content as any[];
    const raster = (await decodeImage(Buffer.from(c[1].data, 'base64'))).raster;
    const hex = (x: number, y: number) => [...raster.data.subarray((y * raster.width + x) * 4, (y * raster.width + x) * 4 + 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
    console.log(direction, raster.width, raster.height, [20, 60, 90, 80, 40, 10].map((x) => x + ':' + hex(x, 15)).join(' '), c[0].text.slice(0, 200));
  }
  console.log(JSON.stringify(proj.containers));
  await mcp.close();
}, 60000);
