import { join } from "node:path";
import { app } from "electron";
import { TARGET } from "../targets";

/**
 * Runtime assets (tray icons, Windows overlay digits) are copied in by
 * electron-builder's extraResources, which flattens each target's tray folder
 * to resources/tray. In development they are read straight from the repo, where
 * tray art still lives under its per-target directory.
 */
export function resourcePath(...segments: string[]): string {
  if (app.isPackaged) return join(process.resourcesPath, ...segments);

  const repoBuild = join(__dirname, "../../build");
  const [first, ...rest] = segments;
  if (first === "tray") return join(repoBuild, TARGET.id, "tray", ...rest);
  return join(repoBuild, ...segments);
}
