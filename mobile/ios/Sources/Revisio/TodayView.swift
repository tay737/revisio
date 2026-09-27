import SwiftUI
import RevisioEngine

/// Today — the loop.
///
/// The screen the app opens on, and the one it can still serve with no network
/// at all: the session it carries is on the device, and everything here is either
/// the stored pack or the last thing the server told us.
struct TodayView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 8)
                HStack(spacing: 14) {
                    Avatar(emoji: model.me?.avatarEmoji, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.name.isEmpty ? "Welcome back" : "Hi, \(model.name)")
                            .font(.title3).bold()
                        Text(model.online ? "Online" : "Offline — your saved session still works")
                            .font(.caption).foregroundColor(model.online ? good : near)
                    }
                    Spacer()
                    Button("Sign out") { model.signOut() }
                        .font(.caption).foregroundColor(muted).buttonStyle(.plain)
                }

                Spacer().frame(height: 18)

                if let home = model.home {
                    Panel {
                        Text("Today").font(.caption).foregroundColor(muted)
                        Text("\(home.due) cards ready").font(.title2).bold().padding(.top, 4)
                        HStack(spacing: 22) {
                            Stat(label: "Level", value: "\(home.level)")
                            Stat(label: "XP", value: "\(home.totalXp)")
                            Stat(label: "Streak", value: "\(home.streak)d")
                        }
                        .padding(.top, 12)

                        if home.reviewedToday > 0 {
                            Text("\(home.correctToday) of \(home.reviewedToday) correct today")
                                .font(.caption).foregroundColor(muted).padding(.top, 10)
                        }
                        if home.fromCache {
                            Text("Showing the session saved on this device.")
                                .font(.caption).foregroundColor(near).padding(.top, 10)
                        }
                    }

                    Button {
                        model.startTodayReview()
                    } label: {
                        Text(home.packCards > 0 ? "Start review" : "Connect once to download cards")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(accent)
                    .disabled(home.packCards == 0)
                    .padding(.top, 12)

                    if model.pending > 0 {
                        Panel {
                            Text("\(model.pending) review\(model.pending == 1 ? "" : "s") waiting to sync")
                                .font(.subheadline)
                            Text("They'll be graded by the server once you're back online.")
                                .font(.caption).foregroundColor(muted)
                            if model.online {
                                Button("Sync now") { model.refreshHome() }
                                    .font(.caption).padding(.top, 6)
                            }
                        }
                        .padding(.top, 12)
                    }
                } else {
                    ProgressView().tint(accent)
                }

                Spacer().frame(height: 22)
                SectionTitle(text: "Elsewhere")
                HStack(spacing: 10) {
                    Button("Read notes") { model.selectTab(.learn) }
                        .buttonStyle(.bordered).frame(maxWidth: .infinity)
                    Button("Cram") { model.selectTab(.cram) }
                        .buttonStyle(.bordered).frame(maxWidth: .infinity)
                }
                .padding(.top, 8)
                HStack(spacing: 10) {
                    Button("Your rank") { model.selectTab(.rank) }
                        .buttonStyle(.bordered).frame(maxWidth: .infinity)
                    Button("Profile") { model.selectTab(.you) }
                        .buttonStyle(.bordered).frame(maxWidth: .infinity)
                }
                .padding(.top, 6)

                Spacer().frame(height: 20)
                Button("Refresh") { model.refreshHome() }
                    .font(.caption).foregroundColor(muted).buttonStyle(.plain)
                Spacer().frame(height: 20)
            }
            .padding(20)
        }
    }
}
