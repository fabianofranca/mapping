# Top app bar nasce com a altura do estilo — 2026-11-13 (épico `epic/top-app-bar-altura`, PR #1793, MCP 0.39.0, schema v19)

## Alterado

- Conferido: a Top app bar da Material 3 criada sem retângulo (Paleta, Catálogo e `create_marking` do MCP) já nasce com a altura do estilo (64 no `small`, 112 no `medium`, 152 no `large`), como a #898 entregou; a largura continua presa à área disponível (360 no container de celular). O Row e o botão criados logo abaixo dela não viram filhos dela. Testes novos guardam o comportamento (modelo, store e MCP) e o R9.4 do roteiro passa a dizer a Altura 64 e o "Pertence a" do Row.
- Corrigido no roteiro: o passo R9.22 do `docs/TESTING.md` agora descreve o que a app faz de fato, e o teste `tests/tooling/testingGuideR922.test.ts` o guarda.
