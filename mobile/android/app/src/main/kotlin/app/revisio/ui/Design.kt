package app.revisio.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon as MaterialIcon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.revisio.engine.Rank
import kotlin.math.cos
import kotlin.math.sin

// ── the design language ─────────────────────────────────────────────────────
//
// Everything here is the mobile end of what `src/app/globals.css` defines, and
// the values are read from that file rather than restated: `Theme.kt` and
// `Theme.swift` are generated out of it by `scripts/native/make-theme.mjs`, and
// the icons out of the web's own lucide registry by `make-icons.mjs`.
//
// The one judgement call in the stylesheet is which half of the language owns
// what, and it is the same call here: **the monochrome duet owns the chrome**
// (surfaces, borders, the pill, the type ladder, the travelling nav indicator)
// and **the game colours own state** (streak, correct, gold). Green appears on
// exactly one control that is not navigation — the button that submits an answer
// inside a study session. Ink means "you are moving around the app"; green means
// "you are earning something", and the two never share a viewport.

private val LocalColors = compositionLocalOf { DarkColors }

/** The palette in scope. Screens read the accessors below, never the raw tables. */
val revisioColors: RevisioColors
    @Composable @ReadOnlyComposable get() = LocalColors.current

// Short names, because they appear in nearly every line of every screen.
val Ink: Color @Composable @ReadOnlyComposable get() = revisioColors.foreground
val Muted: Color @Composable @ReadOnlyComposable get() = revisioColors.mutedForeground
val Card1: Color @Composable @ReadOnlyComposable get() = revisioColors.card
val Card2: Color @Composable @ReadOnlyComposable get() = revisioColors.secondary
val Line: Color @Composable @ReadOnlyComposable get() = revisioColors.border
val LineStrong: Color @Composable @ReadOnlyComposable get() = revisioColors.borderStrong
val Good: Color @Composable @ReadOnlyComposable get() = revisioColors.good
val GoodSoft: Color @Composable @ReadOnlyComposable get() = revisioColors.goodSoft
val Warn: Color @Composable @ReadOnlyComposable get() = revisioColors.streak
val Gold: Color @Composable @ReadOnlyComposable get() = revisioColors.gold
val Info: Color @Composable @ReadOnlyComposable get() = revisioColors.info
val Bad: Color @Composable @ReadOnlyComposable get() = revisioColors.destructive
val Scrim: Color @Composable @ReadOnlyComposable get() = revisioColors.scrim

/** The flat slab behind a control. Ink on a light ground, white on a dark one. */
val Lip: Color @Composable @ReadOnlyComposable get() = revisioColors.lip

/** The softer slab a light pill sits on. */
val LipSoft: Color @Composable @ReadOnlyComposable get() = revisioColors.lipSoft

/** The one Curves the app animates on, from the stylesheet's easing tokens. */
object Motion {
    val snap
        @Composable get() = androidx.compose.animation.core.CubicBezierEasing(
            Easing.snap.x1, Easing.snap.y1, Easing.snap.x2, Easing.snap.y2,
        )
    val out
        @Composable get() = androidx.compose.animation.core.CubicBezierEasing(
            Easing.out.x1, Easing.out.y1, Easing.out.x2, Easing.out.y2,
        )
}

/**
 * Paints the design language.
 *
 * Light and dark are the same system flipped, and the phone follows the system
 * the way the website follows the OS preference — the same policy `lib/theme.ts`
 * resolves, so a learner who has dark set gets dark in both places.
 */
