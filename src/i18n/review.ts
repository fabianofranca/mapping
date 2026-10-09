// Textos da revisão de propostas (etapa 4, fase 4.4), separados dos dicionários gerais
// para não espalhar centenas de chaves; entram neles por `...reviewPtBR` / `...reviewEnUS`.
// As mesmas regras valem: mesmas chaves e os mesmos {parâmetros} nos dois idiomas.

export const reviewPtBR = {
  // Decisão de três estados
  'review.state.undecided': 'Sem decisão',
  'review.state.accepted': 'Aceita',
  'review.state.rejected': 'Rejeitada',
  'review.state.partial': 'Parcial',
  'review.state.partialCounts':
    'Parcial: {accepted} aceitas, {rejected} rejeitadas, {undecided} sem decisão',
  // Tipo de mudança
  'review.kind.created': 'Criada',
  'review.kind.removed': 'Removida',
  'review.kind.moved': 'Movida',
  'review.kind.changed': 'Alterada',
  'review.kind.replaced': 'Imagem trocada',
  // Decidir
  'review.accept': 'Aceitar',
  'review.reject': 'Rejeitar',
  'review.decide.accept': 'Aceitar {name}',
  'review.decide.reject': 'Rejeitar {name}',
  'review.decide.accepted': 'Aceita: {name}',
  'review.decide.rejected': 'Rejeitada: {name}',
  'review.decide.acceptConflict': 'Aceitar {name}: sobrescreve o valor atual',
  'review.decide.rejectConflict': 'Rejeitar {name}: mantém o valor atual',
} as const;

export const reviewEnUS: Record<keyof typeof reviewPtBR, string> = {
  'review.state.undecided': 'Undecided',
  'review.state.accepted': 'Accepted',
  'review.state.rejected': 'Rejected',
  'review.state.partial': 'Partial',
  'review.state.partialCounts':
    'Partial: {accepted} accepted, {rejected} rejected, {undecided} undecided',
  'review.kind.created': 'Created',
  'review.kind.removed': 'Removed',
  'review.kind.moved': 'Moved',
  'review.kind.changed': 'Changed',
  'review.kind.replaced': 'Image replaced',
  'review.accept': 'Accept',
  'review.reject': 'Reject',
  'review.decide.accept': 'Accept {name}',
  'review.decide.reject': 'Reject {name}',
  'review.decide.accepted': 'Accepted: {name}',
  'review.decide.rejected': 'Rejected: {name}',
  'review.decide.acceptConflict': 'Accept {name}: overwrites the current value',
  'review.decide.rejectConflict': 'Reject {name}: keeps the current value',
};
