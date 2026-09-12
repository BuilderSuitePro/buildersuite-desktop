import { app, dialog } from "electron";
import electronUpdater from "electron-updater";
import { TARGET } from "../targets";

// Deliberately not destructured at module scope: electron-updater builds its
// platform updater the moment `autoUpdater` is touched, which would run before
// the app is ready.
const FOUR_HOURS = 4 * 60 * 60 * 1000;

let promptOpen = false;

export function initAutoUpdater(): void {
  // Nothing to update in a dev run, and electron-updater throws without a
  // packaged app-update.yml.
  if (!app.isPackaged) return;

  const { autoUpdater } = electronUpdater;

  // Both apps publish into one GitHub repo, so each needs its own channel.
  // Sharing a channel would let one app install the other's build, which is the
  // worst failure available here.
  autoUpdater.channel = TARGET.id;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.error("[updater]", error);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (promptOpen) return;
    promptOpen = true;

    // Never restart underneath someone mid-conversation.
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `${TARGET.productName} ${info.version} is ready to install.`,
      detail: "The update installs when you restart. Your place is not lost if you choose Later.",
    });

    promptOpen = false;
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[updater] check failed", error);
    });
  };

  check();
  setInterval(check, FOUR_HOURS);
}