@Composable
fun RevisioTheme(content: @Composable () -> Unit) {
    val configuration = LocalConfiguration.current
    val dark = (configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
        android.content.res.Configuration.UI_MODE_NIGHT_YES
    val colors = if (dark) DarkColors else LightColors
    CompositionLocalProvider(LocalColors provides colors) {
        MaterialTheme(
            colorScheme = if (dark) {
                darkColorScheme(
                    primary = colors.foreground,
                    background = colors.background,
                    surface = colors.card,
                    onBackground = colors.foreground,
                    onSurface = colors.foreground,
                )
            } else {
                lightColorScheme(
                    primary = colors.foreground,
                    background = colors.background,
                    surface = colors.card,
                    onBackground = colors.foreground,
                    onSurface = colors.foreground,
                )
            },
            content = content,
        )
    }
}

// ── type ────────────────────────────────────────────────────────────────────

/** A generated token as a Compose style. Sizes are sp, tracking is em. */
fun TypeToken.style(color: Color = Color.Unspecified): TextStyle = TextStyle(
    fontSize = size.sp,
    fontWeight = weight,
    lineHeight = (size * lineHeight).sp,
    letterSpacing = (size * tracking).sp,
    color = color,
)

/** The label treatment: uppercased and letterspaced. Never for prose. */
@Composable
fun Label(text: String, token: TypeToken = Type.label, color: Color = Ink, modifier: Modifier = Modifier) {
    Text(token.text(text), style = token.style(color), modifier = modifier)
}

private fun TypeToken.text(value: String) = if (uppercase) value.uppercase() else value

/**
 * The rotating opener.
 *
 * The dashboard's headline is a `WordRotate` — one line at a time, replaced on a
 * 4.6s cadence with a short rise and fade. The lines are decided by the learner's
 * own state rather than picked at random, so the rotation is a status readout
 * that happens to be alive, not decoration.
 */
@Composable
fun RotatingHeadline(words: List<String>, modifier: Modifier = Modifier) {
    if (words.isEmpty()) return
    var index by remember { mutableIntStateOf(0) }
    androidx.compose.runtime.LaunchedEffect(words.size) {
        while (true) {
            kotlinx.coroutines.delay(4600)
            index = (index + 1) % words.size
        }
    }
    // Read outside `transitionSpec`: a transition lambda is not a composable
    // context, and the curves are composable reads off the generated tokens.
    val riseCurve = Motion.snap
    val fadeCurve = Motion.out
    androidx.compose.animation.AnimatedContent(
        targetState = index,
        transitionSpec = {
            (
                androidx.compose.animation.fadeIn(tween(420, easing = fadeCurve)) +
                    androidx.compose.animation.slideInVertically(tween(420, easing = riseCurve)) { it / 2 }
                ).togetherWith(
                androidx.compose.animation.fadeOut(tween(260)) +
                    androidx.compose.animation.slideOutVertically(tween(260)) { -it / 3 },
            )
        },
        label = "opener",
        modifier = modifier,
    ) { at ->
        Text(words[at % words.size], style = Type.display.style(Ink))
    }
}

// ── icons ───────────────────────────────────────────────────────────────────

/**
 * A glyph from the web's registry.
 *
 * The vectors come from `make-icons.mjs`, so this is the same drawing the
 * browser makes — an emoji would arrive with its own palette and become the
 * second accent the design language forbids, and would render differently on
 * every Android version.
 */
@Composable
fun Icon(
    vector: ImageVector,
    size: Int = 18,
    tint: Color = LocalContentColor.current,
    modifier: Modifier = Modifier,
) {
    androidx.compose.material3.Icon(
        imageVector = vector,
        contentDescription = null,
        tint = tint,
        modifier = modifier.size(size.dp),
    )
}

/** The heavier stroke the bottom bar switches to on the current destination. */
fun iconActive(vector: ImageVector): ImageVector = when (vector) {
    RevisioIcons.dashboard -> RevisioIconsActive.dashboard
    RevisioIcons.review -> RevisioIconsActive.review
    RevisioIcons.learn -> RevisioIconsActive.learn
    RevisioIcons.cram -> RevisioIconsActive.cram
    RevisioIcons.rank -> RevisioIconsActive.rank
    RevisioIcons.person -> RevisioIconsActive.person
    RevisioIcons.more -> RevisioIconsActive.more
    else -> vector
}

// ── the pill ────────────────────────────────────────────────────────────────
//
// The pill is the only interactive shape. Every button carries a flat bottom lip
// and compresses into it when pressed: that single detail is what turns a tap
// from a colour change into a physical act, and it is the whole elevation
// vocabulary. `Box`-plus-`offset` rather than `shadow`, because the lip is a
// solid slab of colour, not a blur.

enum class PillTone {
    /** Ink on canvas — navigation, chrome, "you are moving around the app". */
    Primary,

    /** Owl green. The only colour allowed to carry a primary action, and only
     *  inside a study session. */
    Good,

    /** White with a hairline. The second action in a pair. */
    Secondary,

    /** Canvas-soft, no border. */
    Subtle,

    /** Quiet: a hairline and muted ink, for a third-tier action. */
    Ghost,
}

@Composable
fun PillButton(
    text: String? = null,
    onClick: () -> Unit,
    tone: PillTone = PillTone.Primary,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    /** A count inside the pill, tinted against the face — the dashboard's due badge. */
    trailing: String? = null,
    large: Boolean = false,
    modifier: Modifier = Modifier,
    content: (@Composable () -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    val lipDistance = when (tone) {
        PillTone.Good -> Metrics.goodLipOffset
        PillTone.Primary, PillTone.Secondary -> Metrics.pillOffset
        PillTone.Subtle, PillTone.Ghost -> 0.dp
    }
    val lipColor = when (tone) {
        PillTone.Primary -> Lip
        PillTone.Good -> revisioColors.goodPressed
        PillTone.Secondary -> LipSoft
        else -> Color.Transparent
    }
    val face = when (tone) {
        PillTone.Primary -> Ink
        PillTone.Good -> Good
        PillTone.Secondary -> Card1
        PillTone.Subtle -> Card2
        PillTone.Ghost -> Color.Transparent
    }
    val ink = when (tone) {
        PillTone.Primary -> revisioColors.primaryForeground
        PillTone.Good -> Color.White
        PillTone.Secondary, PillTone.Subtle -> Ink
        PillTone.Ghost -> Muted
    }
    val minHeight = if (large) Metrics.buttonMinHeight + 8.dp else Metrics.buttonMinHeight
    val drop by animateDpAsState(
        targetValue = if (pressed && enabled) lipDistance else 0.dp,
        animationSpec = tween(90, easing = Motion.snap),
        label = "pillPress",
    )

    val shape = RoundedCornerShape(Radius.pill)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(minHeight + lipDistance),
        contentAlignment = Alignment.TopCenter,
    ) {
        // The slab. It stays put while the face drops into it.
        if (lipDistance > 0.dp) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(minHeight)
                    .offset(y = lipDistance)
                    .background(lipColor, shape),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(minHeight)
                .offset(y = drop)
                .clip(shape)
                .background(face)
                .then(
                    if (tone == PillTone.Secondary || tone == PillTone.Ghost) {
                        Modifier.border(1.dp, if (tone == PillTone.Ghost) Line else Line, shape)
                    } else {
                        Modifier
                    },
                )
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    enabled = enabled,
                    onClick = onClick,
                )
                .padding(horizontal = Metrics.buttonPadding),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (icon != null) Icon(icon, size = 18, tint = ink)
                if (content != null) {
                    content()
                } else if (text != null) {
                    Text(
                        text,
                        style = if (tone == PillTone.Good) Type.label.style(ink) else Type.strong.style(ink),
                        maxLines = 1,
                    )
                }
                if (trailing != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(Radius.pill))
                            .background(ink.copy(alpha = 0.2f))
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    ) {
                        Text(trailing, style = Type.fine.style(ink))
                    }
                }
            }
        }
        // The disabled state is an opacity change, exactly as in the stylesheet.
        if (!enabled) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(minHeight)
                    .clip(shape)
                    .background(revisioColors.background.copy(alpha = 0.55f)),
            )
        }
    }
}

