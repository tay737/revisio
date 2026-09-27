import SwiftUI
import RevisioEngine

// ── the palette ─────────────────────────────────────────────────────────────
// One accent, deliberately: rank is coded by shape rather than hue, so a second
// colour would be a second language. These are the same values the Compose client
// uses, so the two apps look like one product.

let accent = Color(red: 28 / 255, green: 100 / 255, blue: 242 / 255)
let surface1 = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255)
let surface2 = Color(red: 44 / 255, green: 44 / 255, blue: 46 / 255)
let muted = Color(red: 152 / 255, green: 152 / 255, blue: 157 / 255)
let good = Color(red: 48 / 255, green: 209 / 255, blue: 88 / 255)
let near = Color(red: 255 / 255, green: 214 / 255, blue: 10 / 255)
let bad = Color(red: 1, green: 69 / 255, blue: 58 / 255)
let ink = Color(red: 245 / 255, green: 245 / 255, blue: 247 / 255)

/// iOS-only keyboard hints, applied only where they exist.
///
/// The package also builds on macOS — that is how the engine is verified — and
/// these modifiers do not exist there, so they are attached through this one
/// guarded seam instead of forcing an iOS-only build.
extension View {
    @ViewBuilder func revisioTextInput() -> some View {
        #if os(iOS)
        self.textInputAutocapitalization(.never)
        #else
        self
        #endif
    }

    @ViewBuilder func revisioEmailInput() -> some View {
        #if os(iOS)
        self.textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never)
        #else
        self
        #endif
    }
}

/// Index without the bounds trap, for the "is there a card after this one?"
/// questions a review loop asks constantly.
extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

// ── shared pieces ───────────────────────────────────────────────────────────

struct Crest: View {
    var size: CGFloat = 64
    var body: some View {
        RoundedRectangle(cornerRadius: size / 4)
            .fill(accent)
            .frame(width: size, height: size)
            .overlay(Text("R").font(.system(size: size * 0.55, weight: .heavy)).foregroundColor(.white))
    }
}

/// The learner's face: their emoji on their colour, or the crest if unset.
struct Avatar: View {
    var emoji: String?
    var size: CGFloat = 40
    private var tint: Color {
        guard let first = emoji?.unicodeScalars.first else { return surface2 }
        switch Int(first.value) % 5 {
        case 0: return Color(red: 58 / 255, green: 58 / 255, blue: 60 / 255)
        case 1: return Color(red: 20 / 255, green: 83 / 255, blue: 45 / 255)
        case 2: return Color(red: 113 / 255, green: 63 / 255, blue: 18 / 255)
        case 3: return Color(red: 30 / 255, green: 58 / 255, blue: 95 / 255)
        default: return Color(red: 59 / 255, green: 42 / 255, blue: 74 / 255)
        }
    }
    var body: some View {
        RoundedRectangle(cornerRadius: size / 3)
            .fill(tint)
            .frame(width: size, height: size)
            .overlay(
                Text((emoji?.isEmpty == false ? emoji : nil) ?? "R")
                    .font(.system(size: size * 0.45))
            )
    }
}

struct Panel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(surface1)
            .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

struct Stat: View {
    let label: String
    let value: String
    var tint: Color = ink
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundColor(muted)
            Text(value).font(.headline).foregroundColor(tint)
        }
    }
}

struct Chip: View {
    let text: String
    var tint: Color = muted
    var body: some View {
        Text(text)
            .font(.system(size: 11))
            .foregroundColor(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(surface2)
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct Bar: View {
    let percent: Int
    var tint: Color = accent
    var height: CGFloat = 6
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: height).fill(surface2)
                RoundedRectangle(cornerRadius: height)
                    .fill(tint)
                    .frame(width: geo.size.width * CGFloat(min(max(percent, 0), 100)) / 100)
            }
        }
        .frame(height: height)
    }
}

struct HDivider: View {
    var body: some View {
        Rectangle().fill(surface2).frame(height: 1)
    }
}

struct SectionTitle: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 13, weight: .semibold)).foregroundColor(muted)
    }
}

struct EmptyNote: View {
    let text: String
    var body: some View {
        Panel { Text(text).font(.system(size: 14)).foregroundColor(muted) }
    }
}

struct DensityToggle: View {
    let density: String
    let onSet: (String) -> Void
    var body: some View {
        HStack(spacing: 2) {
            ForEach([("detailed", "Full"), ("summary", "Summary")], id: \.0) { value, label in
                if density == value {
                    Button { onSet(value) } label: { Text(label).font(.system(size: 12)) }
                        .buttonStyle(.borderedProminent).tint(accent)
                } else {
                    Button { onSet(value) } label: { Text(label).font(.system(size: 12)) }
                        .buttonStyle(.plain).foregroundColor(muted)
                }
            }
        }
    }
}

