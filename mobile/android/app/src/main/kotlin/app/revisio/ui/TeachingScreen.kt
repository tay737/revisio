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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.MyTopic
import app.revisio.engine.RosterEntry
import app.revisio.engine.TeacherClass
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Teaching — classes, join codes and how each student is doing.
 *
 * The web's `/teacher`, ported whole: create a class, rotate its code, rename
 * it, add a student by email, remove one, switch the class's subject, delete
 * the class, and publish or withdraw the topics you wrote. The roster is the
 * point of the page, so each student is a block — identity, weekly activity,
 * then mastery on its own line — the same wrapping shape the web's mobile
 * layout settled on.
 *
 * Every action goes through `staffAction`, which re-reads the console after it
 * lands, so this screen never shows a state the server has already moved past.
 */
@Composable
fun TeachingScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        ScreenTitle("Teaching", eyebrow = "Staff")
        Spacer(Modifier.height(4.dp))
        Text("Classes, join codes, progress.", style = Type.caption.style(Muted))
        Spacer(Modifier.height(18.dp))

        if (state.staffNote != null) Notice(state.staffNote!!, good = true, onDismiss = viewModel::clearStaffNote)
        if (state.staffError != null) Notice(state.staffError!!, good = false, onDismiss = viewModel::clearStaffNote)
        if (state.staffNote != null || state.staffError != null) Spacer(Modifier.height(14.dp))

        val data = state.teacherData
        if (data == null) {
            SoftCard {
                Text(
                    when {
                        state.staffBusy -> "Loading your classes…"
                        state.staffError != null -> state.staffError!!
                        else -> "Your classes are not loaded yet."
                    },
                    style = Type.caption.style(Muted),
                )
            }
            Spacer(Modifier.height(16.dp))
            PillButton(text = "Load classes", onClick = viewModel::loadTeaching, tone = PillTone.Secondary, enabled = !state.staffBusy)
            return@Column
        }

        NewClassCard(state, viewModel, data.subjects.map { it.id to it.name })

        if (data.classes.isEmpty()) {
            Spacer(Modifier.height(20.dp))
            SoftCard {
                Text("No classes yet. Create one above, share the code, and students appear here as they join.", style = Type.caption.style(Muted))
            }
        }
        data.classes.forEachIndexed { index, klass ->
            Spacer(Modifier.height(16.dp))
            ClassCard(state, viewModel, klass, data.subjects.map { it.id to it.name }, index)
        }

        // ── publishing ─────────────────────────────────────────────────────
        Spacer(Modifier.height(20.dp))
        SurfaceCard(modifier = Modifier.entrance(index = 1)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Content", style = Type.strong.style(Ink), modifier = Modifier.weight(1f))
                Chip("${state.myTopics.size} topic${if (state.myTopics.size == 1) "" else "s"}")
            }
            Spacer(Modifier.height(4.dp))
            Text("Staff topics go public immediately, and the questions inside go with them.", style = Type.fine.style(Muted))
            if (state.myTopics.isEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text("Nothing written yet — start in the Library.", style = Type.fine.style(Muted))
            } else {
                Spacer(Modifier.height(10.dp))
                state.myTopics.forEachIndexed { topicIndex, topic ->
                    if (topicIndex > 0) Hairline()
                    TopicPublishRow(state, viewModel, topic)
                }
            }
        }

        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun NewClassCard(state: UiState, viewModel: RevisioViewModel, subjects: List<Pair<String, String>>) {
    var name by remember { mutableStateOf("") }
    var subjectId by remember { mutableStateOf("") }

    SurfaceCard(modifier = Modifier.entrance(scale = true)) {
        Text("New class", style = Type.strong.style(Ink))
        Spacer(Modifier.height(4.dp))
        Text("You will get a six-character code to hand out. You can rotate it if it spreads further than you want.", style = Type.fine.style(Muted))
        Spacer(Modifier.height(12.dp))
        app.revisio.ui.        SettingsField(
            label = "Class name",
            value = name,
            onChange = { name = it },
            placeholder = "10B Biology",
        )
        if (subjects.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            SubjectPicker("Subject", subjectId, subjects) { subjectId = it }
        }
        Spacer(Modifier.height(14.dp))
        PillButton(
            text = if (state.staffBusy) "Creating…" else "Create class",
            onClick = {
                viewModel.staffAction(
                    admin = false,
                    body = buildJsonObject {
                        put("action", "create_class")
                        put("name", name.trim())
                        if (subjectId.isNotBlank()) put("subjectId", subjectId)
                        else subjects.firstOrNull()?.let { put("subjectId", it.first) }
                    },
                    okMsg = "Class created — share the join code.",
                )
                name = ""
            },
            tone = PillTone.Primary,
            icon = RevisioIcons.add,
            enabled = name.isNotBlank() && !state.staffBusy,
            large = true,
        )
    }
}