/**
 * A segmented control.
 *
 * The selected segment carries its own fill rather than only recolouring its
 * label — that was a real bug on the web, where the active label rendered white
 * on white on any control without a shared-layout pill behind it. One owner for
 * the behaviour, so neither port can reintroduce it.
 */
@Composable
fun Segmented(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        options.forEach { (value, label) ->
            val active = value == selected
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(if (active) Ink else Color.Transparent)
                    .defaultMinSize(minHeight = 34.dp)
                    .clickable { if (!active) onSelect(value) }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = Type.captionS.style(if (active) revisioColors.background else Muted),
                    maxLines = 1,
                )
            }
        }
    }
}

/** A square pill for a single glyph — the address-book of secondary actions. */
@Composable
fun IconPill(
    icon: ImageVector,
    onClick: () -> Unit,
    tint: Color = Ink,
    background: Color = Card2,
    size: Dp = Metrics.iconMinHeight,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateDpAsState(
        targetValue = if (pressed) 2.dp else 0.dp,
        animationSpec = tween(90, easing = Motion.snap),
        label = "iconPill",
    )
    Box(
        modifier = modifier
            .size(size)
            .offset(y = scale)
            .clip(RoundedCornerShape(Radius.pill))
            .background(background)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, size = 18, tint = tint)
    }
}

