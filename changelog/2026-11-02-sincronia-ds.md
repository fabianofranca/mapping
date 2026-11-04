# Sincronia do design system — 2026-11-02 (épico `epic/sincronia-ds`, PR #287, MCP sem mudança, schema v13)

## Adicionado

- `docs/DESIGN-SYSTEM.md`: o registro vivo do design system do projeto (o artefato **Mapping** do Claude Design, curado à mão). Traz a URL, o mapa de cada componente, seção, token e ícone do DS para a origem no código, os gatilhos que obrigam a verificar o DS, as pendências abertas e o histórico de sincronização.

## Alterado

- Fluxo de trabalho: toda descrição de PR passa a declarar o **Impacto no DS**, e o fechamento de cada épico aplica as pendências acumuladas no design system. O job `epic` do CI exige que o PR do épico toque o `docs/DESIGN-SYSTEM.md`, como já exigia o `CHANGELOG.md`.
- O design system foi posto em dia com as entregas desde 2026-10-24: Proposto com componentes, Sugestões no campo de texto, Imagens remotas, Biblioteca Material 3 e o **Envolver** da Marcação pai.
