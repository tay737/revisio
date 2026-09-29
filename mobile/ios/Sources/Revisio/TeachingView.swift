import RevisioEngine
import SwiftUI

/// Teaching — classes, join codes and how each student is doing.
///
/// The web's `/teacher`, ported whole: create a class, rotate its code, rename
/// it, add a student by email, remove one, switch the class's subject, delete
/// the class, and publish or withdraw the topics you wrote. The roster is the
/// point of the page, so each student is a block — identity, weekly activity,
/// then mastery on its own line — the same wrapping shape the web's mobile
/// layout settled on.
///
/// Every action goes through `staffAction`, which re-reads the console after it
/// lands, so this screen never shows a state the server has already moved past.
struct TeachingView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 12)
                ScreenTitle(title: "Teaching", eyebrow: "Staff")
                Spacer().frame(height: 4)
                Text("Classes, join codes, progress.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 18)

                if let note = model.staffNote {
                    NoticeView(text: note, good: true) { model.clearStaffNote() }
                }
                if let error = model.staffError {
                    NoticeView(text: error, good: false) { model.clearStaffNote() }
                }

                if let data = model.teacherData {
                    newClass(data)
                    if data.classes.isEmpty {
                        Spacer().frame(height: 20)
                        SurfaceCard {
                            Text("No classes yet. Create one above, share the code, and students appear here as they join.")
                                .font(Type.caption.font)
                                .foregroundStyle(colors.mutedForeground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    ForEach(Array(data.classes.enumerated()), id: \.element.id) { index, klass in
                        Spacer().frame(height: 16)
                        classCard(klass, data, index)
                    }
                    publishing(data)
                } else {
                    SurfaceCard {
                        Text(
                            model.staffBusy ? "Loading your classes…"
                                : (model.staffError ?? "Your classes are not loaded yet.")
                        )
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                    }
                    Spacer().frame(height: 16)
                    PillButton(text: "Load classes", tone: .secondary, enabled: !model.staffBusy) {
                        model.loadTeaching()
                    }
                }

                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }

    private func subjectList(_ data: TeacherPayload) -> [(id: String, name: String)] {
        data.subjects.map { (id: $0.id, name: $0.name) }
    }

    private func newClass(_ data: TeacherPayload) -> some View {
        NewClassForm(subjects: subjectList(data), model: model)
            .entrance(scale: true)
    }

    private func classCard(_ klass: TeacherClass, _ data: TeacherPayload, _ index: Int) -> some View {
        ClassCardView(klass: klass, subjects: subjectList(data), model: model)
            .entrance(index)
    }

    private func publishing(_ data: TeacherPayload) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 20)
            SurfaceCard {
                HStack {
                    Text("Content")
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Spacer(minLength: 0)
                    Chip(text: "\(model.myTopics.count) topic\(model.myTopics.count == 1 ? "" : "s")")
                }
                Spacer().frame(height: 4)
                Text("Staff topics go public immediately, and the questions inside go with them.")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                if model.myTopics.isEmpty {
                    Spacer().frame(height: 10)
                    Text("Nothing written yet — start in the Library.")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                } else {
                    Spacer().frame(height: 10)
                    ForEach(model.myTopics) { topic in
                        Hairline()
                        TopicPublishRow(topic: topic, model: model)
                    }
                }
            }
            .entrance(1)
        }
    }
}

private struct NewClassForm: View {
    @Environment(\.revisio) private var colors
    let subjects: [(id: String, name: String)]
    @ObservedObject var model: AppModel

    @State private var name = ""
    @State private var subjectId = ""

