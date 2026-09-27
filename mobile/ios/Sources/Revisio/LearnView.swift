import SwiftUI
import RevisioEngine

/// Learn — the reading surface.
///
/// Subject → topic → notes, the same hierarchy as the web, but the topic row
/// carries the two intentions that matter on a phone: *Learn* meets the unseen
/// questions with the notes beside them, and the notes are what you read when you
/// are not being tested at all.
struct LearnView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 8)
                HStack {
                    Text("Learn").font(.title).bold()
                    Spacer()
                    DensityToggle(density: model.density) { model.setDensity($0) }
                }
                Text("Notes for every topic, and the first questions that go with them.")
                    .font(.caption).foregroundColor(muted).padding(.top, 2)
                Spacer().frame(height: 14)

                if model.subjects.isEmpty {
                    EmptyNote(text: model.online
                        ? "Nothing published yet. Ask a teacher to publish a subject, or create your own in My content on the web."
                        : "Learn needs a connection once — the catalogue is not cached on this device. Today's review still works offline.")
                }

                ForEach(model.subjects) { subject in
                    Panel {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(subject.name).font(.system(size: 16, weight: .semibold))
                                if let description = subject.description, !description.isEmpty {
                                    Text(description).font(.caption).foregroundColor(muted)
                                }
                            }
                            Spacer()
                            Chip(text: "\(subject.topicCount) \(subject.topicCount == 1 ? "topic" : "topics")")
                        }
                        HStack {
                            Button(model.openSubject == subject.id ? "Hide topics" : "Show topics") {
                                model.toggleSubject(subject.id)
                            }
                            .font(.caption).buttonStyle(.plain).foregroundColor(accent)
                            Spacer()
                            if subject.enrolled {
                                Text("Following").font(.caption2).foregroundColor(good)
                            } else {
                                Button("Follow") { model.enroll(subject.id) }
                                    .font(.caption).buttonStyle(.bordered)
                            }
                        }
                        .padding(.top, 6)

                        if model.openSubject == subject.id {
                            HDivider().padding(.vertical, 8)
                            let topics = model.topicsBySubject[subject.id]
                            if topics == nil {
                                Text("Loading topics…").font(.caption).foregroundColor(muted)
                            } else if topics?.isEmpty == true {
                                Text("No topics under this subject yet.").font(.caption).foregroundColor(muted)
                            } else {
                                ForEach(topics ?? []) { topic in
                                    TopicRow(topic: topic, model: model)
                                    HDivider().padding(.vertical, 6)
                                }
                            }
                        }
                    }
                    .padding(.top, 12)
                }

                Spacer().frame(height: 10)
                HStack {
                    Button("Refresh") { model.loadSubjects() }
                        .font(.caption).buttonStyle(.plain).foregroundColor(muted)
                    Spacer()
                    Button("Cram instead") { model.selectTab(.cram) }
                        .font(.caption).buttonStyle(.plain).foregroundColor(muted)
                }
                Spacer().frame(height: 20)
            }
            .padding(20)
        }
    }
}

private struct TopicRow: View {
    let topic: Topic
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(topic.name).font(.system(size: 15, weight: .medium))
                    Text("\(topic.questions) question\(topic.questions == 1 ? "" : "s") · \(topic.notes) note\(topic.notes == 1 ? "" : "s")")
                        .font(.caption2).foregroundColor(muted)
                }
                Spacer()
                if topic.visibility == "private" { Chip(text: "private") }
            }
            HStack(spacing: 8) {
                Button("Learn") { model.startLearn(topic.id) }
                    .buttonStyle(.borderedProminent).tint(accent).frame(maxWidth: .infinity)
                Button(model.openTopic == topic.id ? "Hide notes" : "Read notes") {
                    model.toggleTopic(topic.id)
                }
                .buttonStyle(.bordered).frame(maxWidth: .infinity)
            }

            if model.openTopic == topic.id {
                let lessons = model.lessonsByTopic[topic.id]
                if lessons == nil {
                    Text("Loading notes…").font(.caption).foregroundColor(muted)
                } else if lessons?.isEmpty == true {
                    Text("No notes written for this topic yet.").font(.caption).foregroundColor(muted)
                } else {
                    ForEach(lessons ?? []) { lesson in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(lesson.title).font(.system(size: 14, weight: .semibold))
                                Spacer()
                                if let refs = lesson.specRefs, !refs.isEmpty { Chip(text: refs) }
                            }
                            NotesView(markdown: body(lesson))
                        }
                        .padding(.top, 8)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func body(_ lesson: Lesson) -> String {
        let preferred = model.density == "summary" ? lesson.summaryMd : lesson.detailedMd
        if let preferred, !preferred.isEmpty { return preferred }
        return lesson.detailedMd ?? ""
    }
}
