import Store from "electron-store";
import { TARGET } from "../targets";

export type WindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
};

export type Settings = {
  launchAtLogin: boolean;
  hotkeyEnabled: boolean;
  hotkey: string;
  /** Set once the user ticks "Don't show this again" on the quit warning. */
  suppressQuitWarning: boolean;
};

// Namespaced per target. Sharing one file would make the two apps fight over
// a single saved position and a single hotkey.
export const windowStore = new Store<WindowState>({
  name: `window-state-${TARGET.id}`,
  defaults: {
    width: TARGET.width,
    height: TARGET.height,
    maximized: false,
  },
});

export const settingsStore = new Store<Settings>({
  name: `settings-${TARGET.id}`,
  defaults: {
    launchAtLogin: false,
    hotkeyEnabled: TARGET.hotkeyEnabledByDefault,
    hotkey: TARGET.defaultHotkey,
    suppressQuitWarning: false,
  },
});

export function getSettings(): Settings {
  return {
    launchAtLogin: settingsStore.get("launchAtLogin"),
    hotkeyEnabled: settingsStore.get("hotkeyEnabled"),
    hotkey: settingsStore.get("hotkey"),
    suppressQuitWarning: settingsStore.get("suppressQuitWarning"),
  };
}
