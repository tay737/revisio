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
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.StaffStudentRef
import app.revisio.UiState
import app.revisio.engine.MyTopic
import app.revisio.engine.RosterEntry
import app.revisio.engine.SrsLadder
import app.revisio.engine.StudentCardStrength
import app.revisio.engine.StudentProgress
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
        // The progress sheet replaces the console while it is open, the way a
        // stored paper replaces the exam picker: one thing on screen at a time.
        if (state.studentProgressFor != null) {
            StudentProgressView(state, viewModel)
            return@Column
        }

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
        SettingsField(
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
            // The name opens the progress sheet — the web's affordance: the
            // weekly numbers say who has stalled, and the sheet says why.
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { viewModel.openStudentProgress(StaffStudentRef(student.userId, student.name)) },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(student.name, style = Type.captionS.style(Ink))
                    Spacer(Modifier.width(4.dp))
                    Icon(RevisioIcons.expand, size = 11, tint = Muted)
                }
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

// ── the per-student progress sheet ──────────────────────────────────────────
//
// The web's `StudentProgressPanel`, shared by the teacher roster and the admin
// users table. It answers the three questions a teacher actually brings to the
// data: are they working (the overview strip), what is struggling (the miss
// list and the ladder), and what have they answered (the recent ledger,
// verbatim). The phone reads the same payload more quietly: ink meters instead
// of tier colours, one column instead of a sheet — the design law this port
// follows everywhere else.

@Composable
fun StudentProgressView(state: UiState, viewModel: RevisioViewModel) {
    val target = state.studentProgressFor ?: return
    val data = state.studentProgress
    var showAllCards by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        ScreenTitle(target.name, eyebrow = "Progress")
        if (data != null) {
            Spacer(Modifier.height(4.dp))
            Text(
                if (data.subjects.isEmpty()) "No subjects studied yet"
                else data.subjects.joinToString(" · ") { it.name },
                style = Type.caption.style(Muted),
            )
        }
        Spacer(Modifier.height(14.dp))

        if (state.studentProgressError != null) {
            SoftCard {
                Text(state.studentProgressError!!, style = Type.caption.style(Muted))
            }
            Spacer(Modifier.height(14.dp))
        } else if (data == null) {
            SoftCard {
                Text(
                    if (state.studentProgressBusy) "Loading progress…" else "No progress to show yet.",
                    style = Type.caption.style(Muted),
                )
            }
            Spacer(Modifier.height(14.dp))
        } else {
            OverviewCard(data)
            Spacer(Modifier.height(20.dp))
            StrengthCard(data)
            Spacer(Modifier.height(20.dp))
            StrugglingCard(data)
            Spacer(Modifier.height(20.dp))
            RecentCard(data)
            Spacer(Modifier.height(20.dp))
            CardStrengthsCard(data, showAll = showAllCards, onToggle = { showAllCards = !showAllCards })
            Spacer(Modifier.height(20.dp))
        }

        PillButton(text = "Close", onClick = viewModel::closeStudentProgress, tone = PillTone.Ghost, icon = RevisioIcons.collapse)
        Spacer(Modifier.height(28.dp))
    }
}

