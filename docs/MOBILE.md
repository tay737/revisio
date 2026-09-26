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

- **A connection is required.** Nothing is graded locally, so an offline device
  can read a cached page but cannot complete a review. The shell says so instead
  of pretending (`NativeShell.tsx`).
- **There are no store submissions yet.** These are sideload artefacts: an APK
  you open, and an unsigned IPA you re-sign. Getting into the App Store and Play
  Store is a signing-and-review task, not a code task.

## 2. Where each concern lives

| Concern | Owner | Why there |
|---|---|---|
| Native identity, app id, the URL to load, chrome config | `capacitor.config.ts` | One file describes the shell |
| "Am I native, and what does that change?" | `src/lib/native.ts` | No Capacitor import exists anywhere else in `src/` |
| The offline banner | `src/components/NativeShell.tsx` | The app's only native-aware surface |
| Service worker policy | `src/lib/native.ts` → consumed by `PwaRegister` | One decision, consulted at its single call site |
| Launcher icon and splash art | `scripts/native/make-assets.mjs` → `assets/` | Generated from the brand, so it cannot drift |
| Product version | `package.json`, stamped by `scripts/native/set-version.mjs` | Store version and tag can never disagree |
| Local/CI build entry point | `scripts/native/prepare.mjs` | A developer and CI run the same script |

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
