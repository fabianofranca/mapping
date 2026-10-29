# Value class

Value class (@JvmInline): embrulha um único valor com tipo próprio, sem custo de objeto em tempo de execução.

## Quando usar

- Ids e valores tipados (UserId, Email, Meters) que não devem se misturar com String ou Int.

## O que não confundir

- **Value class × data class:** a value class tem exatamente uma propriedade e some em tempo de execução; a data class é um objeto com várias.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc), **Parâmetros de tipo**.
- Exatamente uma propriedade (sempre `val`), no construtor.
- Leva `@JvmInline` e não herda classes.

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Declaração aninhada

Uma declaração aninhada (nested, inner ou companion) se liga à externa pelo campo **Declarada em** (`outer`, etiqueta `kotlin-type`). O agente lê a ligação em `refs` (na aninhada) e `backlinks` (na externa). Desenhar a marcação dentro da externa é só arrumação visual e opcional: o pertencimento do canvas (`parent`/`members`) não define o aninhamento no código.

## Sugestões de tipo

Ao digitar no **Tipo** das propriedades e o **Retorno** das funções, aparecem os tipos básicos do Kotlin (`String`, `Int`, `Boolean`, `List`, `Map`...). É só uma ajuda: qualquer texto continua valendo, como `String?` ou `List<Endereco>`.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function`.

## Exemplo

```kotlin
@JvmInline
value class UserId(val value: String) : Comparable<UserId> {
    override fun compareTo(other: UserId): Int = value.compareTo(other.value)
}
```
