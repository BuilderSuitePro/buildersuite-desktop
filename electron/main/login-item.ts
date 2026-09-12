import { app } from "electron";
import { settingsStore } from "./store";

/**
 * Launch at login, defaulting to off — an app that starts itself uninvited is a
 * common complaint.
 *
 * Electron 44 removed the old `openAsHidden` flag, so "start in the tray" is
 * done per platform: a marker argument on Windows, and wasOpenedAtLogin on
 * macOS.
 */
const HIDDEN_FLAG = "--hidden";

export function applyLoginItem(): void {
  const openAtLogin = settingsStore.get("launchAtLogin");

  app.setLoginItemSettings({
    openAtLogin,
    // Windows only; ignored elsewhere.
    args: [HIDDEN_FLAG],
  });
}

/** True when this launch was started automatically at login. */
export function launchedHidden(): boolean {
  if (process.argv.includes(HIDDEN_FLAG)) return true;
  if (process.platform !== "darwin") return false;

  try {
    return app.getLoginItemSettings().wasOpenedAtLogin;
  } catch {
    return false;
  }
}
