package app.revisio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.AdminClass
import app.revisio.engine.AdminUser
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Admin — users and content, developers only.
 *
 * The web's `/admin` is a thousand-line console; the phone carries the parts a
 * developer acts on from their pocket, in the web's own order and with the
 * web's own numbers: approvals, the content shape (so "0 public questions" is
 * stated at the top instead of being discovered by a student), feature flags,
 * pending topics, users with their roles and classes, and the audit trail.
 *
 * Every action goes through `staffAction`, which re-reads the console after it
 * lands — the same reload the web's `act()` performs.
 */
@Composable
fun AdminScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        ScreenTitle("Admin", eyebrow = "Developer")
        Spacer(Modifier.height(4.dp))
        Text("Users, content and the platform's shape.", style = Type.caption.style(Muted))
        Spacer(Modifier.height(18.dp))

        if (state.staffNote != null) Notice(state.staffNote!!, good = true, onDismiss = viewModel::clearStaffNote)
        if (state.staffError != null) Notice(state.staffError!!, good = false, onDismiss = viewModel::clearStaffNote)
        if (state.staffNote != null || state.staffError != null) Spacer(Modifier.height(14.dp))

        val data = state.adminData
        if (data == null) {
            SoftCard {
                Text(
                    when {
                        state.staffBusy -> "Loading the console…"
                        state.staffError != null -> state.staffError!!
                        else -> "The console is not loaded yet."
                    },
                    style = Type.caption.style(Muted),
                )
            }
            Spacer(Modifier.height(16.dp))
            PillButton(text = "Load console", onClick = viewModel::loadAdmin, tone = PillTone.Secondary, enabled = !state.staffBusy)
            return@Column
        }

        // ── the content shape, stated at the top ───────────────────────────
        SurfaceCard(modifier = Modifier.entrance(scale = true)) {
            Text("Content", style = Type.strong.style(Ink))
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Stat("Topics", "${data.contentStats.topics}")
                Stat("Public", "${data.contentStats.publicTopics}")
                Stat("Notes", "${data.contentStats.lessons}")
                Stat("Cards", "${data.contentStats.cards}")
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Stat("Public cards", "${data.contentStats.publicCards}")
                Stat(
                    "Empty topics",
                    "${data.contentStats.emptyTopics}",
                    tint = if (data.contentStats.emptyTopics > 0) Warn else Muted,
                )
            }
        }

        // ── approvals ──────────────────────────────────────────────────────
        val pending = data.approvals.filter { it.status == "pending" }
        if (pending.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 1)) {
                Text("Role requests", style = Type.strong.style(Ink))
                Spacer(Modifier.height(4.dp))
                Text("Asking to step up from student.", style = Type.fine.style(Muted))
                Spacer(Modifier.height(10.dp))
                pending.forEachIndexed { index, request ->
                    if (index > 0) Hairline()
                    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
                        Text("${request.name} — ${request.roleRequested}", style = Type.captionS.style(Ink))
                        Text(request.email, style = Type.fine.style(Muted))
                        request.note.takeIf { it.isNotBlank() }?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(it, style = Type.fine.style(Muted))
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PillButton(
                                text = "Approve",
                                onClick = {
                                    viewModel.staffAction(
                                        admin = true,
                                        body = buildJsonObject {
                                            put("action", "approve_request")
                                            put("approvalId", request.id)
                                        },
                                        okMsg = "${request.name} is now a ${request.roleRequested}.",
                                    )
                                },
                                tone = PillTone.Good,
                            )
                            PillButton(
                                text = "Reject",
                                onClick = {
                                    viewModel.staffAction(
                                        admin = true,
                                        body = buildJsonObject {
                                            put("action", "reject_request")
                                            put("approvalId", request.id)
                                        },
                                        okMsg = "${request.name}'s request was rejected.",
                                    )
                                },
                                tone = PillTone.Ghost,
                            )
                        }
                    }
                }
            }
        }

        // ── pending topics ─────────────────────────────────────────────────
        if (data.pendingTopics.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 2)) {
                Text("Topics awaiting review", style = Type.strong.style(Ink))
                Spacer(Modifier.height(10.dp))
                data.pendingTopics.forEachIndexed { index, topic ->
                    if (index > 0) Hairline()
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(topic.name, style = Type.captionS.style(Ink))
                        }
                        PillButton(
                            text = "Approve",
                            onClick = {
                                viewModel.staffAction(
                                    admin = true,
                                    body = buildJsonObject {
                                        put("action", "review_topic")
                                        put("topicId", topic.id)
                                        put("approveTopic", true)
                                    },
                                    okMsg = "${topic.name} approved and live.",
                                )
                            },
                            tone = PillTone.Secondary,
                        )
                    }
                }
            }
        }

        // ── feature flags ──────────────────────────────────────────────────
        if (data.flags.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 3)) {
                Text("Feature flags", style = Type.strong.style(Ink))
                Spacer(Modifier.height(10.dp))
                data.flags.forEachIndexed { index, flag ->
                    if (index > 0) Hairline()
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(flag.key, style = Type.captionS.style(Ink))
                        }
                        PillButton(
                            text = if (flag.enabled) "Disable" else "Enable",
                            onClick = {
                                viewModel.staffAction(
                                    admin = true,
                                    body = buildJsonObject {
                                        put("action", "set_flag")
                                        put("flagKey", flag.key)
                                        put("enabled", !flag.enabled)
                                    },
                                    okMsg = "${flag.key} ${if (flag.enabled) "disabled" else "enabled"}.",
                                )
                            },
                            tone = if (flag.enabled) PillTone.Secondary else PillTone.Ghost,
                        )
                    }
                }
            }
        }

        // ── users ──────────────────────────────────────────────────────────
        Spacer(Modifier.height(20.dp))
        SurfaceCard(modifier = Modifier.entrance(index = 4)) {
            Text("Users", style = Type.strong.style(Ink))
            Spacer(Modifier.height(4.dp))
            Text("${data.users.size} most recent. Tap a user to manage them.", style = Type.fine.style(Muted))
            Spacer(Modifier.height(10.dp))
            data.users.take(50).forEachIndexed { index, user ->
                if (index > 0) Hairline()
                AdminUserRow(state, viewModel, user, data.classes, data.subjects.map { it.id to it.name })
            }
        }

        // ── classes ────────────────────────────────────────────────────────
        if (data.classes.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 5)) {
                Text("Classes", style = Type.strong.style(Ink))
                Spacer(Modifier.height(4.dp))
                Text("Every class on the platform, with its owner.", style = Type.fine.style(Muted))
                Spacer(Modifier.height(10.dp))
                data.classes.forEachIndexed { index, klass ->
                    if (index > 0) Hairline()
                    AdminClassRow(state, viewModel, klass, data.subjects.map { it.id to it.name })
                }
            }
        }

        // ── audit ──────────────────────────────────────────────────────────
        if (data.audit.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 6)) {
                Text("Audit trail", style = Type.strong.style(Ink))
                Spacer(Modifier.height(10.dp))
                data.audit.take(20).forEach { row ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                        Text(
                            "${row.action} · ${row.createdAt?.take(10) ?: ""}",
                            style = Type.fine.style(Muted),
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(28.dp))
    }
}