// ── the notes renderer ──────────────────────────────────────────────────────
//
// Notes are authored in Markdown for the web. A native client cannot drop a
// browser in for it — that is the whole point — so this renders a deliberately
// small subset: headings, bullets, numbered lists, quotes, rules, code fences and
// bold/italic/inline code. Anything fancier degrades to readable prose rather
// than to markup, which is the right failure for something being studied.

struct NotesView: View {
    let markdown: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                block.view
            }
        }
    }

    private var blocks: [Block] {
        var out: [Block] = []
        var code: [String] = []
        var inCode = false

        for raw in markdown.replacingOccurrences(of: "\r\n", with: "\n").split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(raw)
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                // A fence closes either way, so an unclosed block still renders as
                // code rather than swallowing the rest of the notes.
                out.append(.code(code.joined(separator: "\n")))
                code = []
                inCode.toggle()
                continue
            }
            if inCode { code.append(line); continue }

            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                out.append(.space)
            } else if let match = line.firstMatch(of: #"^\s*(-{3,}|_{3,}|\*{3,})\s*$"#) {
                _ = match
                out.append(.rule)
            } else if let heading = line.firstMatch(of: #"^(#{1,6})\s+(.*)$"#), heading.count == 3 {
                out.append(.heading(String(heading[2]), level: heading[1].count))
            } else if let bullet = line.firstMatch(of: #"^\s*[-*+]\s+(.*)$"#), bullet.count == 2 {
                out.append(.bullet(String(bullet[1])))
            } else if let numbered = line.firstMatch(of: #"^\s*(\d+)[.)]\s+(.*)$"#), numbered.count == 3 {
                out.append(.numbered(String(numbered[1]), String(numbered[2])))
            } else if let quote = line.firstMatch(of: #"^>\s?(.*)$"#), quote.count == 2 {
                out.append(.quote(String(quote[1])))
            } else {
                out.append(.prose(line))
            }
        }
        out.append(.code(code.joined(separator: "\n")))
        return out
    }

    enum Block {
        case heading(String, level: Int)
        case bullet(String)
        case numbered(String, String)
        case quote(String)
        case prose(String)
        case code(String)
        case rule
        case space

        @ViewBuilder var view: some View {
            switch self {
            case let .heading(text, level):
                Text(markdownInline(text))
                    .font(.system(size: level == 1 ? 21 : level == 2 ? 18 : 16, weight: .bold))
                    .padding(.top, 6)
                    .padding(.bottom, 4)
            case let .bullet(text):
                HStack(alignment: .top, spacing: 8) {
                    Text("•").foregroundColor(muted)
                    Text(markdownInline(text))
                }
                .padding(.bottom, 4)
            case let .numbered(number, text):
                HStack(alignment: .top, spacing: 8) {
                    Text("\(number).").foregroundColor(muted)
                    Text(markdownInline(text))
                }
                .padding(.bottom, 4)
            case let .quote(text):
                HStack(alignment: .top, spacing: 10) {
                    RoundedRectangle(cornerRadius: 2).fill(accent).frame(width: 3)
                    Text(markdownInline(text)).foregroundColor(muted)
                }
                .padding(.bottom, 4)
            case let .prose(text):
                Text(markdownInline(text)).padding(.bottom, 4)
            case let .code(body):
                if !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(body)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(Color(red: 185 / 255, green: 241 / 255, blue: 141 / 255))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color(red: 18 / 255, green: 18 / 255, blue: 20 / 255))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .padding(.bottom, 10)
                }
            case .rule:
                HDivider().padding(.vertical, 8)
            case .space:
                Spacer().frame(height: 10)
            }
        }
    }

}

/// Emphasis, code and links, parsed as inline Markdown so `**bold**` really is
/// bold rather than merely losing its asterisks.
private func markdownInline(_ text: String) -> AttributedString {
    let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
    return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
}

private extension String {
    /// The capture groups of the first match of `pattern`, 0 being the whole match.
    func firstMatch(of pattern: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(startIndex..<endIndex, in: self)
        guard let match = regex.firstMatch(in: self, range: range) else { return nil }
        return (0..<match.numberOfRanges).map { index in
            guard let r = Range(match.range(at: index), in: self) else { return "" }
            return String(self[r])
        }
    }
}
