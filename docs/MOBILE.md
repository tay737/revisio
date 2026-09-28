# Native clients

Revisio ships two **native** mobile clients, not a wrapper around the website:

| | Android | iOS |
|---|---|---|
| App | Kotlin + Jetpack Compose | Swift + SwiftUI |
| Engine | Kotlin/JVM library (`:engine`) | Swift package target (`RevisioEngine`) |
| Project | `mobile/android/` | `mobile/ios/Revisio.xcodeproj` |
| Artefact | `Revisio-<version>-android.apk` | `Revisio-<version>-ios-unsigned.ipa` |

Both talk to the backend over the same `/api/v1` contract the web app uses, and
both carry a copy of the grading engine so a review can be marked with no server.

## Why not a shell

The previous iteration wrapped the hosted web app in a WebView
(`server.url` → the deployment). Offline it could only ever render what the
service worker had cached, and `public/sw.js` falls back to `caches.match('/')`
for *any* failed navigation — so losing the network handed the user the cached
**landing page**, whose buttons then had no server to call. That is the reported
bug, and it was structural: a cached website has no app of its own to open.

The fix is not a better cache. It is that the screen the user sees is compiled
into the app, so it exists before, during and after any network call.

## What the clients do

Both clients implement the learner surface itself, not a subset of it. Nothing
here is a WebView, and no screen is fetched at runtime — the five destinations
are compiled in, so losing the network can never blank one.

| Surface | Native screen | Needs a server? |
|---|---|---|
| The daily loop | `TodayScreen` / `TodayView` | table · no — works from the stored session |
| Marking a card (cloze, flashcard, MCQ) | `SessionScreen` / `SessionView` | table · no — graded by the port, queued |
| Cram | `CramScreen` / `CramView` | list yes, session no |
| Learn — subjects, topics, notes | `LearnScreen` / `LearnView` | yes for the catalogue; notes render offline once read |
| Rank — rank, weekly lobby, placement | `RankScreen` / `RankView` | yes (computed from full history) |
| You — profile, privacy switches, prefs, achievements | `YouScreen` / `YouView` | yes |
| Sign in / sign out, session persistence | `AuthScreen` / `AuthView` | first sign-in only |

The content, session and rank payloads are the ones the web already returns, so
the phone and the web cannot disagree about a card, a note or a rank. Counting
and ranking live in `src/domain/` and `src/services/` on the server; the clients
draw what they are handed.

## Architecture: engine apart from interface

Each client is split the same way, and the split is load-bearing.

```
mobile/android/
  engine/   a plain Kotlin/JVM library — no Android dependency
    Grading.kt        the grading port (pure)
    Models.kt         verdicts, cards, queued reviews, API DTOs
    KeyValueStore.kt  the storage seam (memory or files)
    OfflineStore.kt   the single owner of the cached pack + outbox
    SessionStore.kt   the refresh token + user that survive a restart
    SyncEngine.kt     drain the outbox, oldest first
    RevisioApi.kt     the only door to the backend
  app/      the Android surface — Compose UI and wiring only

mobile/ios/
  Package.swift            the engine, as a Swift package
  Sources/RevisioEngine/   the same seven concerns, in Swift
  Sources/Revisio/         the SwiftUI surface
  Revisio.xcodeproj        the app target CI archives — it links RevisioEngine
  Revisio/                 Info.plist and the icon catalogue
```

```
mobile/ios/Sources/Revisio/    one file per destination
  RevisioApp.swift   the shell, the tabs and the state owner
  TodayView.swift    SessionView.swift   CramView.swift
  LearnView.swift    RankView.swift      YouView.swift
  Common.swift       the shared pieces (panel, stat, notes, avatar)
  Design.swift       the design system those screens are written against
  Theme.swift        GENERATED from src/app/globals.css
  Icons.swift        GENERATED from the web's lucide registry
  SVGPath.swift      the path parser Icons.swift needs to draw with
```

The Xcode project does not copy the engine. It references the package beside it
(`XCLocalSwiftPackageReference`) and links the `RevisioEngine` product, so there
is exactly one copy of the grading rules and the tests still run against the same
sources `swift test` compiles.

Because the engine has no UI and no Android dependency, the whole client's
behaviour is unit-testable on a workstation: `./gradlew test` and `swift test`
cover grading, the pack, the outbox and sync without a device or a server.

**One owner per fact**

| Question | Owner |
|---|---|
| How is an answer marked? | `Grading` (both ports) |
| What is cached, and what do we owe the server? | `OfflineStore` |
| Who is signed in, offline? | `SessionStore` |
| When does an owed review go back? | `SyncEngine` |
| How do we talk to the backend? | `RevisioApi` |
| Online or not? | the platform surface (`RevisioViewModel` / `AppModel`) |
| Server now or outbox later? | the platform surface, and nothing else |

## The interface has one owner too

The clients do not have a design system of their own. The web app's is the only
one, and the natives are built against it — otherwise "the same app" would mean
"the same endpoints", and the two phones would drift into looking like two
different products that happen to share a database.