// ── surfaces, chips, badges, meters ─────────────────────────────────────────

/** Level 0 is flat: a radius, a hairline, no shadow. */
@Composable
fun SurfaceCard(
    modifier: Modifier = Modifier,
    tone: Color? = null,
    border: Color? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.lg))
            .background(tone ?: Card1)
            .border(1.dp, border ?: Line, RoundedCornerShape(Radius.lg))
            .padding(20.dp),
    ) { content() }
}

/** Canvas-soft, no border — the quieter sibling. */
@Composable
fun SoftCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.lg))
            .background(Card2)
            .padding(20.dp),
    ) { content() }
}

@Composable
fun ChipPill(text: String, active: Boolean = false, icon: ImageVector? = null) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(Radius.pill))
            .background(if (active) Ink else Card1)
            .border(1.dp, if (active) Color.Transparent else Line, RoundedCornerShape(Radius.pill))
            .defaultMinSize(minHeight = Metrics.chipMinHeight)
            .padding(horizontal = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        val ink = if (active) revisioColors.background else Ink
        if (icon != null) Icon(icon, size = 13, tint = ink)
        Text(
            text,
            style = Type.fine.style(ink),
            maxLines = 1,
            modifier = Modifier.padding(vertical = 5.dp),
        )
    }
}

enum class BadgeTone { Streak, Gold, Good, Quiet }

@Composable
fun Badge(text: String, tone: BadgeTone = BadgeTone.Quiet, icon: ImageVector? = null) {
    val background = when (tone) {
        BadgeTone.Streak -> Warn
        BadgeTone.Gold -> Gold
        BadgeTone.Good -> Good
        BadgeTone.Quiet -> Card2
    }
    val ink = when (tone) {
        BadgeTone.Gold -> Color.Black
        BadgeTone.Quiet -> Muted
        else -> Color.White
    }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(Radius.pill))
            .background(background)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (icon != null) Icon(icon, size = 12, tint = ink)
        Label(text, token = Type.micro, color = ink)
    }
}

/** The 10px pill that carries division, streak and placement progress. */
@Composable
fun Meter(percent: Int, tint: Color? = null, height: Dp = Metrics.meterHeight) {
    val clamped = percent.coerceIn(0, 100)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(Radius.pill))
            .background(Card2),
    ) {
        if (clamped > 0) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(clamped / 100f)
                    .height(height)
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(tint ?: Good),
            )
        }
    }
}

/** The hairline. No shadow tiers: a line is the divider. */
@Composable
fun Hairline(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Line))
}

// ── the answer row ──────────────────────────────────────────────────────────
//
// Options are full-width pills with a 2px stroke and their own lip, so choosing
// one is the same physical gesture as pressing a button.

enum class OptionState { Idle, Selected, Correct, Wrong }

