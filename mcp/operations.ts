import { z } from 'zod';
import { ANCHOR_ALIGNS, ANCHOR_SIDES, READING_DIRECTIONS } from '../src/model';
import { MAX_BASE64_TEXT } from './image/formats';

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
  .describe(
    'Retângulo em pixels inteiros do container (com arquivo: da imagem original, com a orientação EXIF).',
  );

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
    .max(MAX_BASE64_TEXT)
    .optional()
    .describe(
      'Conteúdo da imagem em base64 (aceita o prefixo `data:image/…;base64,`), até 16 MB de imagem; maiores, use `file`.',
    ),
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
      '`{"annotation": <anotação>, "key": <campo table>, "row": <id, apelido ou índice da linha>}` ou `{"annotation": <anotação>, "key": <campo>}` ou só `{"annotation": <anotação>}` (a anotação inteira; o campo precisa de `accepts.annotations`). ' +
      'Uma chave que não é campo do tipo falha com `unknown-field`.',
  );

const owner = item(
  'Anotação dona (mesma marcação; outra camada, ou a mesma na tipada cujo tipo aceita)',
)
  .nullable()
  .optional()
  .describe(
    'Anotação dona (vínculo, ex: o onClick de um Button): referência, id ou apelido; `null` remove o vínculo.',
  );

const arrowStyle = z.enum(['straight', 'curve', 'elbow']);

// A rota da seta (`points`) nunca é escrita pelo servidor: o campo existe só para a operação
// recusá-lo com um erro claro (sem ele o zod o descartaria em silêncio).
const noPoints = z
  .unknown()
  .optional()
  .describe('Não use: a rota é da pessoa (recusado com `invalid-arguments`).');

/**
 * A âncora de uma marcação (schema v20): `to` é a marcação-alvo (referência, id ou apelido); `side`,
 * `align` e `offset` ausentes valem os padrões do componente (`anchor` na raiz dele; sem eles, `top`,
 * `center` e 0).
 */
const anchorShape = z
  .object({
    to: item('Marcação-alvo da âncora (do mesmo espaço)'),
    side: z
      .enum(ANCHOR_SIDES)
      .optional()
      .describe(
        'Lado do alvo em que a marcação fica: `top`, `bottom`, `start` ou `end` (os dois últimos seguem a direção de leitura: em `rtl`, `start` é o lado direito). Ausente: o `anchor.side` do componente, senão `top`.',
      ),
    align: z
      .enum(ANCHOR_ALIGNS)
      .optional()
      .describe(
        'Alinhamento ao longo desse lado: `start`, `center` ou `end`. Ausente: o `anchor.align` do componente, senão `center`.',
      ),
    offset: z
      .object({ main: z.number().finite(), cross: z.number().finite() })
      .optional()
      .describe(
        'Deslocamento em pixels do container (no canvas, unidades do canvas): `main` é a distância da borda do alvo (negativo sobrepõe) e `cross` anda ao longo do lado. Ausente: o `anchor.offset` do componente (em unidades × `density`), senão 0.',
      ),
  })
  .describe(
    'Âncora: a marcação fica encostada em outra do mesmo espaço (`to`). Ela só liga as duas (o desenho do componente lê o lado e a posição do alvo por `$anchor.*`); `snap_to_anchor` encosta de fato. Mover o alvo leva a marcação ancorada junto; redimensionar o alvo não.',
  );

const drawingModeField = z
  .string()
  .nullable()
  .optional()
  .describe(
    'Modo do desenho (`[a-z0-9][a-z0-9-]*`, ex: `dark`): escolhe os valores dos `tokens` das especializações. `null` volta a seguir o do projeto; ausente não muda.',
  );

/** `ltr`/`rtl`, `null` (remove) ou ausente (não muda): o campo comum do container e do projeto. */
const readingDirectionField = z.enum(READING_DIRECTIONS).nullable().optional();

const directionField = readingDirectionField.describe(
  '`direction`: direção de leitura que fixa o container (`ltr`, `rtl`; `null` segue o projeto; ausente não muda). Em `rtl` as fileiras, as grades e as posições `start`/`end` do componente espelham.',
);

