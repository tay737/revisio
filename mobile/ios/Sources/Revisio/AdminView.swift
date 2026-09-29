import RevisioEngine
import SwiftUI

/// Admin — users and content, developers only.
///
/// The web's `/admin` is a thousand-line console; the phone carries the parts a
/// developer acts on from their pocket, in the web's own order and with the
/// web's own numbers: approvals, the content shape (so "0 public questions" is
/// stated at the top instead of being discovered by a student), feature flags,
/// pending topics, users with their roles and classes, and the audit trail.
///
/// Every action goes through `staffAction`, which re-reads the console after it
/// lands — the same reload the web's `act()` performs.
struct AdminView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 12)
                ScreenTitle(title: "Admin", eyebrow: "Developer")
                Spacer().frame(height: 4)
                Text("Users, content and the platform's shape.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 18)

                if let note = model.staffNote {
                    NoticeView(text: note, good: true) { model.clearStaffNote() }
                }
                if let error = model.staffError {
                    NoticeView(text: error, good: false) { model.clearStaffNote() }
                }

                if let data = model.adminData {
                    contentCard(data)
                    approvals(data)
                    pendingTopics(data)
                    flags(data)
                    users(data)
                    classes(data)
                    audit(data)
                } else {
                    SurfaceCard {
                        Text(
                            model.staffBusy ? "Loading the console…"
                                : (model.staffError ?? "The console is not loaded yet.")
                        )
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                    }
                    Spacer().frame(height: 16)
                    PillButton(text: "Load console", tone: .secondary, enabled: !model.staffBusy) {
                        model.loadAdmin()
                    }
                }

                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }

    // ── the content shape, stated at the top ────────────────────────────────

    private func contentCard(_ data: AdminPayload) -> some View {
        SurfaceCard {
            Text("Content")
                .font(Type.strong.font)
                .foregroundStyle(colors.foreground)
            Spacer().frame(height: 10)
            HStack(spacing: 20) {
                Stat(label: "Topics", value: "\(data.contentStats.topics)")
                Stat(label: "Public", value: "\(data.contentStats.publicTopics)")
                Stat(label: "Notes", value: "\(data.contentStats.lessons)")
                Stat(label: "Cards", value: "\(data.contentStats.cards)")
                Spacer(minLength: 0)
            }
            HStack(spacing: 20) {
                Stat(label: "Public cards", value: "\(data.contentStats.publicCards)")
                Stat(
                    label: "Empty topics",
                    value: "\(data.contentStats.emptyTopics)",
                    tint: data.contentStats.emptyTopics > 0 ? colors.streak : colors.mutedForeground,
                )
                Spacer(minLength: 0)
            }
        }
        .entrance(scale: true)
    }

    private func approvals(_ data: AdminPayload) -> some View {
        let pending = data.approvals.filter { $0.status == "pending" }
        return Group {
            if !pending.isEmpty {
                Spacer().frame(height: 20)
                SurfaceCard {
                    Text("Role requests")
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Spacer().frame(height: 4)
                    Text("Asking to step up from student.")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                    Spacer().frame(height: 10)
                    ForEach(pending) { request in
                        Hairline()
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(request.name) — \(request.roleRequested)")
                                .font(Type.captionS.font)
                                .foregroundStyle(colors.foreground)
                            Text(request.email)
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                            if !request.note.isEmpty {
                                Text(request.note)
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                            }
                            HStack(spacing: 8) {
                                PillButton(text: "Approve", tone: .good) {
                                    model.staffAction(
                                        admin: true,
                                        ["action": "approve_request", "approvalId": request.id],
                                        okMsg: "\(request.name) is now a \(request.roleRequested).",
                                    )
                                }
                                PillButton(text: "Reject", tone: .ghost) {
                                    model.staffAction(
                                        admin: true,
                                        ["action": "reject_request", "approvalId": request.id],
                                        okMsg: "\(request.name)'s request was rejected.",
                                    )
                                }
                            }
                        }
                        .padding(.vertical, 12)
                    }
                }
                .entrance(1)
            }
        }
    }

    private func pendingTopics(_ data: AdminPayload) -> some View {
        Group {
            if !data.pendingTopics.isEmpty {
                Spacer().frame(height: 20)
                SurfaceCard {
                    Text("Topics awaiting review")
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Spacer().frame(height: 10)
                    ForEach(data.pendingTopics) { topic in
                        Hairline()
                        HStack {
                            Text(topic.name)
                                .font(Type.captionS.font)
                                .foregroundStyle(colors.foreground)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            PillButton(text: "Approve", tone: .secondary) {
                                model.staffAction(
                                    admin: true,
                                    ["action": "review_topic", "topicId": topic.id, "approveTopic": true],
                                    okMsg: "\(topic.name) approved and live.",
                                )
                            }
                        }
                        .padding(.vertical, 12)
                    }
                }
                .entrance(2)
            }
        }
    }

    private func flags(_ data: AdminPayload) -> some View {
        Group {
            if !data.flags.isEmpty {
                Spacer().frame(height: 20)
                SurfaceCard {
                    Text("Feature flags")
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Spacer().frame(height: 10)
                    ForEach(data.flags) { flag in
                        Hairline()
                        HStack {
                            Text(flag.key)
                                .font(Type.captionS.font)
                                .foregroundStyle(colors.foreground)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            PillButton(
                                text: flag.enabled ? "Disable" : "Enable",
                                tone: flag.enabled ? .secondary : .ghost,
                            ) {
                                model.staffAction(
                                    admin: true,
                                    ["action": "set_flag", "flagKey": flag.key, "enabled": !flag.enabled],
                                    okMsg: "\(flag.key) \(flag.enabled ? "disabled" : "enabled").",
                                )
                            }
                        }
                        .padding(.vertical, 12)
                    }
                }
                .entrance(3)
            }
        }
    }

    private func users(_ data: AdminPayload) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Users")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 4)
                Text("\(data.users.count) most recent. Tap a user to manage them.")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 10)
                ForEach(Array(data.users.prefix(50).enumerated()), id: \.element.id) { index, user in
                    if index > 0 { Hairline() }
                    AdminUserRow(user: user, classes: data.classes, model: model)
                }
            }
            .entrance(4)
        }
    }

    private func classes(_ data: AdminPayload) -> some View {
        Group {
            if !data.classes.isEmpty {
                Spacer().frame(height: 20)
                SurfaceCard {
                    Text("Classes")
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Spacer().frame(height: 4)
                    Text("Every class on the platform, with its owner.")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                    Spacer().frame(height: 10)
                    ForEach(data.classes) { klass in
                        Hairline()
                        AdminClassRow(klass: klass, model: model)
                    }
                }
                .entrance(5)
            }
        }
    }

    private func audit(_ data: AdminPayload) -> some View {
        Group {
            if !data.audit.isEmpty {
                Spacer().frame(height: 20)
                SurfaceCard {
                    Text("Audit trail")
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Spacer().frame(height: 10)
                    ForEach(Array(data.audit.prefix(20).enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Hairline() }
                        HStack {
                            Text("\(row.action) · \(row.createdAt?.prefix(10) ?? "")")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 6)
                    }
                }
                .entrance(6)
            }
        }
    }
}