    var body: some View {
        SurfaceCard {
            Text("New class")
                .font(Type.strong.font)
                .foregroundStyle(colors.foreground)
            Spacer().frame(height: 4)
            Text("You will get a six-character code to hand out. You can rotate it if it spreads further than you want.")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 12)
            SettingsField(label: "Class name", placeholder: "10B Biology", value: $name)
            Spacer().frame(height: 14)
            PillButton(
                text: model.staffBusy ? "Creating…" : "Create class",
                icon: "add",
                enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty && !model.staffBusy,
                large: true
            ) {
                var body: [String: Any] = [
                    "action": "create_class",
                    "name": name.trimmingCharacters(in: .whitespaces),
                ]
                if let first = subjects.first {
                    body["subjectId"] = subjectId.isEmpty ? first.id : subjectId
                }
                model.staffAction(admin: false, body, okMsg: "Class created — share the join code.")
                name = ""
            }
        }
    }
}

private struct ClassCardView: View {
    @Environment(\.revisio) private var colors
    let klass: TeacherClass
    let subjects: [(id: String, name: String)]
    @ObservedObject var model: AppModel


    @State private var renaming = false
    @State private var renameDraft = ""
    @State private var inviting = false
    @State private var inviteEmail = ""

    var body: some View {
        SurfaceCard {
            HStack(spacing: 12) {
                BoxedGlyph(icon: "join")
                VStack(alignment: .leading, spacing: 2) {
                    Text(klass.name)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Text("\(klass.roster.count) student\(klass.roster.count == 1 ? "" : "s")")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
            }
            Spacer().frame(height: 12)

            // The join code, and the two things a teacher does to it.
            HStack(spacing: 10) {
                Text(klass.joinCode)
                    .font(Type.strong.font)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(colors.secondary, in: RoundedRectangle(cornerRadius: Radius.sm))
                PillButton(text: "Rotate", tone: .ghost, icon: "rotate") {
                    model.staffAction(
                        admin: false,
                        ["action": "rotate_code", "classId": klass.id],
                        okMsg: "New code generated. The old one no longer works.",
                    )
                }
            }
            Spacer().frame(height: 10)
            HStack(spacing: 8) {
                PillButton(text: "Rename", tone: .ghost, icon: "edit") {
                    if renaming {
                        renaming = false
                    } else {
                        renaming = true
                        renameDraft = klass.name
                    }
                }
                PillButton(text: "Add student", tone: .ghost, icon: "add") {
                    if inviting {
                        inviting = false
                    } else {
                        inviting = true
                        inviteEmail = ""
                    }
                }
                PillButton(text: "Delete", tone: .ghost) {
                    model.staffAction(
                        admin: false,
                        ["action": "delete_class", "classId": klass.id],
                        okMsg: "Class \"\(klass.name)\" deleted.",
                    )
                }
            }

            if renaming {
                Spacer().frame(height: 10)
                SettingsField(label: "New class name", placeholder: klass.name, value: $renameDraft)
                Spacer().frame(height: 8)
                PillButton(
                    text: "Save",
                    enabled: !renameDraft.trimmingCharacters(in: .whitespaces).isEmpty && !model.staffBusy,
                ) {
                    model.staffAction(
                        admin: false,
                        ["action": "rename_class", "classId": klass.id, "name": renameDraft.trimmingCharacters(in: .whitespaces)],
                        okMsg: "Class renamed.",
                    )
                    renaming = false
                }
            }

            if inviting {
                Spacer().frame(height: 10)
                SettingsField(label: "Student email", placeholder: "student@school.org", value: $inviteEmail)
                Spacer().frame(height: 8)
                PillButton(
                    text: "Add to class",
                    enabled: inviteEmail.contains("@") && !model.staffBusy,
                ) {
                    model.staffAction(
                        admin: false,
                        ["action": "add_class_member", "classId": klass.id, "email": inviteEmail.trimmingCharacters(in: .whitespaces)],
                        okMsg: "\(inviteEmail.trimmingCharacters(in: .whitespaces)) added to \(klass.name).",
                    )
                    inviting = false
                }
            }

            // A class belongs to a subject; switching it here keeps the dashboard
            // grouping truthful without recreating the class.
            if !subjects.isEmpty {
                Spacer().frame(height: 12)
                Text("Subject")
                    .font(Type.eyebrow.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 4)
                SubjectMenu(current: klass.subjectId, subjects: subjects) { next in
                    model.staffAction(
                        admin: false,
                        ["action": "set_class_subject", "classId": klass.id, "subjectId": next],
                        okMsg: "Subject updated.",
                    )
                }
            }

            Spacer().frame(height: 12)
            Hairline()
            if klass.roster.isEmpty {
                Spacer().frame(height: 10)
                Text("Nobody has joined yet. Share the code above and they will show up here.")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            } else {
                ForEach(klass.roster) { student in
                    Hairline()
                    RosterRowView(klass: klass, student: student, model: model)
                }
            }
        }
    }
}

private struct RosterRowView: View {
    @Environment(\.revisio) private var colors
    let klass: TeacherClass
    let student: RosterEntry
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(student.name)
                        .font(Type.captionS.font)
                        .foregroundStyle(colors.foreground)
                    Text(student.email)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
                // Removing is one tap with its own undo-by-rejoining path, so the
                // confirm the web needs is not reproduced as a dialog here; the
                // roster reloads and the student can rejoin with the code.
                PillButton(text: "Remove", tone: .ghost) {
                    model.staffAction(
                        admin: false,
                        ["action": "remove_class_member", "classId": klass.id, "userId": student.userId],
                        okMsg: "\(student.name) removed from \(klass.name).",
                    )
                }
            }
            HStack(spacing: 14) {
                HStack(spacing: 4) {
                    Icon("streak", size: 12, color: student.streak > 0 ? colors.streak : colors.mutedForeground)
                    Text("\(student.streak)d")
                        .font(Type.fine.font)
                        .foregroundStyle(student.streak > 0 ? colors.streak : colors.mutedForeground)
                }
                Text("\(student.reviews7d) rev")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                Text("\(student.xp7d) XP")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                Text("Mastery")
                    .font(Type.micro.font)
                    .foregroundStyle(colors.mutedForeground)
                Meter(percent: min(max(student.masteryPct, 0), 100), tint: colors.foreground, height: 5)
                Text("\(student.masteryPct)%")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }
        }
        .padding(.vertical, 12)
    }
}

