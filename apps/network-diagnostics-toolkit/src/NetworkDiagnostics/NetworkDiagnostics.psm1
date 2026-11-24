#Requires -Version 5.1
<#
    Root module for the Network Diagnostics Toolkit.

    Load order:
      1. Private helpers (validation, result objects, OS wrappers, output, menu helpers)
      2. Public functions (one file per exported command)

    Only the functions listed in FunctionsToExport in the manifest are visible to users.
    Every check in this module is read-only: nothing here changes adapters, DNS settings,
    routes, firewall rules or any other system setting.
#>

# Catch references to variables that were never assigned (typos) without being
# strict about missing object properties, which vary between Windows builds.
Set-StrictMode -Version 1.0

if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) {
    throw 'The Network Diagnostics Toolkit uses Windows networking cmdlets (NetTCPIP, NetAdapter, DnsClient) and only runs on Windows.'
}

# Safety limits. These are deliberately small so the toolkit cannot be used as a scanner.
# Numeric parameter ranges (ping count, timeouts, hop count) are enforced with
# [ValidateRange()] on each public function and are documented in the README.
$script:NdtLimits = @{
    MaxTargets         = 10    # hosts per run (ping, DNS, port check, quick check)
    MaxPorts           = 20    # distinct ports per run
    MaxTcpChecksPerRun = 20    # hosts x ports per run
}

$script:NdtSettings = @{
    PingIntervalMs = 500     # pause between echo requests to the same host
    UseColor       = $true   # Write-Host colours; the [PASS]/[FAIL] markers are always printed
}

# Set by Read-NdtInput when standard input reaches end-of-file (for example, piped input).
$script:NdtInputClosed = $false

# The module object's Version is not set yet while this file runs, so read the manifest.
$script:NdtModuleVersion = '0.0.0'
try {
    $manifestData = Import-PowerShellDataFile -Path (Join-Path -Path $PSScriptRoot -ChildPath 'NetworkDiagnostics.psd1')
    $script:NdtModuleVersion = [string]$manifestData.ModuleVersion
}
catch {
    Write-Verbose "Could not read the module version from the manifest: $($_.Exception.Message)"
}

$privateFolder = Join-Path -Path $PSScriptRoot -ChildPath 'Private'
$publicFolder = Join-Path -Path $PSScriptRoot -ChildPath 'Public'

$sourceFiles = @()
$sourceFiles += @(Get-ChildItem -Path $privateFolder -Filter '*.ps1' -File | Sort-Object -Property Name)
$sourceFiles += @(Get-ChildItem -Path $publicFolder -Filter '*.ps1' -File | Sort-Object -Property Name)

foreach ($sourceFile in $sourceFiles) {
    try {
        . $sourceFile.FullName
    }
    catch {
        throw "Failed to load $($sourceFile.Name): $($_.Exception.Message)"
    }
}

# Default table view for result objects: the four columns a technician reads first.
Update-TypeData -TypeName 'NetworkDiagnostics.Result' -DefaultDisplayPropertySet 'Status', 'TestType', 'Target', 'Summary' -Force

$publicNames = @(Get-ChildItem -Path $publicFolder -Filter '*.ps1' -File | ForEach-Object { $_.BaseName })
Export-ModuleMember -Function $publicNames
