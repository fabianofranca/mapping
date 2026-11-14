/*
 * Copyright 2021 The Android Open Source Project
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

// Trecho de compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt
// from androidx (commit 5113b82a4ed6416d6344efa50e41db8cb65928ff): the three overloads of `TopAppBar`
// (the first `@Deprecated(level = HIDDEN)`, the third with `subtitle`), without the bodies. Fixture of the
// tests of the `mapping-signature` extractor; it does not compile.

package androidx.compose.material3

/**
 * [Material Design small top app bar](https://m3.material.io/components/top-app-bar/overview)
 *
 * Top app bars display information and actions at the top of a screen.
 *
 * This small TopAppBar has slots for a title, navigation icon, and actions.
 *
 * ![Small top app bar
 * image](https://developer.android.com/images/reference/androidx/compose/material3/small-top-app-bar.png)
 *
 * A simple top app bar looks like:
 *
 * @sample androidx.compose.material3.samples.SimpleTopAppBar A top app bar that uses a
 *
 * A simple sample with an [AppBarRow], that varies the number of actions shown.
 *
 * @sample androidx.compose.material3.samples.SimpleTopAppBarWithAdaptiveActions
 *
 *   [scrollBehavior] to customize its nested scrolling behavior when working in conjunction with a
 *   scrolling content looks like:
 *
 * @sample androidx.compose.material3.samples.PinnedTopAppBar
 * @param title the title to be displayed in the top app bar
 * @param modifier the [Modifier] to be applied to this top app bar
 * @param navigationIcon the navigation icon displayed at the start of the top app bar. This should
 *   typically be an [IconButton] or [IconToggleButton].
 * @param actions the actions displayed at the end of the top app bar. This should typically be
 *   [IconButton]s. The default layout here is a [Row], so icons inside will be placed horizontally.
 * @param windowInsets a window insets that app bar will respect.
 * @param colors [TopAppBarColors] that will be used to resolve the colors used for this top app bar
 *   in different states. See [TopAppBarDefaults.topAppBarColors].
 * @param scrollBehavior a [TopAppBarScrollBehavior] which holds various offset values that will be
 *   applied by this top app bar to set up its height and colors. A scroll behavior is designed to
 *   work in conjunction with a scrolled content to change the top app bar appearance as the content
 *   scrolls. See [TopAppBarScrollBehavior.nestedScrollConnection].
 */
@Deprecated(
    message = "Deprecated in favor of TopAppBar with expandedHeight parameter",
    level = DeprecationLevel.HIDDEN,
)
@ExperimentalMaterial3Api
@Composable
fun TopAppBar(
    title: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
    windowInsets: WindowInsets = TopAppBarDefaults.windowInsets,
    colors: TopAppBarColors = TopAppBarDefaults.topAppBarColors(),
    scrollBehavior: TopAppBarScrollBehavior? = null,
) =
    SingleRowTopAppBar(/* corpo omitido neste trecho */)

/**
 * [Material Design small top app bar](https://m3.material.io/components/top-app-bar/overview)
 *
 * Top app bars display information and actions at the top of a screen.
 *
 * This small TopAppBar has slots for a title, navigation icon, and actions.
 *
 * ![Small top app bar
 * image](https://developer.android.com/images/reference/androidx/compose/material3/small-top-app-bar.png)
 *
 * A simple top app bar looks like:
 *
 * @sample androidx.compose.material3.samples.SimpleTopAppBar A top app bar that uses a
 *   [scrollBehavior] to customize its nested scrolling behavior when working in conjunction with a
 *   scrolling content looks like:
 * @sample androidx.compose.material3.samples.PinnedTopAppBar
 * @param title the title to be displayed in the top app bar
 * @param modifier the [Modifier] to be applied to this top app bar
 * @param navigationIcon the navigation icon displayed at the start of the top app bar. This should
 *   typically be an [IconButton] or [IconToggleButton].
 * @param actions the actions displayed at the end of the top app bar. This should typically be
 *   [IconButton]s. The default layout here is a [Row], so icons inside will be placed horizontally.
 * @param expandedHeight this app bar's height. When a specified [scrollBehavior] causes the app bar
 *   to collapse or expand, this value will represent the maximum height that the bar will be
 *   allowed to expand. This value must be specified and finite, otherwise it will be ignored and
 *   replaced with [TopAppBarDefaults.TopAppBarExpandedHeight].
 * @param windowInsets a window insets that app bar will respect.
 * @param colors [TopAppBarColors] that will be used to resolve the colors used for this top app bar
 *   in different states. See [TopAppBarDefaults.topAppBarColors].
 * @param scrollBehavior a [TopAppBarScrollBehavior] which holds various offset values that will be
 *   applied by this top app bar to set up its height and colors. A scroll behavior is designed to
 *   work in conjunction with a scrolled content to change the top app bar appearance as the content
 *   scrolls. See [TopAppBarScrollBehavior.nestedScrollConnection].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopAppBar(
    title: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
    expandedHeight: Dp = TopAppBarDefaults.TopAppBarExpandedHeight,
    windowInsets: WindowInsets = TopAppBarDefaults.windowInsets,
    colors: TopAppBarColors = TopAppBarDefaults.topAppBarColors(),
    scrollBehavior: TopAppBarScrollBehavior? = null,
) =
    SingleRowTopAppBar(/* corpo omitido neste trecho */)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TopAppBar(
    title: @Composable () -> Unit,
    subtitle: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
    titleHorizontalAlignment: Alignment.Horizontal = Alignment.Start,
    expandedHeight: Dp = TopAppBarDefaults.TopAppBarExpandedHeight,
    windowInsets: WindowInsets = TopAppBarDefaults.windowInsets,
    colors: TopAppBarColors = TopAppBarDefaults.topAppBarColors(),
    scrollBehavior: TopAppBarScrollBehavior? = null,
) =
    SingleRowTopAppBar(/* corpo omitido neste trecho */)
