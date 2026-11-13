# Fichas de assinatura escritas à mão (etapa #1079)

Fixtures dos testes do importador (`tests/model/signatures/`, `tests/mcp/planSignatureImport.test.ts`) e do roteiro "Importar a assinatura" do `docs/TESTING.md`. Sem dado pessoal; `source.extractor: "agent"` (escritas à mão, como se faz para fontes sem extrator).

- `button.compose.json`: um `Button` do Compose com `colors` (fábrica) e `contentPadding` (`PaddingValues`).
- `button.compose.changed.json`: a mesma ficha depois de uma mudança (sai `contentPadding`, entra `elevation`, o padrão de `enabled` vira `false`).
- `profile-card.swiftui.json`: uma view SwiftUI com rótulo externo (`badge`) e parâmetro posicional.
- `button.figma.json`: um componente do Figma (`Style` VARIANT, `Disabled` BOOLEAN, `Label` TEXT, `Icon` INSTANCE_SWAP).
- `swift/`: as views SwiftUI do extrator `swift` (`ProfileCard.swift`: `init` explícito com rótulos, `_`, enum, `@ViewBuilder`, `@State` e `@Environment`; `Tag.swift`: memberwise; `Chip.swift`: três `init`, um `deprecated`), com `ProfileCard.expected.json` e `Tag.expected.json` (a ficha esperada, `--ref fixture`). Sem dado pessoal.
- `figma/`: `button.nodes.json`, a resposta sintética de `GET /v1/files/:key/nodes` com o `COMPONENT_SET` `12:34` (`Style` VARIANT, `Disabled#1:2` BOOLEAN, `Label#1:3` TEXT, `Icon#1:4` INSTANCE_SWAP), e `button.expected.json`.
- `kotlin/`: as funções `@Composable` do extrator `kotlin` (`Button.kt`, `AppBar.kt`, `Switch.kt`).
- `library/lib.spec.json`: uma biblioteca de teste pequena (`formatVersion` 16) com `fieldModels.compose`, o tipo `surface` (cores), o `button` (campo `style`) e o `profile-card` (tipo novo).
