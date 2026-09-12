export type TargetId = "suite" | "teams";

export type Target = {
  id: TargetId;
  productName: string;
  appId: string;
  url: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  /** Mac chrome: hiddenInset for the narrow chat column, standard bar for the full suite. */
  hiddenInsetTitleBar: boolean;
  /** Windows close button: hide to tray (background utility) or quit (normal desktop app). */
  closeHidesToTrayOnWindows: boolean;
  /** Default global hotkey. Only one app can own an accelerator; the second to launch fails to bind. */
  defaultHotkey: string;
  /** Whether the hotkey is on out of the box. */
  hotkeyEnabledByDefault: boolean;
  /** Warn once on first real quit that notifications stop. Only meaningful for tray-resident apps. */
  warnOnQuitAboutNotifications: boolean;
};

export const TARGETS: Record<TargetId, Target> = {
  suite: {
    id: "suite",
    productName: "BuilderSuite Pro",
    appId: "com.kingdomtexas.buildersuitepro",
    url: "https://buildersuitepro.com/",
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    hiddenInsetTitleBar: false,
    closeHidesToTrayOnWindows: false,
    defaultHotkey: "CommandOrControl+Shift+B",
    hotkeyEnabledByDefault: false,
    warnOnQuitAboutNotifications: false,
  },
  teams: {
    id: "teams",
    productName: "BuilderTeams",
    appId: "com.kingdomtexas.builderteams",
    url: "https://buildersuitepro.com/messages/popout",
    width: 420,
    height: 760,
    minWidth: 360,
    minHeight: 480,
    hiddenInsetTitleBar: true,
    closeHidesToTrayOnWindows: true,
    defaultHotkey: "CommandOrControl+Shift+T",
    hotkeyEnabledByDefault: true,
    warnOnQuitAboutNotifications: true,
  },
};

function resolveTargetId(): TargetId {
  // Vite replaces this expression with a string literal at build time. A packaged
  // app has no BSP_TARGET in its environment, so it must not be read at runtime.
  const id = process.env.BSP_TARGET;
  return id === "teams" ? "teams" : "suite";
}

export const TARGET: Target = TARGETS[resolveTargetId()];
