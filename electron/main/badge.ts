import { app, nativeImage, type BrowserWindow } from "electron";
import { resourcePath } from "./resources";

/**
 * Unread count mirroring.
 *
 * The web app publishes the count with navigator.setAppBadge(). On macOS
 * Electron maps that straight to the dock badge, so nothing is needed here.
 *
 * Windows is the gap: Electron's badge APIs (app.setBadgeCount / app.badgeCount)
 * are Linux and macOS only, so on Windows the main process is never told the
 * number and setOverlayIcon has nothing to draw. The web app therefore also
 * calls window.__BSP_DESKTOP_BADGE__(count), which arrives here over IPC.
 *
 * If the web app never calls it, Windows simply shows no numeric overlay.
 * Nothing errors and nothing is logged.
 */

const overlayCache = new Map<string, Electron.NativeImage>();

function overlayImage(count: number): Electron.NativeImage | null {
  const key = count > 9 ? "9plus" : String(count);
  const cached = overlayCache.get(key);
  if (cached) return cached;

  const image = nativeImage.createFromPath(
    resourcePath("overlays", `badge-${key}.png`),
  );
  if (image.isEmpty()) return null;

  overlayCache.set(key, image);
  return image;
}

export function applyBadgeCount(
  count: number,
  win: BrowserWindow | null,
): void {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  if (process.platform === "darwin" || process.platform === "linux") {
    app.setBadgeCount(safe);
    return;
  }

  if (process.platform !== "win32" || !win || win.isDestroyed()) return;

  if (safe === 0) {
    win.setOverlayIcon(null, "");
    return;
  }

  const image = overlayImage(safe);
  if (!image) return;

  const label = safe > 9 ? "9+ unread" : `${safe} unread`;
  win.setOverlayIcon(image, label);
}