@Composable
fun OptionRow(
    text: String,
    state: OptionState = OptionState.Idle,
    enabled: Boolean = true,
    onClick: () -> Unit = {},
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val border = when (state) {
        OptionState.Idle -> Line
        OptionState.Selected -> Ink
        OptionState.Correct -> Good
        OptionState.Wrong -> Bad
    }
    val face = when (state) {
        OptionState.Correct -> Good.copy(alpha = 0.12f).compositeOver(Card1)
        OptionState.Wrong -> Bad.copy(alpha = 0.12f).compositeOver(Card1)
        else -> Card1
    }
    val ink = when (state) {
        OptionState.Correct -> revisioColors.goodPressed
        OptionState.Wrong -> Bad
        else -> Ink
    }
    val slab = when (state) {
        OptionState.Correct -> Good.copy(alpha = 0.55f)
        OptionState.Wrong -> Bad.copy(alpha = 0.55f)
        else -> LipSoft
    }
    val drop by animateDpAsState(
        targetValue = if (pressed && enabled) Metrics.pillOffset else 0.dp,
        animationSpec = tween(90, easing = Motion.snap),
        label = "optionPress",
    )
    val shape = RoundedCornerShape(Radius.md)
    Box(modifier = Modifier.fillMaxWidth().height(Metrics.optionMinHeight + Metrics.pillOffset)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(Metrics.optionMinHeight)
                .offset(y = Metrics.pillOffset)
                .background(slab, shape),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(Metrics.optionMinHeight)
                .offset(y = drop)
                .clip(shape)
                .background(face)
                .border(2.dp, border, shape)
                .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(text, style = Type.strong.style(ink))
        }
    }
}

/** Blends a translucent wash over a surface, the way `color-mix` does. */
private fun Color.compositeOver(base: Color): Color {
    val a = alpha
    return Color(
        red = red * a + base.red * (1 - a),
        green = green * a + base.green * (1 - a),
        blue = blue * a + base.blue * (1 - a),
        alpha = 1f,
    )
}

// ── the rank crest ──────────────────────────────────────────────────────────
//
// Rank is the loudest thing on the ladder and the system allows exactly one
// accent colour, so the tier is carried by **geometry** rather than by hue:
// chevrons in the shield (1 at Bronze, 5 at Legend), division pips beneath them,
// dial ticks around the ring, and the ring itself filling with progress. Colour
// does one job only — this crest is yours, or this is a rung you have not
// reached. That is what lets a ladder of them read side by side.

/** `crestFor` from `src/domain/ranked.ts`, so the count has one owner. */
private fun crestSpec(tier: String, division: Int): Triple<Int, Int, Int> {
    val order = listOf("bronze", "silver", "gold", "diamond", "legend")
    val index = order.indexOf(tier).coerceAtLeast(0)
    return Triple(1 + index, 6 + index * 3, 4 - division)
}

