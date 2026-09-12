import { join } from "node:path";
import { BrowserWindow } from "electron";
import { TARGET } from "../targets";

let settingsWindow: BrowserWindow | null = null;

/**
 * The one piece of UI this project owns beyond the frame and tray. Everything
 * else the user sees is the web app.
 */
export function openSettingsWindow(parent?: BrowserWindow | null): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 460,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: `${TARGET.productName} Settings`,
    backgroundColor: "#1a1d21",
    show: false,
    autoHideMenuBar: true,
    parent: parent ?? undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow = win;
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    settingsWindow = null;
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
