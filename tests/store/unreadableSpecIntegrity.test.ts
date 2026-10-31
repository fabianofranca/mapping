// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  serialize,
  serializeSpec,
  setFieldValue,
  setTableCell,
  type Project,
  type Spec,
} from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProject } from '../../src/storage/loadProject';
import { openLocalLibrary } from '../../src/storage/local';
import { openSession, type ProjectSession } from '../../src/store/session';
import { readProjectZip, writeProjectZip } from '../../src/storage/zip';
import { clearReportedErrors } from '../../src/utils/report';
import { NOW, sampleProject } from '../model/fixtures';
import { idGen, layerOf, loadExample } from '../model/specFixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Etapa Biblioteca Material 3, MD1, decisão 4 (integridade): um projeto com uma cópia em
// `specs/` que a app não lê (aqui, `formatVersion` 99 com chaves desconhecidas, como `variants`
// no `code`) abre com as anotações daquela especialização como "tipo inexistente". Editar OUTRA
// coisa e gravar pela sessão precisa preservar os valores dessas anotações, a referência em
// `specializations` e o arquivo da cópia, byte a byte.

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  clearReportedErrors();
});

interface RawAnnotation {
  readonly id: string;
  readonly type: { readonly specId: string } | null;
}
interface RawMapping {
  readonly revision: number;
  readonly specializations: readonly { id: string; version: number; file: string }[];
  readonly layers: readonly { id: string; spec: { specId: string } | null }[];
  readonly markings: readonly { id: string }[];
  readonly annotations: readonly RawAnnotation[];
}

const parse = (text: string | null): RawMapping => JSON.parse(text ?? '') as RawMapping;

/** Anotações (cruas, como estão no `mapping.json`) da especialização `specId`. */
const rawOf = (m: RawMapping, specId: string) =>
  m.annotations.filter((a) => a.type?.specId === specId);

type Layout = 'flat' | 'package';

interface Fixture {
  readonly root: MemoryDirectory;
  /** O `mapping.json` como está no disco antes de a sessão abrir. */
  readonly mappingText: string;
  readonly project: Project;
  /** Caminho da cópia que a app não lê. */
  readonly futureFile: string;
  /** Texto exato dessa cópia. */
  readonly futureText: string;
  /** Os outros arquivos do pacote da especialização ilegível (vazio no layout `flat`). */
  readonly futureExtras: ReadonlyMap<string, string>;
  /** Texto da cópia da especialização válida (`modelo-dados`). */
  readonly validText: string;
  readonly validFile: string;
}

/**
 * Projeto com a SDUI-like `modelo-dados` (válida) e a `futuro` (ilegível), ambas com anotações
 * tipadas e com valores, mais as anotações livres do `sampleProject`. A `futuro` é gravada com
 * `formatVersion` 99 e `variants` no `code`, que a app não conhece.
 */
