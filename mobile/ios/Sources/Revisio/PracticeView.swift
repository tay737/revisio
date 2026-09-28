import RevisioEngine
import SwiftUI

/// Practice — generated maths drills.
///
/// The generator is the server's, and that is the design rather than an accident:
/// a question is derived from its id, so this screen never holds an answer key and
/// there is no second implementation of the maths to drift from the web's. The
/// phone asks for a paper, shows the prompt, and sends back an id and a string.
///
/// Practice is also deliberately outside the scheduler — nothing here writes a
/// review log or moves a card — which is why it gets its own destination instead
/// of being folded into Cram. It is the difference between "I want to get better at
/// quadratics" and "I have an exam in three days".
///
/// The three phases are the web's: pick, run, and a summary. A scoreline alone
/// teaches nothing, so the run phase shows the worked solution the moment a
/// question is marked, while the attempt is still in the learner's head.
struct PracticeView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 12)
                ScreenTitle(title: "Practice", eyebrow: "Drills")
                Spacer().frame(height: 4)
                Text("Generate maths questions. Your schedule stays out of it.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 18)

                if model.practiceDone {
                    summary
                } else if !model.practicePaper.isEmpty {
                    run
                } else {
                    pick
                }

                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }

    // ── pick ────────────────────────────────────────────────────────────────

    @ViewBuilder private var pick: some View {
        if model.mathsSubjects.isEmpty {
            SoftCard {
                Text(model.busy ? "Looking for subjects with practice…" : "No subject has maths practice yet.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            SurfaceCard {
                Text("Subject")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 8)
                ChipRows(items: model.mathsSubjects.map(\.name), perRow: 2, selected: { index in
                    model.practiceSubject == model.mathsSubjects[index].id
                }) { index in
                    model.selectPracticeSubject(model.mathsSubjects[index].id)
                }
            }
            .entrance(scale: true)

            if let catalogue = model.mathsCatalogue, !catalogue.topics.isEmpty {
                Spacer().frame(height: 16)
                SurfaceCard {
                    Text("Topics")
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Spacer().frame(height: 4)
                    Text("None chosen means every topic in the subject.")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                    Spacer().frame(height: 10)
                    ForEach(Array(catalogue.topics.enumerated()), id: \.element.id) { index, topic in
                        if index > 0 { Spacer().frame(height: 10) }
                        Shortcut(
                            icon: "topic",
                            label: topic.name,
                            hint: "\(topic.sets.count) set\(topic.sets.count == 1 ? "" : "s")",
                            trailing: model.practiceTopics.contains(topic.id) ? "Chosen" : nil
                        ) {
                            model.togglePracticeTopic(topic.id)
                        }
                    }
                }
                .entrance(1, scale: true)

                if !catalogue.concepts.isEmpty {
                    Spacer().frame(height: 16)
                    SurfaceCard {
                        Text("Concepts")
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        Spacer().frame(height: 4)
                        Text("Narrow the drill to particular skills. None chosen means all of them.")
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer().frame(height: 10)
                        // The catalogue is long — several dozen concepts — so it is
                        // laid out in rows of two rather than one chip per row, and
                        // the labels are short enough that two always fit.
                        ChipRows(items: catalogue.concepts.map(\.name), perRow: 2, selected: { index in
                            model.practiceConcepts.contains(catalogue.concepts[index].id)
                        }) { index in
                            model.togglePracticeConcept(catalogue.concepts[index].id)
                        }
                    }
                    .entrance(2, scale: true)
                }
            }
        }

        Spacer().frame(height: 16)
        SurfaceCard {
            settingRow("Difficulty", "Mixed deals from every band.") {
                Segmented(
                    options: [("easy", "Easy"), ("medium", "Medium"), ("hard", "Hard"), ("mixed", "Mixed")],
                    selected: model.practiceDifficulty,
                    onSelect: { model.practiceDifficulty = $0 }
                )
            }
            Spacer().frame(height: 14)
            Hairline()
            Spacer().frame(height: 14)
            settingRow("Questions", "Between 1 and 30.") {
                Segmented(
                    options: [("5", "5"), ("10", "10"), ("15", "15"), ("20", "20")],
                    selected: "\(model.practiceCount)",
                    onSelect: { model.setPracticeCount(Int($0) ?? 10) }
                )
            }
            Spacer().frame(height: 18)
            PillButton(text: "Start practice", tone: .good, icon: "start", enabled: !model.busy, large: true) {
                model.startPractice()
            }
        }
        .entrance(3, scale: true)
    }

    private func settingRow<Content: View>(
        _ label: String,
        _ hint: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(Type.captionS.font)
                    .foregroundStyle(colors.foreground)
                Text(hint)
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }
            Spacer(minLength: 0)
            content()
        }
    }

    // ── run ─────────────────────────────────────────────────────────────────

    @ViewBuilder private var run: some View {
        if let question = model.practicePaper[safe: model.practiceIndex] {
            let mark = model.practiceMark
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    LabelText(
                        text: "\(question.conceptName) · \(question.difficulty)",
                        token: Type.eyebrow,
                        color: colors.mutedForeground
                    )
                    Spacer(minLength: 0)
                    LabelText(
                        text: "\(model.practiceIndex + 1) / \(model.practicePaper.count)",
                        token: Type.micro,
                        color: colors.mutedForeground
                    )
                }
                Spacer().frame(height: 4)
                Text("\(question.marks) mark\(question.marks == 1 ? "" : "s")")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 10)
                Meter(
                    percent: (model.practiceIndex + (mark == nil ? 0 : 1)) * 100 / max(model.practicePaper.count, 1),
                    tint: colors.foreground,
                    height: 6
                )

                Spacer().frame(height: 20)
                // The prompt is maths, so it is set in the display ladder rather
                // than as prose: an expression is read as a figure, not a sentence.
                Text(question.prompt)
                    .font(Type.displaySm.font)
                    .foregroundStyle(colors.foreground)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer().frame(height: 20)

                if let mark {
                    SurfaceCard(border: (mark.correct ? colors.good : colors.destructive).opacity(0.45)) {
                        HStack(spacing: 12) {
                            BoxedGlyph(
                                icon: mark.correct ? "correct" : "close",
                                tint: mark.correct ? colors.good : colors.destructive,
                                size: 30
                            )
                            Text(mark.correct ? "Correct" : "Not quite")
                                .font(Type.strong.font)
                                .foregroundStyle(mark.correct ? colors.good : colors.destructive)
                            Spacer(minLength: 0)
                            Badge(text: "+\(mark.marks)", tone: .gold, icon: "xp")
                        }
                        Spacer().frame(height: 12)
                        Hairline()
                        Spacer().frame(height: 12)
                        LabelText(text: "Answer", token: Type.eyebrow, color: colors.mutedForeground)
                        Text(mark.answer)
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        if !mark.solution.isEmpty, !mark.correct {
                            Spacer().frame(height: 10)
                            LabelText(text: "Working", token: Type.eyebrow, color: colors.mutedForeground)
                            Text(mark.solution)
                                .font(Type.caption.font)
                                .foregroundStyle(colors.mutedForeground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer().frame(height: 16)
                    PillButton(
                        text: model.practiceIndex + 1 >= model.practicePaper.count ? "Finish" : "Next question",
                        icon: model.practiceIndex + 1 >= model.practicePaper.count ? "correct" : "next",
                        large: true
                    ) {
                        model.nextPracticeQuestion()
                    }
                } else {
                    Field(placeholder: "Your answer", value: Binding(
                        get: { model.practiceAnswer },
                        set: { model.setPracticeAnswer($0) }
                    ))
                    Spacer().frame(height: 20)
                    PillButton(
                        text: "Check",
                        tone: .good,
                        enabled: !model.practiceAnswer.trimmingCharacters(in: .whitespaces).isEmpty && !model.busy,
                        large: true
                    ) {
                        model.markPractice()
                    }
                }

                Spacer().frame(height: 12)
                PillButton(text: "Leave practice", tone: .ghost) { model.endPractice() }
            }
            .entrance()
        }
    }

    // ── summary ─────────────────────────────────────────────────────────────

    private var summary: some View {
        VStack(spacing: 0) {
            BoxedGlyph(icon: "practice", size: 64)
            Spacer().frame(height: 16)
            Text("Practice complete")
                .font(Type.title.font)
                .foregroundStyle(colors.foreground)
                .multilineTextAlignment(.center)
            Spacer().frame(height: 8)
            Text("\(model.practiceCorrect) of \(model.practicePaper.count) correct")
                .font(Type.lead.font)
                .foregroundStyle(colors.mutedForeground)

            if let xp = model.practiceXp {
                Spacer().frame(height: 10)
                Badge(text: "+\(xp.xpAwarded) XP", tone: .gold, icon: "xp")
            }

            Spacer().frame(height: 20)
            SurfaceCard {
                HStack(alignment: .top, spacing: 20) {
                    Stat(label: "Correct", value: "\(model.practiceCorrect)")
                    Stat(label: "Marks", value: "\(model.practiceMarks)")
                    Stat(label: "Out of", value: "\(model.practiceMaxMarks)")
                    Spacer(minLength: 0)
                }
            }

            Spacer().frame(height: 16)
            Text("These never touched your schedule — practice only earns XP.")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
                .multilineTextAlignment(.center)

            Spacer().frame(height: 24)
            PillButton(text: "Back to setup", icon: "rotate", large: true) { model.endPractice() }
        }
        .frame(maxWidth: .infinity)
        .entrance()
    }
}

/// A wrapping chip row.
///
/// `flex-wrap` on the web, which SwiftUI has no direct spelling of before iOS 16's
/// `Layout` protocol — and a `Layout` here would be more machinery than the
/// problem needs. What it actually needs is a picker whose options are all
/// *visible*: a horizontal scroll would hide the rest off the right edge, and a
/// picker whose options are off-screen is not a picker. So the items are chunked
/// into rows of a known width, which is deterministic and cannot clip.
struct ChipRows: View {
    let items: [String]
    var perRow: Int = 2
    var selected: (Int) -> Bool = { _ in false }
    var onSelect: (Int) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 6) {
                    ForEach(row, id: \.self) { index in
                        Button { onSelect(index) } label: {
                            ChipPill(text: items[index], active: selected(index))
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private var rows: [[Int]] {
        stride(from: 0, to: items.count, by: perRow).map { start in
            Array(start..<min(start + perRow, items.count))
        }
    }
}
