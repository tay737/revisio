import RevisioEngine
import SwiftUI

/// The pieces every screen shares.
///
/// Everything here reads `Theme.swift`, which is generated from the stylesheet,
/// so a screen never names a colour of its own. The one exception is the notes
/// renderer's code tint, which is deliberately a reader's colour rather than a
/// brand one.

extension Collection where Index == Int {
    /// A subscript that answers nil instead of trapping.
    ///
    /// The review loop's index is owned by the model and advanced in its own
    /// right, so between finishing a card and finishing the session there is a
    /// moment where it names a card that is no longer there. That is a state to
    /// render, not a crash to have.
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

/// The brand mark is the wordmark — there is no separate logo lockup.
struct Wordmark: View {
    @Environment(\.revisio) private var colors
    var token: TypeToken = Type.tagline

    var body: some View {
        Text("Revisio")
            .font(token.font)
            .foregroundStyle(colors.foreground)
    }
}

/// The learner's face: their symbol on their colour, or their initials.
///
/// The colour is the *stored* one rather than something derived from the glyph —
/// `SURFACE` in `src/components/ui/avatar.tsx` owns what "moss" looks like, and a
/// picker that showed a different tint from the one it would save would be lying
/// about what the choice does. The settings screen shows all five side by side
/// for exactly that reason.
struct Avatar: View {
    @Environment(\.revisio) private var colors
    var emoji: String?
    var size: CGFloat = 40
    var color: String = "ink"
    var name: String = ""

    private var surface: Color {
        switch color {
        case "moss": return colors.goodSoft
        case "bee": return colors.gold.opacity(0.3)
        case "dawn": return colors.destructive.opacity(0.15)
        case "sky": return colors.info.opacity(0.15)
        default: return colors.foreground
        }
    }

    private var ink: Color {
        switch color {
        case "ink": return colors.background
        case "moss": return colors.goodPressed
        case "dawn": return colors.destructive
        case "sky": return colors.info
        default: return colors.foreground
        }
    }

    private var glyph: String { emoji?.isEmpty == false ? emoji! : initials(of: name) }

    var body: some View {
        Text(glyph)
            .font(.system(size: size * (glyph.count > 2 ? 0.46 : 0.38), weight: .semibold))
            .foregroundStyle(ink)
            .frame(width: size, height: size)
            .background(surface, in: Circle())
            .overlay {
                if color == "bee" { Circle().strokeBorder(colors.border, lineWidth: 1) }
            }
    }
}

/// `initials()` from the web — two letters, or one, or nothing to fall back on.
func initials(of name: String) -> String {
    let words = name.split(whereSeparator: { $0.isWhitespace }).filter { !$0.isEmpty }
    guard let first = words.first?.first else { return "R" }
    let letters = words.count > 1 ? "\(first)\(words[1].first!)" : "\(first)"
    return letters.uppercased()
}

/// A 16px-radius card with a hairline and no shadow. Level 0 is the default.
struct Panel<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        SurfaceCard { content }
    }
}

/// An eyebrow over a display title — the page header every destination uses.
struct ScreenTitle: View {
    @Environment(\.revisio) private var colors
    let title: String
    var eyebrow: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let eyebrow {
                LabelText(text: eyebrow, token: Type.eyebrow, color: colors.mutedForeground)
            }
            Text(title)
                .font(Type.title.font)
                .foregroundStyle(colors.foreground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A label-over-number pair, the shape every stat row on the site uses.
struct Stat: View {
    @Environment(\.revisio) private var colors
    let label: String
    let value: String
    var tint: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            LabelText(text: label, token: Type.micro, color: colors.mutedForeground)
            Text(value)
                .font(Type.displaySm.font)
                .foregroundStyle(tint ?? colors.foreground)
        }
    }
}