/**
 * One user, with the actions a developer actually reaches for: role, status,
 * verification, sessions — and the class chips, which behave exactly like the
 * web's: tap a chip to remove, open the picker to add.
 */
@Composable
private fun AdminUserRow(
    state: UiState,
    viewModel: RevisioViewModel,
    user: AdminUser,
    classes: List<AdminClass>,
    subjects: List<Pair<String, String>>,
) {
    var open by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { open = !open },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(user.name, style = Type.captionS.style(Ink))
                Text(user.email, style = Type.fine.style(Muted))
            }
            Chip(user.role)
            Spacer(Modifier.size(6.dp))
            if (user.status != "active") Chip(user.status, tint = Warn)
            Icon(if (open) RevisioIcons.collapse else RevisioIcons.expand, size = 14, tint = Muted)
        }

        if (open) {
            Spacer(Modifier.height(10.dp))
            // Class membership chips — tap to remove, picker to add. Only
            // classes the account is not in are listed in the picker, exactly
            // as the web's own rule reads.
            val inClasses = classes.filter { c -> c.members.any { it.userId == user.id } }
            val notIn = classes.filter { c -> c.members.none { it.userId == user.id } }
            Text("Classes", style = Type.micro.style(Muted))
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                inClasses.take(3).forEach { klass ->
                    ChipPill("${klass.name} ×", active = true) {
                        viewModel.staffAction(
                            admin = true,
                            body = buildJsonObject {
                                put("action", "remove_class_member")
                                put("classId", klass.id)
                                put("userId", user.id)
                            },
                            okMsg = "${user.name} removed from ${klass.name}.",
                        )
                    }
                }
            }
            if (notIn.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                notIn.take(4).forEach { klass ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                viewModel.staffAction(
                                    admin = true,
                                    body = buildJsonObject {
                                        put("action", "add_class_member")
                                        put("classId", klass.id)
                                        put("userId", user.id)
                                    },
                                    okMsg = "${user.name} added to ${klass.name}.",
                                )
                            }
                            .padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(RevisioIcons.join, size = 12, tint = Muted)
                        Spacer(Modifier.size(6.dp))
                        Text("Add to ${klass.name} (${klass.teacherName})", style = Type.fine.style(Muted))
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Text("Account", style = Type.micro.style(Muted))
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PillButton(
                    text = if (user.status == "suspended") "Activate" else "Suspend",
                    onClick = {
                        viewModel.staffAction(
                            admin = true,
                            body = buildJsonObject {
                                put("action", if (user.status == "suspended") "activate_user" else "suspend_user")
                                put("userId", user.id)
                            },
                            okMsg = if (user.status == "suspended") "${user.name} activated." else "${user.name} suspended.",
                        )
                    },
                    tone = if (user.status == "suspended") PillTone.Good else PillTone.Ghost,
                )
                if (user.emailVerifiedAt == null) {
                    PillButton(
                        text = "Verify email",
                        onClick = {
                            viewModel.staffAction(
                                admin = true,
                                body = buildJsonObject {
                                    put("action", "verify_user_email")
                                    put("userId", user.id)
                                },
                                okMsg = "${user.name}'s email marked verified.",
                            )
                        },
                        tone = PillTone.Secondary,
                    )
                }
                PillButton(
                    text = "Revoke sessions",
                    onClick = {
                        viewModel.staffAction(
                            admin = true,
                            body = buildJsonObject {
                                put("action", "revoke_sessions")
                                put("userId", user.id)
                            },
                            okMsg = "All of ${user.name}'s devices are signed out.",
                        )
                    },
                    tone = PillTone.Ghost,
                )
            }

            Spacer(Modifier.height(10.dp))
            Text("Role", style = Type.micro.style(Muted))
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("student", "teacher", "developer").forEach { role ->
                    if (role != user.role) {
                        PillButton(
                            text = role.replaceFirstChar { it.uppercase() },
                            onClick = {
                                viewModel.staffAction(
                                    admin = true,
                                    body = buildJsonObject {
                                        put("action", "set_user_role")
                                        put("userId", user.id)
                                        put("role", role)
                                    },
                                    okMsg = "${user.name} is now a $role.",
                                )
                            },
                            tone = PillTone.Ghost,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AdminClassRow(
    state: UiState,
    viewModel: RevisioViewModel,
    klass: AdminClass,
    subjects: List<Pair<String, String>>,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(klass.name, style = Type.captionS.style(Ink))
                Text(
                    "${klass.teacherName} · ${klass.members.size} member${if (klass.members.size == 1) "" else "s"} · code ${klass.joinCode}",
                    style = Type.fine.style(Muted),
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PillButton(
                text = "Rotate code",
                onClick = {
                    viewModel.staffAction(
                        admin = true,
                        body = buildJsonObject {
                            put("action", "rotate_code")
                            put("classId", klass.id)
                        },
                        okMsg = "New code for ${klass.name}.",
                    )
                },
                tone = PillTone.Ghost,
                icon = RevisioIcons.rotate,
            )
            PillButton(
                text = "Delete",
                onClick = {
                    viewModel.staffAction(
                        admin = true,
                        body = buildJsonObject {
                            put("action", "delete_class")
                            put("classId", klass.id)
                        },
                        okMsg = "Class \"${klass.name}\" deleted.",
                    )
                },
                tone = PillTone.Ghost,
            )
        }
    }
}