/** The overview strip: reviews, accuracy, streak, due now — two rows of two. */
@Composable
private fun OverviewCard(data: StudentProgress) {
    val o = data.overview
    SurfaceCard {
        Row(modifier = Modifier.fillMaxWidth()) {
            Box(modifier = Modifier.weight(1f)) { ProgressStat("Reviews", "${o.totalReviews}", "${o.monthReviews} in 30d") }
            Box(modifier = Modifier.weight(1f)) {
                ProgressStat(
                    "Accuracy",
                    o.correctPct?.let { "$it%" } ?: "—",
                    o.monthCorrectPct?.let { "$it% in 30d" } ?: "no answers yet",
                    tint = if ((o.correctPct ?: 100) < 60) Bad else null,
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        Hairline()
        Spacer(Modifier.height(14.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            Box(modifier = Modifier.weight(1f)) { ProgressStat("Streak", "${o.streak}d", "best ${o.bestStreak}d") }
            Box(modifier = Modifier.weight(1f)) {
                ProgressStat("Due now", "${o.dueCount}", "${o.totalCards} cards", tint = if (o.dueCount > 0) Warn else null)
            }
        }
    }
}

/** A label-over-number pair with its explanatory line — the web's OverviewStat. */
@Composable
private fun ProgressStat(label: String, value: String, note: String, tint: Color? = null) {
    Column {
        Label(label, token = Type.micro, color = Muted)
        Spacer(Modifier.height(2.dp))
        Text(value, style = Type.displaySm.style(tint ?: Ink))
        Spacer(Modifier.height(2.dp))
        Text(note, style = Type.fine.style(Muted))
    }
}

/**
 * The twelve rungs, every one of them — including the ones this learner holds
 * no cards on, because an empty rung is information too: it is what "strong"
 * would have to look like.
 */
@Composable
private fun StrengthCard(data: StudentProgress) {
    val maxCount = (data.srsLevels.maxOfOrNull { it.count } ?: 0).coerceAtLeast(1)
    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("SRS strength", style = Type.strong.style(Ink), modifier = Modifier.weight(1f))
            Text("levels 1–12", style = Type.fine.style(Muted))
        }
        Spacer(Modifier.height(4.dp))
        Text("Every card the learner has touched, by strength. Higher rungs mean longer intervals.", style = Type.fine.style(Muted))
        Spacer(Modifier.height(12.dp))
        SrsLadder.rungs.forEach { rung ->
            val count = data.srsLevels.firstOrNull { it.level == rung.level }?.count ?: 0
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 3.dp)) {
                Text("${rung.level}", style = Type.fine.style(if (count == 0) Muted else Ink), modifier = Modifier.width(22.dp))
                Column(modifier = Modifier.width(92.dp)) {
                    Text(rung.label, style = Type.fine.style(if (count == 0) Muted else Ink))
                    rung.interval?.let { Text(it, style = Type.micro.style(Muted)) }
                }
                Box(modifier = Modifier.weight(1f)) {
                    Meter((count * 100) / maxCount, tint = Ink, height = 5.dp)
                }
                Spacer(Modifier.width(8.dp))
                Text("$count", style = Type.fine.style(if (count == 0) Muted else Ink), modifier = Modifier.width(24.dp))
            }
        }
    }
}

/** The miss list, most-missed first, with the per-topic roll-up under it. */
@Composable
private fun StrugglingCard(data: StudentProgress) {
    SurfaceCard {
        Text("Struggling with", style = Type.strong.style(Ink))
        Spacer(Modifier.height(10.dp))
        if (data.struggling.isEmpty()) {
            Text("No misses in the last 30 days — or nothing studied yet.", style = Type.caption.style(Muted))
        } else {
            data.struggling.forEachIndexed { index, topic ->
                if (index > 0) Hairline()
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 10.dp)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(topic.topicName, style = Type.captionS.style(Ink))
                        Text(
                            "${topic.subjectName} · last miss ${whenLabel(topic.lastMissedAt)}",
                            style = Type.fine.style(Muted),
                        )
                    }
                    Chip(
                        "${topic.misses} miss${if (topic.misses == 1) "" else "es"}",
                        tint = Bad,
                    )
                }
            }
            if (data.topicHealth.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Hairline()
                Spacer(Modifier.height(10.dp))
                Label("Topic health", token = Type.eyebrow, color = Muted)
                Spacer(Modifier.height(8.dp))
                data.topicHealth.forEach { topic ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row {
                                Text(topic.topicName, style = Type.caption.style(Ink), modifier = Modifier.weight(1f))
                                Text(
                                    "${topic.masteryPct}% mastered" +
                                        (if (topic.missCount > 0) " · ${topic.missCount} miss${if (topic.missCount == 1) "" else "es"}" else ""),
                                    style = Type.fine.style(Muted),
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Meter(topic.masteryPct.coerceIn(0, 100), tint = Ink, height = 4.dp)
                        }
                    }
                }
            }
        }
    }
}

