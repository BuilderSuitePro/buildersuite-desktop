import { contextBridge, ipcRenderer } from "electron";
import { TARGET_ID } from "../targets";

// Lets the web app tell it is running inside the desktop shell, so it can hide
// install prompts and push-notification settings that are dead ends here.
// It falls back to sniffing the user agent, but this flag is the reliable signal.
contextBridge.exposeInMainWorld("__BSP_DESKTOP__", true);

// Which of the two products this window is: "suite" or "teams". The web app
// compares it with ===, and switches to the chat-only UI on "teams", so it has
// to come from the same build-time target the main process uses and never from
// a query string, which is dropped on the first internal navigation.
contextBridge.exposeInMainWorld("__BSP_TARGET__", TARGET_ID);

/**
 * Unread count channel.
 *
 * macOS gets its dock badge from navigator.setAppBadge() on its own. Windows
 * cannot: Electron's badge APIs are Linux/macOS only, so the count has to reach
 * the main process explicitly for the taskbar overlay to be drawn.
 *
 * The web app should call this alongside its existing setAppBadge call.
 */
contextBridge.exposeInMainWorld("__BSP_DESKTOP_BADGE__", (count: unknown) => {
  const value = typeof count === "number" ? count : Number(count);
  ipcRenderer.send("bsp:badge-count", Number.isFinite(value) ? value : 0);
});

// Used only by this project's own settings window.
contextBridge.exposeInMainWorld("bspDesktop", {
  getSettings: () => ipcRenderer.invoke("bsp:get-settings"),
  setSettings: (patch: unknown) => ipcRenderer.invoke("bsp:set-settings", patch),
  openSettings: () => ipcRenderer.send("bsp:open-settings"),
});
