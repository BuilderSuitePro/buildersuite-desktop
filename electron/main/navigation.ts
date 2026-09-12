import { shell, type WebContents } from "electron";

// The app content lives on buildersuitepro.com. Sign-in is an OIDC redirect to a
// tenant-specific subdomain of hercules-auth.com, so it must be allowed to load
// in-window or authentication breaks. The tenant id is not hardcoded.
const ALLOWED_SUFFIXES = ["buildersuitepro.com", "hercules-auth.com"];

export function isInternalUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  return ALLOWED_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * Anything that is not ours opens in the user's real browser. Without this, a
 * link in a message would replace the chat window with a third-party page.
 */
export function applyNavigationPolicy(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
}
