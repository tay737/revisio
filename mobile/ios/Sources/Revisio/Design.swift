import RevisioEngine
import SwiftUI
#if canImport(UIKit)
import UIKit
#else
import AppKit
#endif

// ── the design language ─────────────────────────────────────────────────────
//
// Everything here is the mobile end of what `src/app/globals.css` defines, and
// the values are read from that file rather than restated: `Theme.swift` and the
// Android side's `Theme.kt` are both generated out of it by
// `scripts/native/make-theme.mjs`, and the icons out of the web's own lucide
// registry by `make-icons.mjs`.
//
// The one judgement call in the stylesheet is which half of the language owns
// what, and it is the same call here: **the monochrome duet owns the chrome**
// (surfaces, borders, the pill, the type ladder, the travelling nav indicator)
// and **the game colours own state** (streak, correct, gold). Green appears on
// exactly one control that is not navigation — the button that submits an answer
// inside a study session, and the button that starts one. Ink means "you are
// moving around the app"; green means "you are earning something".

private struct RevisioColorsKey: EnvironmentKey {
    static let defaultValue = RevisioColors.light
}

extension EnvironmentValues {
    /// The palette in scope. Screens read this, never the raw tables.
    var revisio: RevisioColors {
        get { self[RevisioColorsKey.self] }
        set { self[RevisioColorsKey.self] = newValue }
    }
}

/// Paints the design language.
///
/// Light and dark are the same system flipped, and the phone follows the system
/// the way the website follows the OS preference — the same policy
/// `lib/theme.ts` resolves, so a learner who has dark set gets dark in both.
struct RevisioTheme<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        let colors = RevisioColors.forScheme(scheme)
        content
            .environment(\.revisio, colors)
            .background(colors.background)
            .foregroundStyle(colors.foreground)
    }
}

// ── motion ──────────────────────────────────────────────────────────────────
//
// The motion language itself is generated: `Motion`, in Theme.swift, is read out
// of `src/lib/motion.ts` — six springs, five durations, four curves and the four
// entrance gestures — so the springs these modifiers use are the web's own
// numbers rather than a stand-in chosen by hand.

///
/// The web's `press`: `scale(0.95)`, on the spring that has teeth.
///
/// The 90ms lip under a button stays a timing curve, because that is what the
/// stylesheet does with `--ease-snap`. This is the other half: the surfaces the
/// web wraps in `whileTap`, which spring.
///
struct PressScale: ViewModifier {
    @Environment(\.revisio) private var colors
    let pressed: Bool
    let enabled: Bool

    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed && enabled ? Motion.pressScale : 1)
            .animation(Motion.Springs.press.animation, value: pressed)
    }
}

///
/// The web's `fadeUp` — and `fadeScale` when a card or a crest arrives.
///
/// Rise and settle, once, when the element appears, after the web's capped
/// stagger: five cards arrive as a wave, fifty still finish in a third of a
/// second instead of trickling in.
///
struct Entrance: ViewModifier {
    @State private var shown = false
    let index: Int
    let scales: Bool

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : (scales ? Motion.enterScaleRise : Motion.enterRise))
            .scaleEffect(scales && !shown ? Motion.enterScale : 1)
            .animation(
                (scales ? Motion.Springs.settle.animation : Motion.Enter.base)
                    .delay(Motion.stagger(index)),
                value: shown
            )
            .onAppear { shown = true }
    }
}

extension View {
    /// Press feedback: the web's `scale(0.95)` on the press spring.
    func pressScale(_ pressed: Bool, enabled: Bool = true) -> some View {
        modifier(PressScale(pressed: pressed, enabled: enabled))
    }

    /// Entrance: rise and settle, once, after the capped stagger.
    func entrance(_ index: Int = 0, scale: Bool = false) -> some View {
        modifier(Entrance(index: index, scales: scale))
    }

