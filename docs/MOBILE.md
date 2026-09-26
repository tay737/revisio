# Native clients

Revisio ships two **native** mobile clients, not a wrapper around the website:

| | Android | iOS |
|---|---|---|
| App | Kotlin + Jetpack Compose | Swift + SwiftUI |
| Engine | Kotlin/JVM library (`:engine`) | Swift package target (`RevisioEngine`) |
| Project | `mobile/android/` | `mobile/ios/` |
| Artefact | `app-debug.apk` | *(none yet — see [Remaining work](#remaining-work))* |

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
  Sources/RevisioEngine/   the same seven concerns, in Swift
  Sources/Revisio/         the SwiftUI surface
```

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

# iOS
npm run native:ios:test          # engine conformance + store tests

# regenerate the shared grading vectors (after changing domain/grading.ts)
npm run vectors:grading
```

Android needs JDK 21 and the Android SDK (`ANDROID_HOME`). iOS needs Xcode.

`verify:native` is the strongest gate in the repo: it installs the APK, seeds a
signed-in session and a session's worth of cards, **turns the network off**, and
then drives the real screen — open, start a review, answer a cloze, a flashcard
and a multiple choice, and confirm the marks and the queue. If anything depended
on a server, it would fail.

There is no `NATIVE_APP_URL` anymore. The deployment is compiled in (the
`revisioApiBase` Gradle property, or `apiBase` in the iOS app).

## Verification status

Against `1.0.0-alpha.2`:

| Claim | Proven by |
|---|---|
| Kotlin grading port ≡ TypeScript engine | `:engine:test` — 19/19 vectors |
| Swift grading port ≡ TypeScript engine | `swift test` — 19/19 vectors |
| The APK opens its own UI offline | `verify:native` on an emulator with the network disabled |
| A full review completes offline and queues | `verify:native` — cloze, flashcard, MCQ, then the outbox |
| The Swift client compiles for iOS | `swiftc -typecheck -sdk iphonesimulator` (and CI) |
| **Not yet:** an installable iOS build | no Xcode app target (below) |

## Remaining work

- **iOS app target.** `mobile/ios` is a Swift package: the engine and the
  SwiftUI app compile and are tested, but nothing produces an `.app`/`.ipa`
  yet. That needs an Xcode app target wrapping the package (which then also
  carries `Info.plist`, the icon set and version stamping). Until then iOS
  ships no artefact.
- **First exposure is online-only.** `/api/v1/learn` answers *which* unseen
  cards to show; the offline pack only covers the daily queue. A learner who
  has never opened a topic needs a connection once.
- **Signing.** The APK is debug-signed. A store build needs a release keystore
  and Play App Signing; iOS needs a certificate and provisioning profile.
- **The web PWA still falls back to `/`.** `public/sw.js` answers a failed
  navigation with the cached landing page. That is no longer the mobile bug it
  was — the native clients do not use it — but the web app would still benefit
  from a route-aware offline fallback.
- **Feature coverage.** The native clients implement auth, the home summary and
  the daily review loop. Cram, exam, learn, progress, library, teacher and
  admin remain web-only.
