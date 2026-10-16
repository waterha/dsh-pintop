# dsh-pintop

[简体中文](README.md) | **English**

A standalone plugin that keeps the entire DeepSeek Harness window on top on Windows. The button appears at the bottom of the left sidebar. The expanded sidebar shows “窗口置顶 / 取消置顶” (Pin window / Unpin window); the collapsed sidebar shows a pin icon with an accessible label.

## Features

- Keep the entire Harness window above other windows; click again to unpin it.
- Click repeatedly without waiting for a request to finish. Rapid clicks converge on the latest selection, and older responses cannot overwrite newer intent.
- Read the actual Windows `WS_EX_TOPMOST` flag. Failed changes show an error and restore the last confirmed state in the UI.
- Reuse a persistent PowerShell worker instead of starting a process and compiling native interop on every click.
- Hover does not start background queries or display a native `title` tooltip. Focus-triggered state queries are throttled.
- No localStorage. Existing window position, size, and focus are preserved.

## Requirements

- Windows.
- DeepSeek Harness **0.2.0-rc.2 or newer**.
- PowerShell 7, with `pwsh.exe` available on the host process's `PATH`.

The plugin has no third-party runtime dependencies and requires no build step.

## Installation

Clone this repository:

```powershell
git clone https://github.com/waterha/dsh-pintop.git
```

Use the running Harness application's **Plugins manager** to install the local package. Replace the example with your actual clone path:

```text
file:C:/path/to/dsh-pintop
```

The package includes a `cordis.patch.yml` bundle. The official plugin manager installs both host and client components. Application-owned desktop profiles should use the in-app plugin manager.

For an externally managed CLI profile, use the official CLI:

```text
dsh plugin --profile <profile> add file:C:/path/to/dsh-pintop
```

### Configure the Harness executable path

The current default executable path is:

```text
C:\Sofware\dsh\DeepSeek Harness.exe
```

If Harness is installed elsewhere, set the host configuration `executablePath` or the `DSH_PINTOP_EXECUTABLE` environment variable to the full executable path. For example, set it before launching Harness:

```powershell
$env:DSH_PINTOP_EXECUTABLE = 'D:\Apps\DeepSeek Harness\DeepSeek Harness.exe'
```

Configuration is host-owned. Browser requests cannot change the path or supply process IDs or window handles.

### Upgrades and performance

After upgrading from 0.1.0, **fully quit and reopen Harness**. The running host can retain the old plugin module even after reinstalling it; refreshing the page alone does not update the backend.

The first request starts PowerShell and compiles Win32 interop. Subsequent toggles reuse the same worker. A real-window benchmark on the development machine measured a 3.5-second cold start and 9–34 ms for 10 warm toggles, averaging about 14 ms. Actual timings depend on the machine.

Pinning lasts for the current native window's lifetime. Remembering state across exits and automatically pinning on launch are not implemented.

## Native control and API

Native interop uses `Add-Type`, user32 `SetWindowPos`, and `GetWindowLongPtr/GetWindowLong`, with 32/64-bit compatibility. The plugin discovers processes by configured executable name, verifies the full executable path, and accepts only visible, unowned main windows. Cached targets are validated again before use. If multiple matching main windows exist, each is changed. Mixed read states produce an explicit error.

| Request | Purpose |
| --- | --- |
| `GET /api/dsh-pintop` | Read actual topmost state |
| `POST /api/dsh-pintop` | Set state with `{"enabled": true}` or `{"enabled": false}` |

Example successful response:

```json
{"enabled": true, "windowCount": 1}
```

The API requires a loopback connection and loopback Host, rejects cross-site web origins, and allows the exact desktop origin `dsh-app://app`. It does not enable CORS or trust forwarded addresses. Native operations run serially using size-limited JSON messages, a bounded queue, and a timeout. The worker stops when the plugin unloads. Failures return non-success HTTP status codes.

## Validation

```powershell
node --test test/*.test.mjs
node test/native.mjs
```

Unit tests cover the manifest, native payload, client loader and sidebar registration, invalid parameters, request origin checks, rapid clicks, stale responses, error rollback, and focus-query throttling.

The native test requires an open, visible Harness main window. It reads the initial state, verifies enabling and disabling, and restores the initial state in a `finally` block. It temporarily changes the real window's topmost state.

Measure native worker cold-start and warm-toggle latency:

```powershell
node test/latency.mjs --native
```

## License

[MIT](LICENSE)