`docs/DESIGN-DUOLINGO.md` and `src/app/globals.css` are the source. The narrative
baked into both ports is the web's own: **Uber owns the chrome** (the ink/canvas
duet, the grayscale ramp, the pill, the type ladder) and **Duolingo owns the
state** (the tactile lip under a button, the uppercase tracked label, colour
reserved for the game — streak, correct, gold). Green is the one non-navigation
control, because it means the in-session action.

Two generators keep that honest, and both are re-runnable rather than
hand-copied:

```
src/app/globals.css                       src/components/ui/icons.tsx (lucide)
  │ scripts/native/make-theme.mjs           │ scripts/native/make-icons.mjs
  │ 34 colours × 2 schemes, 7 radii,        │ the registry's own path geometry
  │ 18 type tokens, 2 curves, metrics       ▼
  ▼                              mobile/shared/icons.json
Theme.kt / Theme.swift                       │
                                 ├───────────┴───────────┐
                                 ▼                       ▼
                          Icons.kt (ImageVector)   Icons.swift (path data)
```

So the phone's green is the web's green, its radii are its radii, and a tab bar
icon is the same drawing rather than a similarly-shaped emoji. Icons are not a
lookup table of OS glyphs: `make-icons.mjs` reads the same lucide geometry the
web imports at 24dp/24 grid and the web's own stroke weight (1.75, and 2.3 for
the active nav item, exactly as `BottomNav.tsx` swaps it).

`Theme.kt`, `Theme.swift`, `Icons.kt` and `Icons.swift` are **generated** — each
carries a header saying so, and a hand edit is overwritten the next time tokens
move. `Design.kt` and `Design.swift` are the opposite: hand-written against
them, and where the actual component vocabulary lives (panel, pill, stat, rank
crest, meter, badge, the button with its lip). To restyle every screen, change
`globals.css` and re-run the generators; to add a component, write it in
`Design.*` and use it from the screens.

## Grading has one owner, enforced

`src/domain/grading.ts` is still the only implementation of every grading rule.
Each platform carries a *port*, and a port is only honest if it agrees with the
original, so:

```
src/domain/grading.ts
        │  npx tsx scripts/native/grading-vectors.ts
        ▼
mobile/shared/grading-vectors.json        ← one artifact, 19 vectors
        │                    │
        ▼                    ▼
GradingConformanceTest    GradingConformanceTests
(Kotlin, ./gradlew test)  (Swift, swift test)
```

If a rule changes on the web, both native ports fail their tests until they
follow. A learner cannot get different marks on phone and web.

## Offline behaviour

The web app's rule is that the client may **preview** but never decide. The
native clients keep it:

1. When online, the app fetches `/api/v1/offline/pack` and stores it. That
   response carries the session *and* the answer key, deliberately separately
   from the daily queue.
2. With no network, the app opens to its own home screen, greets the learner by
   name from the stored session, and says it is offline.
3. A review is graded locally by the port. The mark is shown as a preview
   ("Saved on this device…") and the review is appended to the outbox.
4. On reconnect the outbox is drained oldest-first. The server re-grades and
   awards XP; drop stops at the first failure, so a replay resumes from a known
   point rather than overtaking itself.

Offline therefore changes *when* a verdict arrives, never who gives it.

## Build and test

```bash
# Android
npm run native:android:test      # engine conformance + store tests
npm run native:android:apk       # debug APK
npm run verify:native            # boots an emulator and drives the app offline

# the clients and the server, against a running server (development database)
npx next start -p 3123 &
npm run verify:native:api -- http://127.0.0.1:3123 dev@revisio.app

# iOS
npm run native:ios:test          # engine conformance + store tests
npm run native:ios:build         # compile the SwiftUI surface against the iOS SDK

# regenerate the shared grading vectors (after changing domain/grading.ts)
npm run vectors:grading

# regenerate the native theme and icon set (after changing globals.css or icons.tsx)
node scripts/native/make-theme.mjs
node scripts/native/make-icons.mjs

# regenerate the iOS icon from public/icon.svg
node scripts/native/make-ios-icon.mjs
```

Android needs JDK 21 and the Android SDK (`ANDROID_HOME`). iOS needs Xcode.

`native:ios:build` is the compile check for the SwiftUI surface, and it is not
redundant with `native:ios:test`. `swift test` builds the package for macOS, so
the screens are type-checked against the wrong API surface; `xcodebuild` builds
them for iOS but needs a working CoreSimulator to plan the build. Pointing
SwiftPM straight at the simulator SDK does the real thing with neither:

```bash
cd mobile/ios
swift build --triple arm64-apple-ios17.0-simulator \
  --sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)"
```

The executable product *is* the app's sources, so this compiles the whole
surface — the shell, the five screens, and the generated theme and icons —
against the iOS SDK, with no device, no simulator and no `.xcodeproj`. It is how
the design-language port was verified when `xcodebuild` could not run at all.

`verify:native` is the strongest gate in the repo: it installs the APK, seeds a
signed-in session and a session's worth of cards, **turns the network off**, and
then drives the real screen — open, start a review, answer a cloze, a flashcard
and a multiple choice, confirm the marks and the queue, then walk every other
destination and come back to the loop. If anything depended on a server, it
would fail.

