import { dialog } from "electron";
import { TARGET } from "../targets";
import { settingsStore } from "./store";

/**
 * Shown once, on the first genuine quit, because a quit app stops delivering
 * message alerts entirely (Electron has no Web Push, so nothing can wake it).
 *
 * Deliberately NOT shown when the window is merely closed to the tray, which
 * happens constantly and would make this noise within a day.
 *
 * Async because only the promise-based dialog reports the checkbox state;
 * showMessageBoxSync returns the button index alone.
 *
 * Resolves true if the quit should go ahead.
 */
export async function confirmQuit(): Promise<boolean> {
  if (!TARGET.warnOnQuitAboutNotifications) return true;
  if (settingsStore.get("suppressQuitWarning")) return true;

  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Quit anyway", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Notifications will stop",
    message: "Notifications will stop",
    detail: `${TARGET.productName} only delivers message alerts while it is running. Close it to the tray instead to keep getting notified.`,
    checkboxLabel: "Don't show this again",
    checkboxChecked: false,
  });

  // Remember the preference even if they back out, matching how the checkbox
  // reads to the user.
  if (checkboxChecked) settingsStore.set("suppressQuitWarning", true);

  return response === 0;
}
