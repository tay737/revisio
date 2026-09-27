import Foundation

/// A native port of `src/domain/grading.ts`.
///
/// The only grading code in the iOS client, so a review can be marked with no
/// server. It is a copy of the canonical TypeScript engine, proven equal by
/// `GradingConformanceTests` against vectors emitted from that source — so
/// grading still has one owner.
///
/// Contract (unchanged): the client may preview but never decide. A verdict
/// reached here is provisional; the queued review is re-graded by `submitReview`
/// when the network returns.
public enum Grading {

    private static func collapse(_ value: String) -> String {
        value.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }

    // ── normalization ───────────────────────────────────────────────────────

    public static func normalize(_ input: String) -> String {
        collapse(input.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    public static func lowercase(_ input: String) -> String { normalize(input).lowercased() }

    public static func stripPunctuation(_ input: String) -> String {
        collapse(
            normalize(input).replacingOccurrences(of: "[\\p{P}\\p{S}]+", with: " ", options: .regularExpression)
        ).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Remove U+0300–U+036F combining marks after canonical decomposition.
    ///
    /// Done by scalar range rather than a regular expression on purpose: this
    /// engine must remove exactly what the TypeScript engine's
    /// `/[\u0300-\u036f]/g` removes, and ICU does not read that brace syntax.
    public static func stripAccents(_ input: String) -> String {
        let decomposed = input.decomposedStringWithCanonicalMapping
        let scalars = decomposed.unicodeScalars.filter { !(0x0300...0x036f).contains($0.value) }
        var view = String.UnicodeScalarView()
        view.append(contentsOf: scalars)
        return String(view)
    }

    public static func fullyNormalized(_ input: String) -> String {
        stripPunctuation(stripAccents(lowercase(input)))
    }

    // ── cloze ───────────────────────────────────────────────────────────────

    public static func gradeCloze(_ userAnswer: String, _ accepted: [AcceptedAnswer]) -> Verdict {
        let user = normalize(userAnswer)
        if user.isEmpty { return Verdict(correct: false, feedbackKind: .wrong, note: "No answer given.") }

        if let match = accepted.first(where: { normalize($0.text) == user }) {
            return Verdict(correct: true, feedbackKind: .correct, matchedAnswerId: match.id)
        }
        if let match = accepted.first(where: { lowercase($0.text) == lowercase(user) }) {
            return Verdict(
                correct: true, feedbackKind: .caseOnly, matchedAnswerId: match.id,
                note: "Correct — mind your capitalisation."
            )
        }
        if let match = accepted.first(where: { stripPunctuation(lowercase($0.text)) == stripPunctuation(lowercase(user)) }) {
            return Verdict(
                correct: true, feedbackKind: .punctuationOnly, matchedAnswerId: match.id,
                note: "Correct — check your punctuation."
            )
        }
        if let match = accepted.first(where: {
            stripPunctuation(stripAccents(lowercase($0.text))) == stripPunctuation(stripAccents(lowercase(user)))
        }) {
            return Verdict(
                correct: true, feedbackKind: .caseAndPunctuation, matchedAnswerId: match.id,
                note: "Correct — check capitalisation and punctuation."
            )
        }
        return Verdict(correct: false, feedbackKind: .wrong)
    }

    // ── flashcards (keyword marking) ────────────────────────────────────────

    private static func includesPhrase(_ haystack: String, _ needle: String, _ synonyms: [String]) -> Bool {
        ([needle] + synonyms).map(fullyNormalized).contains { haystack.contains($0) }
    }

    public static func gradeFlashcard(
        _ userAnswer: String,
        _ accepted: [AcceptedAnswer],
        minPoints override: Int? = nil
    ) -> Verdict {
        let user = fullyNormalized(userAnswer)
        if user.isEmpty { return Verdict(correct: false, feedbackKind: .wrong, note: "No answer given.") }

        guard let rules = accepted.first(where: { !($0.keywords ?? []).isEmpty }), let keywords = rules.keywords else {
            // No keyword rules — fall back to the cloze comparison.
            return gradeCloze(userAnswer, accepted)
        }

        let minPoints = override ?? rules.minPoints ?? 2
        let required = keywords.filter { $0.required == true }
        let optional = keywords.filter { $0.required != true }

        let matchedRequired = required.filter { includesPhrase(user, $0.phrase, $0.synonyms ?? []) }
        let matchedOptional = optional.filter { includesPhrase(user, $0.phrase, $0.synonyms ?? []) }

        let matchedPhrases = (matchedRequired + matchedOptional).map(\.phrase)
        let missedRequired = required.filter { !matchedRequired.contains($0) }
        let missedOptional = optional.filter { !matchedOptional.contains($0) }
        let missedPhrases = (missedRequired + missedOptional).map(\.phrase)

        let requiredOk = matchedRequired.count == required.count
        let pointsOk = matchedRequired.count + matchedOptional.count >= minPoints

        if requiredOk && pointsOk {
            return Verdict(
                correct: true, feedbackKind: .correct, matchedAnswerId: rules.id,
                note: (matchedOptional.isEmpty && missedOptional.isEmpty)
                    ? nil
                    : "Covered: \(matchedPhrases.joined(separator: ", ")).",
                matchedPhrases: matchedPhrases, missedPhrases: missedPhrases
            )
        }

        if requiredOk {
            let missing = missedOptional.prefix(3).map(\.phrase).joined(separator: ", ")
            return Verdict(
                correct: false, feedbackKind: .nearMiss, matchedAnswerId: rules.id,
                note: "Good start — also include: \(missing).",
                matchedPhrases: matchedPhrases, missedPhrases: missedPhrases
            )
        }

        return Verdict(
            correct: false, feedbackKind: .wrong, matchedAnswerId: rules.id,
            note: "Some required points were missing.",
            matchedPhrases: matchedPhrases, missedPhrases: missedPhrases
        )
    }

    // ── multiple choice ─────────────────────────────────────────────────────

    public static func gradeMcq(_ selectedOptionId: String?, _ correctOptionId: String) -> Verdict {
        guard let selected = selectedOptionId, !selected.isEmpty else {
            return Verdict(correct: false, feedbackKind: .wrong, note: "No selection made.")
        }
        if selected == correctOptionId { return Verdict(correct: true, feedbackKind: .correct) }
        return Verdict(correct: false, feedbackKind: .wrong, note: "Incorrect — one attempt only.")
    }

    // ── offline preview ─────────────────────────────────────────────────────

    /// Grade a card with no server, using the pack's answer key. The result is a
    /// plain `Verdict` — the preview the scoreboard does not trust.
    public static func previewVerdict(_ card: OfflineCard, answer: String?, selectedOptionId: String?) -> Verdict {
        if card.key.kind == "mcq" {
            return gradeMcq(selectedOptionId, card.key.correctOptionId ?? "")
        }
        if card.kind == "flashcard" {
            return gradeFlashcard(answer ?? "", card.key.accepted ?? [])
        }
        return gradeCloze(answer ?? "", card.key.accepted ?? [])
    }

    /// The answer shown once a card is graded — the primary accepted answer.
    public static func primaryAnswer(_ card: OfflineCard) -> String? {
        if card.key.kind == "mcq" {
            return card.options?.first(where: { $0.id == card.key.correctOptionId })?.text
        }
        let accepted = card.key.accepted ?? []
        return (accepted.first(where: { $0.isPrimary == true }) ?? accepted.first)?.text
    }

    // ── the same preview, for a card that may have no key ────────────────────
    //
    // A card the server picked (today's queue, first exposure, cram) carries no
    // answer key, so there is nothing to grade locally and pretending otherwise
    // would be the app inventing a mark. These return nil in that case, and the
    // caller says so out loud instead.

    public static func previewVerdict(_ card: QuizCard, answer: String?, selectedOptionId: String?) -> Verdict? {
        guard let key = card.key else { return nil }
        if key.kind == "mcq" { return gradeMcq(selectedOptionId, key.correctOptionId ?? "") }
        if card.kind == "flashcard" { return gradeFlashcard(answer ?? "", key.accepted ?? []) }
        return gradeCloze(answer ?? "", key.accepted ?? [])
    }

    public static func primaryAnswer(_ card: QuizCard) -> String? {
        guard let key = card.key else { return nil }
        if key.kind == "mcq" {
            return card.options?.first(where: { $0.id == key.correctOptionId })?.text
        }
        let accepted = key.accepted ?? []
        return (accepted.first(where: { $0.isPrimary == true }) ?? accepted.first)?.text
    }
}
