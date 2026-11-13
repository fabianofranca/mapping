import type { ModelError, ModelErrorCode, ModelErrorData } from '../src/model';
import { ToolError } from './errors';
import type { Refs } from './items';

/**
 * O que cada erro de regra do `src/model/` quer dizer, para o agente corrigir a operação.
 * `Record` exaustivo: um código novo no modelo obriga a escrever a explicação aqui.
 */
export const MODEL_ERROR_MESSAGES: Readonly<Record<ModelErrorCode, string>> = {
  'not-found': 'item não encontrado',
  'invalid-name': 'nome vazio ou inválido',
  'invalid-color': 'cor inválida: use #RRGGBB',
  'invalid-index': 'posição fora da lista',
  'last-layer': 'o projeto precisa manter ao menos uma camada',
  'invalid-dimensions': 'dimensões do container inválidas (inteiros de 1 a 20000)',
  'invalid-placement': 'posição ou escala do container inválida (escala > 0)',
  'image-overlap': 'o container ficaria sobre outro container no canvas',
  'duplicate-file': 'já existe um container com esse arquivo de imagem',
  'container-without-file':
    'o container não tem arquivo de imagem (só cor de fundo): não há arquivo para trocar nem para devolver',
  'container-has-file':
    'o container tem arquivo de imagem: só o container sem arquivo (fundo liso) tem cor de fundo e tamanho editáveis',
  'container-density': 'a densidade do container precisa ser um número de 0,5 a 8',
  'aspect-change-not-confirmed':
    'a nova imagem do container tem outra proporção: informe confirmAspectChange: true (as marcações serão reescaladas e ficarão "a revisar")',
  'image-too-small': 'a nova imagem do container é pequena demais para as marcações',
  'rect-not-integer': 'o retângulo precisa ter valores inteiros (pixels do container)',
  'rect-too-small': 'retângulo menor que o tamanho mínimo de uma marcação',
  'rect-out-of-image': 'o retângulo sai do container',
  'rect-outside-parent': 'o retângulo sai da marcação pai',
  'invalid-space':
    'espaço inválido: só a marcação do canvas pode ser flutuante, e ela não tem container',
  'invalid-parent':
    'pai inválido: precisa ser do mesmo container, conter o retângulo e não ser descendente',
  'invalid-annotation-parent':
    'dona inválida: precisa ser da mesma marcação, sem ciclo e de outra camada ou, na tipada, de um tipo que aceite este vínculo, inclusive na mesma camada',
  'arrow-endpoint':
    'ponta de seta inválida: precisa ser uma marcação (nem outra seta, nem um container)',
  'arrow-self': 'a seta precisa ligar duas marcações diferentes',
  'invalid-arrow-route': 'rota da seta inválida: pontos com x e y finitos',
  'empty-key': 'par com chave vazia',
  'duplicate-key': 'chave repetida na anotação',
  'duplicate-id': 'id repetido',
  locked: 'item trancado: não pode ser movido, redimensionado, trocado nem excluído',
  'spec-layer':
    'camada de especialização: não pode ser renomeada nem excluída sozinha (remova a especialização)',
  'typed-layer': 'camada de especialização só aceita anotações tipadas',
  'typed-annotation': 'anotação tipada: use `values`, não `entries`',
  'not-typed': 'anotação livre: use `entries`, não `values`',
  'unknown-type': 'tipo de anotação inexistente nas especializações aplicadas',
  'type-not-in-layer': 'o tipo não pertence a esta camada',
  'type-not-applicable':
    'o tipo não se aplica a este item (veja `appliesTo` do tipo em get_specialization: marcação, seta ou ambos)',
  'owner-required': 'este tipo exige uma anotação dona (`owner`)',
  'unknown-role': 'o dono não oferece este papel',
  'role-without-owner': 'um papel exige uma anotação dona (`owner`)',
  'unknown-field': 'campo inexistente no tipo (veja os campos em get_specialization)',
  'invalid-value': 'valor incompatível com o tipo do campo',
  'unknown-option': 'valor fora das opções do campo',
  'self-ref': 'a anotação não pode referenciar a si mesma',
  'ref-not-accepted': 'o campo não aceita esse alvo de referência',
  'spec-already-applied': 'a especialização já está aplicada',
  'spec-not-newer': 'a versão não é maior que a aplicada',
  'spec-missing-migrations': 'a versão nova tem quebras sem migração declarada',
  'unknown-platform': 'plataforma não declarada pelas especializações aplicadas',
  'unknown-doc-repo':
    'repositório de documentos não declarado pelas especializações aplicadas',
  'invalid-local-path':
    'localPath inválido: caminho relativo à pasta do projeto (ex: ../..), não absoluto',
  'invalid-source': 'source inválido: informe system e id não vazios (url é opcional)',
  'not-arrangeable':
    'a marcação não é um container com layout em linha ou coluna e filhas para arrumar',
  'not-fittable':
    'a marcação não tem eixo que dependa do conteúdo (o sizing do componente precisa ser hug ou uma expressão), ou é um componente com filhas no slot',
  'anchor-missing': 'a âncora aponta para uma marcação que não existe',
  'anchor-self': 'a marcação não pode ser ancorada nela mesma',
  'anchor-cycle': 'a âncora fecharia um ciclo de âncoras',
  'anchor-other-space':
    'a âncora precisa ser do mesmo espaço: o mesmo container, ou as duas no canvas',
  'not-anchored': 'a marcação não tem âncora',
  'perspective-name-empty': 'o nome da perspectiva está vazio',
  'perspective-name-taken':
    'já existe uma perspectiva com esse nome (sem diferença de maiúsculas)',
  'not-root':
    'o item não é uma raiz: só container sem pai, marcação do canvas sem pai ou flutuante entra numa perspectiva',
};