function fixture(layout: Layout): Fixture {
  const valid = loadExample('modelo-de-dados');
  // A mesma especialização com outro id: dois tipos `classe`/`endpoint` em specIds distintos.
  const future: Spec = { ...valid, id: 'futuro', name: 'Futuro', version: 3 };

  let p = sampleProject();
  p = applySpecialization(p, valid, { newId: idGen('LV') });
  p = applySpecialization(p, future, {
    newId: idGen('LF'),
    ...(layout === 'package' ? { packageSpecName: 'futuro.spec.json' } : {}),
  });

  const add = (
    id: string,
    markingId: string,
    specId: string,
    layer: string,
    typeId: string,
  ) => {
    p = addTypedAnnotation(p, {
      id,
      markingId,
      layerId: layerOf(p, specId, layer),
      type: { specId, typeId },
      parentAnnotationId: null,
    });
  };
  // Anotação de tipo válido, que a pessoa vai editar.
  add('AV1', 'M2', 'modelo-dados', 'classes', 'classe');
  p = setFieldValue(p, 'AV1', 'nome', 'Válida');
  // Anotações da especialização ilegível, que não podem mudar.
  add('AF1', 'M1', 'futuro', 'classes', 'classe');
  p = setFieldValue(p, 'AF1', 'nome', 'Futura');
  p = setFieldValue(p, 'AF1', 'descricao', 'Valores que a app não sabe interpretar');
  p = setFieldValue(p, 'AF1', 'versao', 7);
  p = addTableRow(p, 'AF1', 'atributos', 'R1');
  p = setTableCell(p, 'AF1', 'atributos', 'R1', 'nome', 'id');
  p = setTableCell(p, 'AF1', 'atributos', 'R1', 'tipo', 'Long');
  add('AF2', 'M3', 'futuro', 'endpoints', 'endpoint');
  p = setFieldValue(p, 'AF2', 'metodo', 'POST');
  p = setFieldValue(p, 'AF2', 'path', '/futuro/{id}');
  p = setFieldValue(p, 'AF2', 'timeoutMs', 250);

  const project: Project = { ...p, revision: 5 };
  const mappingText = serialize(project);
  const refOf = (id: string) => {
    const s = project.specializations.find((x) => x.id === id);
    if (!s) throw new Error(`especialização ${id} sem referência`);
    return s.file;
  };
  const validFile = refOf('modelo-dados');
  const futureFile = refOf('futuro');

  // A cópia ilegível: formatVersion que a app não suporta e chaves desconhecidas, em ordem e
  // com um espaçamento que o `serializeSpec` não reproduziria (para provar o "byte a byte").
  const futureJson = {
    ...future,
    formatVersion: 99,
    futureOnlyKey: { reserved: true },
    layers: future.layers.map((l) => ({
      ...l,
      annotationTypes: l.annotationTypes.map((t) => ({
        ...t,
        code: { symbol: 'Futuro', variants: { compose: { symbol: 'FuturoCompose' } } },
      })),
    })),
  };
  const futureText = `${JSON.stringify(futureJson, null, 4)}\n\n`;
  const validText = serializeSpec(valid);

  const root = new MemoryDirectory('mapeamento');
  root.put('mapping.json', mappingText);
  root.put(validFile, validText);
  root.put(futureFile, futureText);
  const futureExtras = new Map<string, string>();
  if (layout === 'package') {
    const dir = futureFile.slice(0, futureFile.lastIndexOf('/'));
    futureExtras.set(
      `${dir}/components/classe.json`,
      '{"formatVersion":99,"nodes":[]}\n',
    );
    futureExtras.set(`${dir}/docs/classe.md`, '# Classe\n\nTexto do documento.\n');
    for (const [path, text] of futureExtras) root.put(path, text);
  }
  return {
    root,
    mappingText,
    project,
    futureFile,
    futureText,
    futureExtras,
    validText,
    validFile,
  };
}

/** Abre como a app: `loadProject` e `openSession` com o texto lido. */
async function openLikeApp(root: MemoryDirectory) {
  const storage = createFolderStorage(root);
  const loaded = await loadProject(storage);
  if (!loaded.ok) throw new Error(`loadProject: ${loaded.error}`);
  const session = openSession({
    storage,
    project: loaded.project,
    readOnly: loaded.readOnly,
    loadedText: loaded.text,
    libraryIssues: loaded.libraryIssues,
    prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
    now: () => NOW,
  });
  return { loaded, session };
}

async function save(session: ProjectSession) {
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
  expect(session.saveStatus.value).toBe('saved');
}

/** Nada que a gravação deveria mexer: cópias, pacote e anotações da especialização ilegível. */
async function expectFutureIntact(f: Fixture) {
  expect(await f.root.read(f.futureFile)).toBe(f.futureText);
  expect(await f.root.read(f.validFile)).toBe(f.validText);
  for (const [path, text] of f.futureExtras) expect(await f.root.read(path)).toBe(text);

  const before = parse(f.mappingText);
  const after = parse(await f.root.read('mapping.json'));
  // Valores, tipo, marcação e camada das anotações da especialização ilegível.
  expect(rawOf(after, 'futuro')).toHaveLength(2);
  expect(rawOf(after, 'futuro')).toEqual(rawOf(before, 'futuro'));
  // A referência em `specializations` e as camadas da especialização.
  expect(after.specializations).toEqual(before.specializations);
  expect(after.layers.filter((l) => l.spec?.specId === 'futuro')).toEqual(
    before.layers.filter((l) => l.spec?.specId === 'futuro'),
  );
}

