import { shell, type WebContents } from "electron";

// The app content lives on buildersuitepro.com. Sign-in is an OIDC redirect
// chain: the site hands off to the Hercules Auth portal (auth.buildersuitepro.com
// today, or a tenant subdomain of hercules-auth.com, which is not knowable in
// advance), and the portal hands off to the identity provider the user picked.
// Every hop has to stay in-window, or sign-in completes in the system browser
// and the app window is left signed out.
//
// A leading dot means "subdomains only"; everything else is an exact host.
const ALLOWED_HOSTS = [
  "buildersuitepro.com",
  ".buildersuitepro.com",
  ".hercules-auth.com",
  "accounts.google.com",
  "accounts.youtube.com",
  "login.microsoftonline.com",
  "login.live.com",
  "appleid.apple.com",
  "www.facebook.com",
  "www.linkedin.com",
];

export function isInternalUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((entry) =>
    entry.startsWith(".") ? host.endsWith(entry) : host === entry,
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
