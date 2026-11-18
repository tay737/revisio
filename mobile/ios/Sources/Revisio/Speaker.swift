import AVFoundation
import RevisioEngine
import SwiftUI

///
/// F3 read-aloud — `AVSpeechSynthesizer`, the iOS twin of the web's
/// speechSynthesis helper and Android's `TextToSpeech` wrapper.
///
/// Same three rules: capability is probed honestly (no voices, no button);
/// only the question side is ever composed (answers never reach the speaker);
/// one utterance at a time — a new speak() cuts off whatever is running.
///
enum Speaker {
    private static let synth = AVSpeechSynthesizer()
    private static var supported: Bool?

    /// Probe without vocalising — asks the voice registry, never speaks.
    static func isSupported() -> Bool {
        if let supported { return supported }
        let ok = AVSpeechSynthesisVoice.speechVoices().contains {
            $0.language.hasPrefix("en")
        }
        supported = ok
        return ok
    }

    /// Speak [text], cutting off anything in flight. Returns false when the
    /// device has no English voice — callers treat that as "no button".
    @discardableResult
    static func speak(_ text: String) -> Bool {
        guard isSupported(), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        synth.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        synth.speak(utterance)
        return true
    }

    static func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    /// Strip markdown to speakable plain text — mirrors web `stripForSpeech`. */
    static func stripForSpeech(_ markdown: String) -> String {
        var text = markdown
        // images: ![alt](url) -> alt ; links: [label](url) -> label
        text = text.replacingOccurrences(of: "!\\[([^\\]]*)\\]\\([^)]*\\)", with: "$1", options: .regularExpression)
        text = text.replacingOccurrences(of: "\\[([^\\]]+)\\]\\([^)]*\\)", with: "$1", options: .regularExpression)
        // inline and fenced code
        text = text.replacingOccurrences(of: "`{1,3}[^`]*`{1,3}", with: " ", options: .regularExpression)
        // headings, list markers, quotes, table pipes
        text = text.replacingOccurrences(of: "(?m)^#{1,6}\\s+", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "(?m)^\\s*[-*+]\\s+", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "(?m)^\\s*\\d+[.)]\\s+", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "(?m)^>\\s?", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "\\*\\*|__|\\*|_", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "\\$\\$?([^$]+)\\$\\$?", with: "$1", options: .regularExpression)
        text = text.replacingOccurrences(of: "|", with: " ")
        text = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The question side of a card, per kind. Never includes answers.
    static func cardSpeechText(_ card: QuizCard) -> String {
        switch card.kind {
        case "cloze":
            let blanked = (card.textWithBlank ?? "").replacingOccurrences(of: "_{2,}", with: " blank ", options: .regularExpression)
            return stripForSpeech(blanked)
        case "flashcard":
            return stripForSpeech(card.prompt ?? "")
        default:
            var parts = [stripForSpeech(card.question ?? "")]
            for option in card.options ?? [] {
                let t = stripForSpeech(option.text)
                if !t.isEmpty { parts.append(t) }
            }
            return parts.filter { !$0.isEmpty }.joined(separator: ". ")
        }
    }

    static func markdownSpeechText(_ markdown: String) -> String {
        stripForSpeech(markdown)
    }
}

/// A listen/stop ghost button for the session card face and verdict.
/// Hidden entirely when the device has no English voice — honest capability,
/// same contract as the web's `supported` gate.
struct ListenButton: View {
    @Environment(\.revisio) private var colors
    let text: String
    var compact: Bool = false
    @State private var speaking = false

    var body: some View {
        if Speaker.isSupported() {
            HStack(spacing: 6) {
                Icon(speaking ? "speaking" : "listen", size: compact ? 16 : 18, color: speaking ? colors.info : colors.mutedForeground)
                if !compact {
                    Text(speaking ? "Stop" : "Listen")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
            }
            .padding(.horizontal, compact ? 8 : 12)
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            .background(colors.card, in: Capsule())
            .overlay(Capsule().stroke(colors.border, lineWidth: 1))
            .contentShape(Rectangle())
            .onTapGesture {
                if speaking {
                    Speaker.stop()
                    speaking = false
                } else {
                    speaking = Speaker.speak(text)
                }
            }
            .accessibilityLabel(speaking ? "Stop reading aloud" : "Read aloud")
            .accessibilityAddTraits(.isButton)
            .onDisappear { Speaker.stop() }
        }
    }
}
