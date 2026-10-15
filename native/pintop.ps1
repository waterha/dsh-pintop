param(
    [Parameter(Mandatory=$true)][string]$ExecutablePath,
    [ValidateSet('get','set')][string]$Action = 'get',
    [ValidateSet('true','false')][string]$Enabled = 'false'
)
$ErrorActionPreference = 'Stop'
try {
    if (-not [System.IO.Path]::IsPathFullyQualified($ExecutablePath)) { throw 'ExecutablePath must be absolute.' }
    $expected = [System.IO.Path]::GetFullPath($ExecutablePath)
    if (-not (Test-Path -LiteralPath $expected -PathType Leaf)) { throw 'Configured DeepSeek Harness executable does not exist.' }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DshPinTopNative {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint command);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint="GetWindowLongW")] private static extern int GetWindowLong32(IntPtr hWnd, int index);
    public static long ExtendedStyle(IntPtr hWnd) { return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, -20).ToInt64() : GetWindowLong32(hWnd, -20); }
    [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
}
'@
    function Assert-Target($target) {
        $target.Refresh()
        if (-not [string]::Equals($target.Path, $expected, [StringComparison]::OrdinalIgnoreCase)) { throw 'Target executable changed.' }
        $handle = $target.MainWindowHandle
        [uint32]$ownerPid = 0
        [void][DshPinTopNative]::GetWindowThreadProcessId($handle, [ref]$ownerPid)
        if ($handle -eq [IntPtr]::Zero -or -not [DshPinTopNative]::IsWindow($handle) -or -not [DshPinTopNative]::IsWindowVisible($handle) -or [DshPinTopNative]::GetWindow($handle, 4) -ne [IntPtr]::Zero -or $ownerPid -ne $target.Id) { throw 'Target is no longer a visible main window.' }
        return $handle
    }
    $targets = @(Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($expected)) -ErrorAction SilentlyContinue | Where-Object {
        try { $_.MainWindowHandle -ne [IntPtr]::Zero -and [string]::Equals($_.Path, $expected, [StringComparison]::OrdinalIgnoreCase) -and [DshPinTopNative]::IsWindowVisible($_.MainWindowHandle) -and [DshPinTopNative]::GetWindow($_.MainWindowHandle, 4) -eq [IntPtr]::Zero } catch { $false }
    })
    if ($targets.Count -eq 0) { throw 'No visible DeepSeek Harness main window found for configured executable.' }
    $states = @()
    foreach ($target in $targets) {
        $handle = Assert-Target $target
        if ($Action -eq 'set') {
            $after = if ($Enabled -eq 'true') { [IntPtr](-1) } else { [IntPtr](-2) }
            # NOMOVE | NOSIZE | NOACTIVATE | NOOWNERZORDER. Do not focus or reposition.
            if (-not [DshPinTopNative]::SetWindowPos($handle, $after, 0, 0, 0, 0, 0x213)) { throw "SetWindowPos failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
        }
        $handle = Assert-Target $target
        $actual = ([DshPinTopNative]::ExtendedStyle($handle) -band 8) -ne 0
        if ($Action -eq 'set' -and $actual -ne ($Enabled -eq 'true')) { throw 'Windows topmost bit did not match requested state.' }
        $states += [bool]$actual
    }
    $mixed = @($states | Select-Object -Unique).Count -gt 1
    if ($mixed) { throw 'Visible main windows have mixed topmost state; cannot report one boolean.' }
    @{ enabled = [bool]$states[0]; windowCount = $targets.Count } | ConvertTo-Json -Compress
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