@Composable
private fun ClassCard(state: UiState, viewModel: RevisioViewModel, klass: TeacherClass, subjects: List<Pair<String, String>>, index: Int) {
    var renaming by remember { mutableStateOf(false) }
    var renameDraft by remember { mutableStateOf("") }
    var inviting by remember { mutableStateOf(false) }
    var inviteEmail by remember { mutableStateOf("") }

    SurfaceCard(modifier = Modifier.entrance(index = index)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BoxedGlyph(RevisioIcons.join)
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(klass.name, style = Type.strong.style(Ink))
                Text(
                    "${klass.roster.size} student${if (klass.roster.size == 1) "" else "s"}",
                    style = Type.fine.style(Muted),
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        // The join code, and the two things a teacher does to it.
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(Radius.sm))
                    .background(Card2)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(klass.joinCode, style = Type.strong.style(Ink))
            }
            PillButton(
                text = "Rotate",
                onClick = {
                    viewModel.staffAction(
                        admin = false,
                        body = buildJsonObject {
                            put("action", "rotate_code")
                            put("classId", klass.id)
                        },
                        okMsg = "New code generated. The old one no longer works.",
                    )
                },
                tone = PillTone.Ghost,
                icon = RevisioIcons.rotate,
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PillButton(
                text = "Rename",
                onClick = {
                    if (renaming) {
                        renaming = false
                    } else {
                        renaming = true
                        renameDraft = klass.name
                    }
                },
                tone = PillTone.Ghost,
                icon = RevisioIcons.edit,
            )
            PillButton(
                text = "Add student",
                onClick = {
                    if (inviting) {
                        inviting = false
                    } else {
                        inviting = true
                        inviteEmail = ""
                    }
                },
                tone = PillTone.Ghost,
                icon = RevisioIcons.add,
            )
            PillButton(
                text = "Delete",
                onClick = {
                    viewModel.staffAction(
                        admin = false,
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

        if (renaming) {
            Spacer(Modifier.height(10.dp))
            SettingsField(
                label = "New class name",
                value = renameDraft,
                onChange = { renameDraft = it.take(80) },
                placeholder = klass.name,
            )
            Spacer(Modifier.height(8.dp))
            PillButton(
                text = "Save",
                onClick = {
                    viewModel.staffAction(
                        admin = false,
                        body = buildJsonObject {
                            put("action", "rename_class")
                            put("classId", klass.id)
                            put("name", renameDraft.trim())
                        },
                        okMsg = "Class renamed.",
                    )
                    renaming = false
                },
                enabled = renameDraft.isNotBlank() && !state.staffBusy,
            )
        }

        if (inviting) {
            Spacer(Modifier.height(10.dp))
            SettingsField(
                label = "Student email",
                value = inviteEmail,
                onChange = { inviteEmail = it },
                placeholder = "student@school.org",
                imeAction = ImeAction.Done,
            )
            Spacer(Modifier.height(8.dp))
            PillButton(
                text = "Add to class",
                onClick = {
                    viewModel.staffAction(
                        admin = false,
                        body = buildJsonObject {
                            put("action", "add_class_member")
                            put("classId", klass.id)
                            put("email", inviteEmail.trim())
                        },
                        okMsg = "${inviteEmail.trim()} added to ${klass.name}.",
                    )
                    inviting = false
                },
                enabled = inviteEmail.contains("@") && !state.staffBusy,
            )
        }

        // A class belongs to a subject; switching it here keeps the dashboard
        // grouping truthful without recreating the class.
        if (subjects.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            SubjectPicker("Subject", klass.subjectId, subjects) { next ->
                viewModel.staffAction(
                    admin = false,
                    body = buildJsonObject {
                        put("action", "set_class_subject")
                        put("classId", klass.id)
                        put("subjectId", next)
                    },
                    okMsg = "Subject updated.",
                )
            }
        }

        Spacer(Modifier.height(12.dp))
        Hairline()
        if (klass.roster.isEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("Nobody has joined yet. Share the code above and they will show up here.", style = Type.fine.style(Muted))
        } else {
            klass.roster.forEachIndexed { rosterIndex, student ->
                if (rosterIndex > 0) Hairline()
                RosterRow(state, viewModel, klass, student)
            }
        }
    }
}

@Composable
private fun RosterRow(state: UiState, viewModel: RevisioViewModel, klass: TeacherClass, student: RosterEntry) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(student.name, style = Type.captionS.style(Ink))
                Text(student.email, style = Type.fine.style(Muted))
            }
            // Removing is one tap with its own undo-by-rejoining path, so the
            // confirm the web needs is not reproduced as a dialog here; the
            // roster reloads and the student can rejoin with the code.
            PillButton(
                text = "Remove",
                onClick = {
                    viewModel.staffAction(
                        admin = false,
                        body = buildJsonObject {
                            put("action", "remove_class_member")
                            put("classId", klass.id)
                            put("userId", student.userId)
                        },
                        okMsg = "${student.name} removed from ${klass.name}.",
                    )
                },
                tone = PillTone.Ghost,
            )
        }
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            val streakInk = if (student.streak > 0) Warn else Muted
            Icon(RevisioIcons.streak, size = 12, tint = streakInk)
            Text("${student.streak}d", style = Type.fine.style(streakInk))
            Text("${student.reviews7d} rev", style = Type.fine.style(Muted))
            Text("${student.xp7d} XP", style = Type.fine.style(Muted))
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Label("Mastery", token = Type.micro, color = Muted)
            Box(modifier = Modifier.weight(1f)) { Meter(student.masteryPct.coerceIn(0, 100), tint = Ink, height = 5.dp) }
            Text("${student.masteryPct}%", style = Type.fine.style(Muted))
        }
    }
}

