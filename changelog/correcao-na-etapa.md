# Defeitos corrigidos na própria etapa — [Não lançado] (épico `epic/correcao-na-etapa`, parte PR #583, MCP 0.18.0, schema v14)

## Alterado

- Defeito achado durante a implementação de uma etapa (pela fase, pelo testador ou no fechamento) passa a ser corrigido na própria etapa, sem virar issue `bug`, quando não pede decisão do dono. Vira issue só o que pede decisão (produto, mudança de decisão, schema ou formato, correção do tamanho de uma etapa), o que é de perda de dados, integridade do `mapping.json` ou segurança (que chama o dono na hora) e o que aparece depois da fase de correção.
- A fase de correção abre também sem ❌, quando há defeito pendente das fases ou observação do relato que é defeito, e o reteste cobre os passos que as correções afetam.
