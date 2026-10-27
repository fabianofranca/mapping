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

## Aninhamento

Uma declaração aninhada é uma marcação desenhada **dentro** da marcação da declaração externa; o pertencimento vem da geometria (o agente lê `parent` e `members`), não de um campo.

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