@Composable
fun RankCrest(
    rank: Rank,
    size: Int = 88,
    showProgress: Boolean = true,
    muted: Boolean = false,
) {
    val (ridges, segments, pips) = crestSpec(rank.tier, rank.division)
    // Resolved here, not inside the draw scope: a Compose colour accessor is a
    // composable read, and a `Canvas` lambda is not a composable context.
    val mark = if (muted) Muted.copy(alpha = 0.45f) else revisioColors.primary
    val tick = if (muted) Muted.copy(alpha = 0.3f) else Line
    val track = revisioColors.border.copy(alpha = 0.6f)
    val surface = Card1
    val outline = Ink

    Canvas(modifier = Modifier.size(size.dp)) {
        val unit = this.size.minDimension / 100f
        fun p(x: Float, y: Float) = Offset(x * unit, y * unit)

        // Dial ticks — the mechanism. Longer with every tier.
        for (i in 0 until segments) {
            val angle = (i.toFloat() / segments) * (2 * Math.PI).toFloat() - (Math.PI / 2).toFloat()
            drawLine(
                color = tick,
                start = Offset((50 + cos(angle) * 40) * unit, (50 + sin(angle) * 40) * unit),
                end = Offset((50 + cos(angle) * 44) * unit, (50 + sin(angle) * 44) * unit),
                strokeWidth = 1.5f * unit,
                cap = StrokeCap.Round,
            )
        }

        if (showProgress) {
            val radius = 45.5f * unit
            val stroke = 3f * unit
            drawArc(
                color = track,
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(center.x - radius, center.y - radius),
                size = Size(radius * 2, radius * 2),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
            val progress = rank.percent.coerceIn(0, 100)
            if (progress > 0) {
                drawArc(
                    color = mark,
                    startAngle = -90f,
                    sweepAngle = 360f * progress / 100f,
                    useCenter = false,
                    topLeft = Offset(center.x - radius, center.y - radius),
                    size = Size(radius * 2, radius * 2),
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }

        // The shield: ink outline, interior is the surface it sits on.
        val shield = Path().apply {
            moveTo(p(22f, 26f).x, p(22f, 26f).y)
            lineTo(p(78f, 26f).x, p(78f, 26f).y)
            lineTo(p(78f, 50f).x, p(78f, 50f).y)
            cubicTo(
                p(78f, 67f).x, p(78f, 67f).y,
                p(65f, 79f).x, p(65f, 79f).y,
                p(50f, 85f).x, p(50f, 85f).y,
            )
            cubicTo(
                p(35f, 79f).x, p(35f, 79f).y,
                p(22f, 67f).x, p(22f, 67f).y,
                p(22f, 50f).x, p(22f, 50f).y,
            )
            close()
        }
        drawPath(shield, color = surface)
        drawPath(shield, color = outline, style = Stroke(width = 2.5f * unit))

        // Chevrons — the tier count, military-stripe style.
        val gap = 7.5f
        val top = 48f - ((ridges - 1) * gap) / 2f
        for (i in 0 until ridges) {
            val y = top + i * gap
            val chevron = Path().apply {
                moveTo(p(37f, y).x, p(37f, y).y)
                lineTo(p(50f, y - 6f).x, p(50f, y - 6f).y)
                lineTo(p(63f, y).x, p(63f, y).y)
            }
            drawPath(
                chevron,
                color = mark,
                style = Stroke(width = 2.75f * unit, cap = StrokeCap.Round),
            )
        }

        // Division pips — III is one dot, I is three.
        for (i in 0 until pips) {
            val x = 50f + (i - (pips - 1) / 2f) * 5f
            drawCircle(color = mark, radius = 2.4f * unit, center = p(50f, 72f).copy(x = x * unit))
        }
    }
}

/** The compact form: a small crest with the rank's name beside it. */
@Composable
fun RankChip(rank: Rank, muted: Boolean = false, size: Int = 34) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        RankCrest(rank, size = size, showProgress = false, muted = muted)
        Text(
            rank.label,
            style = Type.captionS.style(if (muted) Muted else Ink),
        )
    }
}

// ── the companion ───────────────────────────────────────────────────────────
//
// A companion needs a body, so it has one: a round presence whose face is the
// learner's own rank crest — the thing speaking is visibly the thing they are
// building. The line it says is decided server-side by `companionFor`; this only
// draws it, so the phone and the web cannot read the same numbers differently.

@Composable
fun Companion(
    rank: Rank,
    line: String,
    action: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(Radius.pill))
                .background(Card2)
                .border(1.dp, Line, RoundedCornerShape(Radius.pill)),
            contentAlignment = Alignment.Center,
        ) {
            RankCrest(rank, size = 44, showProgress = false)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(line, style = Type.strong.style(Ink))
            if (action != null && onAction != null) {
                Spacer(Modifier.height(6.dp))
                Text(
                    action,
                    style = Type.fine.style(Ink),
                    textAlign = TextAlign.Start,
                    modifier = Modifier.clickable(onClick = onAction),
                )
            }
        }
    }
}

@Composable
fun VerticalGap(height: Int) = Spacer(Modifier.height(height.dp))

@Composable
fun HorizontalGap(width: Int) = Spacer(Modifier.width(width.dp))
