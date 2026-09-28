import RevisioEngine
import SwiftUI

/// Library — subjects and topics.
///
/// The web's `/library` is two things stacked: the catalogue every learner reads,
/// and the authoring tools (`ComposeTopic`, `ImportDeck`, `GenerateCloze`,
/// `MathsSets`, `ClozeMarking`) that only a teacher or developer sees. The
/// catalogue is the half a phone needs — a learner on a train wants to find the
/// topic and open its notes — so this is that half, and it says so rather than
/// pretending: the authoring cards are not here.
///
/// What it does keep is the one write a learner has over their own content: a topic
/// they wrote can be switched between private and public, and the switch reports
/// the counts the server actually changed.
struct LibraryView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    @State private var classCode = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 12)
                ScreenTitle(title: "Library", eyebrow: "Content")
                Spacer().frame(height: 4)
                Text("Subjects and topics. Everything you are studying, and everything you could.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer().frame(height: 18)

                if model.subjects.isEmpty {
                    SoftCard {
                        Text(model.busy
                            ? "Loading the catalogue…"
                            : "The catalogue needs a connection. Your reviews still work offline.")
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    ForEach(Array(model.subjects.enumerated()), id: \.element.id) { index, subject in
                        subjectCard(subject)
                            .entrance(index, scale: true)
                        Spacer().frame(height: 14)
                    }
                }

                Spacer().frame(height: 10)
                joinCard
                Spacer().frame(height: 20)
                elsewhereCard
                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }

    // ── the catalogue ───────────────────────────────────────────────────────

    private func subjectCard(_ subject: Subject) -> some View {
        let open = model.openSubject == subject.id
        let topics = model.topicsBySubject[subject.id]

        return SurfaceCard {
            Button {
                model.toggleSubject(subject.id)
            } label: {
                HStack(spacing: 14) {
                    BoxedGlyph(icon: open ? "collapse" : "expand")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(subject.name)
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        Text("\(subject.topicCount) topic\(subject.topicCount == 1 ? "" : "s")"
                            + (subject.description.map { " · \($0)" } ?? ""))
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                    Spacer(minLength: 0)
                    if !subject.enrolled {
                        Button { model.enroll(subject.id) } label: {
                            ChipPill(text: "Follow")
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if open {
                Spacer().frame(height: 12)
                Hairline()
                if let topics, !topics.isEmpty {
                    ForEach(Array(topics.enumerated()), id: \.element.id) { index, topic in
                        if index > 0 { Hairline() }
                        TopicRow(name: topic.name, cards: topic.cards ?? 0, visibility: topic.visibility) { next in
                            model.setTopicVisibility(topic.id, visibility: next)
                        }
                    }
                } else {
                    Spacer().frame(height: 12)
                    Text(topics == nil ? "Loading topics…" : "No topics here yet.")
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                }
            }
        }
    }

    // ── joining ─────────────────────────────────────────────────────────────

    private var joinCard: some View {
        SurfaceCard {
            Text("Join a class")
                .font(Type.strong.font)
                .foregroundStyle(colors.foreground)
            Spacer().frame(height: 4)
            Text("Your teacher gives you a code; the class's content appears here.")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 12)
            Field(placeholder: "CLASS-CODE", value: Binding(
                get: { classCode },
                set: { classCode = $0.uppercased() }
            ))
            Spacer().frame(height: 12)
            PillButton(
                text: "Join",
                tone: .secondary,
                icon: "join",
                enabled: !classCode.trimmingCharacters(in: .whitespaces).isEmpty && !model.busy
            ) {
                model.joinClass(classCode)
            }
        }
    }

    private var elsewhereCard: some View {
        SurfaceCard {
            Text("Where else to go")
                .font(Type.strong.font)
                .foregroundStyle(colors.foreground)
            Spacer().frame(height: 10)
            Shortcut(icon: "practice", label: "Practice", hint: "Generated maths drills") {
                model.go(.practice)
            }
            Spacer().frame(height: 6)
            Shortcut(icon: "exam", label: "Exam", hint: "Sit a marked paper") {
                model.go(.exam)
            }
            Spacer().frame(height: 6)
            Shortcut(icon: "cram", label: "Cram", hint: "Sprint before an exam") {
                model.go(.cram)
            }
        }
    }
}

/// One topic: its name, how many cards it holds, and its visibility.
///
/// The toggle only appears where the server sent a visibility — `nil` means the
/// public catalogue, which nobody edits from here. Offering a control that will be
/// refused is worse than not offering it.
private struct TopicRow: View {
    @Environment(\.revisio) private var colors
    let name: String
    let cards: Int
    let visibility: String?
    let onVisibility: (String) -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(Type.captionS.font)
                    .foregroundStyle(colors.foreground)
                Text("\(cards) card\(cards == 1 ? "" : "s")")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }
            Spacer(minLength: 0)
            if let visibility {
                Button {
                    onVisibility(visibility == "public" ? "private" : "public")
                } label: {
                    ChipPill(
                        text: visibility == "public" ? "Public" : "Private",
                        active: visibility == "public",
                        icon: visibility == "public" ? "visible" : "private"
                    )
                }
                .buttonStyle(PressScaleStyle())
            }
        }
        .padding(.vertical, 12)
    }
}
