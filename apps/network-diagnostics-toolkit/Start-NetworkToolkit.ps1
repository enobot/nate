#Requires -Version 5.1
<#
.SYNOPSIS
    Starts the Network Diagnostics Toolkit interactive menu.

.DESCRIPTION
    Loads the NetworkDiagnostics module from the src folder next to this script and opens
    the menu. Reports are saved to the "reports" folder next to this script unless
    -ReportDirectory is given.

    All checks are read-only and only contact the targets you type in.

    If scripts are blocked by the execution policy, run this for the current window only:
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-NetworkToolkit.ps1
    or, in an open PowerShell window:
        Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

.PARAMETER ReportDirectory
    Folder for CSV and text reports. Default: .\reports next to this script.

.PARAMETER NoColor
    Turn off colour. The [PASS]/[FAIL]/[WARN]/[INFO] markers are always shown.

.EXAMPLE
    .\Start-NetworkToolkit.ps1

.EXAMPLE
    .\Start-NetworkToolkit.ps1 -ReportDirectory C:\Tickets\INC0012345 -NoColor
#>
[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$ReportDirectory = (Join-Path -Path $PSScriptRoot -ChildPath 'reports'),

    [switch]$NoColor
)

$modulePath = Join-Path -Path $PSScriptRoot -ChildPath 'src\NetworkDiagnostics\NetworkDiagnostics.psd1'

try {
    Import-Module -Name $modulePath -Force -ErrorAction Stop
}
catch {
    Write-Error -Message "Could not load the Network Diagnostics module from '$modulePath': $($_.Exception.Message)" -ErrorAction Continue
    exit 1
}

Start-NdtMenu -ReportDirectory $ReportDirectory -NoColor:$NoColor
