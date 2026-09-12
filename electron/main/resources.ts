import { join } from "node:path";
import { app } from "electron";

/**
 * Runtime assets (tray icons, Windows overlay digits) are copied in by
 * electron-builder's extraResources. In development they are read straight from
 * the repo instead.
 */
export function resourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? process.resourcesPath
    : join(__dirname, "../../build");
  return join(base, ...segments);
}
