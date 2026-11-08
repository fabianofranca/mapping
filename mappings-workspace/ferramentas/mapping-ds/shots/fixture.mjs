// Remonta o projeto comentarios como estava ANTES da proposta v5 (fda8dd84), o que extract.mjs abre no app real:
// as conversas de teste ancoram em marcações daquele estado (Salvar, Campo E-mail), apagadas pela v5.
// Grava shots/fixture/ (mapping.json + specs/). Só precisa rodar de novo se a fixture for apagada.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { PATHS } from '../paths.mjs';

const PROJECT = `${PATHS.ws}/projetos/comentarios`;
const OUT = `${PATHS.base}/shots/fixture`;
const V5 = 'fda8dd84-02ba-46a5-9f7a-8379c32db7fc';
const V4 = '6b2c17b8-d3c1-413e-8427-a1ea79d6be21';

const p = JSON.parse(readFileSync(`${PROJECT}/mapping.json`, 'utf8'));
const prop = JSON.parse(readFileSync(`${PROJECT}/proposals/${V5}/proposal.json`, 'utf8'));
const LIST = { image: 'containers', marking: 'markings', annotation: 'annotations', arrow: 'arrows' };
const created = new Set(prop.changes.filter((c) => c.kind === 'create').map((c) => c.entityId));
for (const key of Object.values(LIST)) p[key] = p[key].filter((x) => !created.has(x.id));
for (const c of prop.changes) if (c.kind === 'remove') p[LIST[c.entity]].push(c.from);
// A camada inicial (vazia) existia quando a réplica foi medida; o projeto vivo a perdeu depois.
if (!p.layers.some((l) => l.name === 'Camada 1')) p.layers.unshift({ id: '0c4a1f3e-6b2d-4e8a-9c71-5d3f2a1b0e94', name: 'Camada 1', color: '#D32F2F', spec: null });
p.specializations = p.specializations.map((s) => (s.id === 'mapping-ds' ? { ...s, version: 4 } : s));
// O app medido é o 0.25.0 (schema 15): desfaz as migrações 15 → 18 que a app 0.28 aplicou ao projeto vivo
// (project.id, perspectivas e chegadas; modo do desenho no projeto e nos containers).
// O que foi criado depois da v5 dentro de containers que a v5 criou (e a fixture desfaz) fica de fora.
{
  const cs = new Set(p.containers.map((c) => c.id));
  p.markings = p.markings.filter((m) => m.containerId === null || cs.has(m.containerId));
  const ms = new Set(p.markings.map((m) => m.id));
  p.annotations = p.annotations.filter((x) => ms.has(x.markingId));
  p.arrows = p.arrows.filter((x) => ms.has(x.from?.markingId ?? x.from) && ms.has(x.to?.markingId ?? x.to));
}
p.schemaVersion = 15;
for (const k of ['perspectives', 'arrivals', 'drawingMode']) delete p[k];
if (p.project) delete p.project.id;
for (const c of p.containers) delete c.drawingMode;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/mapping.json`, JSON.stringify(p, null, 2));
cpSync(`${PROJECT}/specs/notas`, `${OUT}/specs/notas`, { recursive: true });
cpSync(`${PROJECT}/proposals/${V4}/specs/mapping-ds`, `${OUT}/specs/mapping-ds`, { recursive: true });
// As propostas que já existiam (a conversa de teste cita a v4 no cartão de proposta).
for (const id of ['6cce46da-b133-4496-a17a-bf963a42115f', '044b1325-e1c8-4017-9e85-bd41f652546c', V4]) cpSync(`${PROJECT}/proposals/${id}`, `${OUT}/proposals/${id}`, { recursive: true });
console.log('fixture:', p.containers.length, 'containers ·', p.markings.length, 'marcações ·', p.annotations.length, 'anotações ·', p.arrows.length, 'setas');
