import RevisioEngine
import SwiftUI

/// Learn — the reading.
///
/// Subject → topic → notes, the same hierarchy as the web, but the topic row
/// carries the two intentions that actually matter on a phone: *Learn* meets the
/// unseen questions with the notes beside them, and the paper is what you read
/// when you are not being tested at all.
///
/// Notes are reference material, which is the one thing the macaw blue is for — so
/// the notes affordance is the only place that colour appears on this screen.
struct LearnView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 20)
                HStack(alignment: .center, spacing: 12) {
                    ScreenTitle(title: "Learn", eyebrow: "Notes")
                    Spacer(minLength: 0)
                    Segmented(
                        options: [("detailed", "Full"), ("summary", "Brief")],
                        selected: model.density,
                        onSelect: { model.setDensity($0) }
                    )
                }
                Spacer().frame(height: 6)
                Text("Notes for every topic, and the first questions that go with them.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 20)

                if model.subjects.isEmpty {
                    SoftCard {
                        HStack(spacing: 10) {
                            Icon("learn", size: 16, color: colors.mutedForeground)
                            Text(
                                model.online
                                    ? "Nothing published yet. Ask a teacher to publish a subject, or create your own in My content on the web."
                                    : "Learn needs a connection once — the catalogue is not cached on this device. Today's review still works offline."
                            )
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                ForEach(model.subjects) { subject in
                    SubjectCard(subject: subject, model: model)
                    Spacer().frame(height: 14)
                }

                Spacer().frame(height: 4)
                HStack(spacing: 10) {
                    PillButton(text: "Refresh", tone: .ghost, icon: "rotate") {
                        model.loadSubjects()
                    }
                    PillButton(text: "Cram instead", tone: .ghost, icon: "cram") {
                        model.go(.cram)
                    }
                }
                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }
}

private struct SubjectCard: View {
    @Environment(\.revisio) private var colors
    let subject: Subject
    @ObservedObject var model: AppModel

    private var open: Bool { model.openSubject == subject.id }

    var body: some View {
        SurfaceCard {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(subject.name)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    if let description = subject.description, !description.isEmpty {
                        Text(description)
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                ChipPill(text: "\(subject.topicCount) \(subject.topicCount == 1 ? "topic" : "topics")")
            }

            Spacer().frame(height: 12)
            HStack(spacing: 10) {
                Disclosure(
                    label: open ? "Hide topics" : "Show topics",
                    icon: open ? "collapse" : "expand"
                ) {
                    model.toggleSubject(subject.id)
                }
                Spacer(minLength: 0)
                if subject.enrolled {
                    Badge(text: "Following", tone: .good, icon: "correct")
                } else {
                    SmallPill(label: "Follow", icon: "join") { model.enroll(subject.id) }
                }
            }

            if open {
                Spacer().frame(height: 16)
                Hairline()

                let topics = model.topicsBySubject[subject.id]
                if topics == nil {
                    Spacer().frame(height: 14)
                    Text("Loading topics…")
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                } else if topics?.isEmpty == true {
                    Spacer().frame(height: 14)
                    Text("No topics under this subject yet.")
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                } else {
                    ForEach(topics ?? []) { topic in
                        Spacer().frame(height: 14)
                        TopicBlock(topic: topic, model: model)
                        Spacer().frame(height: 14)
                        Hairline()
                    }
                }
            }
        }
    }
}

private struct TopicBlock: View {
    @Environment(\.revisio) private var colors
    let topic: Topic
    @ObservedObject var model: AppModel

    private var open: Bool { model.openTopic == topic.id }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(topic.name)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Text("\(topic.questions) question\(topic.questions == 1 ? "" : "s") · \(topic.notes) note\(topic.notes == 1 ? "" : "s")")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
                if topic.visibility == "private" {
                    Badge(text: "Private", tone: .quiet, icon: "private")
                }
            }

            Spacer().frame(height: 10)
            HStack(spacing: 8) {
                PillButton(text: "Learn", icon: "review") { model.startLearn(topic.id) }
                PillButton(text: open ? "Hide notes" : "Read notes", tone: .secondary, icon: "notes") {
                    model.toggleTopic(topic.id)
                }
            }

            if open {
                Spacer().frame(height: 14)
                let lessons = model.lessonsByTopic[topic.id]
                if lessons == nil {
                    Text("Loading notes…")
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                } else if lessons?.isEmpty == true {
                    Text("No notes written for this topic yet.")
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                } else {
                    ForEach(lessons ?? []) { lesson in
                        HStack(spacing: 10) {
                            Text(lesson.title)
                                .font(Type.strong.font)
                                .foregroundStyle(colors.foreground)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if let refs = lesson.specRefs, !refs.isEmpty { ChipPill(text: refs) }
                        }
                        Spacer().frame(height: 8)
                        NotesView(markdown: lessonBody(lesson))
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func lessonBody(_ lesson: Lesson) -> String {
        let preferred = model.density == "summary" ? lesson.summaryMd : lesson.detailedMd
        if let preferred, !preferred.isEmpty { return preferred }
        return lesson.detailedMd ?? lesson.summaryMd ?? ""
    }
}

/// A small ink pill for a third-tier action, sized down rather than given its own
/// component: the stylesheet's radius and lip still apply, only the height drops.
private struct SmallPill: View {
    @Environment(\.revisio) private var colors
    let label: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Icon(icon, size: 14, color: colors.primaryForeground)
                Text(label)
                    .font(Type.captionS.font)
                    .foregroundStyle(colors.primaryForeground)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(colors.foreground, in: Capsule())
        }
        .buttonStyle(PressScaleStyle())
    }
}

/// A quiet disclosure control: a hairline affordance, not a filled button.
private struct Disclosure: View {
    @Environment(\.revisio) private var colors
    let label: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(label)
                    .font(Type.captionS.font)
                    .foregroundStyle(colors.foreground)
                Icon(icon, size: 15, color: colors.mutedForeground)
            }
        }
        .buttonStyle(PressScaleStyle())
    }
}
