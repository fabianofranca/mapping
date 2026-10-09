import { z } from 'zod';

// Operações de `plan_changes` (etapa 3a.5). Cada uma vira uma ou mais operações puras do
// `src/model/`, aplicadas em ordem (mcp/batch.ts). Os nomes seguem o vocabulário do modelo.

const ALIAS = /^\$[A-Za-z0-9_-]+$/;

const alias = z
  .string()
  .regex(ALIAS, 'apelido: "$" seguido de letras, números, "_" ou "-"')
  .optional()
  .describe(
    'Apelido temporário (ex: "$porta") para citar o item criado nas operações seguintes deste lote.',
  );

const item = (what: string) =>
  z
    .string()
    .describe(
      `${what}: referência (\`mapping://projeto/m/3f2a9c1e\`, \`m/3f2a9c1e\`), id completo ou apelido \`$nome\` criado antes no lote.`,
    );

const layer = z
  .string()
  .describe(
    'Camada: id, nome, `specId/layerId` (camada de especialização) ou apelido `$nome`.',
  );

const int = z.number().int();
const rect = z
  .object({ x: int, y: int, width: int, height: int })
  .describe('Retângulo em pixels inteiros da imagem original (com a orientação EXIF).');

const name = z.string().nullable().describe('Nome; vazio ou `null` remove o nome.');

const externalSource = z
  .object({
    system: z.string().describe('Sistema de origem (texto livre, ex: "figma").'),
    id: z.string().describe('Id do elemento no sistema de origem.'),
    url: z
      .string()
      .nullable()
      .optional()
      .describe('Link para o elemento na origem (opcional).'),
  })
  .nullable()
  .describe(
    'Identidade externa do elemento, para as reexportações reconhecerem o mesmo item (veja find_by_source). `null` limpa.',
  );

const imageSource = {
  file: z
    .string()
    .optional()
    .describe(
      'Arquivo de imagem (PNG, JPEG ou WebP) dentro das raízes: relativo à pasta do projeto ou a uma raiz, ou absoluto.',
    ),
  base64: z
    .string()
    .optional()
    .describe('Conteúdo da imagem em base64 (aceita o prefixo `data:image/…;base64,`).'),
  fileName: z
    .string()
    .optional()
    .describe(
      'Nome do arquivo em `images/` (a extensão vira .webp se a imagem for otimizada). Padrão: o nome de `file` ou `img-AAAAMMDD-HHMMSS`.',
    ),
};

const entries = z
  .array(
    z.object({
      key: z.string(),
      value: z.string(),
      id: z.string().optional().describe('Id de um par existente (mantém a identidade).'),
    }),
  )
  .describe(
    'Pares chave-valor da anotação livre (substituem todos). Um par com a mesma chave de um existente mantém o id, então as referências a ele continuam valendo.',
  );

const values = z
  .record(z.string(), z.json())
  .describe(
    'Valores dos campos da anotação tipada, por `key` (veja get_specialization). `null` limpa. ' +
      'Campo `table`: a lista de linhas, que substitui a tabela (`{"_id": "…"}` mantém uma linha existente; `"_as": "$linha"` dá um apelido à linha). ' +
      'Campo `ref`: `{"annotation": <anotação>, "entry": <chave ou id do par>}` (par de anotação livre), ' +
      '`{"annotation": <anotação>, "key": <campo table>, "row": <id, apelido ou índice da linha>}` ou `{"annotation": <anotação>, "key": <campo>}`. ' +
      'Campo `codeRef` (onde a instância foi implementada): a lista COMPLETA de entradas `{"platform": "<id da plataforma>", "path": "<arquivo relativo à raiz do repositório, com />", "symbol": "<opcional>", "line": <opcional, inteiro ≥ 1>}` ' +
      '(`"_id"` mantém uma entrada existente, com as propriedades omitidas como estão; entrada sem `_id` é nova; uma lista vazia ou `null` limpa). ' +
      'Para acrescentar uma entrada, envie TODAS as existentes (com o `_id` de `codeRefs` em get_annotation, que não filtra por plataforma) mais a nova: as que faltarem na lista são removidas (o resumo do plano mostra `+N, -N entrada(s)`).',
  );

const owner = item('Anotação dona (mesma marcação, outra camada)')
  .nullable()
  .optional()
  .describe(
    'Anotação dona (vínculo, ex: o onClick de um Button): referência, id ou apelido; `null` remove o vínculo.',
  );

