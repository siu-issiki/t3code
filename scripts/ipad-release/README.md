# iPad personal build (TestFlight)

macOS-style shortcuts (⌘B sidebar, ⌘J terminal, ⌘D review, ⌘P files, `/` focuses composer)
and composer focus on thread switch when a hardware keyboard is connected.

Builds under your own Apple Developer team (personal-team mode drops push, widgets,
App Groups and Sign in with Apple).

1. `cp .env.example .env` at the repo root (needed for T3 account sign-in; email sign-in only —
   OAuth redirects are allowlisted for the official app only).
2. `cp scripts/ipad-release/.env.ipad.example scripts/ipad-release/.env.ipad` and fill it in.
3. `scripts/ipad-release/release.sh` — prebuild, archive, upload to App Store Connect
   (build number is bumped automatically). Logs go to `~/Library/Caches/t3code-ipad-release`.
4. Check processing / add yourself to the internal group:
   `cd scripts/ipad-release && fastlane tf_internal` (needs a saved fastlane session for `ASC_APPLE_ID`).
