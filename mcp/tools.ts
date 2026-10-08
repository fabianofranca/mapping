import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { projectIndex } from '../src/model';
import { createProjectFolder } from './createProject';
import { ToolError } from './errors';
import { DEFAULT_MAX_SIZE, MAX_MAX_SIZE, MIN_MAX_SIZE } from './image/compose';
import { imageFile, markingImage, type ImageResult } from './imageTools';
import { Refs, resolveItem } from './items';
import { listMarkings } from './markingList';
import type { Roots } from './paths';
import { discoverProjects, findProject, loadProject } from './projects';
import {
  annotationDetail,
  imageView,
  markingView,
  projectDetail,
  projectSummary,
  specializationView,
} from './views';

type Json = Record<string, unknown>;

interface ToolResult {
  [key: string]: unknown;
  content: (
    { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
  )[];
  isError?: boolean;
}

/**
 * Resposta em JSON compacto, só no texto: o MCP recomenda repetir o conteúdo estruturado no
 * texto, e clientes que mostram os dois gastariam o dobro do contexto do agente.
 */
async function respond(produce: () => Promise<Json>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await produce()) }] };
  } catch (error) {
    return failure(error);
  }
}

/** Como `respond`, mas a tool devolve também uma imagem (o texto vem antes: descreve a imagem). */
async function respondWithImage(
  produce: () => Promise<ImageResult>,
): Promise<ToolResult> {
  try {
    const { json, image } = await produce();
    return {
      content: [
        { type: 'text', text: JSON.stringify(json) },
        {
          type: 'image',
          data: Buffer.from(image.bytes).toString('base64'),
          mimeType: image.mimeType,
        },
      ],
    };
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): ToolResult {
  if (error instanceof ToolError) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(error) }] };
  }
  // O stdout é do protocolo: o diagnóstico vai para o stderr.
  process.stderr.write(
    `mapping-mcp: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: {
            code: 'internal-error',
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      },
    ],
  };
}

const projectArg = z
  .string()
  .describe(
    'Projeto: nome da pasta (ex: "cadastro"), caminho relativo a uma raiz ou caminho absoluto dentro das raízes. Veja list_projects.',
  );
const optionalProjectArg = projectArg
  .optional()
  .describe(
    'Projeto, quando a referência não o traz (`m/3f2a9c1e` ou id). Sem ele, procura em todos os projetos das raízes.',
  );
const refArg = z
  .string()
  .describe(
    'Referência copiada da app (`mapping://projeto/m/3f2a9c1e (caminho)`), `m/3f2a9c1e` (com `project`) ou o id completo.',
  );

const maxSizeArg = z
  .number()
  .int()
  .min(MIN_MAX_SIZE)
  .max(MAX_MAX_SIZE)
  .optional()
  .describe(
    `Lado maior máximo da imagem devolvida, em pixels (padrão ${DEFAULT_MAX_SIZE}; nunca amplia). Quanto maior, mais contexto o agente gasta.`,
  );