export const operationSchema = z.discriminatedUnion('op', [
  // Repositórios por plataforma
  z.object({
    op: z.literal('set_platform_repo'),
    platform: z
      .string()
      .describe(
        'Id de uma plataforma declarada pelas especializações aplicadas (veja `platforms` em get_project).',
      ),
    urlTemplate: z
      .string()
      .nullable()
      .optional()
      .describe(
        'URL de um arquivo no repositório, com `{path}` e, opcional, `{line}` (ex: `https://github.com/org/app/blob/main/{path}#L{line}`). `null` ou vazio remove; omitido mantém.',
      ),
    localPath: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Raiz do repositório da plataforma, relativa à pasta do projeto (ex: `../../..`). `null` ou vazio remove; omitido mantém. Sem `urlTemplate` nem `localPath`, a configuração é removida.',
      ),
  }),
  z.object({
    op: z.literal('remove_platform_repo'),
    platform: z.string().describe('Plataforma cuja configuração de repositório sai.'),
  }),
  // Camadas
  z.object({
    op: z.literal('create_layer'),
    as: alias,
    name: z.string(),
    color: z
      .string()
      .optional()
      .describe('#RRGGBB; padrão: a próxima cor livre da paleta.'),
  }),
  z.object({
    op: z.literal('update_layer'),
    layer,
    name: z.string().optional().describe('Só camadas livres podem ser renomeadas.'),
    color: z.string().optional().describe('#RRGGBB'),
  }),
  z.object({
    op: z.literal('move_layer'),
    layer,
    index: int.min(0).describe('Nova posição (0 = primeira).'),
  }),
  z.object({
    op: z.literal('delete_layer'),
    layer: layer.describe(
      'Camada livre a excluir (com as anotações dela e as vinculadas a elas).',
    ),
  }),
  // Especializações
  z.object({
    op: z.literal('apply_specialization'),
    file: z
      .string()
      .describe(
        'Arquivo da especialização (JSON) dentro das raízes; a cópia vai para specs/.',
      ),
  }),
  z.object({
    op: z.literal('update_specialization'),
    file: z.string().describe('Versão nova (maior) de uma especialização já aplicada.'),
  }),
  z.object({
    op: z.literal('remove_specialization'),
    specId: z.string(),
    mode: z
      .enum(['delete', 'convert'])
      .describe(
        '`delete` apaga as camadas e anotações dela; `convert` as transforma em livres.',
      ),
  }),
  // Imagens
  z.object({
    op: z.literal('add_image'),
    as: alias,
    ...imageSource,
    name: z.string().optional().describe('Nome de exibição (padrão: o do arquivo).'),
    source: externalSource.optional(),
    center: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe(
        'Ponto do canvas perto do qual a imagem fica (padrão: à direita das outras).',
      ),
  }),
  z.object({
    op: z.literal('update_image'),
    image: item('Imagem'),
    name: name.optional(),
    source: externalSource.optional(),
    x: z.number().optional().describe('Posição no canvas (unidades do canvas).'),
    y: z.number().optional(),
    scale: z
      .number()
      .optional()
      .describe('Unidades do canvas por pixel da imagem (tamanho exibido).'),
    markingColor: z
      .string()
      .nullable()
      .optional()
      .describe('Cor da borda das marcações (#RRGGBB) ou `null` (cor do tema).'),
    locked: z.boolean().optional().describe('Trancar ou destrancar a imagem.'),
    markingsLocked: z
      .boolean()
      .optional()
      .describe('Trancar (ou destrancar) todas as marcações da imagem.'),
  }),
  z.object({
    op: z.literal('replace_image'),
    image: item('Imagem'),
    ...imageSource,
    source: externalSource
      .optional()
      .describe('Nova origem da imagem; omitida, a origem atual é mantida.'),
    confirmAspectChange: z
      .boolean()
      .optional()
      .describe(
        'Necessário se a proporção mudar: as marcações são reescaladas e ficam "a revisar".',
      ),
  }),
  z.object({ op: z.literal('delete_image'), image: item('Imagem') }),
  // Marcações
  z.object({
    op: z.literal('create_marking'),
    as: alias,
    image: item('Imagem'),
    rect,
    name: name.optional(),
    source: externalSource.optional(),
    parent: item('Marcação pai')
      .nullable()
      .optional()
      .describe(
        'Pai: referência, id ou apelido; `null` = primeiro nível. Omitido: a marcação mais interna que contém o retângulo, como na app.',
      ),
  }),
  z.object({
    op: z.literal('update_marking'),
    marking: item('Marcação'),
    name: name.optional(),
    source: externalSource.optional(),
    rect: rect
      .optional()
      .describe('Novo retângulo (as filhas não se movem e precisam continuar dentro).'),
    move: z
      .object({ dx: int, dy: int })
      .optional()
      .describe('Desloca a marcação com as filhas (em pixels da imagem).'),
    parent: item('Marcação pai')
      .nullable()
      .optional()
      .describe('Novo pai (precisa conter o retângulo) ou `null` (primeiro nível).'),
    locked: z.boolean().optional(),
    confirmReview: z
      .boolean()
      .optional()
      .describe('`true` confirma a posição de uma marcação "a revisar".'),
  }),
  z.object({ op: z.literal('delete_marking'), marking: item('Marcação') }),
  // Anotações
  z.object({
    op: z.literal('create_annotation'),
    as: alias,
    marking: item('Marcação'),
    type: z
      .string()
      .optional()
      .describe(
        'Tipo da anotação tipada: `specId/typeId`, `typeId` ou o nome do tipo. Omitido: anotação livre (pares chave-valor).',
      ),
    layer: layer
      .optional()
      .describe(
        'Camada. Obrigatória na anotação livre; na tipada, padrão: a camada do tipo.',
      ),
    name: name.optional(),
    entries: entries.optional(),
    values: values.optional(),
    owner,
    inherit: z
      .boolean()
      .optional()
      .describe('`true`: a anotação vale também para as marcações descendentes.'),
  }),
  z.object({
    op: z.literal('update_annotation'),
    annotation: item('Anotação'),
    name: name.optional(),
    entries: entries.optional(),
    values: values
      .optional()
      .describe('Só os campos informados mudam (veja `values` em create_annotation).'),
    owner,
    inherit: z.boolean().optional(),
  }),
  z.object({
    op: z.literal('delete_annotation'),
    annotation: item('Anotação').describe(
      'Anotação a excluir (com as vinculadas a ela).',
    ),
  }),
]);

export type Operation = z.infer<typeof operationSchema>;
export type OperationName = Operation['op'];
