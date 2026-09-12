# buildersuite-desktop

Electron shells for **BuilderSuite Pro** and **BuilderTeams**, built from one
codebase and shipped as two signed apps.

The window loads the live site over HTTPS. The chat interface, branding, auth and
notifications are all rendered by the web app. This repo only owns the native
shell: window frame, tray, settings, packaging and release.

> Do not rebuild any web UI here. If a feature seems missing, it is a change to
> make in Builder Suite Pro, not in this repo.

## Targets

| | suite | teams |
| --- | --- | --- |
| Product | BuilderSuite Pro | BuilderTeams |
| App ID | `com.kingdomtexas.buildersuitepro` | `com.kingdomtexas.builderteams` |
| Loads | `/` | `/messages/popout` |
| Window | 1280x800, min 1024x700 | 420x760, min 360x480 |
| Mac title bar | standard | `hiddenInset` |
| Close on Windows | quits | hides to tray |
| Global hotkey | none | `CommandOrControl+Shift+T` |

The target is chosen at build time by `BSP_TARGET` and burned into the bundle by
Vite. It is never read from the environment at runtime, because a packaged app
has no such variable and would silently fall back to the wrong target.

## Develop

```bash
npm install
npm run dev:teams     # or dev:suite
```

Node 24. On this machine Node comes from mise, which is not on the default PATH:

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
```

## Build

```bash
npm run dist:teams    # dist/teams/BuilderTeams.dmg + .zip
npm run dist:suite    # dist/suite/BuilderSuite-Pro.dmg + .zip
```

Windows installers cannot be produced on macOS — NSIS cannot be cross-built from
Apple Silicon. Push any branch and the `build` workflow produces unsigned
Windows and Mac artifacts on GitHub's runners.

The macOS DMG step occasionally fails with a `plistlib.InvalidFileException`
from `hdiutil`. It is transient; re-run the same command.

## Release

Push a tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Both apps are built on Windows and macOS runners, signed, notarized and
published to one GitHub Release as four assets:

```
BuilderSuite-Pro-Setup.exe
BuilderSuite-Pro.dmg
BuilderTeams-Setup.exe
BuilderTeams.dmg
```

Filenames deliberately carry no version number, so these links stay valid
forever and only need pasting into BSP once:

```
https://github.com/buildersuitepro/buildersuite-desktop/releases/latest/download/BuilderSuite-Pro-Setup.exe
https://github.com/buildersuitepro/buildersuite-desktop/releases/latest/download/BuilderSuite-Pro.dmg
https://github.com/buildersuitepro/buildersuite-desktop/releases/latest/download/BuilderTeams-Setup.exe
https://github.com/buildersuitepro/buildersuite-desktop/releases/latest/download/BuilderTeams.dmg
```

The repo must stay **public** or those URLs 404 for anyone without credentials.

### Auto-update

Both apps publish into one repo, so each uses its own update channel (`suite`,
`teams`) and therefore its own manifest. Without that they would both write
`latest.yml` and one app could install the other's build.

macOS builds a `zip` alongside the `dmg` because electron-updater cannot apply
an update from a DMG.

## Signing

Nothing is signed yet, and unsigned builds warn on both platforms. Credentials
live in GitHub Actions Secrets only — never commit a certificate to this public
repo.

- Windows: Azure Trusted Signing, commented out in `electron-builder.base.yml`.
  Needs `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
  electron-builder v27 replaces `azureSignOptions` with a unified `win.sign` key.
- macOS: Developer ID plus notarization, via the built-in `mac.notarize`.
  Needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

## What the web app provides

The shell depends on three things from Builder Suite Pro:

1. **`__BSP_DESKTOP__`** — exposed by the preload, used by BSP to hide install
   prompts and push-notification settings that are dead ends in a desktop app.
2. **A drag region** at the top of the pop-out, so the macOS traffic lights do
   not overlap chat content. No CSS is injected from this side.
3. **The unread count**, see below.

### Unread badge

BSP calls `navigator.setAppBadge(count)`. On macOS Electron maps that to the dock
badge automatically and nothing else is needed.

Windows has no equivalent: Electron's badge APIs are Linux and macOS only, so the
main process never learns the number and the taskbar overlay has nothing to draw.
BSP should therefore also call, next to its existing `setAppBadge`:

```ts
window.__BSP_DESKTOP_BADGE__?.(totalUnreadCount);
```

Optional and safe: if it is never called, Windows shows no numeric overlay and
nothing errors.

## Notifications

Web Push does not work in Electron — `pushManager.subscribe()` fails because
Electron ships Chromium without Google's push service. This is accepted for v1.

BuilderTeams stays resident in the tray, holds a live connection, and raises
native notifications that way. Alerts stop only when the app is genuinely quit,
which is why the first real quit shows a one-time warning.

FCM and `electron-push-receiver` are explicitly out of scope.