There is no `NATIVE_APP_URL` anymore. The deployment is compiled in (the
`revisioApiBase` Gradle property, or `apiBase` in the iOS app).

`verify:native:api` is the other half of the gate. `verify:native` proves the app
runs with no server; this one proves it reads the *right* server. It signs in
against a running target and walks every route the two clients call, asserting
the fields their models require. It reads rather than writes — no review is
submitted, so nothing is re-scheduled.

It exists because a phone decodes silently. The web client has a console and a
human; the native clients turn a renamed field into a default, and a screen that
says "0 questions" looks like an empty topic rather than a broken contract. This
is not hypothetical: `/content` sends a topic's counts as `cards`/`lessons` while
`/cram` sends the same two numbers as `cardCount`/`lessonCount`, and a model that
knows only one spelling passes every test and shows nothing.

### The iOS bundle

CI archives the app target and hand-packages the `.ipa`:

```bash
cd mobile/ios
xcodebuild archive \
  -project Revisio.xcodeproj -scheme Revisio-iOS -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /tmp/Revisio.xcarchive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""

mkdir -p /tmp/Payload && cp -R /tmp/Revisio.xcarchive/Products/Applications/Revisio.app /tmp/Payload/
(cd /tmp && zip -qry Revisio-ios-unsigned.ipa Payload)
```

`-exportArchive` is deliberately not used: it insists on a signing identity this
repository does not have. An `.ipa` is just a zip with the app under `Payload/`,
and building it by hand is what lets an unsigned build ship. The result is still
a real Release device build — sources compiled, `RevisioEngine` linked, the icon
catalogue compiled into the bundle and the version stamped from `package.json`.
The workflow then opens the `.ipa` it is about to publish and asserts the bundle
id, the version and the compiled icon, because an artefact that quietly lost its
version is worse than one that never built.

Version stamping is one script for both platforms:

```
package.json  version 1.0.0-alpha.4
      │  node scripts/native/set-version.mjs
      ├─▶ mobile/android/app/build.gradle.kts   versionName / versionCode
      └─▶ mobile/ios/Revisio.xcodeproj           MARKETING_VERSION
                                                 CURRENT_PROJECT_VERSION
```

`Info.plist` reads both back out as `CFBundleShortVersionString` and
`CFBundleVersion`, so no version is ever written twice.

## Verification status

Against `1.0.0-alpha.4`:

| Claim | Proven by |
|---|---|
| Kotlin grading port ≡ TypeScript engine | `:engine:test` — 19/19 vectors |
| Swift grading port ≡ TypeScript engine | `swift test` — 19/19 vectors |
| The APK opens its own UI offline | `verify:native` on an emulator with the network disabled |
| A full review completes offline and queues | `verify:native` — cloze, flashcard, MCQ, then the outbox |
| Every destination is compiled in, not fetched | `verify:native` — Learn, Cram, Rank and You each open offline and say what they are missing instead of failing |
| The native models match what the server sends | `verify:native:api` — every learner route, against a running server, field by field |
| Offline is never reported as being signed out | `verify:native` — the account banner reads "You're offline" while the network is off |
| The phones wear the web's design, not a lookalike | `make-theme.mjs` / `make-icons.mjs` read `globals.css` and the lucide registry; a token or icon change is a regeneration, not a hand copy |
| The restyled screens still work with no network | `verify:native` — the same offline run, driven against the new UI, all destinations included |
| The SwiftUI surface compiles for iOS, not just macOS | `native:ios:build` — the whole surface built for `arm64-apple-ios-simulator` against the iOS SDK, no simulator required |
| iOS produces an installable artefact | the `ios` job archives `Revisio.xcodeproj` and attaches `Revisio-<version>-ios-unsigned.ipa` |
| The `.ipa` is the app we think it is | the workflow reads back the bundle id, version and compiled icon from the published file |
| **Not yet:** running on iOS hardware | the `.ipa` is unsigned and has not been launched on a device |

## Remaining work

- **Signing.** The APK is debug-signed, so it installs anywhere. The `.ipa` is
  **unsigned** and will not install as-is: it needs an Apple developer
  certificate and provisioning profile to be distributed, or a re-signing tool
  (Sideloadly, AltStore) to run on a personal device. A store build needs a
  release keystore with Play App Signing on the Android side and a real
  distribution profile on the iOS side.
- **First exposure is online-only.** `/api/v1/learn` answers *which* unseen
  cards to show; the offline pack only covers the daily queue. A learner who
  has never opened a topic needs a connection once.
- **The web PWA still falls back to `/`.** `public/sw.js` answers a failed
  navigation with the cached landing page. That is no longer the mobile bug it
  was — the native clients do not use it — but the web app would still benefit
  from a route-aware offline fallback.
- **Feature coverage.** The learner surface is native on both platforms — the
  loop, cram, learn and notes, rank, profile and settings. Still web-only:
  exam mode, the library, teacher tools and the admin console. Those are
  authoring and operations surfaces, and they are the natural next port.
- **Notes are read online first.** `LearnView`/`LearnScreen` fetch the lesson
  text from the server; a topic read once is not yet kept for offline reading
  the way the daily pack is.
