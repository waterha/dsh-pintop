param(
    [Parameter(Mandatory=$true)][string]$ExecutablePath,
    [ValidateSet('get','set')][string]$Action,
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
    $script:targets = @{}
    function Test-Target($target) {
        try {
            $target.Refresh()
            $handle = $target.MainWindowHandle
            [uint32]$ownerPid = 0
            [void][DshPinTopNative]::GetWindowThreadProcessId($handle, [ref]$ownerPid)
            return $handle -ne [IntPtr]::Zero -and [DshPinTopNative]::IsWindow($handle) -and [DshPinTopNative]::IsWindowVisible($handle) -and [DshPinTopNative]::GetWindow($handle, 4) -eq [IntPtr]::Zero -and $ownerPid -eq $target.Id -and [string]::Equals($target.Path, $expected, [StringComparison]::OrdinalIgnoreCase)
        } catch { return $false }
    }
    function Find-Targets {
        $found = @{}
        $name = [System.IO.Path]::GetFileNameWithoutExtension($expected)
        foreach ($target in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
            if (Test-Target $target) { $found[[string]$target.Id] = $target }
        }
        if ($found.Count -eq 0) { throw 'No visible DeepSeek Harness main window found for configured executable.' }
        $script:targets = $found
    }
    function Get-Targets {
        $valid = @($script:targets.Values | Where-Object { Test-Target $_ })
        if ($valid.Count -eq 0 -or $valid.Count -ne $script:targets.Count) { Find-Targets; $valid = @($script:targets.Values) }
        return $valid
    }
    function Invoke-Request($request) {
        if ($null -eq $request -or $request.PSObject.Properties.Name -notcontains 'action' -or @($request.PSObject.Properties.Name | Where-Object { $_ -notin @('action','enabled') }).Count -gt 0 -or $request.action -notin @('get','set')) { throw 'Invalid native request.' }
        if ($request.action -eq 'set' -and $request.enabled -isnot [bool]) { throw 'Invalid enabled value.' }
        $targets = @(Get-Targets)
        foreach ($target in $targets) {
            $handle = $target.MainWindowHandle
            if ($request.action -eq 'set') {
                $after = if ($request.enabled) { [IntPtr](-1) } else { [IntPtr](-2) }
                # NOMOVE | NOSIZE | NOACTIVATE | NOOWNERZORDER | ASYNCWINDOWPOS.
                if (-not [DshPinTopNative]::SetWindowPos($handle, $after, 0, 0, 0, 0, 0x4213)) { throw "SetWindowPos failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
            }
        }
        $actual = $null
        for ($poll = 0; $poll -lt 5; $poll++) {
            $states = @()
            foreach ($target in @(Get-Targets)) { $states += (([DshPinTopNative]::ExtendedStyle($target.MainWindowHandle) -band 8) -ne 0) }
            if (@($states | Select-Object -Unique).Count -eq 1) { $actual = [bool]$states[0]; if ($request.action -eq 'get' -or $request.enabled -eq $actual) { break } }
            Start-Sleep -Milliseconds 25
        }
        if ($null -eq $actual) { throw 'Visible main windows have mixed topmost state; cannot report one boolean.' }
        if ($request.action -eq 'set' -and $actual -ne $request.enabled) { throw 'Windows topmost bit did not match requested state.' }
        @{ ok = $true; enabled = $actual; windowCount = @($targets).Count } | ConvertTo-Json -Compress
    }
    if ($Action) {
        $legacy = [pscustomobject]@{ action = $Action; enabled = ($Enabled -eq 'true') }
        Invoke-Request $legacy
        exit 0
    }
    while ($null -ne ($line = [Console]::In.ReadLine())) {
        try {
            if ([string]::IsNullOrWhiteSpace($line) -or $line.Length -gt 4096) { throw 'Invalid native request.' }
            $request = $line | ConvertFrom-Json
            Invoke-Request $request
        } catch { @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }
        [Console]::Out.Flush()
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