struct SectionTitle: View {
    @Environment(\.revisio) private var colors
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelText(text: text, token: Type.eyebrow, color: colors.mutedForeground)
            Spacer().frame(height: 10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct Chip: View {
    @Environment(\.revisio) private var colors
    let text: String
    var tint: Color?

    var body: some View {
        Text(text)
            .font(Type.fine.font)
            .foregroundStyle(tint ?? colors.foreground)
            .lineLimit(1)
            .padding(.horizontal, 11)
            .padding(.vertical, 5)
            .background(colors.secondary, in: Capsule())
    }
}

/// Division, streak and placement progress: the 10px meter.
struct Bar: View {
    let percent: Int
    var tint: Color?
    var height: CGFloat = 10

    var body: some View {
        Meter(percent: percent, tint: tint, height: height)
    }
}

struct HDivider: View { var body: some View { Hairline() } }

/// One line of "here is what happened", used wherever a screen can be empty.
struct EmptyNote: View {
    let text: String

    var body: some View {
        SoftCard {
            Text(text)
                .font(Type.caption.font)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The notes-density segments. Kept as a named control because both the reader
/// and the drill carry it, and they must not drift apart.
struct DensityToggle: View {
    let density: String
    let onSet: (String) -> Void

    var body: some View {
        Segmented(
            options: [("detailed", "Full"), ("summary", "Brief")],
            selected: density,
            onSelect: onSet
        )
    }
}

/// Achievement → registry glyph, the same resolution the web performs.
///
/// The database stores an emoji per achievement. An emoji would reintroduce
/// off-palette colour, so an achievement resolves by id first, then by the legacy
/// emoji, then to a generic award — one mapping, mirrored from
/// `src/components/ui/icons.tsx`, so the phone and the browser draw the same mark.
func achievementIcon(id: String?, legacyEmoji: String?) -> String {
    if let id, let named = ACHIEVEMENT_BY_ID[id] { return named }
    if let legacyEmoji, let named = ACHIEVEMENT_BY_EMOJI[legacyEmoji] { return named }
    return "achievements"
}

private let ACHIEVEMENT_BY_ID: [String: String] = [
    "first-review": "start",
    "reviews-50": "level",
    "reviews-250": "streak",
    "reviews-500": "climb",
    "reviews-1000": "rocket",
    "streak-7": "schedule",
    "streak-30": "checked",
    "streak-100": "crown",
    "xp-1000": "xp",
    "xp-5000": "crown",
    "xp-25000": "achievements",
    "perfect-session": "target",
    "perfect-session-20": "secure",
    "level-25": "league",
]

private let ACHIEVEMENT_BY_EMOJI: [String: String] = [
    "🌱": "start",
    "⚡": "level",
    "🔥": "streak",
    "📅": "schedule",
    "🗓️": "checked",
    "💎": "xp",
    "🎯": "target",
    "🏃": "climb",
    "🚀": "rocket",
    "🏔️": "crown",
    "👑": "crown",
    "⛰️": "achievements",
    "🛡️": "secure",
    "🎖️": "league",
]

// ── the notes renderer ──────────────────────────────────────────────────────
//
// Notes are authored in Markdown for the web. A native client cannot drop a
// browser engine in for it — that is the whole point — so this is a deliberately
// small renderer: headings, bullets, numbered lists, block quotes, bold/italic
// and inline code. Anything fancier degrades to readable text rather than to
// markup, which is the right failure for prose somebody is studying.

struct NotesView: View {
    @Environment(\.revisio) private var colors
    let markdown: String

    /// Notes are reference material, which is the one thing `--info` is for.
    private static let codeInk = Color(hex: 0x1CB0F6FF)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                block
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var blocks: [AnyView] {
        var out: [AnyView] = []
        var inCode = false
        var code: [String] = []
        let lines = markdown.replacingOccurrences(of: "\r\n", with: "\n").split(
            separator: "\n", omittingEmptySubsequences: false
        ).map(String.init)

        for raw in lines {
            let line = raw.replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression)
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                // A fence closes the buffer either way, so an unclosed block still
                // renders as code rather than swallowing the rest of the notes.
                out.append(AnyView(codeBlock(code.joined(separator: "\n"))))
                code = []
                inCode.toggle()
                continue
            }
            if inCode {
                code.append(line)
                continue
            }

            let heading = line.range(of: "^#{1,6}\\s+", options: .regularExpression)
            let bullet = line.range(of: "^\\s*[-*+]\\s+", options: .regularExpression)
            let numbered = line.range(of: "^\\s*\\d+[.)]\\s+", options: .regularExpression)
            let quote = line.range(of: "^>\\s?", options: .regularExpression)
            let rule = line.range(of: "^\\s*(-{3,}|_{3,}|\\*{3,})\\s*$", options: .regularExpression)

            if rule != nil {
                out.append(AnyView(Hairline().padding(.vertical, 12)))
            } else if line.trimmingCharacters(in: .whitespaces).isEmpty {
                out.append(AnyView(Spacer().frame(height: 12)))
            } else if let heading {
                let depth = line.prefix(while: { $0 == "#" }).count
                let text = String(line[heading.upperBound...])
                out.append(
                    AnyView(
                        inline(text, weight: .bold)
                            .font(depth == 1 ? Type.displaySm.font : .system(size: 18, weight: .bold))
                            .padding(.top, 8)
                            .padding(.bottom, 6)
                    )
                )
            } else if let bullet {
                out.append(
                    AnyView(
                        HStack(alignment: .top, spacing: 10) {
                            Text("•").foregroundStyle(colors.mutedForeground)
                            inline(String(line[bullet.upperBound...]))
                        }
                        .padding(.bottom, 6)
                    )
                )
            } else if let numbered {
                out.append(
                    AnyView(
                        HStack(alignment: .top, spacing: 10) {
                            Text(String(line[line.startIndex..<numbered.upperBound]).trimmingCharacters(in: .whitespaces))
                                .foregroundStyle(colors.mutedForeground)
                            inline(String(line[numbered.upperBound...]))
                        }
                        .padding(.bottom, 6)
                    )
                )
            } else if let quote {
                out.append(
                    AnyView(
                        HStack(alignment: .top, spacing: 12) {
                            Capsule()
                                .fill(colors.info)
                                .frame(width: 3)
                            inline(String(line[quote.upperBound...]))
                                .foregroundStyle(colors.mutedForeground)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 6)
                    )
                )
            } else {
                out.append(AnyView(inline(line).padding(.bottom, 6)))
            }
        }
        out.append(AnyView(codeBlock(code.joined(separator: "\n"))))
        return out
    }

    @ViewBuilder
    private func codeBlock(_ body: String) -> some View {
        if !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text(body)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(Self.codeInk)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(colors.secondary, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .padding(.bottom, 12)
        }
    }

    /// Bold, italic and inline code, with the markers removed.
    private func inline(_ text: String, weight: Font.Weight = .regular) -> Text {
        var result = Text("")
        var index = text.startIndex
        let body = Type.body.font

        func plain(_ slice: String) -> Text {
            Text(slice).font(body.weight(weight)).foregroundColor(colors.foreground)
        }

        while index < text.endIndex {
            let rest = text[index...]
            if rest.hasPrefix("**"), let end = rest.dropFirst(2).range(of: "**") {
                result = result + Text(String(rest.dropFirst(2)[..<end.lowerBound]))
                    .font(body.weight(.semibold))
                    .foregroundColor(colors.foreground)
                index = end.upperBound
            } else if rest.hasPrefix("*"), let end = rest.dropFirst().firstIndex(of: "*") {
                result = result + Text(String(rest.dropFirst()[..<end]))
                    .font(body.italic())
                    .foregroundColor(colors.foreground)
                index = rest.index(after: end)
            } else if rest.hasPrefix("`"), let end = rest.dropFirst().firstIndex(of: "`") {
                result = result + Text(String(rest.dropFirst()[..<end]))
                    .font(.system(size: 15, design: .monospaced))
                    .foregroundColor(Self.codeInk)
                index = rest.index(after: end)
            } else if rest.hasPrefix("["), let close = rest.firstIndex(of: "]") {
                // [label](url) — the label is the useful half on a phone.
                let after = rest.index(after: close)
                if after < rest.endIndex, rest[after] == "(", let end = rest[after...].firstIndex(of: ")") {
                    result = result + Text(String(rest.dropFirst()[..<close]))
                        .font(body)
                        .foregroundColor(Self.codeInk)
                    index = rest.index(after: end)
                } else {
                    result = result + plain(String(rest.first!))
                    index = rest.index(after: index)
                }
            } else {
                result = result + plain(String(rest.first!))
                index = rest.index(after: index)
            }
        }
        return result
    }
}
