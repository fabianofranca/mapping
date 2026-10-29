# Data class

Data class: classe de dados com equals, hashCode, copy, toString e componentN gerados a partir das propriedades do construtor primário.

## Quando usar

- Modelos de domínio, DTOs, respostas de API e estado de UI.
- Propriedades do construtor primário definem a identidade (`equals`, `hashCode`, `copy`).

## O que não confundir

- **Data class × class:** só as propriedades declaradas no construtor entram em `equals`, `hashCode`, `copy` e `toString`.
- **Data class × value class:** a value class embrulha um único valor sem custo; a data class tem uma ou mais propriedades e é um objeto.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc), **Parâmetros de tipo**.
- Ao menos uma propriedade no construtor (`declaredIn` = construtor).
- Não pode ser `open`, `abstract`, `sealed` nem `inner`.

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
@Serializable
data class Usuario(
    val id: String,
    val email: String?,
    val enderecos: List<Endereco> = emptyList(),
) : Parcelable
```
