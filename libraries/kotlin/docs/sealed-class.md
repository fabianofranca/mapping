# Sealed class

Sealed class: hierarquia fechada e abstrata; os subtipos diretos são conhecidos em tempo de compilação, o que permite when exaustivo.

## Quando usar

- Resultados com formas diferentes (sucesso, erro, carregando) e hierarquias fechadas com estado.
- Quando os subtipos precisam de construtor ou propriedades próprias.

## O que não confundir

- **Sealed × enum:** o enum tem instâncias fixas e iguais em forma; a sealed tem subtipos com dados próprios.
- **Sealed class × sealed interface:** use a interface quando os subtipos não compartilham estado ou precisam de outra superclasse.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc), **Parâmetros de tipo**.
- É abstrata; o construtor é protected ou private.
- Os subtipos são as declarações cujo `supertypes` aponta para ela (coluna `typeRef`).

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Declaração aninhada

Uma declaração aninhada (nested, inner ou companion) se liga à externa pelo campo **Declarada em** (`outer`, etiqueta `kotlin-type`). O agente lê a ligação em `refs` (na aninhada) e `backlinks` (na externa). Desenhar a marcação dentro da externa é só arrumação visual e opcional: o pertencimento do canvas (`parent`/`members`) não define o aninhamento no código.

## Sugestões de tipo

Ao digitar no **Tipo** das propriedades e o **Retorno** das funções, aparecem os tipos básicos do Kotlin (`String`, `Int`, `Boolean`, `List`, `Map`...). No **Tipo** das propriedades e dos supertipos aparecem também as declarações mapeadas (com o tipo delas ao lado), e escolher uma preenche junto o **Tipo mapeado**. É só uma ajuda: qualquer texto continua valendo, como `String?` ou `List<Endereco>`.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function`.

## Exemplo

```kotlin
sealed class Resultado<out T> {
    val timestamp: Long = System.currentTimeMillis()

    data class Sucesso<T>(val valor: T) : Resultado<T>()
    data class Falha(val erro: Throwable) : Resultado<Nothing>()
}
```