    /// The web's `SPRING.pop` entrance — a crest or a badge arriving with teeth.
    ///
    /// `initial={{ scale: 0.7, opacity: 0, rotate: -6 }}` in the app: the element
    /// comes up from seven tenths, slightly rotated, and overshoots because the pop
    /// spring is underdamped (damping ratio 0.64). It is used only where something
    /// has been *earned* — a promotion, a session summary, an unlocked badge — so
    /// the overshoot reads as a flourish rather than as the interface being loose.
    func pop(delay: Double = 0, from: CGFloat = 0.7, rotate: Double = -6) -> some View {
        modifier(Pop(delay: delay, from: from, rotate: rotate))
    }
}

/// The earned-entrance modifier behind `pop()`. SwiftUI's own spring can only be
/// expressed as a response/damping pair, and the web authors the same spring as
/// stiffness/damping/mass, so the conversion lives in `SpringSpec` — the numbers
/// here are the web's, not a lookalike.
struct Pop: ViewModifier {
    @State private var shown = false
    let delay: Double
    let from: CGFloat
    let rotate: Double

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .scaleEffect(shown ? 1 : from)
            .rotationEffect(.degrees(shown ? 0 : rotate))
            .animation(Motion.Springs.pop.animation.delay(delay), value: shown)
            .onAppear { shown = true }
    }
}

// ── type ────────────────────────────────────────────────────────────────────

extension TypeToken {
    /// A token as a SwiftUI font, with its tracking already applied.
    var text: Font { font }
}

/// The label treatment: uppercased and letterspaced. Never applied to prose.
struct LabelText: View {
    @Environment(\.revisio) private var colors
    let text: String
    var token: TypeToken = Type.label
    var color: Color?

    var body: some View {
        Text(token.text(text))
            .font(token.font)
            .tracking(token.trackingPoints)
            .foregroundStyle(color ?? colors.foreground)
    }
}

// ── the pill ────────────────────────────────────────────────────────────────
//
// The pill is the only interactive shape. Every button carries a flat bottom lip
// and compresses into it when pressed: that single detail is what turns a tap
// from a colour change into a physical act, and it is the whole elevation
// vocabulary. The lip is a *solid* shadow — radius 0, a 3px y-offset — which is
// exactly `box-shadow: 0 3px 0 0 <colour>`.

enum PillTone {
    /// Ink on canvas — navigation, chrome, "you are moving around the app".
    case primary
    /// Owl green. The only colour allowed to carry a primary action.
    case good
    /// White with a hairline. The second action in a pair.
    case secondary
    /// Canvas-soft, no border.
    case subtle
    /// Quiet: a hairline and muted ink, for a third-tier action.
    case ghost
}

struct PillButton: View {
    @Environment(\.revisio) private var colors

    let text: String
    var tone: PillTone = .primary
    var icon: String?
    /// A count inside the pill — the dashboard's due badge.
    var trailing: String?
    var enabled: Bool = true
    var large: Bool = false
    let action: () -> Void

    private var minHeight: CGFloat { large ? Metrics.buttonMinHeight + 8 : Metrics.buttonMinHeight }

    private var lip: CGFloat {
        switch tone {
        case .good: return Metrics.goodLipOffset
        case .primary, .secondary: return Metrics.pillOffset
        case .subtle, .ghost: return 0
        }
    }

    private var lipColor: Color {
        switch tone {
        case .primary: return colors.lip
        case .good: return colors.goodPressed
        case .secondary: return colors.lipSoft
        case .subtle, .ghost: return .clear
        }
    }

    private var face: Color {
        switch tone {
        case .primary: return colors.foreground
        case .good: return colors.good
        case .secondary: return colors.card
        case .subtle: return colors.secondary
        case .ghost: return .clear
        }
    }

    private var ink: Color {
        switch tone {
        case .primary: return colors.primaryForeground
        case .good: return .white
        case .secondary, .subtle: return colors.foreground
        case .ghost: return colors.mutedForeground
        }
    }

