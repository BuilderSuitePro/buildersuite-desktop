import { Menu, Tray, app, nativeImage } from "electron";
import { TARGET } from "../targets";
import { resourcePath } from "./resources";
import { settingsStore } from "./store";
import { applyLoginItem } from "./login-item";
import { applyHotkey } from "./shortcuts";
import { openSettingsWindow } from "./settings-window";
import { getMainWindow, showMainWindow, toggleMainWindow } from "./window";

let tray: Tray | null = null;

/**
 * macOS wants a flat black template image so the menu bar can invert it for
 * light and dark. Windows wants the full-colour mark; the black silhouette
 * there looks like a rendering fault.
 */
function trayImage(): Electron.NativeImage {
  const file = process.platform === "darwin" ? "trayTemplate.png" : "tray-win.png";
  const image = nativeImage.createFromPath(resourcePath("tray", file));
  if (process.platform === "darwin") image.setTemplateImage(true);
  return image;
}

export function buildTrayMenu(): void {
  if (!tray) return;

  const menu = Menu.buildFromTemplate([
    {
      label: `Open ${TARGET.productName}`,
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: settingsStore.get("launchAtLogin"),
      click: (item) => {
        settingsStore.set("launchAtLogin", item.checked);
        applyLoginItem();
      },
    },
    {
      label: "Settings…",
      click: () => openSettingsWindow(getMainWindow()),
    },
    { type: "separator" },
    {
      label: `Quit ${TARGET.productName}`,
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(menu);
}

export function createTray(): void {
  tray = new Tray(trayImage());
  tray.setToolTip(TARGET.productName);
  tray.on("click", () => toggleMainWindow());
  buildTrayMenu();
}

/** Keeps the tray checkbox honest after a change made in the settings window. */
export function syncLoginItemFromSettings(): void {
  applyLoginItem();
  applyHotkey();
  buildTrayMenu();
}
