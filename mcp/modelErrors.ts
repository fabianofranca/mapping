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
  'invalid-dimensions': 'dimensões da imagem inválidas',
  'invalid-placement': 'posição ou escala da imagem inválida (escala > 0)',
  'image-overlap': 'a imagem ficaria sobre outra imagem no canvas',
  'duplicate-file': 'já existe uma imagem com esse arquivo',
  'aspect-change-not-confirmed':
    'a nova imagem tem outra proporção: informe confirmAspectChange: true (as marcações serão reescaladas e ficarão "a revisar")',
  'image-too-small': 'a nova imagem é pequena demais para as marcações',
  'rect-not-integer': 'o retângulo precisa ter valores inteiros (pixels da imagem)',
  'rect-too-small': 'retângulo menor que o tamanho mínimo de uma marcação',
  'rect-out-of-image': 'o retângulo sai da imagem',
  'rect-outside-parent': 'o retângulo sai da marcação pai',
  'rect-excludes-children': 'o retângulo deixaria filhas de fora',
  'invalid-parent':
    'pai inválido: precisa ser da mesma imagem, conter o retângulo e não ser descendente',
  'invalid-annotation-parent':
    'dona inválida: precisa ser da mesma marcação, de outra camada, sem ciclo e (na tipada) de um tipo que aceite este vínculo',
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
  'owner-required': 'este tipo exige uma anotação dona (`owner`)',
  'unknown-field': 'campo inexistente no tipo',
  'invalid-value': 'valor incompatível com o tipo do campo',
  'unknown-option': 'valor fora das opções do campo',
  'self-ref': 'a anotação não pode referenciar a si mesma',
  'ref-not-accepted': 'o campo não aceita esse alvo de referência',
  'spec-already-applied': 'a especialização já está aplicada',
  'spec-not-newer': 'a versão não é maior que a aplicada',
  'unknown-platform': 'plataforma não declarada pelas especializações aplicadas',
  'platform-not-allowed':
    'plataforma não permitida no campo codeRef: precisa estar nas plataformas da especialização do tipo (e no `platforms` do campo, se houver)',
  'invalid-path':
    'caminho inválido: relativo à raiz do repositório, com `/`, sem `.`, `..` nem segmentos vazios',
  'invalid-url-template':
    'urlTemplate inválido: precisa começar com http:// ou https:// e conter {path} ({line} é opcional)',
  'invalid-local-path':
    'localPath inválido: caminho relativo à pasta do projeto (ex: ../..), não absoluto',
  'invalid-source': 'source inválido: informe system e id não vazios (url é opcional)',
};

/** Erro de regra do modelo numa tool de leitura → `ToolError` com a explicação e o detalhe. */
export function modelToolError(error: ModelError): ToolError {
  const [, detail] = error.message.split(': ');
  return new ToolError(error.code, MODEL_ERROR_MESSAGES[error.code], {
    ...(detail ? { detail } : {}),
  });
}