const formatArg = z
  .enum(['png', 'jpeg', 'webp'])
  .optional()
  .describe(
    'Formato da imagem devolvida. Padrão: jpeg se o arquivo original é JPEG, senão png (sem perdas, bom para telas e texto).',
  );

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export function registerTools(server: McpServer, roots: Roots): void {
  server.registerTool(
    'list_projects',
    {
      description:
        'Lista os projetos Mapping (pastas com mapping.json) encontrados nas raízes configuradas: nome, caminho, contagens e especializações aplicadas.',
      annotations: READ_ONLY,
    },
    () =>
      respond(async () => {
        const locations = await discoverProjects(roots);
        const reals = await roots.realRoots();
        const projects = await Promise.all(
          locations.map(async (location) => {
            try {
              return projectSummary(await loadProject(roots, location));
            } catch (error) {
              if (!(error instanceof ToolError)) throw error;
              // Um projeto ilegível não esconde os outros: aparece com o motivo.
              return {
                name: location.name,
                path: location.path,
                dir: location.dir,
                root: location.root,
                error: error.toJSON().error,
              };
            }
          }),
        );
        return {
          roots: roots.roots,
          missingRoots: roots.roots.filter((_, i) => reals[i] === null),
          projects,
        };
      }),
  );

  server.registerTool(
    'create_project',
    {
      description:
        'Cria um projeto Mapping vazio (mapping.json, images/ e .gitignore) numa pasta dentro de uma raiz. O nome da pasta vira o <projeto> das referências.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'Pasta a criar: relativa a uma raiz (ex: "cadastro") ou absoluta dentro dela.',
          ),
        name: z.string().describe('Nome do projeto (aparece na app).'),
        root: z
          .string()
          .optional()
          .describe('Raiz em que criar, quando há mais de uma e `path` é relativo.'),
        firstLayerName: z
          .string()
          .optional()
          .describe('Nome da primeira camada (padrão: "Camada 1").'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) =>
      respond(async () => {
        const created = await createProjectFolder(roots, args);
        const loaded = await loadProject(roots, await findProject(roots, created.dir));
        return { created: true, ...projectSummary(loaded) };
      }),
  );

  server.registerTool(
    'get_project',
    {
      description:
        'Resumo do projeto: imagens, camadas, especializações (com a situação da cópia), contagens e pendências (anotações incompletas).',
      inputSchema: { project: projectArg },
      annotations: READ_ONLY,
    },
    ({ project }) =>
      respond(async () => {
        const loaded = await loadProject(roots, await findProject(roots, project));
        return projectDetail(new Refs(loaded));
      }),
  );

  server.registerTool(
    'list_markings',
    {
      description:
        'Lista marcações em linhas compactas (referência, caminho, retângulo em pixels da imagem original, trava, anotações). Os filtros se combinam; os de camada, tipo e incompletas valem para a mesma anotação própria da marcação (herdadas não contam).',
      inputSchema: {
        project: projectArg,
        image: z
          .string()
          .optional()
          .describe('Só desta imagem: referência, id, nome ou nome do arquivo.'),
        layer: z
          .string()
          .optional()
          .describe('Só marcações com anotação nesta camada (id ou nome).'),
        annotationType: z
          .string()
          .optional()
          .describe(
            'Só marcações com anotação deste tipo: typeId, specId/typeId ou nome do tipo.',
          ),
        incomplete: z
          .boolean()
          .optional()
          .describe(
            'Só marcações com anotação incompleta (campo obrigatório vazio, referência quebrada…).',
          ),
        text: z
          .string()
          .optional()
          .describe(
            'Texto no nome da marcação ou no nome, chaves e valores das anotações (sem acento e sem diferenciar maiúsculas).',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('Linhas por página (padrão 100).'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Quantas linhas pular (paginação).'),
      },
      annotations: READ_ONLY,
    },
    ({ project, ...filters }) =>
      respond(async () => {
        const loaded = await loadProject(roots, await findProject(roots, project));
        return listMarkings(new Refs(loaded), filters);
      }),
  );

  server.registerTool(
    'get_marking',
    {
      description:
        'Tudo sobre uma marcação: caminho, imagem, retângulo em pixels da imagem original, trava, filhas, anotações por camada (próprias e herdadas, com a origem), árvore de vínculos, referências de saída resolvidas, backlinks e pendências.',
      inputSchema: { ref: refArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project, 'm');
        const marking = projectIndex(item.refs.project).markings.get(item.id);
        if (!marking) throw new ToolError('not-found', `marcação não encontrada: ${ref}`);
        return markingView(item.refs, marking);
      }),
  );

  server.registerTool(
    'get_annotation',
    {
      description:
        'Uma anotação (livre ou tipada): conteúdo, camada, marcação, dona e vinculadas, referências de saída resolvidas, backlinks e pendências.',
      inputSchema: { ref: refArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project, 'a');
        const annotation = projectIndex(item.refs.project).annotations.get(item.id);
        if (!annotation)
          throw new ToolError('not-found', `anotação não encontrada: ${ref}`);
        return annotationDetail(item.refs, annotation);
      }),
  );

  server.registerTool(
    'get_image',
    {
      description:
        'Uma imagem do projeto: arquivo e caminho absoluto (se existir), dimensões, posição, trava, e as marcações de primeiro nível.',
      inputSchema: { ref: refArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project, 'i');
        const image = projectIndex(item.refs.project).images.get(item.id);
        if (!image) throw new ToolError('not-found', `imagem não encontrada: ${ref}`);
        return imageView(roots, item.refs, image);
      }),
  );

  server.registerTool(
    'resolve',
    {
      description:
        'Descobre o que uma referência designa (marcação, imagem ou anotação) e devolve a referência completa, com o caminho legível. Use antes de get_* quando não souber o tipo.',
      inputSchema: { ref: refArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project);
        const index = projectIndex(item.refs.project);
        const { refs } = item;
        const base = {
          kind: { m: 'marking', i: 'image', a: 'annotation' }[item.kind],
          ref: refs.ref(item.kind, item.id),
          id: item.id,
          project: { name: refs.projectName, path: item.loaded.location.path },
        };
        if (item.kind === 'm') {
          const marking = index.markings.get(item.id)!;
          return {
            ...base,
            name: marking.name,
            image: refs.ref('i', marking.imageId),
            rect: marking.rect,
          };
        }
        if (item.kind === 'i') {
          const image = index.images.get(item.id)!;
          return { ...base, name: image.name, file: image.file };
        }
        const annotation = index.annotations.get(item.id)!;
        return {
          ...base,
          marking: refs.ref('m', annotation.markingId),
          layer: index.layers.get(annotation.layerId)?.name ?? annotation.layerId,
        };
      }),
  );

  server.registerTool(
    'get_specialization',
    {
      description:
        'O JSON completo de uma especialização aplicada ao projeto (camadas, tipos, campos, descrições e orientações), para aprender os tipos de anotação antes de ler ou escrever anotações tipadas.',
      inputSchema: {
        project: projectArg,
        specId: z
          .string()
          .describe('Id da especialização (ex: "sdui"); veja get_project.'),
      },
      annotations: READ_ONLY,
    },
    ({ project, specId }) =>
      respond(async () => {
        const loaded = await loadProject(roots, await findProject(roots, project));
        return specializationView(new Refs(loaded), specId);
      }),
  );

  server.registerTool(
    'get_marking_image',
    {
      description:
        'Devolve, como imagem, o recorte de uma marcação (mode "crop", com `padding` opcional em pixels da imagem original) ou a imagem inteira com a marcação contornada em magenta (mode "context"). Com `outlineChildren`, contorna as filhas diretas com cores diferentes e a resposta traz a legenda cor → nome → referência. O texto da resposta diz a região mostrada, a escala e onde a marcação ficou na imagem devolvida.',
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        padding: z
          .number()
          .int()
          .min(0)
          .max(4096)
          .optional()
          .describe(
            'Margem em volta da marcação, em pixels da imagem original (padrão 0; limitada às bordas da imagem). Só no modo "crop".',
          ),
        mode: z
          .enum(['crop', 'context'])
          .optional()
          .describe(
            '"crop" (padrão): só o recorte. "context": a imagem inteira com a marcação destacada.',
          ),
        outlineChildren: z
          .boolean()
          .optional()
          .describe(
            'Contorna as marcações filhas com cores diferentes e devolve a legenda em texto.',
          ),
        maxSize: maxSizeArg,
        format: formatArg,
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) =>
      respondWithImage(async () => {
        const item = await resolveItem(roots, ref, project, 'm');
        const marking = projectIndex(item.refs.project).markings.get(item.id);
        if (!marking) throw new ToolError('not-found', `marcação não encontrada: ${ref}`);
        return markingImage(roots, item.refs, marking, options);
      }),
  );

  server.registerTool(
    'get_image_file',
    {
      description:
        'Devolve a imagem inteira de uma imagem do projeto, reduzida se o lado maior passar de `maxSize`. Para ver só uma marcação, use get_marking_image.',
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        maxSize: maxSizeArg,
        format: formatArg,
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) =>
      respondWithImage(async () => {
        const item = await resolveItem(roots, ref, project, 'i');
        const image = projectIndex(item.refs.project).images.get(item.id);
        if (!image) throw new ToolError('not-found', `imagem não encontrada: ${ref}`);
        return imageFile(roots, item.refs, image, options);
      }),
  );
}
