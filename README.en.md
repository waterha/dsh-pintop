# dsh-pintop

[简体中文](README.md) | **English**

A standalone plugin that keeps the entire DeepSeek Harness window on top on Windows. The button appears at the bottom of the left sidebar. The expanded sidebar shows “窗口置顶 / 取消置顶” (Pin window / Unpin window); the collapsed sidebar shows a pin icon with an accessible label.

## Requirements

- Windows.
- PowerShell 7, available as `pwsh.exe` on `PATH`.
- By default, the plugin uses the executable path of the running Harness host process, so it does not depend on a fixed installation directory. No plugin change is needed after moving or reinstalling Harness.

If the host cannot expose the correct `DeepSeek Harness.exe` path through `process.execPath`, set `executablePath` in the plugin configuration or use the `DSH_PINTOP_EXECUTABLE` environment variable. The value must be the absolute path to an existing `DeepSeek Harness.exe` file.

## Installation

### Method 1: Ask Harness to install it

Enter the following in a DeepSeek Harness conversation:

> Please help me install this plugin: https://github.com/waterha/dsh-pintop.git

Wait for installation to finish, then restart Harness to use the plugin.

### Method 2: Clone and install locally

```powershell
git clone https://github.com/waterha/dsh-pintop.git
```

Use the running Harness application's **Plugins manager** to install the local package. Replace the example with your actual clone path:

```text
file:C:/path/to/dsh-pintop
```

## License

[MIT](LICENSE)
