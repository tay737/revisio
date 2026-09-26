# Revisio on iOS and Android

Status: v1.0.0-alpha.1 — sideload-only alpha artefacts.

## 1. The shape: a shell, not a port

Revisio is a thin client. Grading, the SRS scheduler, XP, leagues and content
visibility all run on the server and the client never re-derives them
(`docs/ARCHITECTURE.md` §18). That decision is what makes a native app cheap:
the apps are the *same* Next.js app in a native WebView, with native chrome
around it. There is no second implementation to keep in step.

```
┌──────────────────────────────────────────────┐
│  Revisio.apk / Revisio.ipa                   │
│  ┌────────────────────────────────────────┐  │
│  │  Capacitor WebView                     │  │
│  │  → NATIVE_APP_URL (the Next.js app)    │  │
│  └────────────────────────────────────────┘  │
│  status bar · splash · back button · icons   │
└──────────────────────────────────────────────┘
```

Consequences worth stating plainly:

- **A session can be finished with no network.** The app takes a reviewable
  session with it, grades locally, and hands the answers back when the
  connection returns — see §7. The alternatives were worse: refusing to review
  at all, or inventing XP the server never awarded.
- **There are no store submissions yet.** These are sideload artefacts: an APK
  you open, and an unsigned IPA you re-sign. Getting into the App Store and Play
  Store is a signing-and-review task, not a code task.

## 2. Where each concern lives

| Concern | Owner | Why there |
|---|---|---|
| Native identity, app id, the URL to load, chrome config | `capacitor.config.ts` | One file describes the shell |
| "Am I native, and what does that change?" | `src/lib/native.ts` | No Capacitor import exists anywhere else in `src/` |
| Connectivity status | `src/components/NativeShell.tsx` | The app's only native-aware surface |
| Service worker policy | `src/lib/native.ts` → consumed by `PwaRegister` | One decision, consulted at its single call site |
| The offline session, the outbox, the preview rule | `src/lib/offline.ts` | Nothing else reads or writes those keys |
| The answer key an offline session needs | `src/services/offline.ts` | Assembled server-side, never on the queue |
| Launcher icon and splash art | `scripts/native/make-assets.mjs` → `assets/` | Generated from the brand, so it cannot drift |
| Product version | `package.json`, stamped by `scripts/native/set-version.mjs` | Store version and tag can never disagree |
| Local/CI build entry point | `scripts/native/prepare.mjs` | A developer and CI run the same script |
| Proof the offline contract holds | `scripts/verify-offline.ts` | The claims above, checked against a running server |

The generated `android/` and `ios/` directories are **not committed**. They are
reproducible from the files above, which keeps the repository buildable on a
machine that has neither the Android SDK nor CocoaPods.

## 3. Building locally

Requirements:

| | Android | iOS |
|---|---|---|
| OS | any | macOS |
| Toolchain | Android SDK + JDK 21 | Xcode (full, not just Command Line Tools) + CocoaPods |
| Command | `npm run native:apk` | `npm run native:ipa` |
| Output | `android/app/build/outputs/apk/debug/app-debug.apk` | `ios/App/build/.../App.app` |

```bash
export NATIVE_APP_URL=https://your-deployment.example.com
npm run native:prepare     # cap add → assets → version → cap sync
npm run native:apk
```

Without `NATIVE_APP_URL` the build still succeeds, and the app boots into the
bundled `native-www` shell explaining that it is not connected. That is the
intended failure mode: a build mistake should be legible, not a white screen.

## 4. Icons and splash screens

`node scripts/native/make-assets.mjs` renders `assets/` from the brand colours
using `sharp`. The outputs are committed, so a normal build needs nothing extra.

The mark is centred by rasterising the glyph, trimming it to its ink and
compositing it — not by SVG `dominant-baseline`, which the rasteriser ignores and
which silently pushed it below centre. Re-run the script only when the mark
changes.

## 5. Signing, honestly

| Artefact | Signing | Installs on a real device? |
|---|---|---|
| `Revisio-*-android.apk` | Debug keystore, created by Gradle | **Yes** — enable "Install unknown apps" |
| `Revisio-*-ios-unsigned.ipa` | None | **No, not directly** — re-sign first |

