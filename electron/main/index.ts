import { app, ipcMain } from "electron";
import { TARGET } from "../targets";
import { applyBadgeCount } from "./badge";
import { applyLoginItem, launchedHidden } from "./login-item";
import { confirmQuit } from "./quit-warning";
import { getSettings, settingsStore, type Settings } from "./store";
import { applyHotkey, releaseHotkeys } from "./shortcuts";
import { openSettingsWindow } from "./settings-window";
import { buildTrayMenu, createTray, syncLoginItemFromSettings } from "./tray";
import { initAutoUpdater } from "./updater";
import { createMainWindow, getMainWindow, showMainWindow } from "./window";

// Windows needs this before any window or notification exists, or toasts are
// attributed to "Electron" and the two apps share one taskbar group.
app.setAppUserModelId(TARGET.appId);

// Second launch should surface the running app rather than start another copy.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
  void start();
}

/** Distinguishes a real quit from the close button hiding to tray. */
let quitting = false;

async function start(): Promise<void> {
  await app.whenReady();

  registerIpc();

  const win = createMainWindow(launchedHidden());

  win.on("close", (event) => {
    // Tray-resident apps keep running so the live connection stays up and
    // notifications keep arriving. The full suite quits like normal software.
    const hideToTray =
      !quitting &&
      TARGET.closeHidesToTrayOnWindows &&
      process.platform !== "darwin";

    if (hideToTray) {
      event.preventDefault();
      win.hide();
      return;
    }

    // Standard macOS behaviour: the window closes, the app stays in the dock.
    if (!quitting && process.platform === "darwin") {
      event.preventDefault();
      win.hide();
    }
  });

  createTray();

  applyLoginItem();
  applyHotkey();
  initAutoUpdater();

  app.on("activate", () => showMainWindow());
}

app.on("before-quit", (event) => {
  if (quitting) return;

  event.preventDefault();
  void confirmQuit().then((proceed) => {
    if (!proceed) return;
    quitting = true;
    app.quit();
  });
});

app.on("will-quit", () => releaseHotkeys());

// Every window closing is not a reason to exit for a tray-resident app, and on
// macOS it is never a reason to exit.
app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;
  if (TARGET.closeHidesToTrayOnWindows) return;
  app.quit();
});

function registerIpc(): void {
  // The web app publishes its unread count here. See badge.ts for why Windows
  // cannot read it any other way.
  ipcMain.on("bsp:badge-count", (_event, value: unknown) => {
    const count = typeof value === "number" ? value : Number(value);
    applyBadgeCount(Number.isFinite(count) ? count : 0, getMainWindow());
  });

  ipcMain.handle("bsp:get-settings", () => ({
    ...getSettings(),
    productName: TARGET.productName,
    version: app.getVersion(),
    platform: process.platform,
    defaultHotkey: TARGET.defaultHotkey,
    supportsHotkey: TARGET.hotkeyEnabledByDefault || TARGET.id === "teams",
  }));

  ipcMain.handle("bsp:set-settings", (_event, patch: Partial<Settings>) => {
    if (typeof patch.launchAtLogin === "boolean") {
      settingsStore.set("launchAtLogin", patch.launchAtLogin);
    }
    if (typeof patch.hotkeyEnabled === "boolean") {
      settingsStore.set("hotkeyEnabled", patch.hotkeyEnabled);
    }
    if (typeof patch.hotkey === "string" && patch.hotkey.trim()) {
      settingsStore.set("hotkey", patch.hotkey.trim());
    }

    syncLoginItemFromSettings();
    const hotkey = applyHotkey();
    buildTrayMenu();

    return { ...getSettings(), hotkeyRegistered: hotkey.ok };
  });

  ipcMain.on("bsp:open-settings", () => openSettingsWindow(getMainWindow()));
}