    private var border: Color? {
        switch tone {
        case .secondary, .ghost: return colors.border
        default: return nil
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Icon(icon, size: 18, color: ink) }
                if tone == .good {
                    LabelText(text: text, token: Type.label, color: ink)
                } else {
                    Text(text)
                        .font(Type.strong.font)
                        .foregroundStyle(ink)
                        .lineLimit(1)
                }
                if let trailing {
                    Text(trailing)
                        .font(Type.fine.font)
                        .foregroundStyle(ink)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(ink.opacity(0.2), in: Capsule())
                }
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: minHeight)
            .padding(.horizontal, Metrics.buttonPadding)
            .background(face, in: Capsule())
            .overlay {
                if let border {
                    Capsule().strokeBorder(border, lineWidth: 1)
                }
            }
        }
        .buttonStyle(LipButtonStyle(lip: lip, lipColor: lipColor))
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }
}

/// The tactile press: the face drops into its own slab and the slab disappears.
private struct LipButtonStyle: ButtonStyle {
    let lip: CGFloat
    let lipColor: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .shadow(color: configuration.isPressed ? .clear : lipColor, radius: 0, x: 0, y: lip)
            .offset(y: configuration.isPressed ? lip : 0)
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
            .animation(Motion.Springs.press.animation, value: configuration.isPressed)
    }
}

/// A square pill for a single glyph.
struct IconPill: View {
    @Environment(\.revisio) private var colors

    let icon: String
    var tint: Color?
    var background: Color?
    var size: CGFloat = Metrics.iconMinHeight
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Icon(icon, size: 18, color: tint ?? colors.foreground)
                .frame(width: size, height: size)
                .background(background ?? colors.secondary, in: Circle())
        }
        .buttonStyle(PressScaleStyle())
    }
}

/// The bar's own press feedback: the target shrinks a little under the thumb.
struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.15), value: configuration.isPressed)
    }
}

// ── surfaces, chips, badges, meters ─────────────────────────────────────────

/// Level 0 is flat: a radius, a hairline, no shadow.
struct SurfaceCard<Content: View>: View {
    @Environment(\.revisio) private var colors
    var tone: Color?
    var border: Color?
    var padding: CGFloat = 20
    let content: Content

    init(tone: Color? = nil, border: Color? = nil, padding: CGFloat = 20, @ViewBuilder content: () -> Content) {
        self.tone = tone
        self.border = border
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(tone ?? colors.card, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .strokeBorder(border ?? colors.border, lineWidth: 1)
            }
    }
}

/// Canvas-soft, no border — the quieter sibling.
struct SoftCard<Content: View>: View {
    @Environment(\.revisio) private var colors
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(colors.secondary, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
}

struct ChipPill: View {
    @Environment(\.revisio) private var colors
    let text: String
    var active: Bool = false
    var icon: String?

    var body: some View {
        let ink = active ? colors.background : colors.foreground
        HStack(spacing: 5) {
            if let icon { Icon(icon, size: 13, color: ink) }
            Text(text)
                .font(Type.fine.font)
                .foregroundStyle(ink)
                .lineLimit(1)
        }
        .padding(.horizontal, 11)
        .frame(minHeight: Metrics.chipMinHeight)
        .background(active ? colors.foreground : colors.card, in: Capsule())
        .overlay {
            Capsule().strokeBorder(active ? .clear : colors.border, lineWidth: 1)
        }
    }
}

enum BadgeTone { case streak, gold, good, quiet }

struct Badge: View {
    @Environment(\.revisio) private var colors
    let text: String
    var tone: BadgeTone = .quiet
    var icon: String?

    var body: some View {
        let background: Color = switch tone {
        case .streak: colors.streak
        case .gold: colors.gold
        case .good: colors.good
        case .quiet: colors.secondary
        }
        let ink: Color = switch tone {
        case .gold: .black
        case .quiet: colors.mutedForeground
        default: .white
        }
        HStack(spacing: 4) {
            if let icon { Icon(icon, size: 12, color: ink) }
            LabelText(text: text, token: Type.micro, color: ink)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(background, in: Capsule())
        .fixedSize()
    }
}

/// The 10px pill that carries division, streak and placement progress.
struct Meter: View {
    @Environment(\.revisio) private var colors
    let percent: Int
    var tint: Color?
    var height: CGFloat = Metrics.meterHeight

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(colors.secondary)
                Capsule()
                    .fill(tint ?? colors.good)
                    .frame(width: geo.size.width * min(1, max(0, Double(percent) / 100)))
            }
        }
        .frame(height: height)
        // The web's meter spring: smooth, no wobble.
        .animation(Motion.Springs.meter.animation, value: percent)
    }
}