/** The last twenty answers, exactly as they were graded. */
@Composable
private fun RecentCard(data: StudentProgress) {
    SurfaceCard {
        Text("Recent answers", style = Type.strong.style(Ink))
        Spacer(Modifier.height(4.dp))
        Text("The last twenty reviews exactly as they were graded.", style = Type.fine.style(Muted))
        Spacer(Modifier.height(10.dp))
        if (data.recent.isEmpty()) {
            Text("Nothing answered yet.", style = Type.caption.style(Muted))
        } else {
            data.recent.forEachIndexed { index, answer ->
                if (index > 0) Hairline()
                Row(modifier = Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        when {
                            answer.correct == null -> RevisioIcons.clock
                            answer.correct == true -> RevisioIcons.correct
                            else -> RevisioIcons.close
                        },
                        size = 13,
                        tint = when {
                            answer.correct == null -> Muted
                            answer.correct == true -> Good
                            else -> Bad
                        },
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(answer.prompt ?: "(no text)", style = Type.caption.style(Ink))
                        Text(
                            "${answer.topicName} · ${whenLabel(answer.reviewedAt)} · ${answer.mode}",
                            style = Type.fine.style(Muted),
                        )
                    }
                    val given = answer.userAnswer
                    if (!given.isNullOrEmpty()) {
                        Spacer(Modifier.width(8.dp))
                        Chip(given, tint = Muted)
                    }
                }
            }
        }
    }
}

/** Card-level strength, eight at a time, with the soonest due dates underneath. */
@Composable
private fun CardStrengthsCard(data: StudentProgress, showAll: Boolean, onToggle: () -> Unit) {
    val cards: List<StudentCardStrength> = if (showAll) data.distribution else data.distribution.take(8)
    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Card strengths", style = Type.strong.style(Ink), modifier = Modifier.weight(1f))
            if (data.distribution.size > 8) {
                PillButton(
                    text = if (showAll) "Show less" else "Show all ${data.distribution.size}",
                    onClick = onToggle,
                    tone = PillTone.Ghost,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        if (cards.isEmpty()) {
            Text("No cards in rotation yet.", style = Type.caption.style(Muted))
        } else {
            cards.forEachIndexed { index, card ->
                if (index > 0) Hairline()
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 10.dp)) {
                    Text("${card.srsLevel}", style = Type.fine.style(Ink), modifier = Modifier.width(24.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(card.prompt ?: "(no text)", style = Type.caption.style(Ink))
                        Text(
                            "${card.topicName} · ${card.srsLabel}" +
                                (if (card.lapses > 0) " · ${card.lapses} lapse${if (card.lapses == 1) "" else "s"}" else ""),
                            style = Type.fine.style(Muted),
                        )
                    }
                    val due = card.dueAt
                    Text(
                        if (due != null && isDue(due)) "due now" else whenLabel(due),
                        style = Type.fine.style(Muted),
                    )
                }
            }
            if (data.upcoming.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Hairline()
                Spacer(Modifier.height(10.dp))
                Label("Coming up next", token = Type.eyebrow, color = Muted)
                Spacer(Modifier.height(4.dp))
                Text(
                    data.upcoming.take(3).joinToString(" · ") { upcoming ->
                        val prompt = upcoming.prompt ?: "card"
                        val clipped = prompt.take(40) + if (prompt.length > 40) "…" else ""
                        "“$clipped” (${whenLabel(upcoming.dueAt)})"
                    },
                    style = Type.caption.style(Muted),
                )
            }
        }
    }
}

/** The web's relative-time line: "5m ago", "in 2h", "—" when there is nothing. */
internal fun whenLabel(iso: String?): String {
    if (iso == null || iso.isEmpty()) return "—"
    val then = runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }.getOrNull()
        ?: return "—"
    val diff = System.currentTimeMillis() - then
    val mins = Math.abs(diff) / 60_000
    val label = when {
        mins < 60 -> "${mins}m"
        mins < 60 * 24 -> "${mins / 60}h"
        mins < 60 * 24 * 30 -> "${mins / (60 * 24)}d"
        else -> "${mins / (60 * 24 * 30)}mo"
    }
    return if (diff < 0) "in $label" else "$label ago"
}

private fun isDue(iso: String): Boolean {
    val then = runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }.getOrNull()
        ?: return false
    return then <= System.currentTimeMillis()
}
