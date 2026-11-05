# Foco que não se perde e nomes acessíveis estáveis — [Não lançado] (épico `epic/foco-e-nomes`, PR #535, MCP 0.16.0 sem mudança, schema v13)

## Corrigido

- Legenda das marcas da revisão: `Esc` com o foco nela a fecha, o X se chama "Fechar legenda" e, ao fechar (pelo X ou por `Esc`), o foco volta ao botão **Legenda das marcas**, em vez de se perder.
- Sair da revisão: pelo botão ou pelo diálogo "Sair da revisão?" (**Sair mesmo assim**), o foco vai ao **Revisar** ou **Continuar** da proposta na janela Propostas, ou ao canvas se a janela estiver fechada.
- Voltar do Catálogo da biblioteca para a tela inicial (por Enter ou por clique): o foco vai ao **Abrir biblioteca**, e não mais ao fundo da página.
- Botão **Lista**: o nome e a dica são sempre "Lista"; o estado (aberta ou fechada) fica só no `aria-pressed`. Antes a dica trocava entre "Mostrar a lista" e "Esconder a lista".
- Detalhes não fecha mais ao estreitar a janela de 1280 para 900 px: as janelas laterais encolhem, mas continuam abertas. Só abrir a app já numa janela abaixo de 1200 px começa com Detalhes recolhido.
- Menu ⋮ das linhas: abre no primeiro clique mesmo quando a linha está fora da vista e o clique faz a página rolar.
