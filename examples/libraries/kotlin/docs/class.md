# Class

Classe Kotlin comum (class).

## Quando usar

- Serviços, repositórios, casos de uso, view models e implementações de interface.
- Tipos com identidade e comportamento; para dados puros prefira data class.

## O que não confundir

- **Class × data class:** a data class gera `equals`, `hashCode`, `copy` e `toString` a partir do construtor; a class comum não.
- **Class × object:** o object é instância única; a class se instancia quantas vezes for preciso.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc), **Parâmetros de tipo**.
- `modality` é `final` (padrão), `open` ou `abstract`.
- `inner` só faz sentido numa classe aninhada que usa a instância da externa.

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Aninhamento

Uma declaração aninhada é uma marcação desenhada **dentro** da marcação da declaração externa; o pertencimento vem da geometria (o agente lê `parent` e `members`), não de um campo.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function`.

## Exemplo

```kotlin
@Singleton
internal open class UserRepositoryImpl<T>(
    private val api: UserApi,
) : BaseRepo<User>(api), UserRepository {
    var cache: Map<String, User> = emptyMap()

    override suspend fun find(id: String): User? = cache[id]
}
```