- **Android.** The CI artefact is `assembleDebug`, which Gradle signs with a
  throwaway key, so it installs like any APK. A Play Store release must instead
  use a release keystore and Play App Signing; add the keystore as a base64
  secret and switch the Gradle task to `assembleRelease`.
- **iOS.** CI has no signing identity, so the IPA is unsigned. It is a real
  build of the real app, and it can be installed by re-signing it (Sideloadly,
  AltStore) with an Apple ID, or by signing with an Apple Developer certificate
  and a provisioning profile. An Apple Developer account (\$99/yr) is required
  for anything beyond a 7-day personal sideload.

## 6. Producing a release

```bash
# 1. Set the version once.
npm version 1.0.0-alpha.2 --no-git-tag-version

# 2. Point the apps at a deployment (repository variable, once).
#    Settings → Secrets and variables → Actions → Variables → NATIVE_APP_URL

# 3. Tag it — CI builds both artefacts and publishes the release.
git add -A && git commit -m "release: 1.0.0-alpha.2"
git tag v1.0.0-alpha.2
git push origin main --tags
```

`.github/workflows/mobile-release.yml` runs `scripts/native/prepare.mjs`, builds
the APK on `ubuntu-latest` and the IPA on `macos-14`, and attaches both to the
GitHub Release. `workflow_dispatch` runs the same builds without publishing, for
a dry run.

## 7. Reviewing with no network

The app is a thin client, so offline was never going to be free — but it was
always going to be possible, because grading and scheduling are *pure* modules
(`domain/grading.ts`, `domain/srs.ts`) with no database and no framework
dependency. That is what makes a local verdict possible without a second
implementation of any rule.

### What happens on a train

1. **Online, quietly.** Loading a daily queue also fetches an *offline pack*
   from `/api/v1/offline/pack` and keeps it in `localStorage`. The pack is the
   queue plus the key each card kind needs — accepted answers for cloze and
   flashcards, the correct option for multiple choice.
2. **Offline, the app still opens.** The service worker's cache serves the HTML,
   styles and client bundles, so the review screen loads with no connection at
   all. That is its main job now; it was briefly disabled in the native shell on
   the mistaken belief that the WebView's HTTP cache covered this. An HTTP cache
   is best-effort and cannot boot an application.
3. **Answering grades locally.** `previewVerdict` in `lib/offline.ts` calls the
   same `domain/grading` the server calls, so the verdict, the "case only"
   nudge and the model answer all read exactly as they do online.
4. **The review is owed, not lost.** It goes into an append-only outbox with its
   client timestamp. The XP is deliberately *not* invented — the chip on screen
   says `n saved`, and the background banner counts what is waiting.
5. **Reconnecting settles up.** On the `online` event, and when the review
   screen opens, the outbox is replayed oldest-first to `/api/v1/reviews`. The
   server re-grades each one, awards the XP, moves the schedule and writes the
   log. A review that lands takes itself out of the pack, so it is never dealt
   twice.

### Why the verdict is a preview

`domain/grading` says of itself: *the server's verdict is final; the client may
preview but never decide.* Offline honours that literally rather than working
around it. The learner sees the verdict immediately because that is what makes
studying possible; the server still decides what it is worth. One implementation
of every rule, now called from a second place instead of copied into one.

### The split that keeps it honest

| Endpoint | Carries answers? | Fetched |
|---|---|---|
| `/api/v1/queue/today` | **no** | constantly |
| `/api/v1/offline/pack` | **yes** | rarely, deliberately |

Keeping them separate is the point: the key travels only when a client has asked
for a session to take with it, so an ordinary queue read cannot hand over the
whole answer set.

### Verifying it

```bash
npm run build && npm start &
npm run verify:offline -- http://127.0.0.1:3100 dev@revisio.app
```

The script asserts the four claims the design rests on: the pack carries the
right key per kind, the daily queue carries none, a locally previewed verdict
equals the server's for correct / wrong / case-only answers, and a replayed
review lands without double-logging. It reviews real cards, so point it at a
development database.

### What is deliberately not offline

- **First exposure** (`/learn`) stays online-only. Meeting a card for the first
  time without its notes is a guess, and shipping a degraded version of that
  would be worse than the honest "not now".
- **Teacher, admin and library** surfaces are unchanged. They are authoring
  tools; they are not what anyone uses on a train.
