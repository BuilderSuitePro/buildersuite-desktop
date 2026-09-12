import { globalShortcut } from "electron";
import { settingsStore } from "./store";
import { toggleMainWindow } from "./window";

let registered: string | null = null;

/**
 * Another app may already own the combination. A failed binding is reported
 * back to the settings window; it is never fatal.
 */
export function applyHotkey(): { ok: boolean; accelerator: string | null } {
  if (registered) {
    globalShortcut.unregister(registered);
    registered = null;
  }

  if (!settingsStore.get("hotkeyEnabled")) return { ok: true, accelerator: null };

  const accelerator = settingsStore.get("hotkey");
  if (!accelerator) return { ok: true, accelerator: null };

  try {
    const ok = globalShortcut.register(accelerator, toggleMainWindow);
    if (ok) registered = accelerator;
    return { ok, accelerator };
  } catch {
    // An unparseable accelerator throws rather than returning false.
    return { ok: false, accelerator };
  }
}

export function releaseHotkeys(): void {
  globalShortcut.unregisterAll();
  registered = null;
}
