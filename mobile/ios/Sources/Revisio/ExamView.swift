import RevisioEngine
import SwiftUI

/// Exam simulator — sit a marked paper.
///
/// The web's `/exam` is not another loop with a different label, and porting it as
/// one would have missed the point. A paper is dealt by topic, the mark scheme
/// stays on the server until the script is handed in, and handing it in *stores an
/// attempt* — so this is the one surface in the app that produces a record rather
/// than moving a schedule.
///
/// The three phases are the web's: pick topics, sit the paper, read the marked
/// script. None of them is optional and none is merged, because "which topics
/// should this cover" and "what did I get" are different questions and a screen
/// that answers both at once answers neither.
struct ExamView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 12)
                ScreenTitle(title: "Exam simulator", eyebrow: "Papers")
                Spacer().frame(height: 4)
                Text("Marked against the mark scheme.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 18)

                if model.examResult != nil {
                    marked
                } else if !model.examPaper.isEmpty {
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
        SurfaceCard {
            Text("Topics")
                .font(Type.strong.font)
                .foregroundStyle(colors.foreground)
            Spacer().frame(height: 4)
            Text("The paper is dealt from the topics you choose. A topic with no questions cannot be picked.")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 12)

            if let pool = model.examPool {
                Text("\(pool.questionsAvailable) question\(pool.questionsAvailable == 1 ? "" : "s") available")
                    .font(Type.micro.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 10)
                ChipRows(items: pool.topics.map(\.name), perRow: 2, selected: { index in
                    model.examPicked.contains(pool.topics[index].id)
                }) { index in
                    model.toggleExamTopic(pool.topics[index].id)
                }
                Spacer().frame(height: 14)
                PillButton(
                    text: model.examBusy ? "Building the paper…" : "Sit a paper",
                    tone: .good,
                    icon: "exam",
                    enabled: !model.examPicked.isEmpty && !model.examBusy,
                    large: true
                ) {
                    model.startExam()
                }
            } else {
                Text(model.busy ? "Loading the question pool…" : "Nothing loaded yet.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
            }
        }
        .entrance(scale: true)

        // Past attempts are shown, not hidden: a learner who has sat this paper
        // before should be able to see whether the last one went better.
        let attempts = model.examPool?.attempts ?? []
        if !attempts.isEmpty {
            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Past papers")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 10)
                ForEach(Array(attempts.prefix(8).enumerated()), id: \.element.id) { index, attempt in
                    if index > 0 { Hairline() }
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            // The server stores halves, so the display halves too —
                            // a mark out of 20 shown as 40/20 would be a port bug.
                            Text("\(ExamScore.text(attempt.score)) / \(ExamScore.text(attempt.maxScore))")
                                .font(Type.strong.font)
                                .foregroundStyle(colors.foreground)
                            Text(String(attempt.createdAt?.prefix(10) ?? "—"))
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                        }
                        Spacer(minLength: 0)
                        Badge(text: ExamScore.percent(attempt.score, attempt.maxScore), tone: .quiet)
                    }
                    .padding(.vertical, 12)
                }
            }
            .entrance(1, scale: true)
        }
    }

    // ── run ─────────────────────────────────────────────────────────────────

    private var run: some View {
        let answered = model.examAnswers.count
        let total = model.examPaper.count

        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                LabelText(text: "Paper", token: Type.eyebrow, color: colors.mutedForeground)
                Spacer(minLength: 0)
                LabelText(
                    text: "\(answered) / \(total) answered",
                    token: Type.micro,
                    color: colors.mutedForeground
                )
            }
            Spacer().frame(height: 10)
            Meter(percent: answered * 100 / max(total, 1), tint: colors.foreground, height: 6)
            Spacer().frame(height: 20)

            ForEach(Array(model.examPaper.enumerated()), id: \.element.id) { index, question in
                questionBlock(index + 1, question)
                Spacer().frame(height: 14)
            }

            Spacer().frame(height: 6)
            PillButton(
                text: model.examBusy ? "Handing in…" : "Hand in",
                icon: "publish",
                enabled: !model.examBusy,
                large: true
            ) {
                model.submitExam()
            }
            Spacer().frame(height: 8)
            Text("The mark scheme is applied when you hand in — the paper never carried it.")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 12)
            PillButton(text: "Leave paper", tone: .ghost) { model.endExam() }
        }
        .entrance()
    }

    private func questionBlock(_ number: Int, _ question: ExamQuestion) -> some View {
        let answer = model.examAnswers[question.id] ?? ""

        return SurfaceCard {
            HStack(alignment: .top, spacing: 12) {
                Text("\(number)")
                    .font(Type.numSm.font)
                    .foregroundStyle(colors.mutedForeground)
                VStack(alignment: .leading, spacing: 2) {
                    Text(question.questionMd)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(question.marks) mark\(question.marks == 1 ? "" : "s")"
                        + (question.board.map { " · \($0)" } ?? "")
                        + (question.sourceYear.map { " \($0)" } ?? ""))
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
            }
            Spacer().frame(height: 14)

            if question.kind == "mcq" {
                VStack(spacing: 10) {
                    ForEach(Array((question.options ?? []).enumerated()), id: \.offset) { index, option in
                        let letter = String(UnicodeScalar(UInt8(65 + index)))
                        OptionRow(
                            text: "\(letter). \(option)",
                            state: answer == letter ? .selected : .idle,
                            enabled: true
                        ) {
                            model.setExamAnswer(question.id, letter)
                        }
                    }
                }
            } else {
                SettingsField(
                    label: "",
                    placeholder: "Your answer",
                    value: Binding(
                        get: { answer },
                        set: { model.setExamAnswer(question.id, $0) }
                    ),
                    lines: 3
                )
            }
        }
    }

    // ── marked ──────────────────────────────────────────────────────────────

    @ViewBuilder private var marked: some View {
        if let result = model.examResult {
            VStack(spacing: 0) {
                BoxedGlyph(icon: "exam", size: 64)
                Spacer().frame(height: 16)
                Text("Paper marked")
                    .font(Type.title.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 8)
                Text("\(ExamScore.text(result.score)) of \(ExamScore.text(result.maxScore)) · \(result.percentage)%")
                    .font(Type.lead.font)
                    .foregroundStyle(colors.mutedForeground)
                if result.xpAwarded > 0 {
                    Spacer().frame(height: 10)
                    Badge(text: "+\(result.xpAwarded) XP", tone: .gold, icon: "xp")
                }
            }
            .frame(maxWidth: .infinity)

            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Marked script")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 10)
                ForEach(Array(result.detail.enumerated()), id: \.offset) { index, line in
                    if index > 0 { Hairline() }
                    let question = model.examPaper.first { $0.id == line.questionId }
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 10) {
                            Text("\(index + 1).")
                                .font(Type.captionS.font)
                                .foregroundStyle(colors.mutedForeground)
                            Text(question?.questionMd ?? "Question")
                                .font(Type.captionS.font)
                                .foregroundStyle(colors.foreground)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Badge(
                                text: "\(ExamScore.text(line.awarded)) / \(line.marks)",
                                tone: line.correct ? .good : .streak
                            )
                        }
                        Spacer().frame(height: 8)
                        Text("Your answer: \(line.userAnswer.isEmpty ? "—" : line.userAnswer)")
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer().frame(height: 4)
                        Text(line.feedback)
                            .font(Type.fine.font)
                            .foregroundStyle(line.correct ? colors.good : colors.streak)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 12)
                }
            }
            .entrance(1)

            Spacer().frame(height: 24)
            PillButton(text: "Back to the pool", icon: "rotate", large: true) { model.endExam() }
        }
    }
}

/// Halves are real marks, so they are shown as halves.
///
/// The server stores an exam score doubled so that a half mark survives the round
/// trip; printing `3.0` where the learner earned `3` would be the port leaking its
/// own arithmetic.
enum ExamScore {
    static func text(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
    }

    static func percent(_ score: Double, _ maxScore: Double) -> String {
        maxScore > 0 ? "\(Int((score / maxScore) * 100))%" : "0%"
    }
}
