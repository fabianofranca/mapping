/*
 * Copyright 2022 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Trecho de compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Switch.kt
// from androidx (commit 5113b82a4ed6416d6344efa50e41db8cb65928ff): the signature and the KDoc of `Switch`
// (with the `thumbContent` slot) and the two overloads of `SwitchDefaults.colors`, without the bodies.
// Fixture of the tests of the `mapping-signature` extractor; it does not compile.

package androidx.compose.material3

/**
 * [Material Design switch](https://m3.material.io/components/switch)
 *
 * Switches toggle the state of a single item on or off.
 *
 * ![Switch
 * image](https://developer.android.com/images/reference/androidx/compose/material3/switch.png)
 *
 * @sample androidx.compose.material3.samples.SwitchSample
 *
 * Switch can be used with a custom icon via [thumbContent] parameter
 *
 * @sample androidx.compose.material3.samples.SwitchWithThumbIconSample
 * @param checked whether or not this switch is checked
 * @param onCheckedChange called when this switch is clicked. If `null`, then this switch will not
 *   be interactable, unless something else handles its input events and updates its state.
 * @param modifier the [Modifier] to be applied to this switch
 * @param thumbContent content that will be drawn inside the thumb, expected to measure
 *   [SwitchDefaults.IconSize]
 * @param enabled controls the enabled state of this switch. When `false`, this component will not
 *   respond to user input, and it will appear visually disabled and disabled to accessibility
 *   services.
 * @param colors [SwitchColors] that will be used to resolve the colors used for this switch in
 *   different states. See [SwitchDefaults.colors].
 * @param interactionSource an optional hoisted [MutableInteractionSource] for observing and
 *   emitting [Interaction]s for this switch. You can use this to change the switch's appearance or
 *   preview the switch in different states. Note that if `null` is provided, interactions will
 *   still happen internally.
 */
@Composable
@Suppress("ComposableLambdaParameterNaming", "ComposableLambdaParameterPosition")
fun Switch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    thumbContent: (@Composable () -> Unit)? = null,
    enabled: Boolean = true,
    colors: SwitchColors = SwitchDefaults.colors(),
    interactionSource: MutableInteractionSource? = null,
) {
    // corpo omitido neste trecho
}

/** Contains the default values used by [Switch] */
object SwitchDefaults {
    /**
     * Creates a [SwitchColors] that represents the different colors used in a [Switch] in different
     * states.
     */
    @Composable fun colors() = MaterialTheme.colorScheme.defaultSwitchColors

    /**
     * Creates a [SwitchColors] that represents the different colors used in a [Switch] in different
     * states.
     *
     * @param checkedThumbColor the color used for the thumb when enabled and checked
     * @param checkedTrackColor the color used for the track when enabled and checked
     * @param checkedBorderColor the color used for the border when enabled and checked
     * @param checkedIconColor the color used for the icon when enabled and checked
     * @param uncheckedThumbColor the color used for the thumb when enabled and unchecked
     * @param uncheckedTrackColor the color used for the track when enabled and unchecked
     * @param uncheckedBorderColor the color used for the border when enabled and unchecked
     * @param uncheckedIconColor the color used for the icon when enabled and unchecked
     * @param disabledCheckedThumbColor the color used for the thumb when disabled and checked
     * @param disabledCheckedTrackColor the color used for the track when disabled and checked
     * @param disabledCheckedBorderColor the color used for the border when disabled and checked
     * @param disabledCheckedIconColor the color used for the icon when disabled and checked
     * @param disabledUncheckedThumbColor the color used for the thumb when disabled and unchecked
     * @param disabledUncheckedTrackColor the color used for the track when disabled and unchecked
     * @param disabledUncheckedBorderColor the color used for the border when disabled and unchecked
     * @param disabledUncheckedIconColor the color used for the icon when disabled and unchecked
     */
    @Composable
    fun colors(
        checkedThumbColor: Color = SwitchTokens.SelectedHandleColor.value,
        checkedTrackColor: Color = SwitchTokens.SelectedTrackColor.value,
        checkedBorderColor: Color = Color.Transparent,
        checkedIconColor: Color = SwitchTokens.SelectedIconColor.value,
        uncheckedThumbColor: Color = SwitchTokens.UnselectedHandleColor.value,
        uncheckedTrackColor: Color = SwitchTokens.UnselectedTrackColor.value,
        uncheckedBorderColor: Color = SwitchTokens.UnselectedFocusTrackOutlineColor.value,
        uncheckedIconColor: Color = SwitchTokens.UnselectedIconColor.value,
        disabledCheckedThumbColor: Color =
            SwitchTokens.DisabledSelectedHandleColor.value
                .copy(alpha = SwitchTokens.DisabledSelectedHandleOpacity)
                .compositeOver(MaterialTheme.colorScheme.surface),
        disabledCheckedTrackColor: Color =
            SwitchTokens.DisabledSelectedTrackColor.value
                .copy(alpha = SwitchTokens.DisabledTrackOpacity)
                .compositeOver(MaterialTheme.colorScheme.surface),
        disabledCheckedBorderColor: Color = Color.Transparent,
        disabledCheckedIconColor: Color =
            SwitchTokens.DisabledSelectedIconColor.value
                .copy(alpha = SwitchTokens.DisabledSelectedIconOpacity)
                .compositeOver(MaterialTheme.colorScheme.surface),
        disabledUncheckedThumbColor: Color =
            SwitchTokens.DisabledUnselectedHandleColor.value
                .copy(alpha = SwitchTokens.DisabledUnselectedHandleOpacity)
                .compositeOver(MaterialTheme.colorScheme.surface),
        disabledUncheckedTrackColor: Color =
            SwitchTokens.DisabledUnselectedTrackColor.value
                .copy(alpha = SwitchTokens.DisabledTrackOpacity)
                .compositeOver(MaterialTheme.colorScheme.surface),
        disabledUncheckedBorderColor: Color =
            SwitchTokens.DisabledUnselectedTrackOutlineColor.value
                .copy(alpha = SwitchTokens.DisabledTrackOpacity)
                .compositeOver(MaterialTheme.colorScheme.surface),
        disabledUncheckedIconColor: Color =
            SwitchTokens.DisabledUnselectedIconColor.value
                .copy(alpha = SwitchTokens.DisabledUnselectedIconOpacity)
                .compositeOver(MaterialTheme.colorScheme.surface),
    ): SwitchColors =
        SwitchColors(/* argumentos omitidos neste trecho */)
}
