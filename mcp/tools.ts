import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ModelError, projectIndex } from '../src/model';
import { planChanges } from './changes';
import { LocalFileChecker } from './codeFiles';
import { codeHintsView, type CodeContext } from './codeViews';
import { createProjectFolder } from './createProject';
import { ToolError } from './errors';
import { DEFAULT_MAX_SIZE, MAX_MAX_SIZE, MIN_MAX_SIZE } from './image/compose';
import { imageFile, markingImage, type ImageResult } from './imageTools';
import { findByCodeResult } from './findByCode';
import { Refs, resolveItem } from './items';
import { listMarkings } from './markingList';
import { modelToolError } from './modelErrors';
import { operationSchema } from './operations';
import { Proposals } from './proposals';
import { findBySourceResult, findTypesBySourceResult } from './sourceTools';
import { validateSpecialization } from './specValidation';
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

/** Erro de uma tool → resposta `isError`; só o inesperado vira `internal-error` (com stack no stderr). */
export function failure(error: unknown): ToolResult {
  if (error instanceof ModelError) return failure(modelToolError(error));
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

const proposalRefArg = z
  .string()
  .describe(
    'Referência da proposta (`mapping://projeto/p/3f2a9c1e`, a que propose_changes e list_proposals devolvem), `p/3f2a9c1e` (com `project`) ou o id completo.',
  );

const operationsArg = z
  .array(operationSchema)
  .min(1)
  .max(1000)
  .describe('Operações, aplicadas em ordem. Veja o recurso AGENT-GUIDE.md.');

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

const platformArg = z
  .string()
  .describe(
    'Id da plataforma declarada pelas especializações aplicadas (veja `platforms` em get_project).',
  );

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

/** Visões que resolvem `codeRef`: o `workDir` do cliente limita a conferência de arquivos locais. */
function codeContext(roots: Roots, refs: Refs): CodeContext {
  return { refs, files: new LocalFileChecker(roots.workDir) };
}

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
        'Resumo do projeto: imagens, camadas, especializações (com a situação da cópia), plataformas de código (`platforms`), repositórios por plataforma (`platformRepos`), avisos de repositório ausente (`warnings`), contagens e pendências (anotações incompletas).',
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
        'Tudo sobre uma marcação: caminho, imagem, retângulo em pixels da imagem original, trava, filhas, anotações por camada (próprias e herdadas, com a origem), árvore de vínculos, referências de saída resolvidas, backlinks e pendências. ' +
        'Nas anotações tipadas, `codeRefs` traz onde foram implementadas (plataforma, caminho, símbolo, linha, `url` do repositório, `localFile` relativo ao diretório de trabalho do cliente e `exists`) e `code` o mapeamento do tipo por plataforma. O servidor só confere se o arquivo existe: nunca lê código.',
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        platform: platformArg
          .optional()
          .describe(
            'Só os `codeRefs` e o `code` desta plataforma (ex: a que você vai implementar). Atenção: as entradas das outras plataformas ficam de fora; para alterar um `codeRef`, parta de get_annotation, que traz todas.',
          ),
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, platform }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project, 'm');
        const marking = projectIndex(item.refs.project).markings.get(item.id);
        if (!marking) throw new ToolError('not-found', `marcação não encontrada: ${ref}`);
        return markingView(codeContext(roots, item.refs), marking, platform);
      }),
  );

  server.registerTool(
    'get_code_hints',
    {
      description:
        'O que implementar numa plataforma a partir de uma marcação: a árvore da marcação e das descendentes, e em cada uma as anotações tipadas com o componente de código da plataforma (`symbol`), os parâmetros com os valores já traduzidos (`params`), as orientações (`notes`), os eventos vinculados sob a dona (`linked`), os valores de referência resolvidos (ex: `User.name`) e onde já foi implementado (`codeRefs`). ' +
        'Tipos com `symbol: null` não têm mapeamento nesta plataforma. Depois de implementar, registre onde com plan_changes (campo `codeRef` da anotação).',
      inputSchema: { ref: refArg, platform: platformArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, platform, project }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project, 'm');
        return codeHintsView(codeContext(roots, item.refs), item.id, platform);
      }),
  );

  server.registerTool(
    'find_by_code',
    {
      description:
        'Do código para o mapeamento: as marcações cujo `codeRef` aponta para um arquivo e/ou símbolo. `path` casa com o caminho inteiro ou com os últimos segmentos (`CheckoutScreen.kt` casa com `app/…/CheckoutScreen.kt`; `Screen.kt` não); `symbol` casa por igualdade; com os dois, ambos precisam casar. Sem `project`, procura em todos os projetos das raízes. Devolve as referências `mapping://` da marcação e da anotação. Não abre arquivos de código.',
      inputSchema: {
        project: projectArg
          .optional()
          .describe('Projeto onde procurar. Sem ele, procura em todos os das raízes.'),
        path: z
          .string()
          .optional()
          .describe(
            'Arquivo: caminho inteiro (relativo à raiz do repositório) ou só o final por segmentos inteiros (ex: "CheckoutScreen.kt").',
          ),
        symbol: z
          .string()
          .optional()
          .describe('Símbolo exato (classe, componente ou função).'),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => findByCodeResult(roots, args)),
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
        return annotationDetail(codeContext(roots, item.refs), annotation);
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

  server.registerTool(
    'plan_changes',
    {
      description:
        'Prévia de um lote de alterações: valida contra as regras do Mapping e devolve se é válido, os erros por operação, um resumo legível, as contagens, as pendências novas, as referências dos itens que serão criados e quantas mudanças o usuário teria de revisar. NÃO grava nada (nem proposta). ' +
        'As operações são aplicadas em ordem; um item criado pode ser citado nas seguintes pelo apelido de `as` (ex: "$porta"). Itens trancados não podem ser movidos, redimensionados nem excluídos. Para enviar a alteração ao usuário, use propose_changes (o agente nunca grava o projeto direto).',
      inputSchema: {
        project: projectArg,
        operations: operationsArg,
      },
      annotations: READ_ONLY,
    },
    ({ project, operations }) =>
      respond(async () =>
        planChanges(roots, await findProject(roots, project), operations, Date.now),
      ),
  );

  const proposals = new Proposals(
    roots,
    Date.now,
    () => server.server.getClientVersion()?.name,
  );

  server.registerTool(
    'propose_changes',
    {
      description:
        'Envia uma alteração ao usuário como PROPOSTA para revisão: valida o lote como o plan_changes, calcula as mudanças (criações, alterações campo a campo, remoções) e grava `proposals/<id>/proposal.json` (imagens novas em `proposals/<id>/images/`). O `mapping.json` NÃO é alterado: o usuário revisa na app, aceita ou rejeita em qualquer nível (proposta, imagem, item, mudança), deixa notas e aplica o que aceitou. ' +
        'Devolve a referência `mapping://<projeto>/p/<código>`, um resumo por nível e as referências definitivas dos itens criados. Depois, avise o usuário e espere a revisão terminar (get_proposal: nada pendente nem aceito sem aplicar); leia o resultado com get_proposal_review e, para corrigir, envie outra proposta com `supersedes` só com as correções. Reexportações: use `source` nas imagens e marcações e find_by_source para propor só o que mudou.',
      inputSchema: {
        project: projectArg,
        title: z
          .string()
          .describe('Título da proposta (aparece na janela Propostas da app).'),
        description: z
          .string()
          .optional()
          .describe('Descrição: o que a proposta faz e por quê.'),
        origin: z
          .string()
          .optional()
          .describe(
            'De onde vieram os dados (texto livre, ex: "Figma: Loja v3 › Checkout").',
          ),
        author: z
          .string()
          .optional()
          .describe('Quem envia (padrão: o nome do cliente MCP, ex: o agente).'),
        supersedes: z
          .string()
          .optional()
          .describe(
            'Proposta que esta substitui (referência `mapping://projeto/p/código`, `p/código` ou id). A anterior passa a `superseded` (decisões e notas continuam guardadas). Se a revisão dela não tinha terminado, a resposta traz um aviso.',
          ),
        operations: operationsArg,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => respond(() => proposals.propose(args)),
  );

  server.registerTool(
    'list_proposals',
    {
      description:
        'Lista as propostas do projeto (abertas e fechadas): referência, título, origem, autor, data, estado, progresso da revisão (pendentes, aceitas sem aplicar, rejeitadas, aplicadas), conflitos e a relação de substituição.',
      inputSchema: {
        project: projectArg,
        status: z
          .enum(['open', 'applied', 'superseded', 'withdrawn'])
          .optional()
          .describe('Só as propostas neste estado.'),
      },
      annotations: READ_ONLY,
    },
    ({ project, status }) => respond(() => proposals.list(project, status)),
  );

  server.registerTool(
    'get_proposal',
    {
      description:
        'Uma proposta: progresso da revisão (`progress.complete` = nada pendente nem aceito sem aplicar), resumo por nível (Projeto e imagens), as mudanças com o estado de cada uma (pending, accepted, rejected, applied), conflitos (o projeto mudou depois da proposta), aviso de item trancado e as notas. Use para saber se a revisão terminou.',
      inputSchema: {
        ref: proposalRefArg,
        project: optionalProjectArg,
        state: z
          .enum(['pending', 'accepted', 'rejected', 'applied', 'conflict'])
          .optional()
          .describe(
            'Só as mudanças neste estado (`conflict` = valor atual diferente do antes).',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Mudanças por página (padrão 200).'),
        offset: z.number().int().min(0).optional().describe('Quantas mudanças pular.'),
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) => respond(() => proposals.get(ref, project, options)),
  );

  server.registerTool(
    'get_proposal_review',
    {
      description:
        'O resultado da revisão, só o que importa para a próxima rodada: as mudanças rejeitadas (com o alvo, antes/depois e as notas do usuário), as notas gerais (proposta, projeto, imagem, item), os conflitos e se a revisão terminou (`ready`). Corrija só isso e envie com propose_changes e `supersedes`.',
      inputSchema: { ref: proposalRefArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) => respond(() => proposals.review(ref, project)),
  );

  server.registerTool(
    'withdraw_proposal',
    {
      description:
        'Retira uma proposta aberta (estado `withdrawn`): nada mais dela será aplicado; o que já foi aplicado continua no projeto. Os arquivos ficam em proposals/ para o histórico.',
      inputSchema: { ref: proposalRefArg, project: optionalProjectArg },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({ ref, project }) => respond(() => proposals.withdraw(ref, project)),
  );

  server.registerTool(
    'find_by_source',
    {
      description:
        'Acha as imagens e marcações cuja origem (`source`) é `system` + `id` (comparação exata), para uma reexportação casar os elementos que já existem em vez de duplicá-los. Sem `project`, procura em todos os projetos das raízes. Também lista (`proposed`) as propostas ainda abertas que criam um elemento com essa origem.',
      inputSchema: {
        project: projectArg
          .optional()
          .describe('Projeto onde procurar. Sem ele, procura em todos os das raízes.'),
        system: z.string().describe('Sistema de origem (ex: "figma").'),
        id: z.string().describe('Id do elemento no sistema de origem.'),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => findBySourceResult(roots, args)),
  );

  server.registerTool(
    'find_types_by_source',
    {
      description:
        'Do elemento de origem para o tipo de anotação: os tipos das especializações aplicadas ao projeto cujo `sources` declara o elemento (ex: o componente `DS/Button` do Figma), pelo `id` (mais forte) e/ou pelo `name`. Cada tipo vem com os campos que têm propriedade de origem do sistema (e como os valores se traduzem), para você preencher `values` sem deduzir pelo nome.',
      inputSchema: {
        project: projectArg,
        system: z.string().describe('Sistema de origem (ex: "figma").'),
        id: z
          .string()
          .optional()
          .describe('Id do elemento (ou do componente) na origem.'),
        name: z
          .string()
          .optional()
          .describe('Nome do elemento na origem (ex: "DS/Button").'),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => findTypesBySourceResult(roots, args)),
  );

  server.registerTool(
    'validate_specialization',
    {
      description:
        'Valida um arquivo de especialização (`path`, dentro das raízes) ou um texto JSON (`text`), sem aplicar a nenhum projeto. Devolve os MESMOS erros que a importação da app, cada um com o caminho exato (ex: `layers[0].annotationTypes[2].fields[1].sources[0].values.Primary: …`), e avisos que não impedem a importação (plataforma declarada e não usada, tipo sem `code`). É o ciclo gerar, validar, corrigir.',
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            'Arquivo da especialização (JSON), relativo a uma raiz ou absoluto dentro delas.',
          ),
        text: z.string().optional().describe('O conteúdo JSON da especialização.'),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => validateSpecialization(roots, args)),
  );
}
