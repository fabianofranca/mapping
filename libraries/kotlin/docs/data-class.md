# Data class

Data class: data class with equals, hashCode, copy, toString and componentN generated from the properties of the primary constructor.

## When to use

- Domain models, DTOs, API responses and UI state.
- Properties of the primary constructor define the identity (`equals`, `hashCode`, `copy`).

## What not to confuse

- **Data class × class:** only the properties declared in the constructor take part in `equals`, `hashCode`, `copy` and `toString`.
- **Data class × value class:** the value class wraps a single value at no cost; the data class has one or more properties and is an object.

## Main fields

- **Name** (required): simple name of the declaration; it carries the `kotlin-type` tag, so supertypes and property types of other markings can point to it.
- **Package**, **Visibility**, **Annotations** and **Description** (KDoc), **Type parameters**.
- At least one property in the constructor (`declaredIn` = construtor).
- Cannot be `open`, `abstract`, `sealed` or `inner`.

## How a subtype is linked

Each line of `supertypes` holds the type as written in the code and, in **Mapped type** (`typeRef`), the mapped declaration with the `kotlin-type` tag. This is how a subtype is linked to the sealed class or interface: the subclasses are the declarations whose `supertypes` points to it.

## Nested declaration

A nested declaration (nested, inner or companion) is linked to its outer declaration through the **Declared in** field (`outer`, tag `kotlin-type`). The agent reads the link in `refs` (on the nested one) and `backlinks` (on the outer one). Drawing the marking inside the outer one is only an optional visual tidy-up: the canvas membership (`parent`/`members`) does not define the nesting in the code.

## Type suggestions

When typing in the **Type** of properties and the **Return type** of functions, the basic Kotlin types appear (`String`, `Int`, `Boolean`, `List`, `Map`...). In the **Type** of properties and supertypes the mapped declarations appear too (with their kind next to them), and choosing one also fills in the **Mapped type**. It is only a help: any text is still valid, such as `String?` or `List<Address>`.

## References to properties

- Other annotations point to a line of `properties` through a `ref` field that accepts `data-field` or `kotlin-property`.
- Functions (`functions`) carry the `kotlin-function` tag.

## Example

```kotlin
@Serializable
data class User(
    val id: String,
    val email: String?,
    val addresses: List<Address> = emptyList(),
) : Parcelable
```
