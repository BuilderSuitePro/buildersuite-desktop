import { join } from "node:path";
import { BrowserWindow, screen, shell } from "electron";
import { TARGET } from "../targets";
import { windowStore } from "./store";
import { applyFocusBridge } from "./focus-bridge";
import { applyNavigationPolicy } from "./navigation";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * A saved position can point at a monitor that is no longer attached, which
 * would open the window off-screen with no way to reach it.
 */
function isOnSomeDisplay(x: number, y: number, width: number, height: number) {
  return screen.getAllDisplays().some(({ workArea }) => {
    return (
      x + width > workArea.x &&
      y + height > workArea.y &&
      x < workArea.x + workArea.width &&
      y < workArea.y + workArea.height
    );
  });
}

function restoredBounds() {
  const width = Math.max(windowStore.get("width"), TARGET.minWidth);
  const height = Math.max(windowStore.get("height"), TARGET.minHeight);
  const x = windowStore.get("x");
  const y = windowStore.get("y");

  if (x === undefined || y === undefined || !isOnSomeDisplay(x, y, width, height)) {
    return { width, height };
  }
  return { x, y, width, height };
}

function persistBounds(win: BrowserWindow) {
  if (win.isMinimized()) return;
  const maximized = win.isMaximized();
  windowStore.set("maximized", maximized);
  if (maximized) return;

  const { x, y, width, height } = win.getNormalBounds();
  windowStore.set({ x, y, width, height });
}

export function createMainWindow(startHidden = false): BrowserWindow {
  const win = new BrowserWindow({
    ...restoredBounds(),
    minWidth: TARGET.minWidth,
    minHeight: TARGET.minHeight,
    title: TARGET.productName,
    // Without this the window flashes white on every launch before the dark
    // chat paints, which reads as broken.
    backgroundColor: "#1a1d21",
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "darwin" && TARGET.hiddenInsetTitleBar
      ? { titleBarStyle: "hiddenInset" as const }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // Loading a remote URL with Node integration enabled would be a serious
      // security hole.
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium throttles timers and rendering in a window that is hidden or
      // minimised. That is the state this app spends most of its life in, and
      // it is precisely when the page has to keep its connection alive and
      // raise notifications promptly, so the throttling is turned off.
      backgroundThrottling: false,
      // Default persistent session on purpose: the OIDC session cookie has to
      // survive a restart. A custom or in-memory partition signs the user out
      // on every launch.
      spellcheck: true,
    },
  });

  mainWindow = win;

  if (windowStore.get("maximized")) win.maximize();

  // Started at login: stay in the tray rather than popping up over whatever the
  // user is doing while they log in.
  win.once("ready-to-show", () => {
    if (!startHidden) win.show();
  });

  // The remote page sets its own <title>, which is a long marketing string.
  // Keep the OS-facing window and taskbar label as the product name.
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle(TARGET.productName);
  });

  win.on("resize", () => persistBounds(win));
  win.on("move", () => persistBounds(win));
  win.on("close", () => persistBounds(win));
  win.on("closed", () => {
    mainWindow = null;
  });

  applyNavigationPolicy(win.webContents);
  applyFocusBridge(win.webContents);

  void win.loadURL(TARGET.url);

  return win;
}

export function toggleMainWindow(): void {
  const win = mainWindow;
  if (!win) return;

  if (win.isVisible() && !win.isMinimized() && win.isFocused()) {
    win.hide();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export function showMainWindow(): void {
  const win = mainWindow;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export function openExternalHomepage(): void {
  void shell.openExternal(TARGET.url);
}