describe.each<Layout>(['flat', 'package'])(
  'cópia de especialização que a app não lê (%s)',
  (layout) => {
    let session: ProjectSession | null = null;
    afterEach(async () => {
      await session?.close();
      session = null;
    });

    it('abre sem reparo nem migração, com a especialização ilegível sem spec', async () => {
      const f = fixture(layout);
      const { loaded, session: s } = await openLikeApp(f.root);
      session = s;

      // Sem inconsistência (reparo) nem migração; nada foi gravado só por abrir.
      expect(loaded).toMatchObject({ ok: true, readOnly: false, migratedFrom: null });
      expect(loaded.ok && loaded.text).toBe(f.mappingText);
      expect(f.root.dirs.has('backups')).toBe(false);
      // A cópia ilegível não vira `Spec`; a válida sim.
      const specs = loaded.ok ? loaded.project.specializations : [];
      expect(specs.find((x) => x.id === 'futuro')?.spec).toBeNull();
      expect(specs.find((x) => x.id === 'modelo-dados')?.spec).not.toBeNull();
      // As anotações da especialização ilegível continuam no projeto, com os valores.
      const kept = loaded.ok
        ? loaded.project.annotations.filter((a) => a.type?.specId === 'futuro')
        : [];
      expect(kept.map((a) => a.id)).toEqual(['AF1', 'AF2']);
      expect(kept).toEqual(f.project.annotations.filter((a) => a.id.startsWith('AF')));
      expect(await f.root.read('mapping.json')).toBe(f.mappingText);
    });

    it('editar outras marcações e anotações e gravar preserva valores, referência e cópia', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;

      // Edita OUTRAS coisas: marcação sem anotação do futuro, anotação livre, anotação válida.
      s.actions.renameMarking('M4', 'Renomeada');
      s.actions.moveMarking('M4', 10, 10);
      s.actions.updateEntry('A1', 'E1', { key: 'tipo', value: 'riscado' });
      s.actions.renameAnnotation('A4', 'Outra nota');
      s.actions.setFieldValue('AV1', 'nome', 'Válida editada');
      await save(s);

      const after = parse(await f.root.read('mapping.json'));
      expect(after.revision).toBe(6);
      // A edição valeu (prova que a sessão gravou de fato).
      expect(JSON.stringify(after)).toContain('Válida editada');
      expect(JSON.stringify(after)).toContain('Renomeada');
      await expectFutureIntact(f);

      // Segunda gravação: continua intacto.
      s.actions.renameMarking('M4', 'Renomeada de novo');
      await save(s);
      expect(parse(await f.root.read('mapping.json')).revision).toBe(7);
      await expectFutureIntact(f);

      // Fechar a sessão (grava o pendente) também não mexe.
      await s.close();
      session = null;
      await expectFutureIntact(f);

      // Reabrir: os valores continuam lá, ainda sem spec para interpretá-los.
      const again = await loadProject(createFolderStorage(f.root));
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(
        again.project.specializations.find((x) => x.id === 'futuro')?.spec,
      ).toBeNull();
      expect(
        again.project.annotations.filter((a) => a.type?.specId === 'futuro'),
      ).toEqual(f.project.annotations.filter((a) => a.id.startsWith('AF')));
      expect(again.project.annotations.find((a) => a.id === 'AV1')?.values).toMatchObject(
        {
          nome: 'Válida editada',
        },
      );
    });

    it('mover a marcação que carrega anotações da especialização ilegível não muda os valores', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;
      s.actions.renameMarking('M1', 'Porta renomeada');
      s.actions.moveMarking('M3', 5, 5);
      await save(s);
      await expectFutureIntact(f);
    });

    it('o zip exportado leva a cópia ilegível e o pacote dela como estavam', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;
      s.actions.renameMarking('M4', 'Renomeada');
      await save(s);

      // O JSZip usa temporizadores: o resto roda com o relógio de verdade.
      vi.useRealTimers();
      const collected = await s.collectFiles();
      const zip = await writeProjectZip(collected);
      const read = await readProjectZip(zip);
      expect(read.ok).toBe(true);
      if (!read.ok) return;

      // O `mapping.json` do zip ainda cita a especialização: a cópia precisa estar junto.
      expect(rawOf(parse(read.files.mapping), 'futuro')).toEqual(
        rawOf(parse(f.mappingText), 'futuro'),
      );
      expect(parse(read.files.mapping).specializations.map((x) => x.id)).toContain(
        'futuro',
      );
      expect.soft(read.files.specs.get(f.futureFile)).toBe(f.futureText);
      for (const [path, text] of f.futureExtras) {
        expect.soft(await read.files.specAssets?.get(path)?.text()).toBe(text);
      }
    });

    it('zip → neste dispositivo → zip: a cópia ilegível e o pacote dela ida e volta como estavam', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;
      s.actions.renameMarking('M4', 'Renomeada');
      await save(s);

      // O JSZip e o IndexedDB de teste usam temporizadores: o resto roda com o relógio de verdade.
      vi.useRealTimers();
      const first = await readProjectZip(await writeProjectZip(await s.collectFiles()));
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      // Importa o zip para o IndexedDB, como `importZip`, e abre como a app.
      const library = await openLocalLibrary();
      if (!library) throw new Error('IndexedDB indisponível');
      const id = 'ida-e-volta';
      let local: ProjectSession | null = null;
      try {
        await library.create(id, first.files, { unexported: false });
        const storage = library.open(id);
        const loaded = await loadProject(storage);
        if (!loaded.ok) throw new Error(`loadProject: ${loaded.error}`);
        expect(
          loaded.project.specializations.find((x) => x.id === 'futuro')?.spec,
        ).toBeNull();
        local = openSession({
          storage,
          project: loaded.project,
          readOnly: loaded.readOnly,
          loadedText: loaded.text,
          libraryIssues: loaded.libraryIssues,
          prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
          now: () => NOW,
        });
        const again = await readProjectZip(
          await writeProjectZip(await local.collectFiles()),
        );
        expect(again.ok).toBe(true);
        if (!again.ok) return;

        expect(rawOf(parse(again.files.mapping), 'futuro')).toEqual(
          rawOf(parse(f.mappingText), 'futuro'),
        );
        expect.soft(again.files.specs.get(f.futureFile)).toBe(f.futureText);
        expect.soft(again.files.specs.get(f.validFile)).toBe(f.validText);
        for (const [path, text] of f.futureExtras) {
          expect.soft(await again.files.specAssets?.get(path)?.text()).toBe(text);
        }
        // O mesmo conjunto de arquivos de `specs/` da primeira exportação.
        expect([...again.files.specs.keys()].sort()).toEqual(
          [...first.files.specs.keys()].sort(),
        );
        expect([...(again.files.specAssets?.keys() ?? [])].sort()).toEqual(
          [...(first.files.specAssets?.keys() ?? [])].sort(),
        );
      } finally {
        await local?.close();
        await library.remove(id);
        library.close();
      }
    });

    it('cópia citada que não existe no armazenamento continua fora do zip', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;
      // Some do disco entre a abertura e a exportação (alteração externa).
      const parts = f.futureFile.split('/');
      const name = parts.pop() ?? '';
      let dir = f.root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      await dir.removeEntry(name);
      vi.useRealTimers();
      const collected = await s.collectFiles();
      expect(collected.specs.has(f.futureFile)).toBe(false);
      expect(collected.specs.get(f.validFile)).toBe(f.validText);
    });
  },
);