/// One user, with the actions a developer actually reaches for: role, status,
/// verification, sessions — and the class chips, which behave exactly like the
/// web's: tap a chip to remove, tap a row below to add.
private struct AdminUserRow: View {
    @Environment(\.revisio) private var colors
    let user: AdminUser
    let classes: [AdminClass]
    @ObservedObject var model: AppModel

    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(user.name)
                        .font(Type.captionS.font)
                        .foregroundStyle(colors.foreground)
                    Text(user.email)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
                Chip(text: user.role)
                if user.status != "active" {
                    Chip(text: user.status, tint: colors.streak)
                }
                Icon(open ? "collapse" : "expand", size: 14, color: colors.mutedForeground)
            }
            .contentShape(Rectangle())
            .onTapGesture { open.toggle() }
            .padding(.vertical, 12)

            if open {
                // Class membership chips — tap to remove, tap a row to add. Only
                // classes the account is not in are listed, exactly as the web's
                // own rule reads.
                let inClasses = classes.filter { c in c.members.contains { $0.userId == user.id } }
                let notIn = classes.filter { c in !c.members.contains { $0.userId == user.id } }
                Text("Classes")
                    .font(Type.micro.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 4)
                HStack(spacing: 6) {
                    ForEach(inClasses.prefix(3)) { klass in
                        Button {
                            model.staffAction(
                                admin: true,
                                ["action": "remove_class_member", "classId": klass.id, "userId": user.id],
                                okMsg: "\(user.name) removed from \(klass.name).",
                            )
                        } label: {
                            ChipPill(text: "\(klass.name) ×", active: true)
                        }
                        .buttonStyle(.plain)
                    }
                }
                ForEach(notIn.prefix(4)) { klass in
                    HStack(spacing: 6) {
                        Icon("join", size: 12, color: colors.mutedForeground)
                        Text("Add to \(klass.name) (\(klass.teacherName))")
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        model.staffAction(
                            admin: true,
                            ["action": "add_class_member", "classId": klass.id, "userId": user.id],
                            okMsg: "\(user.name) added to \(klass.name).",
                        )
                    }
                    .padding(.vertical, 6)
                }

                Spacer().frame(height: 10)
                Text("Account")
                    .font(Type.micro.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 4)
                HStack(spacing: 8) {
                    PillButton(
                        text: user.status == "suspended" ? "Activate" : "Suspend",
                        tone: user.status == "suspended" ? .good : .ghost,
                    ) {
                        model.staffAction(
                            admin: true,
                            ["action": user.status == "suspended" ? "activate_user" : "suspend_user", "userId": user.id],
                            okMsg: user.status == "suspended" ? "\(user.name) activated." : "\(user.name) suspended.",
                        )
                    }
                    if user.emailVerifiedAt == nil {
                        PillButton(text: "Verify email", tone: .secondary) {
                            model.staffAction(
                                admin: true,
                                ["action": "verify_user_email", "userId": user.id],
                                okMsg: "\(user.name)'s email marked verified.",
                            )
                        }
                    }
                    PillButton(text: "Revoke sessions", tone: .ghost) {
                        model.staffAction(
                            admin: true,
                            ["action": "revoke_sessions", "userId": user.id],
                            okMsg: "All of \(user.name)'s devices are signed out.",
                        )
                    }
                }

                Spacer().frame(height: 10)
                Text("Role")
                    .font(Type.micro.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 4)
                HStack(spacing: 8) {
                    ForEach(["student", "teacher", "developer"], id: \.self) { role in
                        if role != user.role {
                            PillButton(text: role.capitalized, tone: .ghost) {
                                model.staffAction(
                                    admin: true,
                                    ["action": "set_user_role", "userId": user.id, "role": role],
                                    okMsg: "\(user.name) is now a \(role).",
                                )
                            }
                        }
                    }
                }
                Spacer().frame(height: 8)
            }
        }
    }
}

private struct AdminClassRow: View {
    @Environment(\.revisio) private var colors
    let klass: AdminClass
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(klass.name)
                .font(Type.captionS.font)
                .foregroundStyle(colors.foreground)
            Text("\(klass.teacherName) · \(klass.members.count) member\(klass.members.count == 1 ? "" : "s") · code \(klass.joinCode)")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
            HStack(spacing: 8) {
                PillButton(text: "Rotate code", tone: .ghost, icon: "rotate") {
                    model.staffAction(
                        admin: true,
                        ["action": "rotate_code", "classId": klass.id],
                        okMsg: "New code for \(klass.name).",
                    )
                }
                PillButton(text: "Delete", tone: .ghost) {
                    model.staffAction(
                        admin: true,
                        ["action": "delete_class", "classId": klass.id],
                        okMsg: "Class \"\(klass.name)\" deleted.",
                    )
                }
            }
        }
        .padding(.vertical, 12)
    }
}
