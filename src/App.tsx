import { useCallback, useEffect, useState } from "react";

type SettingsPayload = {
  launchAtLogin: boolean;
  hotkeyEnabled: boolean;
  hotkey: string;
  productName: string;
  version: string;
  platform: string;
  supportsHotkey: boolean;
  hotkeyRegistered?: boolean;
};

declare global {
  interface Window {
    bspDesktop: {
      getSettings: () => Promise<SettingsPayload>;
      setSettings: (patch: Partial<SettingsPayload>) => Promise<SettingsPayload>;
    };
  }
}

/** Turns a keydown into an Electron accelerator string. */
function toAccelerator(event: React.KeyboardEvent<HTMLInputElement>): string | null {
  const key = event.key;
  if (["Control", "Meta", "Alt", "Shift", "Dead"].includes(key)) return null;

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null;

  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

export function App() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [hotkeyFailed, setHotkeyFailed] = useState(false);

  useEffect(() => {
    void window.bspDesktop.getSettings().then(setSettings);
  }, []);

  const patch = useCallback(async (next: Partial<SettingsPayload>) => {
    const result = await window.bspDesktop.setSettings(next);
    setSettings(result);
    setHotkeyFailed(result.hotkeyEnabled && result.hotkeyRegistered === false);
  }, []);

  if (!settings) return <div className="page" />;

  return (
    <div className="page">
      <h1>{settings.productName}</h1>
      <div className="version">Version {settings.version}</div>

      <div className="row">
        <div>
          <div className="row-label">Launch at login</div>
          <div className="row-help">
            Starts minimised to the tray when you sign in to this computer.
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.launchAtLogin}
          onChange={(event) => void patch({ launchAtLogin: event.target.checked })}
        />
      </div>

      {settings.supportsHotkey && (
        <>
          <div className="row">
            <div>
              <div className="row-label">Global shortcut</div>
              <div className="row-help">
                Shows and hides the window from anywhere.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.hotkeyEnabled}
              onChange={(event) => void patch({ hotkeyEnabled: event.target.checked })}
            />
          </div>

          <div className="row">
            <div>
              <div className="row-label">Shortcut</div>
              <div className="row-help">
                Click the box and press the combination you want.
              </div>
              {hotkeyFailed && (
                <div className="warn">
                  Another app already owns that combination. Pick a different one.
                </div>
              )}
            </div>
            <input
              type="text"
              readOnly
              value={settings.hotkey}
              disabled={!settings.hotkeyEnabled}
              onKeyDown={(event) => {
                event.preventDefault();
                const accelerator = toAccelerator(event);
                if (accelerator) void patch({ hotkey: accelerator });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