private struct TopicPublishRow: View {
    @Environment(\.revisio) private var colors
    let topic: MyTopic
    @ObservedObject var model: AppModel

    private var live: Bool { topic.visibility == "public" }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(topic.name)
                        .font(Type.captionS.font)
                        .foregroundStyle(colors.foreground)
                    ChipPill(text: live ? "public" : topic.visibility.replacingOccurrences(of: "_", with: " "), active: live)
                }
                Text("\(topic.cardCount ?? 0) questions · \(topic.lessonCount ?? 0) note\((topic.lessonCount ?? 0) == 1 ? "" : "s")")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }
            Spacer(minLength: 0)
            PillButton(
                text: live ? "Withdraw" : "Publish",
                tone: live ? .ghost : .secondary,
                icon: live ? "unpublish" : "publish",
            ) {
                model.staffAction(
                    admin: false,
                    [
                        "action": "set_topic_visibility",
                        "topicId": topic.id,
                        "visibility": live ? "private" : "public",
                    ],
                    okMsg: live ? "\(topic.name) withdrawn." : "\(topic.name) is live — questions included.",
                )
            }
        }
        .padding(.vertical, 12)
    }
}

/// A labelled dropdown over the subject list — the web's `<select>`.
struct SubjectMenu: View {
    @Environment(\.revisio) private var colors
    let current: String
    let subjects: [(id: String, name: String)]
    let onPick: (String) -> Void

    var body: some View {
        Menu {
            ForEach(Array(subjects.enumerated()), id: \.element.id) { _, subject in
                Button(subject.name) { onPick(subject.id) }
            }
        } label: {
            HStack {
                Text(subjects.first { $0.id == current }?.name ?? "No subject")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.foreground)
                Spacer(minLength: 0)
                Icon("expand", size: 14, color: colors.mutedForeground)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(colors.secondary, in: RoundedRectangle(cornerRadius: Radius.sm))
        }
    }
}
