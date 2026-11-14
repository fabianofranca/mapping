# Annotation class

Annotation class: declares an annotation (@Audited, @SerialName).

## When to use

- Declaring your own annotations to mark classes, functions or properties.

## What not to confuse

- **Declaring × applying:** this marking declares the annotation; applying it to a declaration is that declaration's `annotations` field.

## Main fields

- **Name** (required): simple name of the declaration; it carries the `kotlin-type` tag, so supertypes and property types of other markings can point to it.
- **Package**, **Visibility**, **Annotations** and **Description** (KDoc).
- The properties are the constructor parameters, always `val`.
- No functions, supertypes or body; `targets` and `retention` describe the scope.

## Nested declaration

A nested declaration (nested, inner or companion) is linked to its outer declaration through the **Declared in** field (`outer`, tag `kotlin-type`). The agent reads the link in `refs` (on the nested one) and `backlinks` (on the outer one). Drawing the marking inside the outer one is only an optional visual tidy-up: the canvas membership (`parent`/`members`) does not define the nesting in the code.

## Type suggestions

When typing in the **Type** of properties, the basic Kotlin types appear (`String`, `Int`, `Boolean`, `List`, `Map`...). In the **Type** of properties and supertypes the mapped declarations appear too (with their kind next to them), and choosing one also fills in the **Mapped type**. It is only a help: any text is still valid, such as `String?` or `List<Address>`.

## References to properties

- Other annotations point to a line of `properties` through a `ref` field that accepts `data-field` or `kotlin-property`.
- This declaration has no functions; only the properties (parameters) are targets.

## Example

```kotlin
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Audited(
    val action: String = "",
    val level: Int = 1,
)
```