const densityField = z
  .number()
  .nullable()
  .optional()
  .describe(
    'Densidade: quantos pixels da imagem vale uma unidade do componente (dp, pt, px a 1x), de 0,5 a 8; 3 para uma captura 1080 px de um celular de 360 dp (largura da imagem ÷ largura do tamanho pronto). `size` e `minSize` do componente são em unidades e o `rect` em pixels (`rect` = unidades × `density`). `null` volta a 1 (em `update_container`); ausente não muda.',
  );

/** Campos de `update_container` (e da antiga `update_image`). */
const updateContainerFields = {
  name: name.optional(),
  source: externalSource.optional(),
  x: z.number().optional().describe('Posição no canvas (unidades do canvas).'),
  y: z.number().optional(),
  scale: z
    .number()
    .optional()
    .describe('Unidades do canvas por pixel do container (tamanho exibido).'),
  markingColor: z
    .string()
    .nullable()
    .optional()
    .describe('Cor da borda das marcações (#RRGGBB) ou `null` (cor do tema).'),
  locked: z.boolean().optional().describe('Trancar ou destrancar o container.'),
  drawingMode: drawingModeField,
  direction: directionField,
  density: densityField,
  markingsLocked: z
    .boolean()
    .optional()
    .describe('Trancar (ou destrancar) todas as marcações do container.'),
  background: z
    .string()
    .optional()
    .describe(
      'Só em container sem arquivo (fundo liso): nova cor de fundo `#RRGGBB`. Num container com arquivo falha com `container-has-file`.',
    ),
  width: int
    .min(1)
    .max(20000)
    .optional()
    .describe(
      'Só em container sem arquivo (fundo liso): nova largura em pixels (as marcações precisam continuar dentro). Num container com arquivo falha com `container-has-file`.',
    ),
  height: int
    .min(1)
    .max(20000)
    .optional()
    .describe(
      'Só em container sem arquivo (fundo liso): nova altura em pixels (as marcações precisam continuar dentro). Num container com arquivo falha com `container-has-file`.',
    ),
};

/** Campos de `replace_container` (e da antiga `replace_image`): o novo arquivo de imagem. */
const replaceContainerFields = {
  ...imageSource,
  source: externalSource
    .optional()
    .describe('Nova origem do container; omitida, a origem atual é mantida.'),
  confirmAspectChange: z
    .boolean()
    .optional()
    .describe(
      'Necessário se a proporção mudar: as marcações são reescaladas e ficam "a revisar".',
    ),
};

