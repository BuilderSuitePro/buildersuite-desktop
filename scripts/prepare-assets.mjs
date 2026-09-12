// Turns the downloaded brand art in build/_src into the exact sizes and formats
// electron-builder and the tray need. Re-runnable; safe to run on every build.
//
// electron-builder generates the Windows .ico and Mac .icns itself from a single
// 1024x1024 icon.png in each target's buildResources directory, so those are
// never produced by hand here.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "build", "_src");
const build = join(root, "build");
const tmp = join(build, "_tmp");

const ensure = (p) => mkdirSync(p, { recursive: true });

async function appIcon(target, file) {
  const out = join(build, target);
  ensure(out);
  await sharp(join(src, file))
    .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(out, "icon.png"));
}

async function trayIcons(target, trayFile, iconFile) {
  const out = join(build, target, "tray");
  ensure(out);

  // macOS: flat black on transparent. The Template suffix is required — it tells
  // macOS to invert the image for light and dark menu bars.
  await sharp(join(src, trayFile)).resize(22, 22).png().toFile(join(out, "trayTemplate.png"));
  await sharp(join(src, trayFile)).resize(44, 44).png().toFile(join(out, "trayTemplate@2x.png"));

  // Windows: full colour. The flat black silhouette looks like a bug there.
  await sharp(join(src, iconFile)).resize(32, 32).png().toFile(join(out, "tray-win.png"));
}

async function installerSidebar() {
  ensure(tmp);
  const png = join(tmp, "installerSidebar.png");

  // NSIS demands exactly 164x314. Cover-and-crop rather than squash, since the
  // source aspect ratio does not match.
  await sharp(join(src, "installer-sidebar.png"))
    .resize(164, 314, { fit: "cover", position: "centre" })
    .flatten({ background: "#1a1d21" })
    .png()
    .toFile(png);

  // sharp cannot write BMP; sips can, and ships with macOS.
  execFileSync("sips", ["-s", "format", "bmp", png, "--out", join(build, "installerSidebar.bmp")], {
    stdio: "ignore",
  });
}

async function dmgBackground() {
  await sharp(join(src, "dmg-background.png"))
    .resize(540, 380, { fit: "cover", position: "centre" })
    .png()
    .toFile(join(build, "dmg-background.png"));

  await sharp(join(src, "dmg-background.png"))
    .resize(1080, 760, { fit: "cover", position: "centre" })
    .png()
    .toFile(join(build, "dmg-background@2x.png"));
}

async function wordmarks() {
  // Light-text wordmark is the default; the dark-text original is invisible on
  // the dark chrome used everywhere here.
  await sharp(join(src, "wordmark-light.png")).png().toFile(join(build, "wordmark-light.png"));
  await sharp(join(src, "wordmark-dark.png")).png().toFile(join(build, "wordmark-dark.png"));
}

await appIcon("suite", "suite-icon.png");
await appIcon("teams", "teams-icon.png");
await trayIcons("suite", "suite-tray.png", "suite-icon.png");
await trayIcons("teams", "teams-tray.png", "teams-icon.png");
await installerSidebar();
await dmgBackground();
await wordmarks();

rmSync(tmp, { recursive: true, force: true });
console.log("assets prepared");
