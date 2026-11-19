# UpdateImpact

O impacto de atualizar uma especialização aplicada (`src/ui/UpdateImpact.tsx`), dentro do diálogo **Atualizar "…"?** (arquivo único) ou **Pacote "…"** (atualização por pacote) do SpecsDialog.

É um **agrupador** (tipo estrutural, sem desenho): no app ele não tem caixa própria, são parágrafos e listas soltos no corpo do diálogo. A marcação envolve os filhos:

- *Da versão N para a M.* e as camadas criadas, liberadas ou *Nenhuma camada criada ou removida.* (Texto, parágrafo);
- **Passos da migração** (Texto `t-body-strong`) e, por passo, o rótulo (*Remover o campo titulo em tabela*), as contagens (Texto `t-small` `muted`, *5 anotação(ões), 5 valor(es)*) e até 5 perdas (Texto, com o marcador da lista como Texto);
- o total das perdas e as referências quebradas (`.notice-error`: Caixa `danger-bg` raio 8 e Texto `danger`);
- recusada: o aviso do que falta migrar, na mesma Caixa.

O resumo do pacote, a contagem de erros e avisos e o LibraryIssueList ficam fora dele (são do SpecsDialog).
