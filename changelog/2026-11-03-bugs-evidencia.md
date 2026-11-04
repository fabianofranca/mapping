# Rótulos em inglês, bug e evidência visual — 2026-11-03 (épico `epic/bugs-evidencia`, PR #382, MCP 0.13.0, schema v13)

## Alterado

- Os rótulos do ciclo passam a ter nomes em inglês: `pronta` → `ready`, `em-andamento` → `in-progress`, `fase` → `step`. As issues concluídas são as fechadas com `in-progress`.
- Defeito passa a ser uma issue com o rótulo `bug`, em vez de `roadmap`. O `bug` é tipo: acompanha a issue até ela fechar, também quando ela vira `pronta` e `em-andamento`.
- A captura que mostra o defeito aparece no corpo da issue como imagem, guardada no branch `evidencias`; o relato do agente testador mostra as capturas dos ❌ do mesmo jeito.
