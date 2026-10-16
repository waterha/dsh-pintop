# dsh-pintop

Standalone, dependency-free Windows plugin for DeepSeek Harness 0.2.0-rc.2 or newer. Adds a pin button to the left sidebar footer. The collapsed sidebar uses an icon with an accessible label; expanded mode shows 窗口置顶 / 取消置顶. State is read from the native WS_EX_TOPMOST bit on mount and throttled window focus. After the initial read, the button stays clickable while a request runs: rapid clicks update the desired state immediately and coalesce into the latest request. Older replies cannot overwrite newer intent. Failures are shown and roll back to the last confirmed state. No localStorage is used. Hover does not trigger native work or system title tooltips.

## Install

Use the running application's official Plugins manager and install the local package spec:

```
file:C:/Sofware/122/dsh-pintop
```

The package includes a `cordis.patch.yml` bundle; the official plugin manager installs both the host and client. Reload/restart only as requested by the manager. This source directory does not modify the desktop profile or packaged application.

For an externally managed CLI profile, the equivalent official CLI command is:

```
dsh plugin --profile <profile> add file:C:/Sofware/122/dsh-pintop
```

The application-owned desktop profile must use the application's plugin manager, not the external CLI writer.

After upgrading from 0.1.0, fully quit and reopen Harness: the running host can retain the old plugin module even after reinstalling it. A page refresh alone does not replace that host module. The first native worker request pays the PowerShell/compiler startup cost; subsequent toggles reuse the worker. On the development machine, a real-window benchmark measured a 3.5-second cold start and 9–34 ms warm toggles (mean 14 ms); timings vary by machine.

## Native target and API

Default executable: `C:\Sofware\dsh\DeepSeek Harness.exe`. Host configuration `executablePath` or environment variable `DSH_PINTOP_EXECUTABLE` can override it with the full installed DeepSeek Harness executable path. Configuration is host-owned; browser requests cannot change it or provide process IDs/window handles. The native helper discovers processes by configured executable name, checks the exact executable path, and only accepts visible, unowned main windows. It rechecks the process identity and handle before and after modifying the window. If multiple main windows exist, it changes each; mixed read states fail explicitly.

`GET /api/dsh-pintop` reads actual state. `POST /api/dsh-pintop` accepts only JSON `{ "enabled": true }` or `{ "enabled": false }`. Success is `{ "enabled": boolean, "windowCount": number }`, verified from the native bit. The API requires a loopback socket and loopback Host, rejects cross-site web origins, and permits the exact local desktop origin `dsh-app://app`. It does not enable CORS or trust forwarded addresses. Operations run serially through a lifecycle-managed persistent PowerShell worker. Win32 interop is compiled once per worker rather than on every click. Validated window targets are cached and checked again before use. The worker accepts only bounded JSON messages (not shell commands), has a bounded request queue and timeout, and is stopped when the plugin unloads. Errors return non-success HTTP status.

Requires Windows and PowerShell 7 (`pwsh.exe` on the host PATH). Interop uses Add-Type, user32 SetWindowPos and GetWindowLongPtr/GetWindowLong with 32/64-bit compatibility. Existing position, size and focus are preserved. Pinning lasts for the current native window lifetime; no auto-repin or launch persistence is implemented.

## Validate

```
node --test test/*.test.mjs
node test/native.mjs
```

The native test reads the initial bit, enables and verifies it, disables and verifies it, and restores the initial state in a finally block. It requires an existing visible main window at the configured path. It temporarily changes the real desktop window. Package tests verify the manifest, native payload, browser loader/footer registration, invalid native parameters and request trust fence. No build or dependency installation is required.