/// The hairline. No shadow tiers: a line is the divider.
struct Hairline: View {
    @Environment(\.revisio) private var colors
    var body: some View {
        Rectangle()
            .fill(colors.border)
            .frame(height: 1)
    }
}

/// A segmented control.
///
/// The selected segment carries its own fill rather than only recolouring its
/// label — that was a real bug on the web, where the active label rendered white
/// on white on any control without a shared-layout pill behind it. One owner for
/// the behaviour, so neither port can reintroduce it.
struct Segmented: View {
    @Environment(\.revisio) private var colors
    let options: [(value: String, label: String)]
    let selected: String
    let onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(options, id: \.value) { option in
                let active = option.value == selected
                Button {
                    if !active { onSelect(option.value) }
                } label: {
                    Text(option.label)
                        .font(Type.captionS.font)
                        .foregroundStyle(active ? colors.background : colors.mutedForeground)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 34)
                        .background(active ? colors.foreground : .clear, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// The keyboard kinds a field can ask for.
///
/// On the phone this is UIKit's own list. Elsewhere there is no software
/// keyboard, so the value is carried and unused — which keeps one field component
/// rather than forking the whole design layer by platform, and it is what lets
/// `swift test` compile this layer on the macOS host on every push.
#if canImport(UIKit)
typealias KeyboardKind = UIKeyboardType
#else
struct KeyboardKind {
    static let `default` = KeyboardKind()
    static let emailAddress = KeyboardKind()
    static let numberPad = KeyboardKind()
    private init() {}
}
#endif

/// The software-keyboard hints, applied only where a software keyboard exists.
private struct KeyboardHints: ViewModifier {
    let keyboard: KeyboardKind

    @ViewBuilder func body(content: Content) -> some View {
        #if os(iOS)
        content
            .keyboardType(keyboard)
            .textInputAutocapitalization(.never)
        #else
        content
        #endif
    }
}

/// The 48px field with a 2px stroke — the stylesheet's `text-input` pair.
struct Field: View {
    @Environment(\.revisio) private var colors
    let placeholder: String
    @Binding var value: String
    var secure: Bool = false
    var keyboard: KeyboardKind = .default
    var submitLabel: SubmitLabel = .next

    var body: some View {
        Group {
            if secure {
                SecureField("", text: $value, prompt: promptText)
            } else {
                TextField("", text: $value, prompt: promptText)
            }
        }
        .font(Type.body.font)
        .foregroundStyle(colors.foreground)
        .modifier(KeyboardHints(keyboard: keyboard))
        .submitLabel(submitLabel)
        .autocorrectionDisabled()
        .padding(.horizontal, 14)
        .frame(minHeight: Metrics.inputMinHeight)
        .background(colors.card, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                .strokeBorder(colors.border, lineWidth: Metrics.inputBorder)
        }
    }

    /// `Text.foregroundStyle` returning a `Text` is iOS 17 only, and the platform
    /// here is 16, so the prompt is tinted the way 16 spells it.
    private var promptText: Text {
        Text(placeholder).foregroundColor(colors.mutedForeground.opacity(0.75))
    }
}

// ── the answer row ──────────────────────────────────────────────────────────

enum OptionState { case idle, selected, correct, wrong }

struct OptionRow: View {
    @Environment(\.revisio) private var colors
    let text: String
    var state: OptionState = .idle
    var enabled: Bool = true
    let action: () -> Void

    private var border: Color {
        switch state {
        case .idle: colors.border
        case .selected: colors.foreground
        case .correct: colors.good
        case .wrong: colors.destructive
        }
    }

    private var face: Color {
        switch state {
        case .correct: colors.good.opacity(0.12).over(colors.card)
        case .wrong: colors.destructive.opacity(0.12).over(colors.card)
        default: colors.card
        }
    }

    private var ink: Color {
        switch state {
        case .correct: colors.goodPressed
        case .wrong: colors.destructive
        default: colors.foreground
        }
    }

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(Type.strong.font)
                .foregroundColor(ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .frame(minHeight: Metrics.optionMinHeight)
                .background(face, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .strokeBorder(border, lineWidth: 2)
                }
        }
        .buttonStyle(LipButtonStyle(lip: Metrics.pillOffset, lipColor: colors.lipSoft))
        .disabled(!enabled)
    }
}

private extension Color {
    ///
    /// Blends a translucent wash over a surface, the way the stylesheet's
    /// `color-mix(in oklab, … )` does for a correct or wrong answer row. Alpha is
    /// composited, not stacked, so the result is one opaque colour and a row on a
    /// card cannot show a seam where the wash ends.
    func over(_ base: Color) -> Color {
        #if canImport(UIKit)
        return blend(base) { UIColor($0).cgColor.components ?? [] }
        #else
        return blend(base) { colour in
            (NSColor(colour).usingColorSpace(.sRGB) ?? .clear).cgColor.components ?? []
        }
        #endif
    }

    /// The composite, given a way to read a colour's components on this platform.
    private func blend(_ base: Color, components: (Color) -> [CGFloat]) -> Color {
        let top = components(self)
        let bottom = components(base)
        guard top.count >= 4, bottom.count >= 4 else { return base }
        let alpha = top[3]
        return Color(
            .sRGB,
            red: top[0] * alpha + bottom[0] * (1 - alpha),
            green: top[1] * alpha + bottom[1] * (1 - alpha),
            blue: top[2] * alpha + bottom[2] * (1 - alpha),
            opacity: 1
        )
    }
}

// ── the rank crest ──────────────────────────────────────────────────────────
//
// Rank is the loudest thing on the ladder and the system allows exactly one
// accent colour, so the tier is carried by **geometry** rather than by hue:
// chevrons in the shield (1 at Bronze, 5 at Legend), division pips beneath them,
// dial ticks around the ring, and the ring itself filling with progress. Colour
// does one job only — this crest is yours, or this is a rung you have not
// reached. That is what lets a ladder of them read side by side.

/// `crestFor` from `src/domain/ranked.ts`, so the counts have one owner.
func crestSpec(tier: String, division: Int) -> (ridges: Int, segments: Int, pips: Int) {
    let order = ["bronze", "silver", "gold", "diamond", "legend"]
    let index = max(0, order.firstIndex(of: tier) ?? 0)
    return (1 + index, 6 + index * 3, 4 - division)
}

struct RankCrest: View {
    @Environment(\.revisio) private var colors
    let rank: Rank
    var size: CGFloat = 88
    var showProgress: Bool = true
    var muted: Bool = false

    var body: some View {
        let spec = crestSpec(tier: rank.tier, division: rank.division)
        let mark = muted ? colors.mutedForeground.opacity(0.45) : colors.primaryForeground
        let tick = muted ? colors.mutedForeground.opacity(0.3) : colors.border
        let track = colors.border.opacity(0.6)
        let surface = colors.card
        let outline = colors.foreground

        Canvas { context, canvasSize in
            let unit = min(canvasSize.width, canvasSize.height) / 100
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * unit, y: y * unit) }

            // Dial ticks — the mechanism. Longer with every tier.
            for i in 0..<spec.segments {
                let angle = (CGFloat(i) / CGFloat(spec.segments)) * 2 * .pi - .pi / 2
                var line = Path()
                line.move(to: CGPoint(x: 50 * unit + cos(angle) * 40 * unit, y: 50 * unit + sin(angle) * 40 * unit))
                line.addLine(to: CGPoint(x: 50 * unit + cos(angle) * 44 * unit, y: 50 * unit + sin(angle) * 44 * unit))
                context.stroke(line, with: .color(tick), style: StrokeStyle(lineWidth: 1.5 * unit, lineCap: .round))
            }

            if showProgress {
                let radius = 45.5 * unit
                let centre = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
                let box = CGRect(x: centre.x - radius, y: centre.y - radius, width: radius * 2, height: radius * 2)
                context.stroke(Path(ellipseIn: box), with: .color(track), lineWidth: 3 * unit)

                let progress = min(100, max(0, rank.percent))
                if progress > 0 {
                    var arc = Path()
                    arc.addArc(
                        center: centre,
                        radius: radius,
                        startAngle: .degrees(-90),
                        endAngle: .degrees(-90 + 360 * Double(progress) / 100),
                        clockwise: false
                    )
                    context.stroke(arc, with: .color(mark), style: StrokeStyle(lineWidth: 3 * unit, lineCap: .round))
                }
            }

            // The shield: ink outline, interior is the surface it sits on.
            var shield = Path()
            shield.move(to: p(22, 26))
            shield.addLine(to: p(78, 26))
            shield.addLine(to: p(78, 50))
            shield.addCurve(to: p(50, 85), control1: p(78, 67), control2: p(65, 79))
            shield.addCurve(to: p(22, 50), control1: p(35, 79), control2: p(22, 67))
            shield.closeSubpath()
            context.fill(shield, with: .color(surface))
            context.stroke(shield, with: .color(outline), style: StrokeStyle(lineWidth: 2.5 * unit, lineJoin: .round))

            // Chevrons — the tier count, military-stripe style.
            let gap: CGFloat = 7.5
            let top = 48 - (CGFloat(spec.ridges - 1) * gap) / 2
            for i in 0..<spec.ridges {
                let y = top + CGFloat(i) * gap
                var chevron = Path()
                chevron.move(to: p(37, y))
                chevron.addLine(to: p(50, y - 6))
                chevron.addLine(to: p(63, y))
                context.stroke(
                    chevron,
                    with: .color(mark),
                    style: StrokeStyle(lineWidth: 2.75 * unit, lineCap: .round, lineJoin: .round)
                )
            }

            // Division pips — III is one dot, I is three.
            for i in 0..<spec.pips {
                let x = 50 + (CGFloat(i) - CGFloat(spec.pips - 1) / 2) * 5
                let dot = CGRect(x: x * unit - 2.4 * unit, y: 72 * unit - 2.4 * unit, width: 4.8 * unit, height: 4.8 * unit)
                context.fill(Path(ellipseIn: dot), with: .color(mark))
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Rank \(rank.label)")
    }
}

/// The compact form: a small crest with the rank's name beside it.
struct RankChip: View {
    @Environment(\.revisio) private var colors
    let rank: Rank
    var muted: Bool = false
    var size: CGFloat = 34

    var body: some View {
        HStack(spacing: 8) {
            RankCrest(rank: rank, size: size, showProgress: false, muted: muted)
            Text(rank.label)
                .font(Type.captionS.font)
                .foregroundStyle(muted ? colors.mutedForeground : colors.foreground)
        }
    }
}

// ── the companion ───────────────────────────────────────────────────────────
//
// A companion needs a body, so it has one: a round presence whose face is the
// learner's own rank crest — the thing speaking is visibly the thing they are
// building. The line it says is decided server-side by `companionFor`; this only
// draws it, so the phone and the web cannot read the same numbers differently.

struct Companion: View {
    @Environment(\.revisio) private var colors
    let rank: Rank
    let line: String
    var action: String?
    var onAction: (() -> Void)?

    var body: some View {
        HStack(spacing: 14) {
            RankCrest(rank: rank, size: 44, showProgress: false)
                .frame(width: 64, height: 64)
                .background(colors.secondary, in: Circle())
                .overlay { Circle().strokeBorder(colors.border, lineWidth: 1) }
            VStack(alignment: .leading, spacing: 6) {
                Text(line)
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if let action, let onAction {
                    Button(action: onAction) {
                        Text(action)
                            .font(Type.fine.font)
                            .foregroundStyle(colors.foreground)
                            .underline()
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

/// The rotating opener, mirroring the dashboard's `WordRotate`.
///
/// One line at a time, replaced on a 4.6s cadence with a short rise and fade.
/// The lines are decided by the learner's own state rather than picked at
/// random, so the rotation is a status readout that happens to be alive.
struct RotatingHeadline: View {
    @Environment(\.revisio) private var colors
    let words: [String]
    @State private var index = 0

    var body: some View {
        Text(words.isEmpty ? "" : words[index % words.count])
            .font(Type.display.font)
            .foregroundStyle(colors.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .id(index)
            .transition(.asymmetric(
                insertion: .move(edge: .bottom).combined(with: .opacity),
                removal: .move(edge: .top).combined(with: .opacity)
            ))
            .animation(Motion.Enter.base, value: index)
            .onAppear { advance() }
    }

    private func advance() {
        guard words.count > 1 else { return }
        Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_600_000_000)
                withAnimation(Motion.Enter.base) { index = (index + 1) % words.count }
            }
        }
    }
}

/// The lines the opener rotates through — `Copy.openers`, from the engine, so the
/// phone rotates exactly the sentences the dashboard does.
func openers(due: Int, streak: Int, level: Int, subject: String?) -> [String] {
    Copy.openers(due: due, streak: streak, level: level, subject: subject)
}

// ── polarity panels ─────────────────────────────────────────────────────────

/// The web's `.band` scope.
///
/// The stylesheet divides pages with **surface change, not chrome**: bands
/// alternating canvas → ink → canvas, with no border and no shadow between them,
/// because the polarity shift *is* the divider. Remapping the *palette* rather
/// than the classes is what lets one view — written once with `colors.card`,
/// `colors.mutedForeground`, a `colors.primary` pill — come out right on either
/// ground.
extension RevisioColors {
    /// Every semantic role remapped as if the band were the page.
    var bandScoped: RevisioColors {
        RevisioColors(
            background: band,
            foreground: bandForeground,
            card: bandCard,
            cardForeground: bandForeground,
            popover: bandCard,
            primary: bandForeground,
            primaryForeground: band,
            secondary: bandSecondary,
            secondaryForeground: bandForeground,
            muted: bandCard,
            mutedForeground: bandMuted,
            accent: bandSecondary,
            accentForeground: bandForeground,
            destructive: destructive,
            destructiveForeground: destructiveForeground,
            border: bandBorder,
            borderStrong: borderStrong,
            input: bandSecondary,
            ring: bandForeground,
            good: good,
            goodPressed: goodPressed,
            goodSoft: goodSoft,
            streak: streak,
            gold: gold,
            info: info,
            band: band,
            bandForeground: bandForeground,
            bandCard: bandCard,
            bandBorder: bandBorder,
            bandMuted: bandMuted,
            bandSecondary: bandSecondary,
            lip: lip,
            lipSoft: Color(hex: 0x2A2A2AFF),
            scrim: scrim
        )
    }
}

/// The web's `TilePanel` — a band at app-page scale.
///
/// In the shell it is a rounded panel rather than a full-bleed section, and it is
/// the loudest structural device in the system: the near-black slab on a white
/// page is what makes the scoreboard read as a scoreboard without a second accent
/// colour. A `tone` of `.light` or `.parchment` is the same panel on the other
/// ground.
enum TileTone { case dark, light, parchment }

struct TilePanel<Content: View>: View {
    @Environment(\.revisio) private var colors
    var tone: TileTone = .dark
    @ViewBuilder var content: Content

    var body: some View {
        let scoped = tone == .dark ? colors.bandScoped : colors
        let surface = tone == .dark ? colors.band : (tone == .parchment ? colors.secondary : colors.card)

        ZStack(alignment: .topLeading) {
            if tone == .dark {
                // One off-centre wash of light, and a 1px specular sheen along the
                // top edge. Not decoration: they are the light source, and they
                // are why a near-black panel reads as a surface rather than as a
                // hole in the page. White at 10% — a rank is not a colour.
                Circle()
                    .fill(Color.white.opacity(0.10))
                    .frame(width: 224, height: 224)
                    .blur(radius: 48)
                    .offset(x: 96, y: -120)
                LinearGradient(
                    colors: [.clear, Color.white.opacity(0.20), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(height: 1)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            VStack(alignment: .leading, spacing: 0) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
        }
        .background(surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .strokeBorder(tone == .dark ? Color.clear : colors.border, lineWidth: 1)
        )
        .environment(\.revisio, scoped)
    }
}

// ── counters ────────────────────────────────────────────────────────────────

/// The web's `NumberTicker` — a number that counts to its value.
///
/// Springs rather than tweens (the web runs `damping: 60, stiffness: 100`), so a
/// queue that empties fast reads as fast and a big XP total arrives with some
/// weight.
struct NumberTicker: View {
    var value: Int
    var font: Font
    var color: Color

    @State private var shown: Double = 0

    var body: some View {
        Text("\(Int(shown.rounded()))")
            .font(font)
            .foregroundStyle(color)
            .monospacedDigit()
            .onAppear { shown = Double(value) }
            .onChange(of: value) { next in
                withAnimation(Motion.Springs.meter.animation) { shown = Double(next) }
            }
    }
}

// ── confetti ────────────────────────────────────────────────────────────────

/// A burst of paper, resting on the same rules the web's `Confetti` uses: the
/// game's own colours only, a short life, and gravity.
///
/// Reserved for the two moments something is *finished* — a session closed and a
/// paper handed in — which is why it is a screen-level effect rather than a
/// decoration any card can ask for.
struct Confetti: View {
    @Environment(\.revisio) private var colors
    var trigger: Int

    private struct Piece {
        let x: Double
        let vx: Double
        let vy: Double
        let spin: Double
        let size: Double
        let delay: Double
        let colour: Int
    }

    @State private var pieces: [Piece] = []
    @State private var clock: Double = 0

    var body: some View {
        Canvas { context, size in
            guard clock > 0 else { return }
            let palette = [colors.good, colors.gold, colors.info, colors.streak]
            for piece in pieces {
                let local = (clock - piece.delay) / (1 - piece.delay)
                if local <= 0 || local >= 1 { continue }
                let x = (piece.x + piece.vx * local) * size.width
                let y = (piece.vy * local + 0.9 * local * local) * size.height + size.height * 0.35
                let alpha = max(0, min(1, 1 - local * local))
                var layer = context
                layer.translateBy(x: x, y: y)
                layer.rotate(by: .radians(piece.spin * local))
                let rect = CGRect(
                    x: -4 * piece.size,
                    y: -3 * piece.size,
                    width: 8 * piece.size,
                    height: 6 * piece.size
                )
                layer.fill(Path(rect), with: .color(palette[piece.colour].opacity(alpha)))
            }
        }
        .allowsHitTesting(false)
        .onChange(of: trigger) { next in
            if next > 0 { seed(next) }
        }
        .onAppear { if trigger > 0 { seed(trigger) } }
    }

    private func seed(_ seedValue: Int) {
        var generator = SeededGenerator(seed: UInt64(abs(seedValue) &+ 1))
        pieces = (0..<140).map { index in
            Piece(
                x: Double.random(in: 0...1, using: &generator),
                vx: (Double.random(in: 0...1, using: &generator) - 0.5) * 1.6,
                vy: -Double.random(in: 0...1, using: &generator) * 1.3 - 0.35,
                spin: (Double.random(in: 0...1, using: &generator) - 0.5) * 12,
                size: 0.5 + Double.random(in: 0...1, using: &generator),
                delay: Double.random(in: 0...1, using: &generator) * 0.18,
                colour: index % 4
            )
        }
        clock = 0
        withAnimation(.linear(duration: 2.2)) { clock = 1 }
    }
}

/// A tiny deterministic generator, so a burst replays identically rather than
/// scattering differently on every redraw.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) { state = seed == 0 ? 0x9E3779B97F4A7C15 : seed }

    mutating func next() -> UInt64 {
        state ^= state << 13
        state ^= state >> 7
        state ^= state << 17
        return state
    }
}

// ── the reading progress hairline ───────────────────────────────────────────

/// The web's `ScrollProgress` — the 2px ink line that fills as a long page is
/// read. Only Learn carries one, because only Learn is long enough to lose your
/// place in.
struct ScrollProgress: View {
    @Environment(\.revisio) private var colors
    var progress: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(colors.border)
                Rectangle()
                    .fill(colors.foreground)
                    .frame(width: geo.size.width * max(0, min(1, progress)))
                    .animation(Motion.Springs.meter.animation, value: progress)
            }
        }
        .frame(height: 2)
    }
}
