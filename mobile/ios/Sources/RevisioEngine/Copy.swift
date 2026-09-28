import Foundation

/// The words the app says — a port of the web's `src/lib/profile.ts`.
///
/// The website keeps every sentence it speaks in one pure module so that "how
/// Revisio talks to someone" has a single owner. The phones need the same
/// sentences, and the only way to have them is to carry them: a server that sent
/// the copy would need a round trip to say "Good morning", and a phone that
/// invented its own would drift.
///
/// The rules from that module are kept as written here:
///
///   • second person, quiet confidence, no exclamation marks, no emoji;
///   • every line must be true of the numbers it was handed;
///   • the order of the cases in `companionFor` *is* the policy, and it is not
///     arbitrary — a returning learner is not told they are new, and a finished
///     queue is named before a nudge is ever considered.
///
/// Anything the screens add on top (button labels, section headings) stays in the
/// screens, next to the layout it belongs to.
public enum Copy {

    /// Time-of-day greeting. Late night gets acknowledged rather than scolded.
    public static func greeting(hour: Int) -> String {
        if hour < 5 { return "Still up" }
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        if hour < 23 { return "Good evening" }
        return "Late session"
    }

    public static func firstName(_ name: String?) -> String {
        let trimmed = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "there" }
        return String(trimmed.split(whereSeparator: { $0.isWhitespace })[0])
    }

    public static func initials(_ name: String?) -> String {
        let parts = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: { $0.isWhitespace })
        if parts.isEmpty { return "R" }
        if parts.count == 1 { return String(parts[0].prefix(2)).uppercased() }
        return "\("\(parts[0].first!)\(parts[parts.count - 1].first!)")".uppercased()
    }

    public static func greetingFor(_ name: String?, hour: Int) -> String {
        "\(greeting(hour: hour)), \(firstName(name))"
    }

    /// Conversation starters for the rotating headline.
    ///
    /// All are answers to "what is this session actually about", so the rotation
    /// never feels random — and the order is fixed, because the first line is the
    /// one a learner is most likely to read.
    public static func openers(due: Int, streak: Int, level: Int, subject: String?) -> [String] {
        var lines: [String] = []
        if due > 0 {
            lines.append("\(due) \(due == 1 ? "card is" : "cards are") waiting")
            lines.append("Let's clear today's queue")
        } else {
            lines.append("Nothing is due — you're ahead")
            lines.append("Want to get ahead instead?")
        }
        if streak >= 2 { lines.append("Day \(streak) of your streak") }
        if level > 1 { lines.append("Level \(level) — keep it moving") }
        if let subject { lines.append("Back to \(subject)?") }
        var seen = Set<String>()
        let unique = lines.filter { seen.insert($0).inserted }
        return unique.isEmpty ? ["Let's get started"] : unique
    }

    /// Post-session copy. Score first, then one sentence that explains it.
    public static func sessionSummary(correct: Int, total: Int) -> String {
        if total == 0 { return "No cards answered yet." }
        let pct = Int((Double(correct) / Double(total) * 100).rounded())
        if pct == 100 { return "\(correct) for \(total). Every one of them." }
        if pct >= 80 { return "\(correct) for \(total) — that's the recall we want." }
        if pct >= 50 { return "\(correct) for \(total). The misses are the useful part." }
        return "\(correct) for \(total). Worth a pass over the notes before the next run."
    }

    /// Empty-state copy that hands the learner a next action rather than a shrug.
    public static func emptyQueueLine(due: Int, streak: Int) -> String {
        if due == 0 && streak > 0 {
            return "Your schedule is clear and your \(streak)-day streak is safe. Anything you do now is a head start."
        }
        return "Your schedule is clear. Cram a topic, read ahead, or come back tomorrow."
    }

    /// A learner's recent form, from today's numbers.
    ///
    /// Four reviews is the floor because three correct answers is not a pattern.
    public static func formFor(reviewed: Int, correct: Int) -> FormRead {
        if reviewed < 4 {
            return FormRead(form: "unknown", label: "No read yet", detail: "Four reviews is enough to call your form.")
        }
        let accuracy = Double(correct) / Double(reviewed)
        let pct = Int((accuracy * 100).rounded())
        if accuracy >= 0.9 {
            return FormRead(form: "sharp", label: "Sharp", detail: "\(pct)% today — this is your best gear.")
        }
        if accuracy >= 0.7 {
            return FormRead(form: "steady", label: "Steady", detail: "\(pct)% today. Solid, unspectacular, fine.")
        }
        return FormRead(form: "shaky", label: "Shaky", detail: "\(pct)% today. Slow down and read the whole clue.")
    }

    /// The lobby's line for the current week.
    ///
    /// Competitive framing without aggression: the zone is a fact, and the
    /// sentence explains what it means.
    public static func lobbyLine(
        zone: String,
        position: Int,
        size: Int,
        daysLeft: Int,
        rankLabel: String
    ) -> String {
        let days = daysLeft == 1 ? "Today is the last day" : "\(daysLeft) days left"
        switch zone {
        case "pending":
            return "We are still placing you. A few more reviews and we will seat you in a \(rankLabel) lobby."
        case "promotion":
            return "\(position) of \(size) — you are inside the promotion zone. \(days); holding this seat moves you up a rung."
        case "demotion":
            return "\(position) of \(size) — that is the demotion band. One session pulls you clear of it."
        default:
            return "\(position) of \(size) — safe, and close enough to the promotion band to take it. \(days)."
        }
    }

    /// The companion's read of where the learner is.
    ///
    /// The cases below are ordered, and the order is the policy (see the enum's
    /// comment). `hour` is passed rather than read so the night-time branch is
    /// testable, and `rankLabel` is the learner's current rank if they hold one —
    /// the only fact that makes the praise case personal.
    public static func companionFor(
        name: String?,
        due: Int,
        reviewed: Int,
        correct: Int,
        streak: Int,
        bestStreak: Int,
        totalXp: Int,
        rankLabel: String?,
        hour: Int
    ) -> CompanionRead {
        let rank = (rankLabel?.isEmpty ?? true) ? "" : " \(rankLabel!)"

        // 1 — a brand new account. The one moment the app must not be coy.
        if totalXp <= 0 && reviewed == 0 {
            return CompanionRead(
                tone: "welcome",
                line: "Nothing here yet, \(firstName(name)) — which is the good part. Ten minutes on the first topic and the scheduler starts working for you tonight.",
                actionLabel: "Pick a topic"
            )
        }

        // 2 — a gap worth acknowledging. Best-streak is the proof they were serious.
        if streak == 0 && bestStreak >= 3 && reviewed == 0 {
            return CompanionRead(
                tone: "returning",
                line: "You had \(bestStreak) days going. Nothing is lost — the queue has held your place, and it only takes today to start the next run.",
                actionLabel: "Resume where you left off"
            )
        }

        // 3 — the work is done. Name it in their own numbers.
        if due == 0 && reviewed > 0 {
            let clean = correct == reviewed
            let line = clean
                ? "\(reviewed) for \(reviewed). That is a clean sheet, and it\(rank.isEmpty ? "" : " is why you are holding\(rank)")."
                : "\(reviewed) answered and the queue is clear\(rank.isEmpty ? "" : " — still\(rank)"). Days like this are what hold a rank together."
            return CompanionRead(tone: clean ? "praise" : "open", line: line, actionLabel: "See the ladder")
        }

        // 4 — mid-session. Short, because they are in the middle of something.
        if reviewed > 0 && due > 0 {
            return CompanionRead(
                tone: "momentum",
                line: "\(reviewed) down, \(due) to go. You are faster on these than you were at the start.",
                actionLabel: "Carry on"
            )
        }

        // 5 — the nudge. Late at night it is an offer, not an order.
        if due > 0 {
            let late = hour >= 23 || hour < 5
            let line = late
                ? "\(due) cards are due. Five of them would keep \(streak > 0 ? "day \(streak)" : "the streak algorithm") happy — the rest can wait for tomorrow."
                : "\(due) cards due, and nothing in there you have not seen before. Worth doing while they are still easy."
            return CompanionRead(tone: "nudge", line: line, actionLabel: "Start the queue")
        }

        // 6 — nothing due and nothing done: an invitation, not a reprimand.
        return CompanionRead(
            tone: "open",
            line: "Nothing is due, which means today is optional — the best kind. Get ahead on a topic, or protect the rank with a quick cram.",
            actionLabel: "Get ahead"
        )
    }
}

/// `formFor`'s answer: which gear the learner is in, and the sentence for it.
public struct FormRead: Equatable, Sendable {
    public let form: String
    public let label: String
    public let detail: String

    public init(form: String, label: String, detail: String) {
        self.form = form
        self.label = label
        self.detail = detail
    }
}

/// `companionFor`'s answer.
///
/// `actionLabel` is the offer; the destination is the screen's business, because
/// the phone routes it natively rather than by path.
public struct CompanionRead: Equatable, Sendable {
    public let tone: String
    public let line: String
    public let actionLabel: String

    public init(tone: String, line: String, actionLabel: String) {
        self.tone = tone
        self.line = line
        self.actionLabel = actionLabel
    }
}
