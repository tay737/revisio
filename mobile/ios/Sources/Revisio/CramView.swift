import RevisioEngine
import SwiftUI

/// Cram — the drill.
///
/// Time-boxed practice that bypasses the scheduler on purpose: nothing here moves
/// a card's due date, which is what makes it safe to do the night before an exam.
/// The marks are still the server's, and the notes come along at whichever density
/// was asked for.
///
/// Choosing topics replaces the checkbox list with selectable rows: on a phone a
/// 20px checkbox is a poor target, and the row already has to carry two numbers, so
/// the whole row is the control and the tick is the confirmation.
struct CramView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 20)
                ScreenTitle(title: "Cram", eyebrow: "Practice")
                Spacer().frame(height: 6)
                Text("Practice without touching the schedule — nothing you cram is re-scheduled.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 20)

                if model.cramTopics.isEmpty {
                    SoftCard {
                        HStack(spacing: 10) {
                            Icon("cram", size: 16, color: colors.mutedForeground)
                            Text(
                                model.online
                                    ? "No topics to cram yet."
                                    : "Cram needs a connection: the server deals the questions."
                            )
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                } else {
                    settings

                    Spacer().frame(height: 24)
                    SectionTitle(text: "Topics")
                    ForEach(model.cramTopics) { topic in
                        TopicPick(
                            name: topic.name,
                            meta: "\(topic.questions) question\(topic.questions == 1 ? "" : "s") · \(topic.notes) note\(topic.notes == 1 ? "" : "s")",
                            checked: model.cramSelected.contains(topic.id)
                        ) {
                            model.toggleCramTopic(topic.id)
                        }
                        Spacer().frame(height: 10)
                    }

                    Spacer().frame(height: 8)
                    // Starting a session is the one green action on this screen —
                    // the same call the dashboard makes about "Start review".
                    let picked = model.cramSelected.count
                    PillButton(
                        text: picked == 0
                            ? "Pick at least one topic"
                            : "Cram \(picked) topic\(picked == 1 ? "" : "s")",
                        tone: picked == 0 ? .secondary : .good,
                        icon: picked == 0 ? nil : "cram",
                        trailing: picked > 0 ? "\(picked)" : nil,
                        enabled: picked > 0 && !model.busy,
                        large: true
                    ) {
                        model.startCram()
                    }
                }

                Spacer().frame(height: 12)
                PillButton(text: "Refresh topics", tone: .ghost, icon: "rotate") {
                    model.loadCramTopics()
                }
                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }

    /// The settings, in one surface: density and how deep to go.
    private var settings: some View {
        SurfaceCard {
            LabelText(text: "Notes", token: Type.eyebrow, color: colors.mutedForeground)
            Spacer().frame(height: 8)
            Segmented(
                options: [("detailed", "Full"), ("summary", "Brief")],
                selected: model.density,
                onSelect: { model.setDensity($0) }
            )

            Spacer().frame(height: 18)
            Hairline()
            Spacer().frame(height: 16)

            LabelText(text: "Questions per topic", token: Type.eyebrow, color: colors.mutedForeground)
            Spacer().frame(height: 8)
            HStack(spacing: 12) {
                IconPill(icon: "collapse", size: 34) {
                    model.setMaxPerTopic(model.maxPerTopic - 5)
                }
                Text("\(model.maxPerTopic)")
                    .font(Type.displaySm.font)
                    .foregroundStyle(colors.foreground)
                IconPill(icon: "add", size: 34) {
                    model.setMaxPerTopic(model.maxPerTopic + 5)
                }
                Spacer(minLength: 0)
                Text("\(model.cramTopics.count) topic\(model.cramTopics.count == 1 ? "" : "s") available")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }
        }
    }
}

/// A topic you can pick.
///
/// The whole row is the target, and the tick is drawn on `--good` because "selected
/// for the thing you are about to do" is a state, not chrome.
private struct TopicPick: View {
    @Environment(\.revisio) private var colors
    let name: String
    let meta: String
    let checked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            SurfaceCard(border: checked ? colors.good : nil) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name)
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        Text(meta)
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                    Spacer(minLength: 0)
                    ZStack {
                        Circle().fill(checked ? colors.good : colors.secondary)
                        if checked {
                            Icon("correct", size: 15, color: colors.background)
                        }
                    }
                    .frame(width: 26, height: 26)
                }
            }
        }
        .buttonStyle(PressScaleStyle())
    }
}