@Composable
private fun TopicPublishRow(state: UiState, viewModel: RevisioViewModel, topic: MyTopic) {
    val live = topic.visibility == "public"
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(topic.name, style = Type.captionS.style(Ink), modifier = Modifier.weight(1f, fill = false))
                ChipPill(if (live) "public" else topic.visibility.replace('_', ' '), active = live)
            }
            Spacer(Modifier.height(2.dp))
            Text(
                "${topic.cardCount ?: 0} questions · ${topic.lessonCount ?: 0} note${if ((topic.lessonCount ?: 0) == 1) "" else "s"}",
                style = Type.fine.style(Muted),
            )
        }
        PillButton(
            text = if (live) "Withdraw" else "Publish",
            onClick = {
                viewModel.staffAction(
                    admin = false,
                    body = buildJsonObject {
                        put("action", "set_topic_visibility")
                        put("topicId", topic.id)
                        put("visibility", if (live) "private" else "public")
                    },
                    okMsg = if (live) "${topic.name} withdrawn." else "${topic.name} is live — questions included.",
                )
            },
            tone = if (live) PillTone.Ghost else PillTone.Secondary,
            icon = if (live) RevisioIcons.unpublish else RevisioIcons.publish,
        )
    }
}

/** A labelled dropdown over the subject list — the web's `<select>`. */
@Composable
private fun SubjectPicker(label: String, current: String, subjects: List<Pair<String, String>>, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val currentName = subjects.firstOrNull { it.first == current }?.second ?: "No subject"
    Column {
        Label(label, token = Type.eyebrow, color = Muted)
        Spacer(Modifier.height(4.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radius.sm))
                .background(Card2)
                .clickable { open = !open }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(currentName, style = Type.caption.style(Ink), modifier = Modifier.weight(1f))
            Icon(if (open) RevisioIcons.collapse else RevisioIcons.expand, size = 14, tint = Muted)
        }
        if (open) {
            subjects.forEach { (id, name) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            onPick(id)
                            open = false
                        }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(name, style = Type.caption.style(if (id == current) Ink else Muted))
                }
            }
        }
    }
}
