import type { ModelError, ModelErrorCode } from '../src/model';
import { ToolError } from './errors';

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
    'dona inválida: precisa ser da mesma marcação, de outra camada, sem ciclo e (na tipada) de um tipo que aceite este vínculo',
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
  'unknown-field': 'campo inexistente no tipo (veja os campos em get_specialization)',
  'invalid-value': 'valor incompatível com o tipo do campo',
  'unknown-option': 'valor fora das opções do campo',
  'self-ref': 'a anotação não pode referenciar a si mesma',
  'ref-not-accepted': 'o campo não aceita esse alvo de referência',
  'spec-already-applied': 'a especialização já está aplicada',
  'spec-not-newer': 'a versão não é maior que a aplicada',
  'spec-missing-migrations': 'a versão nova tem quebras sem migração declarada',
  'unknown-platform': 'plataforma não declarada pelas especializações aplicadas',
  'invalid-local-path':
    'localPath inválido: caminho relativo à pasta do projeto (ex: ../..), não absoluto',
  'invalid-source': 'source inválido: informe system e id não vazios (url é opcional)',
  'not-arrangeable':
    'a marcação não é um container com layout em linha ou coluna e filhas para arrumar',
};

/** Dica do próximo passo para os erros do modelo que a têm. */
export const MODEL_ERROR_HINTS: Readonly<Partial<Record<ModelErrorCode, string>>> = {
  'type-not-applicable':
    'escolha um tipo cujo `appliesTo` inclua este item (marcação ou seta) ou use uma anotação livre numa camada sem especialização',
};

/** Erro de regra do modelo numa tool de leitura → `ToolError` com a explicação e o detalhe. */
export function modelToolError(error: ModelError): ToolError {
  const [, detail] = error.message.split(': ');
  const hint = MODEL_ERROR_HINTS[error.code];
  return new ToolError(error.code, MODEL_ERROR_MESSAGES[error.code], {
    ...(detail ? { detail } : {}),
    ...(hint ? { hint } : {}),
  });
}
