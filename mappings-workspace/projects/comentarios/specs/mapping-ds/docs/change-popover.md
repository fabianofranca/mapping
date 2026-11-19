# ChangePopover

Popover de um marcador (ChangeMark), nos Detalhes da revisão (`src/ui/review/ChangePopover.tsx` dentro do `Popover` da app; `.popover` de `src/theme/editor.css` e `.change-popover*` de `src/theme/review.css`): 320 px (`size-change-popover`), respiro 8, fundo `color-surface`, borda `color-border`, raio 6 e a sombra de popup; o conteúdo é uma coluna com 8 px entre os blocos.

**Filhos esperados:**
- a cabeça: ChangeKind (`sm`), o título "Campo · tipo" (Texto `t-heading`) e as Flag (Conflito, Envolvida, junto, Aplicada, a comparação com a nova);
- os valores: DiffValue (ou a lista das linhas de uma tabela);
- a ajuda do efeito (Texto `t-small`);
- o rodapé, com a divisória de cima (Caixa `lados` `cima`): DecisionMark + "Decisão: …" (Texto `t-small`), os Button `sm` Aceitar (`accept`) e Rejeitar (`reject`), o IconButton `note` e a NoteField.

A seta de rolagem e o limite abaixo da ReviewBar são comportamento, não desenho.