export const operationSchema = z.discriminatedUnion('op', [
  // Projeto
  z.object({
    op: z.literal('update_project'),
    drawingMode: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Modo do desenho do projeto (`[a-z0-9][a-z0-9-]*`, ex: `dark`): escolhe os valores dos `tokens` das especializações (não é o tema claro/escuro da app). `null` remove (volta ao primeiro modo de cada especialização); ausente não muda.',
      ),
    direction: readingDirectionField.describe(
      'Direção de leitura do projeto (`ltr`, `rtl`): em `rtl` as fileiras, as grades, as posições `start`/`end` e os ícones `mirror` dos componentes espelham, nos containers que não fixam a sua. `null` remove (volta a `ltr`); ausente não muda.',
    ),
  }),
  // Repositórios por plataforma
  z.object({
    op: z.literal('set_platform_repo'),
    platform: z
      .string()
      .describe(
        'Id de uma plataforma declarada pelas especializações aplicadas (veja `platforms` em get_project).',
      ),
    localPath: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Raiz do clone local do repositório da plataforma, relativa à pasta do projeto (ex: `../../..`). `null` ou vazio remove a configuração. O endereço do repositório vem da especialização (`platforms[].repo`), não do projeto: `urlTemplate` aqui falha com `unknown-field`.',
      ),
    urlTemplate: z.unknown().optional().describe('Não existe mais: veja `localPath`.'),
  }),
  z.object({
    op: z.literal('remove_platform_repo'),
    platform: z.string().describe('Plataforma cuja configuração de repositório sai.'),
  }),
  // Repositórios de documentos (clone local, no molde dos de plataforma)
  z.object({
    op: z.literal('set_doc_repo'),
    repo: z
      .string()
      .describe(
        'Id de um repositório de documentos (`docRepos`) declarado pelas especializações aplicadas (veja `docRepos` em get_project).',
      ),
    localPath: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Raiz do clone local do repositório de documentos, relativa à pasta do projeto (ex: `../../design-docs`). É por ela que get_component lê o `.md` do tipo. `null` ou vazio remove a configuração. O endereço do repositório vem da especialização (`docRepos[].url`), não do projeto.',
      ),
  }),
  z.object({
    op: z.literal('remove_doc_repo'),
    repo: z.string().describe('Repositório de documentos cujo clone local sai.'),
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
  // Containers
  z.object({
    op: z.literal('add_container'),
    as: alias,
    ...imageSource,
    drawingMode: drawingModeField,
    direction: directionField,
    density: densityField,
    name: z
      .string()
      .optional()
      .describe(
        'Nome do container (padrão: o nome do arquivo, ou sem nome num container só com fundo; a app mostra "Container").',
      ),
    width: int
      .min(1)
      .max(20000)
      .optional()
      .describe(
        'Container só com fundo: largura em pixels (1 a 20000; ex: 390 num celular). Com `file`/`base64` a largura vem do arquivo e `width` não vale.',
      ),
    height: int
      .min(1)
      .max(20000)
      .optional()
      .describe(
        'Container só com fundo: altura em pixels (1 a 20000; ex: 844 num celular). Com `file`/`base64` a altura vem do arquivo e `height` não vale.',
      ),
    background: z
      .string()
      .optional()
      .describe(
        'Container só com fundo: cor `#RRGGBB`. Com `file`/`base64` o container tem a imagem como conteúdo e `background` não vale.',
      ),
    source: externalSource.optional(),
    center: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe(
        'Ponto do canvas perto do qual o container fica (padrão: à direita dos outros containers).',
      ),
    beside: item('Container de referência')
      .optional()
      .describe(
        'Container de referência (referência, id ou apelido `$nome`): o novo nasce à direita dele, com o topo alinhado e a MESMA escala (use para o conteúdo fora da imagem, ao lado da tela). Lugar ocupado: vai para o espaço livre mais próximo. Não combine com `center`.',
      ),
  }),
  z.object({
    // Antiga, aceita com aviso: use `add_container` com `file`.
    op: z.literal('add_image'),
    as: alias,
    ...imageSource,
    name: z
      .string()
      .optional()
      .describe('Antiga: use `add_container` com `file`. Nome (padrão: o do arquivo).'),
    source: externalSource.optional(),
    center: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe(
        'Ponto do canvas perto do qual o container fica (padrão: à direita dos outros).',
      ),
  }),
  z.object({
    // Antiga, aceita com aviso: use `add_container` com `width`, `height` e `background`.
    op: z.literal('add_blank_image'),
    as: alias,
    name: z
      .string()
      .optional()
      .describe('Antiga: use `add_container`. Nome do container (padrão: sem nome).'),
    width: int
      .min(1)
      .max(20000)
      .describe('Largura do container em pixels (1 a 20000; ex: 390 num celular).'),
    height: int
      .min(1)
      .max(20000)
      .describe('Altura do container em pixels (1 a 20000; ex: 844 num celular).'),
    background: z.string().describe('Cor de fundo `#RRGGBB`.'),
    source: externalSource.optional(),
    center: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe(
        'Ponto do canvas perto do qual o container fica (padrão: à direita dos outros).',
      ),
  }),
  z.object({
    op: z.literal('update_container'),
    container: item('Container'),
    ...updateContainerFields,
  }),
  z.object({
    // Antiga, aceita com aviso: use `update_container` (o argumento `image` virou `container`).
    op: z.literal('update_image'),
    image: item('Container'),
    ...updateContainerFields,
  }),
  z.object({
    op: z.literal('replace_container'),
    container: item('Container'),
    ...replaceContainerFields,
  }),
  z.object({
    // Antiga, aceita com aviso: use `replace_container`.
    op: z.literal('replace_image'),
    image: item('Container'),
    ...replaceContainerFields,
  }),
  z.object({ op: z.literal('delete_container'), container: item('Container') }),
  // Antiga, aceita com aviso: use `delete_container`.
  z.object({ op: z.literal('delete_image'), image: item('Container') }),
  // Marcações
  z.object({
    op: z.literal('create_marking'),
    as: alias,
    annotationAs: alias.describe(
      'Apelido temporário (ex: "$botao") para citar a anotação criada por `annotation` nas operações seguintes.',
    ),
    container: item('Container')
      .optional()
      .describe(
        'Container onde a marcação nasce. Omitido (e sem a antiga `image`): marcação do canvas, com `rect` em unidades do canvas.',
      ),
    image: item('Container')
      .optional()
      .describe('Antiga: use `container`. Aceita com aviso.'),
    near: item('Container ou marcação')
      .optional()
      .describe(
        'Só para um tipo de anotação flutuante: a marcação nasce num lugar livre na margem deste container ou desta marcação, empilhada de cima para baixo (referência, id ou apelido). Posiciona e o `rect`, se vier, dá só o tamanho (x e y são ignorados). Para um tipo ou marcação não flutuante, é ignorado com aviso.',
      ),
    inside: item('Componente com slot')
      .optional()
      .describe(
        'Posiciona a filha no slot deste componente, depois da última filha (referência, id ou apelido de uma marcação do lote ou do projeto); o pai continua vindo da geometria. Exige `annotation` de um tipo com componente e um alvo que desenhe componente com slot (`invalid-parent` se não desenha ou se `container` for outro). Com `rect`, o `rect` dá só o tamanho (x e y são ignorados). Slot cheio: a filha fica presa ao componente, com aviso `ignored-argument`. Não vale com `near`.',
      ),
    rect: rect
      .optional()
      .describe(
        'Retângulo em pixels do container (sem `container`: unidades do canvas, podendo ser negativo). Obrigatório, a menos que `annotation` seja de um tipo com componente: então, omitido, a marcação nasce no tamanho inicial do componente (no centro do container; dentro do slot com `inside`). O mínimo de cada lado é 8 px numa marcação comum e 1 px numa marcação com anotação de um tipo com componente (se o componente declara `minSize`, esse mínimo vale); abaixo dele falha com `rect-too-small`.',
      ),
    name: name.optional(),
    source: externalSource.optional(),
    anchor: anchorShape
      .optional()
      .describe(
        'Âncora (veja `anchor` em `update_marking`). Com `annotation` de um tipo com componente e sem `rect`, a marcação nasce no tamanho medido já encostada na âncora (o lado, o alinhamento e o deslocamento que `anchor` não diz vêm do `anchor` da raiz do componente); com `rect`, o `rect` manda e a âncora só é gravada. Não vale com `near` nem `inside`.',
      ),
    parent: item('Marcação pai')
      .nullable()
      .optional()
      .describe(
        'Antigo: aceito com aviso e ignorado. O pai sai da geometria (a marcação mais interna que contém o retângulo).',
      ),
    annotation: z
      .object({
        type: z
          .string()
          .describe(
            'Tipo da anotação tipada: `specId/typeId`, `typeId` ou o nome do tipo.',
          ),
        layer: layer
          .optional()
          .describe(
            'Camada (precisa ser a do tipo; padrão: a camada do tipo na especialização).',
          ),
        name: name.optional(),
        values: values.optional(),
      })
      .optional()
      .describe(
        'Cria, junto da marcação, uma anotação tipada (uma instância do tipo). Quando o tipo tem componente, os campos começam com o `preview` do componente (como a paleta da app) e `values` sobrescreve só os campos informados, também depois de `apply_specialization` ou `update_specialization` no mesmo lote (o lote já vê os componentes da versão nova). Se o tipo declara componente e o lote não o acha, o passo avisa (`ignored-argument`) que a anotação nasceu sem o preview e sem o tamanho mínimo.',
      ),
  }),
  z.object({
    op: z.literal('import_measured'),
    container: item('Container').describe(
      'Container onde as marcações nascem (referência, id ou apelido `$nome`). Os retângulos da árvore são em pixels dele, depois de `scale` e `offset`.',
    ),
    system: z
      .string()
      .describe(
        'O `system` de uma origem `kind: "measured"` declarada por uma especialização aplicada (`origins`): as `sources` dos tipos com esse `system` dizem como casar cada nó e cada campo.',
      ),
    tree: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'A árvore medida inline: `{ type, id?, classes?, rect: { x, y, width, height }, props?, children? }` (nó raiz). Use `tree` OU `file`, nunca os dois.',
      ),
    file: z
      .string()
      .optional()
      .describe(
        'Um `.json` com a árvore medida dentro das raízes (relativo à pasta do projeto ou a uma raiz, ou absoluto). Use `file` OU `tree`.',
      ),
    offset: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe(
        'Deslocamento em px do container, somado depois da escala (padrão 0, 0).',
      ),
    scale: z
      .number()
      .positive()
      .optional()
      .describe(
        'Multiplicador dos retângulos medidos (padrão 1; 2 para uma captura em 2×).',
      ),
  }),
  z.object({
    op: z.literal('wrap_items'),
    as: alias,
    items: z
      .array(item('Marcação ou container'))
      .min(1)
      .describe(
        'Marcações e containers a envolver (referência, id ou apelido; o mesmo Envolver da app). Notas (flutuantes) e setas são ignoradas com aviso; sem nada que entre, a operação falha com `invalid-parent`.',
      ),
    name: name
      .optional()
      .describe(
        'Nome da marcação nova (como em `create_marking`); sem nome, ela nasce sem.',
      ),
    source: externalSource.optional(),
  }),
  z.object({
    op: z.literal('move_marking'),
    marking: item('Marcação'),
    index: int
      .min(0)
      .describe(
        'Nova posição entre as irmãs (mesmo container e mesmo pai): 0 = a primeira, desenhada por baixo; a última fica por cima. As irmãs são as do estado do lote naquele ponto, depois das operações anteriores (um `update_marking` antes pode tirar ou pôr irmãs); se a marcação já está nessa posição, nada muda e o resumo diz isso.',
      ),
  }),
  z.object({
    op: z.literal('fit_marking'),
    marking: item('Marcação').describe(
      'A marcação de um componente cujo `sizing` depende do conteúdo (`hug` ou expressão num eixo; veja `get_component`) e que não tem marcações no slot. Cada eixo assim vira o tamanho medido com os valores da anotação nesse ponto do lote (inteiro para cima, entre o `minSize` e os limites da raiz; o eixo `fill`, o ausente e o esticado pelo `stretch` do pai não mudam; nunca passa da imagem); o canto de cima à esquerda fica. Chame-a depois de mudar um valor que altera o conteúdo (texto, campo que liga ou desliga uma parte), no mesmo lote ou na mesma proposta: editar o valor sozinho não muda o retângulo. O resumo diz o retângulo antes e depois (ou que nada mudou). Falha com `not-fittable` (nenhum eixo depende do conteúdo) e `locked` (geometria trancada que mudaria).',
    ),
  }),
  z.object({
    op: z.literal('snap_to_anchor'),
    marking: item('Marcação').describe(
      'Uma marcação com `anchor` (veja `update_marking`). Ela é encostada na âncora: o retângulo sai do `side`, do `align` e do `offset` (o que a âncora não diz vem do `anchor` da raiz do componente; o `offset` dele é em unidades × `density`), com o tamanho que a marcação já tem (use `fit_marking` antes para o tamanho acompanhar o conteúdo). Preso dentro do container, com aviso quando foi preciso. Chame-a depois de mudar o tamanho da marcação ou de ancorá-la: nada se encosta sozinho (só mover a âncora leva as ancoradas junto). O resumo diz o retângulo antes e depois (ou que nada mudou). Falha com `not-anchored` (sem âncora) e `locked` (geometria trancada que mudaria).',
    ),
  }),
  z.object({
    op: z.literal('update_marking'),
    marking: item('Marcação'),
    name: name.optional(),
    source: externalSource.optional(),
    anchor: anchorShape
      .nullable()
      .optional()
      .describe(
        'Grava a âncora (sem mover a marcação: use `snap_to_anchor` para encostar), ou `null` para tirá-la. Ausente não muda. Erros: `anchor-missing` (o alvo não existe), `anchor-self`, `anchor-other-space` (o alvo precisa estar no mesmo container, ou os dois no canvas) e `anchor-cycle`. Num `rect`/`container` do mesmo passo, a âncora vale depois dele. Excluir o alvo tira a âncora das ancoradas.',
      ),
    rect: rect
      .optional()
      .describe(
        'Novo retângulo (as filhas não se movem e precisam continuar dentro; o mínimo de cada lado é 8 px, ou 1 px numa marcação que desenha um componente, que também respeita o `minSize` dele). Sem `container`, vale no espaço atual da marcação; com `container`, nos pixels do container novo (no canvas, em unidades do canvas).',
      ),
    container: item('Container novo')
      .nullable()
      .optional()
      .describe(
        'Troca o espaço da marcação: o container novo, ou `null` para o canvas. Exige `rect` nos pixels dele (no canvas, em unidades do canvas). O pai e o espaço das demais saem da geometria (um retângulo do canvas que cabe inteiro num container passa a ser dele). A marcação flutuante só vive no canvas. Geometria trancada falha com `locked`.',
      ),
    floating: z
      .boolean()
      .optional()
      .describe(
        '`true` torna a marcação flutuante (comentário sobre o canvas): ela sai do container e passa ao canvas, com o `rect` convertido. `false` deixa de ser flutuante (o container que a contém inteira a recebe). Exige a geometria destrancada.',
      ),
    move: z
      .object({ dx: int, dy: int })
      .optional()
      .describe('Desloca a marcação com as filhas (em pixels do container).'),
    parent: item('Marcação pai')
      .nullable()
      .optional()
      .describe(
        'Antigo: aceito com aviso e ignorado. O pai sai da geometria (mova ou redimensione para mudá-lo).',
      ),
    locked: z.boolean().optional(),
    confirmReview: z
      .boolean()
      .optional()
      .describe('`true` confirma a posição de uma marcação "a revisar".'),
  }),
  z.object({ op: z.literal('delete_marking'), marking: item('Marcação') }),
  // Setas (ME4): uma marcação que aponta; a rota (`points`) é sempre da pessoa.
  z.object({
    op: z.literal('create_arrow'),
    as: alias,
    from: item('Marcação de origem'),
    to: item('Marcação de destino'),
    style: arrowStyle
      .optional()
      .describe('Traço: `straight`, `curve` (padrão) ou `elbow`.'),
    name: name.optional(),
    points: noPoints,
  }),
  z.object({
    op: z.literal('update_arrow'),
    arrow: item('Seta'),
    name: name.optional(),
    style: arrowStyle.optional(),
    locked: z.boolean().optional(),
    points: noPoints,
  }),
  z.object({ op: z.literal('delete_arrow'), arrow: item('Seta') }),
  // Anotações
  z.object({
    op: z.literal('create_annotation'),
    as: alias,
    marking: item('Marcação'),
    type: z
      .string()
      .optional()
      .describe(
        'Tipo da anotação tipada: `specId/typeId`, `typeId` ou o nome do tipo. Omitido: anotação livre (pares chave-valor). Numa marcação que já existe os campos começam só com os `default` do tipo (sem o `preview` do componente, que é texto de exemplo); `values` sobrescreve os informados.',
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
    role: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Papel (id de um `childRoles` do tipo do dono) em que a anotação se liga ao `owner`. Exige `owner` (`role-without-owner`) e um papel que o dono ofereça (`unknown-role`). Sem `role` num dono que tem papéis o lote vale e o plano devolve `missing-role` em `issues`. Trocar o `owner` (ou `owner: null`) limpa o papel que o novo dono não oferece, e o plano avisa com `role-cleared` em `warnings` e `; papel "…" limpo` no resumo. Veja `childRoles` em get_specialization.',
      ),
    inherit: z
      .boolean()
      .optional()
      .describe(
        'Antigo, ignorado (a herança de anotações saiu do formato na v13): aceito com aviso por uma versão.',
      ),
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
    role: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Troca o papel no dono (`null` limpa). Confere contra o dono já com o `owner` novo, se vier no mesmo passo. Sem `role` no passo, a troca de `owner` que limpa o papel avisa com `role-cleared` em `warnings`. Veja `role` em create_annotation.',
      ),
    inherit: z
      .boolean()
      .optional()
      .describe('Antigo, ignorado (veja create_annotation).'),
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
