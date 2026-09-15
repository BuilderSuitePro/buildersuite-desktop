import { type WebContents } from "electron";

/**
 * Makes clicking a notification banner bring the window back.
 *
 * The web app's notification handler calls window.focus(). In a browser that is
 * enough. In Electron it is not: focus() acts on a window that is already on
 * screen, so when the window is hidden to the tray or minimised — the exact
 * situation in which someone is relying on notifications — it returns without
 * the window ever appearing. showMainWindow() does the restore() + show() +
 * focus() that is actually required, but nothing in the page could reach it.
 *
 * The web app is not going to be changed for the sake of the desktop shell, so
 * the shell adapts to it instead and wraps window.focus so the existing call
 * surfaces the window first and then behaves as before.
 *
 * The preload cannot do the wrapping itself. With contextIsolation on it runs
 * in a separate world, and the window object it can see is not the page's; all
 * it can do is hand a function across with contextBridge. Something running in
 * the page's own world has to pick that function up, which is what this
 * injected script is for — executeJavaScript evaluates in the main world.
 * contextIsolation and nodeIntegration are untouched.
 */
const SHIM = `(() => {
  if (window.__bspFocusPatched) return;
  const show = window.__BSP_DESKTOP_SHOW__;
  if (typeof show !== "function") return;
  const original = window.focus.bind(window);
  window.focus = function () {
    show();
    return original();
  };
  window.__bspFocusPatched = true;
})();`;

export function applyFocusBridge(contents: WebContents): void {
  // Re-applied on every completed load. A real navigation — the sign-in
  // redirect chain, or any in-window link the navigation policy allows —
  // discards the page's JS context and the wrapper with it, and the fix would
  // silently stop working the first time someone clicked through. Client-side
  // route changes keep the same context and so keep the wrapper; the guard flag
  // makes a repeated injection a no-op either way.
  contents.on("did-finish-load", () => {
    void contents.executeJavaScript(SHIM, true);
  });
}
