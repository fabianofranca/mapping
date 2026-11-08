# OtherChanges

As seções "Outras mudanças" e "Imagens" dos Detalhes da revisão (`src/ui/review/OtherChanges.tsx`: `OtherChangesSection`, `OtherChangeRow` e `ImagesSection`): o que não tem campo no painel normal (origem, trava, troca de imagem, posição da imagem, camadas, especializações e repositórios) e as imagens com mudanças. É **estrutural**: a seção recolhível (`.details-section`) não tem fundo nem borda.

**Filhos esperados:**
- a cabeça da seção: Ícone `chevronDown` (`muted`), o título (Texto `t-heading`) e a contagem (Texto `t-small` `muted`);
- uma linha por mudança (`.other-change-row`, 4 px entre elas): Caixa com borda `border`, raio `sm`, 28 px de altura mínima e respiro 2 × 6 (na mudança selecionada na janela Propostas, `fundo` `selection` e borda `accent`); dentro, o ChangeKind (`sm`), o título (Texto `t-body-strong`), o resumo (Texto `t-small` `muted`, com reticências) e o ChangeMark;
- na seção Imagens, cada linha leva o nome da imagem (Texto `t-body-strong`), as contagens (DecisionMark de 12 px + número) e o Button `sm` "Abrir".
