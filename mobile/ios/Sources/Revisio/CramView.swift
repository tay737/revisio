import SwiftUI
import RevisioEngine

/// Cram — the drill.
///
/// Time-boxed practice that bypasses the scheduler on purpose: nothing here moves
/// a card's due date, which is what makes it safe the night before an exam. The
/// marks are still the server's, and the notes come along at whichever density was
/// asked for.
struct CramView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 8)
                Text("Cram").font(.title).bold()
                Text("Practice without touching the schedule — nothing you cram is re-scheduled.")
                    .font(.caption).foregroundColor(muted).padding(.top, 2)
                Spacer().frame(height: 14)

                if model.cramTopics.isEmpty {
                    EmptyNote(text: model.online
                        ? "No topics to cram yet."
                        : "Cram needs a connection: the server deals the questions.")
                } else {
                    Panel {
                        Text("Notes").font(.caption).foregroundColor(muted)
                        DensityToggle(density: model.density) { model.setDensity($0) }
                            .padding(.top, 6)
                        Text("Questions per topic").font(.caption).foregroundColor(muted).padding(.top, 12)
                        HStack(spacing: 12) {
                            Button("−5") { model.setMaxPerTopic(model.maxPerTopic - 5) }
                                .buttonStyle(.bordered)
                            Text("\(model.maxPerTopic)").font(.title3).bold()
                            Button("+5") { model.setMaxPerTopic(model.maxPerTopic + 5) }
                                .buttonStyle(.bordered)
                        }
                        .padding(.top, 6)
                    }

                    SectionTitle(text: "Topics").padding(.top, 14)
                    ForEach(model.cramTopics) { topic in
                        Panel {
                            HStack {
                                Image(systemName: model.cramSelected.contains(topic.id) ? "checkmark.square.fill" : "square")
                                    .foregroundColor(model.cramSelected.contains(topic.id) ? accent : muted)
                                    .onTapGesture { model.toggleCramTopic(topic.id) }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(topic.name).font(.system(size: 15, weight: .semibold))
                                    Text("\(topic.questions) question\(topic.questions == 1 ? "" : "s") · \(topic.notes) note\(topic.notes == 1 ? "" : "s")")
                                        .font(.caption2).foregroundColor(muted)
                                }
                                Spacer()
                            }
                        }
                        .padding(.top, 8)
                    }

                    Button {
                        model.startCram()
                    } label: {
                        Text(model.cramSelected.isEmpty
                             ? "Pick at least one topic"
                             : "Cram \(model.cramSelected.count) topic\(model.cramSelected.count == 1 ? "" : "s")")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(accent)
                    .disabled(model.cramSelected.isEmpty || model.busy)
                    .padding(.top, 14)
                }

                Spacer().frame(height: 10)
                Button("Refresh") { model.loadCramTopics() }
                    .font(.caption).buttonStyle(.plain).foregroundColor(muted)
                Spacer().frame(height: 20)
            }
            .padding(20)
        }
    }
}
