import RevisioEngine
import SwiftUI

/// Review — clear the cards due.
///
/// The website splits Today from Review on purpose, and the split is the reason
/// this screen exists at all. Today is a dashboard: the streak, the numbers, what
/// is waiting, and a shortcut into whatever the learner came for. `/review` is the
/// thing they came for. A phone bar has four slots, and spending one of them on a
/// dashboard while the single most-performed action in the product had no
/// destination was the wrong trade.
///
/// What it shows is the queue's *shape* rather than the queue: how many cards are
/// due, how long that is likely to take, and whether today's pack is already on
/// the device. The cards themselves are the loop, and the loop is one tap away.
struct ReviewView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 12)
                ScreenTitle(title: "Review", eyebrow: "Today")
                Spacer().frame(height: 4)
                Text("Clear the cards due. Every mark is the server's.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)

                Spacer().frame(height: 20)
                queueCard

                if model.home != nil && due == 0 {
                    Spacer().frame(height: 20)
                    SurfaceCard {
                        Text("Keep it moving")
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        Spacer().frame(height: 12)
                        Shortcut(icon: "cram", label: "Cram", hint: "Sprint before an exam") {
                            model.go(.cram)
                        }
                        Spacer().frame(height: 10)
                        Shortcut(icon: "practice", label: "Practice", hint: "Generated maths drills") {
                            model.go(.practice)
                        }
                        Spacer().frame(height: 10)
                        Shortcut(icon: "exam", label: "Exam", hint: "Sit a marked paper") {
                            model.go(.exam)
                        }
                    }
                    .entrance(1)
                }

                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }

    private var due: Int { model.home?.due ?? 0 }

    private var queueTitle: String {
        guard model.home != nil else { return "Loading today's queue…" }
        return due == 0 ? "Nothing is due" : "\(due) card\(due == 1 ? "" : "s") waiting"
    }

    private var offline: Bool { (model.home?.fromCache ?? false) || !model.online }

    private var dealt: Int {
        min(offline ? (model.home?.packCards ?? 0) : due, 20)
    }

    private var estimate: String {
        guard model.home != nil else { return "Checking your saved session." }
        if due == 0 { return "The scheduler has nothing for you right now. Cram, or read ahead." }
        if offline && dealt == 0 { return "No session is saved for offline study. Connect once to download today's cards." }
        if dealt <= 5 { return "About a minute of work." }
        let capNote = due > dealt ? " · up to 20 cards per session" : ""
        return "About \((dealt * 12) / 60) minutes of work\(capNote)."
    }

    private var queueCard: some View {
        SurfaceCard {
            HStack(spacing: 16) {
                BoxedGlyph(icon: "review")
                VStack(alignment: .leading, spacing: 2) {
                    Text(queueTitle)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Text(estimate)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }

            if offline {
                Spacer().frame(height: 14)
                Hairline()
                Spacer().frame(height: 14)
                HStack(spacing: 8) {
                    Icon("clock", size: 13, color: colors.streak)
                    Text((model.home?.packCards ?? 0) > 0
                        ? "Offline: the session saved on this device is what will be dealt."
                        : "No session is saved on this device. Connect once to download today's cards.")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.streak)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer().frame(height: 18)
            PillButton(
                text: model.startingReview ? "Loading today's session…" : (model.pending > 0 ? "Start review · \(model.pending) saved" : "Start review"),
                tone: .good,
                icon: "start",
                enabled: model.home != nil && !model.busy && !model.startingReview && (!offline || dealt > 0),
                large: true
            ) {
                model.startTodayReview()
            }
            Spacer().frame(height: 8)
            Text("Nothing here touches the schedule until a card is actually answered.")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
        }
        .entrance(scale: true)
    }
}

/// The 38px tile a glyph sits on.
///
/// One owner for the shape, because these tiles appear in the More sheet, on the
/// library and beside every shortcut row — and a tile that is 36px here and 40px
/// there is the kind of drift that makes a port feel assembled rather than built.
struct BoxedGlyph: View {
    @Environment(\.revisio) private var colors
    var icon: String
    var tint: Color?
    var size: CGFloat = 38

    var body: some View {
        Icon(icon, size: size * 0.47, color: tint ?? colors.foreground)
            .frame(width: size, height: size)
            .background(colors.secondary, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

/// One tappable row: tile, label, hint, chevron — the More sheet's own row.
struct Shortcut: View {
    @Environment(\.revisio) private var colors
    var icon: String
    var label: String
    var hint: String
    var trailing: String?
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                BoxedGlyph(icon: icon)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Text(hint)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
                if let trailing {
                    Text(trailing)
                        .font(Type.captionS.font)
                        .foregroundStyle(colors.mutedForeground)
                } else {
                    Icon("expand", size: 16, color: colors.mutedForeground)
                }
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
    }
}