/** Dica do próximo passo para os erros do modelo que a têm. */
export const MODEL_ERROR_HINTS: Readonly<Partial<Record<ModelErrorCode, string>>> = {
  'type-not-applicable':
    'escolha um tipo cujo `appliesTo` inclua este item (marcação ou seta) ou use uma anotação livre numa camada sem especialização',
  'rect-too-small':
    'aumente `width` e `height` do `rect` até pelo menos o mínimo (cada lado, em pixels do container; no canvas, em unidades do canvas)',
  'not-fittable':
    'só uma marcação de componente com `sizing` `hug` ou por expressão (veja `get_component`) e sem marcações no slot se ajusta ao conteúdo; as demais não precisam de `fit_marking`',
  'not-anchored':
    'a marcação precisa de uma âncora: grave `anchor` com `update_marking` (ou `create_marking`) antes de `snap_to_anchor`',
  'anchor-missing':
    '`anchor.to` precisa ser uma marcação que existe (referência, id ou apelido de uma marcação do lote)',
  'anchor-other-space':
    'a âncora e a marcação precisam estar no mesmo espaço (o mesmo container, ou as duas no canvas): mova uma delas antes, com `update_marking` e `container`',
  'anchor-cycle':
    'a âncora já depende desta marcação (direta ou indiretamente): ancore em outra marcação ou tire a âncora do outro lado com `anchor: null`',
  'container-density':
    'de 0,5 a 8; 3 para uma captura 1080 px de um celular de 360 dp (pixels da imagem por unidade do componente); `null` volta a 1',
  'image-overlap':
    'mude `x`, `y` ou `scale` do container (ou o tamanho dele) para não cobrir o outro, ou mova o outro container antes',
};

function isSize(value: unknown): value is { width: number; height: number } {
  if (typeof value !== 'object' || value === null) return false;
  const { width, height } = value as Record<string, unknown>;
  return typeof width === 'number' && typeof height === 'number';
}

/** `recebido 5×3 px; mínimo 8×8 px` a partir do `data` de um `rect-too-small`; `null` se faltar. */
export function rectTooSmallDetail(data: ModelErrorData | undefined): string | null {
  if (!data || !isSize(data.received) || !isSize(data.min)) return null;
  const { received, min } = data;
  const origin = data.source === 'component' ? ' (do componente)' : '';
  return `recebido ${received.width}×${received.height} px; mínimo ${min.width}×${min.height} px${origin}`;
}

/** Texto depois do primeiro `: ` da mensagem (`code: texto`); o texto pode ter `: ` dentro. */
function messageDetail(error: ModelError): string | undefined {
  const at = error.message.indexOf(': ');
  return at < 0 ? undefined : error.message.slice(at + 2);
}

/** O detalhe que o `data` de alguns erros do modelo dá (o resto usa o texto da mensagem). */
function specificDetail(error: ModelError, refs?: Refs): string | undefined {
  switch (error.code) {
    case 'rect-too-small':
      return rectTooSmallDetail(error.data) ?? undefined;
    case 'container-density': {
      const received = error.data?.density;
      return `recebido ${typeof received === 'number' ? received : '?'}; de 0,5 a 8`;
    }
    case 'image-overlap': {
      const id = error.data?.containerId;
      return typeof id === 'string'
        ? `sobrepõe o container ${refs ? refs.ref('i', id) : id}`
        : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Detalhe e dica de um erro do modelo. O `data` vira texto aqui (o modelo só guarda fatos); o id
 * do outro container vira referência quando há `refs`. Sem `data`, o detalhe é o texto da mensagem.
 */
export function describeModelError(
  error: ModelError,
  refs?: Refs,
): { detail?: string; hint?: string } {
  const hint = MODEL_ERROR_HINTS[error.code];
  let detail = specificDetail(error, refs);
  detail ??= messageDetail(error);
  return { ...(detail ? { detail } : {}), ...(hint ? { hint } : {}) };
}

/** Erro de regra do modelo numa tool de leitura → `ToolError` com a explicação e o detalhe. */
export function modelToolError(error: ModelError, refs?: Refs): ToolError {
  return new ToolError(error.code, MODEL_ERROR_MESSAGES[error.code], {
    ...describeModelError(error, refs),
  });
}
