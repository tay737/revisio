import RevisioEngine
import SwiftUI

/// Exam simulator — sit a marked paper, and read the board's own documents.
///
/// The web's `/exam` is not another loop with a different label, and porting it as
/// one would have missed the point. A paper is dealt by topic, the mark scheme
/// stays on the server until the script is handed in, and handing it in *stores an
/// attempt* — so this is the one surface in the app that produces a record rather
/// than moving a schedule.
///
/// The three phases are the web's: pick topics, sit the paper, read the marked
/// script. Beside them sit the two things the web grew: the stored papers (real
/// question papers, mark schemes and formulae sheets, opened verbatim), and a
/// marking report that says *what kind* of mark was lost — per assessment
/// objective — not just how many.
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

                if model.paperDoc != nil {
                    PaperDocView(model: model)
                } else if model.examResult != nil {
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

        // ── stored board papers ────────────────────────────────────────────
        let papers = model.examPool?.papers ?? []
        if !papers.isEmpty {
            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Real papers & mark schemes")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 4)
                Text("The board's own documents, extracted from the originals. The mark scheme is the most honest revision guide there is — read it beside the notes.")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer().frame(height: 12)
                ForEach(papers) { paper in
                    StoredPaperRow(paper: paper) { model.loadPaperDoc(paper.id) }
                }
            }
            .entrance(1, scale: true)
        }

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
                questionBlock((question.questionRef ?? "").isEmpty ? "\(index + 1)" : question.questionRef!, question)
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

    private func questionBlock(_ label: String, _ question: ExamQuestion) -> some View {
        let answer = model.examAnswers[question.id] ?? ""
        let totalMarks = question.marks + (question.qwcMarks ?? 0)

        return SurfaceCard {
            HStack(alignment: .top, spacing: 12) {
                Text("Q\(label)")
                    .font(Type.numSm.font)
                    .foregroundStyle(colors.mutedForeground)
                VStack(alignment: .leading, spacing: 2) {
                    Text(question.questionMd)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(totalMarks) mark\(totalMarks == 1 ? "" : "s")"
                        + (question.qwcMarks ?? 0 > 0 ? " (incl. \(question.qwcMarks ?? 0) QWC)" : "")
                        + (question.board.map { " · \($0)" } ?? "")
                        + (question.sourceYear.map { " \($0)" } ?? ""))
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
            }
            // The AO split is dealt with the paper: how many of these marks are
            // knowledge, application, reasoning. The web prints the same rows.
            if let splits = question.aoSplit, !splits.isEmpty {
                Spacer().frame(height: 10)
                Text("WHERE THE MARKS LIVE")
                    .font(Type.micro.font)
                    .foregroundStyle(colors.mutedForeground)
                Spacer().frame(height: 6)
                ForEach(Array(splits.enumerated()), id: \.offset) { _, split in
                    AoSplitRowView(split: split)
                }
            }
            if let refs = question.specRefs, !refs.isEmpty {
                Spacer().frame(height: 8)
                Text("Spec: \(refs)")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }
            Spacer().frame(height: 14)

            if question.kind == "mcq" {
                VStack(spacing: 10) {
                    ForEach(Array((question.options ?? []).enumerated()), id: \.offset) { index, option in
                        let letter = String(UnicodeScalar(UInt8(65 + index)))
                        OptionRow(
                            text: "\(letter). \(option.text)",
                            state: answer == option.id ? .selected : .idle,
                            enabled: true
                        ) {
                            model.setExamAnswer(question.id, option.id)
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
                Spacer().frame(height: 6)
                Text(
                    result.percentage >= 80
                        ? "That is a strong paper. The remainder is worth a look while the marking is fresh."
                        : result.percentage >= 50
                            ? "A solid pass. Read the feedback below before you move on."
                            : "Worth re-reading the notes on the questions you lost marks on."
                )
                .font(Type.caption.font)
                .foregroundStyle(colors.mutedForeground)
                .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)

            Spacer().frame(height: 20)
            ForEach(Array(result.detail.enumerated()), id: \.offset) { index, line in
                MarkedQuestionCard(index: index, line: line, paper: model.examPaper)
                Spacer().frame(height: 12)
            }

            // The AO profile answers the question a percentage cannot: *what kind*
            // of marks am I losing? Aggregated per assessment objective.
            if let profile = result.aoProfile, !profile.isEmpty {
                SurfaceCard {
                    Text("Where the marks went")
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Spacer().frame(height: 4)
                    Text("marks earned by assessment objective")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                    Spacer().frame(height: 10)
                    ForEach(profile, id: \.ao) { row in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text("\(row.ao) — \(AoGuide.label(row.ao))")
                                    .font(Type.captionS.font)
                                    .foregroundStyle(colors.foreground)
                                Spacer(minLength: 0)
                                Text("\(row.awarded)/\(row.available) · \(row.percentage)%")
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                            }
                            if let description = AoGuide.description(row.ao) {
                                Text(description)
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    Hairline()
                    Spacer().frame(height: 8)
                    Text(AoGuide.directive(profile))
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .entrance(1)
                Spacer().frame(height: 12)
            }

            Spacer().frame(height: 12)
            PillButton(text: "Back to the pool", icon: "rotate", large: true) { model.endExam() }
        }
    }
}

// ── AO copy, mirrored from `AO_EXPLAINER` in the web's exam page ─────────────

enum AoGuide {
    static func label(_ ao: String) -> String {
        switch ao {
        case "AO1": return "Knowledge & understanding"
        case "AO2": return "Application"
        case "AO3": return "Analysis & evaluation"
        default: return "Assessment objective"
        }
    }

    static func description(_ ao: String) -> String? {
        switch ao {
        case "AO1":
            return "Recall marks. Awarded for stating accurate facts, definitions and terms — naming the thing correctly. No context needed: a correct fact is a mark even in isolation."
        case "AO2":
            return "Application marks. Awarded for using knowledge in the scenario given — the answer must refer to the context (the club, the college, the data), not just state general theory."
        case "AO3":
            return "Reasoning marks. Awarded for chains of reasoning: weighing options, drawing conclusions, making justified judgements. \"This means… therefore… which affects the business because…\""
        default: return nil
        }
    }

    /// One-sentence revision directive from the AO profile — the web's
    /// `aoDirective`. Ties only when every objective scored the same; in that
    /// case say the honest thing rather than inventing a weakest link.
    static func directive(_ profile: [AoRow]) -> String {
        let sorted = profile.sorted { $0.percentage < $1.percentage }
        guard let weakest = sorted.first, let strongest = sorted.last else { return "" }
        if sorted.count > 1 && weakest.percentage == strongest.percentage {
            return "Every objective scored the same — revise the questions you lost, whatever kind of mark they were."
        }
        if weakest.percentage >= strongest.percentage - 10 {
            return "Marks are spread evenly across objectives. Revise from the per-question breakdown below."
        }
        let tail: String
        switch weakest.ao {
        case "AO1": tail = "re-read the notes for the facts and definitions you were expected to state."
        case "AO2": tail = "practise tying your answers to the scenario — every point should name the business, person or data in the question."
        default: tail = "practise finishing answers with a reasoned judgement: weigh both sides, then decide."
        }
        return "Your weakest objective is \(weakest.ao) (\(label(weakest.ao).lowercased())) at \(weakest.percentage)% — \(tail)"
    }
}

/// One AO line, on the paper or in the marking report.
struct AoSplitRowView: View {
    @Environment(\.revisio) private var colors
    let split: AoSplit

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("\(split.ao) — \(AoGuide.label(split.ao))")
                    .font(Type.captionS.font)
                    .foregroundStyle(colors.foreground)
                Spacer(minLength: 0)
                Text("\(split.marks) mark\(split.marks == 1 ? "" : "s")")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }
            if let description = AoGuide.description(split.ao) {
                Text(description)
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
    }
}

/// One marked question, as the web's `ResultDetail` shows it: score, feedback,
/// the points hit and missed, the AO split, and — behind one disclosure — the
/// marking material: how an examiner marks this, the mark scheme itself, a model
/// answer, and the learner's own answer to compare against.
struct MarkedQuestionCard: View {
    @Environment(\.revisio) private var colors
    let index: Int
    let line: ExamMark
    let paper: [ExamQuestion]

    @State private var open = false

    var body: some View {
        let question = paper.first { $0.id == line.questionId }
        SurfaceCard {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text((line.questionRef ?? "").isEmpty ? "Question \(index + 1)" : "Question \(line.questionRef!)")
                        .font(Type.captionS.font)
                        .foregroundStyle(colors.mutedForeground)
                    Spacer(minLength: 0)
                    Text("\(ExamScore.text(line.awarded)) / \(line.total)")
                        .font(Type.captionS.font)
                        .foregroundStyle(line.correct ? colors.good : colors.destructive)
                }
                if let questionMd = question?.questionMd {
                    Spacer().frame(height: 6)
                    Text(questionMd)
                        .font(Type.captionS.font)
                        .foregroundStyle(colors.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer().frame(height: 8)
                Text(line.feedback)
                    .font(Type.fine.font)
                    .foregroundStyle(line.correct ? colors.good : colors.streak)
                    .fixedSize(horizontal: false, vertical: true)

                let matched = line.matchedPhrases ?? []
                if !matched.isEmpty {
                    Spacer().frame(height: 8)
                    Text("Points covered: \(matched.joined(separator: " · "))")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.good)
                        .fixedSize(horizontal: false, vertical: true)
                }
                let missed = line.missedPhrases ?? []
                if !missed.isEmpty {
                    Spacer().frame(height: 4)
                    Text("Missing for more marks: \(missed.prefix(5).joined(separator: " · "))")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let splits = line.aoSplit, !splits.isEmpty {
                    Spacer().frame(height: 10)
                    Text("WHERE THE MARKS LIVE")
                        .font(Type.micro.font)
                        .foregroundStyle(colors.mutedForeground)
                    Spacer().frame(height: 6)
                    ForEach(Array(splits.enumerated()), id: \.offset) { _, split in
                        AoSplitRowView(split: split)
                    }
                    if (line.qwcMarks ?? 0) > 0 {
                        Spacer().frame(height: 4)
                        Text(
                            "Plus \(line.qwcMarks ?? 0) QWC \((line.qwcMarks ?? 0) == 1 ? "mark" : "marks") for quality of written communication — clear structure, controlled grammar, and the subject's technical terms used properly."
                        )
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }

                let hasMaterial = !(line.markSchemeMd ?? "").isEmpty
                    || !(line.modelAnswerMd ?? "").isEmpty
                    || !(line.markingNotesMd ?? "").isEmpty
                if hasMaterial {
                    Spacer().frame(height: 10)
                    PillButton(
                        text: open ? "Hide marking material" : "Mark scheme & model answer",
                        tone: .ghost,
                        icon: open ? "collapse" : "expand"
                    ) {
                        open.toggle()
                    }
                    if open {
                        Spacer().frame(height: 10)
                        Hairline()
                        Spacer().frame(height: 10)
                        if let notes = line.markingNotesMd, !notes.isEmpty {
                            Text("HOW AN EXAMINER MARKS THIS")
                                .font(Type.micro.font)
                                .foregroundStyle(colors.mutedForeground)
                            NotesView(markdown: notes)
                            Spacer().frame(height: 8)
                        }
                        if let scheme = line.markSchemeMd, !scheme.isEmpty {
                            Text("MARK SCHEME")
                                .font(Type.micro.font)
                                .foregroundStyle(colors.mutedForeground)
                            NotesView(markdown: scheme)
                            Spacer().frame(height: 8)
                        }
                        if let model_answer = line.modelAnswerMd, !model_answer.isEmpty {
                            Text("MODEL ANSWER")
                                .font(Type.micro.font)
                                .foregroundStyle(colors.mutedForeground)
                            NotesView(markdown: model_answer)
                            Spacer().frame(height: 8)
                        }
                        Text("YOUR ANSWER")
                            .font(Type.micro.font)
                            .foregroundStyle(colors.mutedForeground)
                        Text(line.userAnswer.isEmpty ? "—" : line.userAnswer)
                            .font(Type.fine.font)
                            .foregroundStyle(colors.foreground)
                    }
                }
            }
        }
    }
}

/// A stored paper row in the pool, and the verbatim reader it opens.
struct StoredPaperRow: View {
    @Environment(\.revisio) private var colors
    let paper: StoredPaper
    let onOpen: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                ChipPill(text: ExamView.paperKindLabel(paper.kind), active: paper.kind == "question_paper")
                Text(paper.title)
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                let meta = [paper.board, paper.series, paper.paperCode,
                            paper.durationMinutes.map { "\($0) min" }]
                    .compactMap { $0 }
                    .filter { !$0.isEmpty }
                    .joined(separator: " · ")
                if !meta.isEmpty {
                    Text(meta)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
            }
            if let marks = paper.totalMarks {
                Badge(text: "\(marks) marks", tone: .quiet)
            }
            PillButton(text: "Open", tone: .ghost, icon: "expand") { onOpen() }
        }
        .padding(.vertical, 10)
    }

    // kept beside the row so both platforms resolve the same label
    fileprivate static func kindLabel(_ kind: String) -> String {
        switch kind {
        case "question_paper": return "Question paper"
        case "mark_scheme": return "Mark scheme"
        case "formulae_sheet": return "Formulae sheet"
        default: return "Document"
        }
    }
}

struct PaperDocView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        if let doc = model.paperDoc {
            VStack(alignment: .leading, spacing: 0) {
                Text(doc.title)
                    .font(Type.title.font)
                    .foregroundStyle(colors.foreground)
                let meta = [doc.board, doc.series, doc.paperCode,
                            doc.durationMinutes.map { "\($0) min" }]
                    .compactMap { $0 }
                    .filter { !$0.isEmpty }
                    .joined(separator: " · ")
                if !meta.isEmpty {
                    Spacer().frame(height: 4)
                    Text(meta)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer().frame(height: 14)
                SurfaceCard {
                    NotesView(markdown: doc.contentMd)
                }
                Spacer().frame(height: 16)
                PillButton(text: "Close", tone: .ghost, icon: "collapse") { model.closePaperDoc() }
            }
            .entrance()
        }
    }
}

extension ExamView {
    static func paperKindLabel(_ kind: String) -> String {
        StoredPaperRow.kindLabel(kind)
    }
}

extension String {
    /// `""` reads as "unset" for the optional-carrying fidelity fields.
    var blank: Bool { isEmpty }
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
