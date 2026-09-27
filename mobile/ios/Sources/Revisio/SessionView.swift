import SwiftUI
import RevisioEngine

/// The review loop, in whichever mode it was started.
///
/// One screen for today's queue, first exposure and cram: the server picks which
/// cards and grades the answers in all three, and the only difference the learner
/// sees is the label and whether the notes travel alongside. Three loops would
/// have meant three places for a mark to be awarded differently.
///
/// The body is split into pieces on purpose: as one expression Swift cannot type
/// check it in reasonable time, and a screen whose structure is invisible is a
/// screen nobody dares change.
struct SessionView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        if model.finished {
            SummaryView(model: model)
        } else if let card = model.cards[safe: model.index] {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    progress
                    notes(for: card)
                    Spacer().frame(height: 14)
                    promptBlock(card)
                    Spacer().frame(height: 16)
                    answerBlock(card)
                    Spacer().frame(height: 16)
                    actionBlock(card)
                    Spacer().frame(height: 10)
                    Button("Leave session") { model.endReview() }
                        .font(.caption).foregroundColor(muted).buttonStyle(.plain)
                    Spacer().frame(height: 20)
                }
                .padding(20)
            }
        }
    }

    private var header: some View {
        HStack {
            Text(model.mode.label).font(.caption).bold().foregroundColor(accent)
            Text(model.sessionTitle).font(.caption).foregroundColor(muted)
            Spacer()
            Text("\(model.index + 1) / \(model.cards.count)").font(.caption).foregroundColor(muted)
        }
        .padding(.top, 8)
    }

    private var progress: some View {
        ProgressView(value: Double(model.index + 1), total: Double(max(model.cards.count, 1)))
            .tint(accent)
            .padding(.top, 8)
    }

    @ViewBuilder
    private func notes(for card: QuizCard) -> some View {
        let mine = model.notesFor(card)
        if !mine.isEmpty {
            Button(model.notesOpen ? "Hide notes" : "Show notes (\(mine.count))") {
                model.toggleNotes()
            }
            .font(.caption)
            .padding(.top, 10)

            if model.notesOpen {
                ForEach(mine, id: \.stableId) { note in
                    NotePanel(note: note, summary: model.density == "summary")
                        .padding(.top, 10)
                }
            }
        }
    }

    private func promptBlock(_ card: QuizCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.subjectName + " · " + card.topicName).font(.caption).foregroundColor(muted)
            Text(card.promptText).font(.title3).bold()
        }
    }

    @ViewBuilder
    private func answerBlock(_ card: QuizCard) -> some View {
        if card.kind == "mcq" {
            VStack(spacing: 10) {
                ForEach(card.options ?? [], id: \.id) { option in
                    McqOption(
                        text: option.text,
                        chosen: model.selection == option.id,
                        locked: model.feedback != nil
                    ) {
                        model.setSelection(option.id)
                    }
                }
            }
        } else {
            TextField(
                card.kind == "flashcard" ? "Say it in your own words" : "Your answer",
                text: Binding(get: { model.answer }, set: { model.setAnswer($0) })
            )
            .revisioTextInput()
            .textFieldStyle(.roundedBorder)
            .disabled(model.feedback != nil)
        }
    }

    @ViewBuilder
    private func actionBlock(_ card: QuizCard) -> some View {
        if let feedback = model.feedback {
            FeedbackPanel(feedback: feedback)
            Button {
                model.next()
            } label: {
                Text(model.index + 1 >= model.cards.count ? "Finish" : "Next card")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).tint(accent)
            .padding(.top, 12)
        } else {
            Button {
                model.submit()
            } label: {
                Text("Check").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).tint(accent)
            .disabled(!inputReady(card))
        }
    }

    private func inputReady(_ card: QuizCard) -> Bool {
        if card.kind == "mcq" { return model.selection != nil }
        return !model.answer.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

private struct McqOption: View {
    let text: String
    let chosen: Bool
    let locked: Bool
    let onSelect: () -> Void

    // Two branches rather than a ternary: the bordered styles are different
    // concrete types, so a conditional expression has no common type to infer.
    var body: some View {
        Group {
            if chosen {
                label.buttonStyle(.borderedProminent).tint(accent)
            } else {
                label.buttonStyle(.bordered)
            }
        }
        .disabled(locked)
    }

    private var label: some View {
        Button(action: { if !locked { onSelect() } }) {
            Text(text).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct NotePanel: View {
    let note: Note
    let summary: Bool

    var body: some View {
        Panel {
            HStack {
                Text(note.title).font(.subheadline).bold()
                Spacer()
                if let refs = note.specRefs, !refs.isEmpty { Chip(text: refs) }
            }
            if note.hasAnyBody {
                NotesView(markdown: note.body(summary: summary)).padding(.top, 10)
            }
        }
    }
}

private struct FeedbackPanel: View {
    let feedback: Feedback

    private var label: (String, Color) {
        switch feedback.verdict?.feedbackKind {
        case .correct: return ("Correct", good)
        case .caseOnly, .punctuationOnly, .caseAndPunctuation: return ("Correct — check your spelling", good)
        case .nearMiss: return ("Nearly there", near)
        case .wrong: return ("Not quite", Color(red: 1, green: 0.27, blue: 0.23))
        case .none: return ("Saved", near)
        }
    }

    /// Say which of the two situations this is. A card from today's pack carries
    /// its key, so the mark above is the real one, held back only by the network;
    /// a card the server picked has no key here at all.
    private var provisionalNote: String {
        feedback.verdict == nil
            ? "Saved on this device. This card came from the server, so the server will mark it when you reconnect."
            : "Saved on this device. The server will confirm this mark when you reconnect."
    }

    var body: some View {
        Panel {
            HStack {
                Text(label.0).font(.headline).foregroundColor(label.1)
                Spacer()
                if feedback.xpAwarded > 0 {
                    Text("+\(feedback.xpAwarded) XP").font(.subheadline).foregroundColor(good)
                }
            }
            if let note = feedback.verdict?.note, !note.isEmpty {
                Text(note).font(.subheadline).padding(.top, 6)
            }
            if let answer = feedback.correctAnswer, !answer.isEmpty {
                Text("Answer: \(answer)").font(.subheadline).bold().padding(.top, 10)
            }
            if let missed = feedback.verdict?.missedPhrases, !missed.isEmpty {
                Text("Missing: \(missed.joined(separator: ", "))")
                    .font(.caption).foregroundColor(muted).padding(.top, 6)
            }
            if let explanation = feedback.explanation, !explanation.isEmpty {
                Text(explanation).font(.caption).padding(.top, 10)
            }
            if feedback.provisional {
                Text(provisionalNote).font(.caption).foregroundColor(near).padding(.top, 10)
            }
        }
    }
}

private struct SummaryView: View {
    @ObservedObject var model: AppModel

    private var title: String {
        switch model.mode {
        case .cram: return "Cram complete"
        case .learn: return "Topic met"
        case .daily: return "Session complete"
        }
    }

    var body: some View {
        VStack(spacing: 14) {
            Spacer()
            Crest(size: 72)
            Text(title).font(.title).bold()
            Text("\(model.correct) of \(model.answered) correct").foregroundColor(muted)
            if model.mode == .learn && model.total > 0 {
                Text("\(model.met + model.answered) of \(model.total) cards met in \(model.sessionTitle)")
                    .font(.caption).foregroundColor(muted)
            }
            if model.pending > 0 {
                Text("\(model.pending) review\(model.pending == 1 ? "" : "s") will sync when you're online.")
                    .font(.footnote).foregroundColor(near).multilineTextAlignment(.center)
            }
            Button {
                model.endReview()
            } label: {
                Text("Done").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).tint(accent)
            Spacer()
        }
        .padding(32)
    }
}

