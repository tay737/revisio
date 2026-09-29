import RevisioEngine
import SwiftUI

/// The study loop.
///
/// One screen for today's queue, first exposure and cram: the server picks which
/// cards and grades the answers in all three, and the only difference the learner
/// sees is the label and whether the notes travel alongside. Building three loops
/// would have meant three places for a mark to be awarded differently.
///
/// This is the one viewport where green is allowed to carry a primary action — it
/// is the button you press *inside* the session, the one that earns rather than
/// navigates. Every other control on this screen is ink, and the verdict wears the
/// game colours: owl green correct, cardinal red wrong, fox orange for a near miss
/// or a queued answer.
///
/// The body is split into pieces on purpose: as one expression Swift cannot type
/// check it in reasonable time, and a screen whose structure is invisible is a
/// screen nobody dares change.
struct SessionView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        if model.finished {
            SummaryView(model: model)
        } else if let card = model.cards[safe: model.index] {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 16)
                    header
                    progress
                    notes(for: card)
                    //
                    // The one motion the review loop is built around.
                    //
                    // On the web the question and its verdict share a keyed
                    // element, so answering re-mounts nothing while the next card
                    // rises into place — enter 14px below with a fade, over the
                    // quick duration. Keying this block on the card's own id does
                    // the same thing here: a new card is a new view identity, so
                    // its entrance runs, while the header, the meter and the notes
                    // stay exactly where they were. Nothing is torn down between
                    // cards, which is the difference between a deck being dealt
                    // and a page reloading.
                    VStack(alignment: .leading, spacing: 0) {
                        promptBlock(card)
                        Spacer().frame(height: 20)
                        answerBlock(card)
                        Spacer().frame(height: 20)
                        actionBlock(card)
                    }
                    .entrance()
                    .id(card.id)
                    Spacer().frame(height: 12)
                    PillButton(text: "Leave session", tone: .ghost) { model.endReview() }
                    Spacer().frame(height: 28)
                }
                .padding(20)
            }
        }
    }

    /// What this session is, and how far through it we are.
    private var header: some View {
        VStack(spacing: 6) {
            HStack(spacing: 0) {
                LabelText(text: model.mode.label, token: Type.eyebrow, color: model.mode.tint(colors))
                Spacer().frame(width: 10)
                Text(model.sessionTitle)
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                LabelText(text: "\(model.index + 1) / \(model.cards.count)", token: Type.micro, color: colors.mutedForeground)
            }
            HStack {
                Spacer(minLength: 0)
                // Ink, not green — leaving is not something to celebrate. Ending a
                // session keeps every point already earned; the summary opens and
                // the remaining cards stay due. The web puts the same quiet
                // control beside the running XP.
                HStack(spacing: 5) {
                    Icon("signOut", size: 12, color: colors.mutedForeground)
                    Text("End session")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(colors.background, in: Capsule())
                .contentShape(Rectangle())
                .onTapGesture { model.endSessionEarly() }
            }
        }
    }

    /// The same 10px meter the rest of the app uses, a little thinner here.
    private var progress: some View {
        let percent = model.cards.isEmpty ? 0 : (model.index + 1) * 100 / model.cards.count
        return VStack(spacing: 0) {
            Spacer().frame(height: 10)
            Meter(percent: percent, tint: colors.foreground, height: 6)
        }
    }

    @ViewBuilder
    private func notes(for card: QuizCard) -> some View {
        let mine = model.notesFor(card)
        if !mine.isEmpty {
            Spacer().frame(height: 16)
            PillButton(
                text: model.notesOpen ? "Hide notes" : "Show notes (\(mine.count))",
                tone: .ghost,
                icon: "notes"
            ) {
                model.toggleNotes()
            }
            if model.notesOpen {
                Spacer().frame(height: 12)
                ForEach(mine, id: \.stableId) { note in
                    SurfaceCard {
                        HStack(spacing: 12) {
                            Text(note.title)
                                .font(Type.strong.font)
                                .foregroundStyle(colors.foreground)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if let refs = note.specRefs, !refs.isEmpty { Chip(text: refs) }
                        }
                        if note.hasAnyBody {
                            Spacer().frame(height: 12)
                            NotesView(markdown: note.body(summary: model.density == "summary"))
                        }
                    }
                    Spacer().frame(height: 12)
                }
            }
        }
    }

    private func promptBlock(_ card: QuizCard) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelText(text: "\(card.subjectName) · \(card.topicName)", token: Type.micro, color: colors.mutedForeground)
            Spacer().frame(height: 8)
            Text(card.promptText)
                .font(Type.displaySm.font)
                .foregroundStyle(colors.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func answerBlock(_ card: QuizCard) -> some View {
        if card.kind == "mcq" {
            VStack(spacing: 10) {
                ForEach(card.options ?? [], id: \.id) { option in
                    OptionRow(
                        text: option.text,
                        state: optionState(card, option),
                        enabled: model.feedback == nil
                    ) {
                        model.setSelection(option.id)
                    }
                }
            }
        } else {
            Field(
                placeholder: card.kind == "flashcard" ? "Say it in your own words" : "Your answer",
                value: Binding(get: { model.answer }, set: { model.setAnswer($0) }),
                submitLabel: .done
            )
            .disabled(model.feedback != nil)
        }
    }

    /// Once the answer is in, the row that was right and the row that was chosen
    /// each say so in their own colour — which is the whole reason the game
    /// colours exist apart from the chrome.
    private func optionState(_ card: QuizCard, _ option: CardOption) -> OptionState {
        let chosen = model.selection == option.id
        guard model.feedback == nil else {
            if card.key?.kind == "mcq", card.key?.correctOptionId == option.id { return .correct }
            return chosen ? .wrong : .idle
        }
        return chosen ? .selected : .idle
    }

    @ViewBuilder
    private func actionBlock(_ card: QuizCard) -> some View {
        if let feedback = model.feedback {
            FeedbackPanel(feedback: feedback)
            Spacer().frame(height: 16)
            PillButton(
                text: model.index + 1 >= model.cards.count ? "Finish" : "Next card",
                icon: model.index + 1 >= model.cards.count ? "correct" : "next",
                large: true
            ) {
                model.next()
            }
        } else {
            // The in-session CTA. Uppercase and letterspaced, per the label
            // treatment the design language reserves for controls.
            PillButton(
                text: "Check",
                tone: .good,
                enabled: inputReady(card),
                large: true
            ) {
                model.submit()
            }
        }
    }

    private func inputReady(_ card: QuizCard) -> Bool {
        if card.kind == "mcq" { return model.selection != nil }
        return !model.answer.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

/// The mode earns its own eyebrow colour: reading borrows the notes blue.
private extension StudyMode {
    func tint(_ colors: RevisioColors) -> Color {
        switch self {
        case .daily: return colors.mutedForeground
        case .learn: return colors.info
        case .cram: return colors.streak
        }
    }
}

private struct FeedbackPanel: View {
    @Environment(\.revisio) private var colors
    let feedback: Feedback

    private var verdict: (label: String, tone: Color, icon: String) {
        switch feedback.verdict?.feedbackKind {
        case .correct:
            return ("Correct", colors.good, "correct")
        case .caseOnly, .punctuationOnly, .caseAndPunctuation:
            return ("Correct — check your spelling", colors.good, "correct")
        case .nearMiss:
            return ("Nearly there", colors.streak, "due")
        case .wrong:
            return ("Not quite", colors.destructive, "close")
        case .none:
            return ("Saved", colors.streak, "clock")
        }
    }

    /// The two situations read differently on purpose: a card from today's pack
    /// carries its key, so a mark is real and only the confirmation is pending; a
    /// card the server picked has no key here at all.
    private var provisionalNote: String {
        feedback.verdict == nil
            ? "Saved on this device. This card came from the server, so the server will mark it when you reconnect."
            : "Saved on this device. The server will confirm this mark when you reconnect."
    }

    var body: some View {
        let mark = verdict
        SurfaceCard(border: mark.tone.opacity(0.45)) {
            HStack(spacing: 12) {
                // The glyph sits on the verdict colour, in the page's own ground,
                // so a correct mark reads as ink-on-green rather than as a second
                // colour arriving uninvited.
                Icon(mark.icon, size: 16, color: colors.background)
                    .frame(width: 30, height: 30)
                    .background(mark.tone, in: Circle())
                Text(mark.label)
                    .font(Type.strong.font)
                    .foregroundStyle(mark.tone)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if feedback.xpAwarded > 0 {
                    Badge(text: "+\(feedback.xpAwarded) XP", tone: .gold, icon: "xp")
                }
            }

            if let note = feedback.verdict?.note, !note.isEmpty {
                Spacer().frame(height: 12)
                Hairline()
                Spacer().frame(height: 12)
                Text(note)
                    .font(Type.caption.font)
                    .foregroundStyle(colors.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let answer = feedback.correctAnswer, !answer.isEmpty {
                Spacer().frame(height: 12)
                Text("Answer: \(answer)")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let missed = feedback.verdict?.missedPhrases, !missed.isEmpty {
                Spacer().frame(height: 6)
                Text("Missing: \(missed.joined(separator: ", "))")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
            }
            if let explanation = feedback.explanation, !explanation.isEmpty {
                Spacer().frame(height: 10)
                Text(explanation)
                    .font(Type.caption.font)
                    .foregroundStyle(colors.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if feedback.provisional {
                Spacer().frame(height: 10)
                HStack(spacing: 8) {
                    Icon("clock", size: 13, color: colors.streak)
                    LabelText(text: "Saved on this device", token: Type.micro, color: colors.streak)
                }
                Spacer().frame(height: 6)
                Text(provisionalNote)
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// The verdict.
///
/// The crest is the loudest thing here on purpose: finishing a session is the
/// moment the ladder moves, so the summary shows where you now stand rather than
/// a scoreline alone.
private struct SummaryView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    private var title: String {
        switch model.mode {
        case .cram: return "Cram complete"
        case .learn: return "Topic met"
        case .daily: return model.ended ? "Session ended" : "Session complete"
        }
    }

    private var percent: Int {
        model.answered == 0 ? 0 : model.correct * 100 / model.answered
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Spacer().frame(height: 40)

                // Finishing a session is the moment the ladder moves, so the crest
                // arrives on the pop spring — scale 0.7 and a slight rotation,
                // overshooting into place — while everything under it settles with
                // plain rises. One flourish on the screen that earned it.
                if let rank = model.ranked?.ranked.rank {
                    RankCrest(rank: rank, size: 104)
                        .pop()
                    Spacer().frame(height: 18)
                    RankChip(rank: rank, size: 26)
                    Spacer().frame(height: 22)
                } else {
                    Icon("achievements", size: 32, color: colors.foreground)
                        .frame(width: 72, height: 72)
                        .background(colors.secondary, in: Circle())
                    Spacer().frame(height: 22)
                }

                Text(title)
                    .font(Type.title.font)
                    .foregroundStyle(colors.foreground)
                    .multilineTextAlignment(.center)
                Spacer().frame(height: 8)
                Text("\(model.correct) of \(model.answered) correct (\(percent)%)")
                    .font(Type.lead.font)
                    .foregroundStyle(colors.mutedForeground)

                if model.mode == .learn && model.total > 0 {
                    Spacer().frame(height: 6)
                    Text("\(model.met + model.answered) of \(model.total) cards met in \(model.sessionTitle)")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                        .multilineTextAlignment(.center)
                }

                Spacer().frame(height: 20)
                // Accuracy is stated, never hidden: a session of near misses
                // should not read as a session of hits.
                SurfaceCard {
                    HStack(alignment: .top, spacing: 20) {
                        Stat(label: "Correct", value: "\(model.correct)", tint: colors.good)
                        Stat(label: "Answered", value: "\(model.answered)")
                        Stat(label: "Accuracy", value: "\(percent)%")
                        Spacer(minLength: 0)
                    }
                }

                if model.pending > 0 {
                    Spacer().frame(height: 16)
                    HStack(spacing: 8) {
                        Icon("clock", size: 14, color: colors.streak)
                        Text("\(model.pending) review\(model.pending == 1 ? "" : "s") will sync when you're online.")
                            .font(Type.fine.font)
                            .foregroundStyle(colors.streak)
                    }
                }

                Spacer().frame(height: 28)
                PillButton(text: "Done", large: true) { model.endReview() }
                Spacer().frame(height: 24)
            }
            .padding(28)
        }
    }
}
